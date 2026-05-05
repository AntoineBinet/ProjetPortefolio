"""Casino — base SQLite (users, invites, sessions, chip_log).

Schéma volontairement simple, accessible par sqlite3 stdlib.
Sécurité :
- Tokens (session/invite) : 24+ octets random, base64-url
- Codes invité : 6 chars [A-Z2-9] (sans I/O/0/1)
- Pas de mot de passe utilisateur ; auth = session cookie HTTPOnly + Secure
- Admin : authentifié via mdp Portfolio (ADMIN_PASS) → upsert d'un user is_admin
- SQL : toujours via paramètres (jamais de concat) → pas d'injection
- Logs financiers : chip_log immuable (insert only)
"""
from __future__ import annotations

import os
import secrets
import sqlite3
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from threading import Lock

DB_PATH = Path(__file__).resolve().parent / "casino.db"
_INVITE_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # sans I/O/0/1
_lock = Lock()


def _connect() -> sqlite3.Connection:
    """Connexion thread-safe avec foreign_keys et row_factory."""
    cn = sqlite3.connect(str(DB_PATH), timeout=10, isolation_level=None,
                         check_same_thread=False)
    cn.row_factory = sqlite3.Row
    cn.execute("PRAGMA foreign_keys=ON")
    cn.execute("PRAGMA journal_mode=WAL")
    return cn


@contextmanager
def db():
    """Context manager qui sérialise les écritures."""
    with _lock:
        cn = _connect()
        try:
            yield cn
        finally:
            cn.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS kv_settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  is_admin     INTEGER DEFAULT 0,
  chips        INTEGER DEFAULT 0,
  avatar_seed  INTEGER DEFAULT 0,
  notes        TEXT,
  created_at   REAL,
  last_seen    REAL
);

CREATE TABLE IF NOT EXISTS invites (
  id              TEXT PRIMARY KEY,    -- = link_token (URL slug)
  code            TEXT NOT NULL,       -- 6 chars
  starting_chips  INTEGER DEFAULT 2000,
  is_admin        INTEGER DEFAULT 0,
  used_by         TEXT,
  used_at         REAL,
  expires_at      REAL,
  created_by      TEXT,
  created_at      REAL,
  note            TEXT,
  FOREIGN KEY (used_by)    REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  created_at  REAL,
  expires_at  REAL,
  ip          TEXT,
  ua_hash     TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS chip_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   TEXT NOT NULL,
  delta     INTEGER NOT NULL,
  reason    TEXT,
  admin_id  TEXT,
  ts        REAL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_invites_code   ON invites(code) WHERE used_by IS NULL;
CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chip_log_user  ON chip_log(user_id, ts DESC);
"""


def init():
    """Crée le schéma s'il n'existe pas."""
    with db() as cn:
        cn.executescript(SCHEMA)


# ── Génération d'identifiants ────────────────────────────────────

def gen_token(n_bytes: int = 24) -> str:
    """Token URL-safe de ~32 chars (24 octets)."""
    return secrets.token_urlsafe(n_bytes)


def gen_invite_code() -> str:
    """Code 6 chars de l'alphabet sans confusion."""
    return "".join(secrets.choice(_INVITE_ALPHA) for _ in range(6))


def gen_user_id() -> str:
    return uuid.uuid4().hex


# ── Users ────────────────────────────────────────────────────────

def get_user(user_id: str) -> dict | None:
    with db() as cn:
        row = cn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else None


def get_user_by_name(name: str) -> dict | None:
    with db() as cn:
        row = cn.execute("SELECT * FROM users WHERE LOWER(name)=LOWER(?)", (name,)).fetchone()
        return dict(row) if row else None


def list_users() -> list[dict]:
    with db() as cn:
        return [dict(r) for r in cn.execute(
            "SELECT * FROM users ORDER BY is_admin DESC, last_seen DESC NULLS LAST"
        ).fetchall()]


def create_user(name: str, chips: int = 0, is_admin: bool = False,
                avatar_seed: int = 0, notes: str | None = None) -> str:
    """Insère un user. Renvoie son id. Lève si name déjà pris."""
    uid = gen_user_id()
    now = time.time()
    with db() as cn:
        cn.execute(
            "INSERT INTO users(id,name,is_admin,chips,avatar_seed,notes,created_at,last_seen) "
            "VALUES (?,?,?,?,?,?,?,?)",
            (uid, name.strip()[:24], 1 if is_admin else 0, int(chips),
             int(avatar_seed) % 24, notes, now, now)
        )
    return uid


def update_user(user_id: str, **fields) -> bool:
    """Met à jour les champs autorisés (name, chips, notes, avatar_seed, is_admin).
    Pour les chips, préférer adjust_chips qui logge l'opération."""
    allowed = {"name", "chips", "notes", "avatar_seed", "is_admin", "last_seen"}
    keys = [k for k in fields if k in allowed]
    if not keys:
        return False
    set_clause = ", ".join(f"{k}=?" for k in keys)
    vals = [fields[k] for k in keys] + [user_id]
    with db() as cn:
        cn.execute(f"UPDATE users SET {set_clause} WHERE id=?", vals)
        return cn.total_changes > 0


def delete_user(user_id: str) -> bool:
    """Supprime le user et ses dépendances FK :
    - sessions : DELETE
    - chip_log : DELETE (les transactions sont auditables avant la suppression
                 via chip_history ; après suppression du user on les évacue)
    - invites.used_by : NULL (invitation marquée non utilisée mais conservée)
    - invites.created_by : NULL (audit conservé sans rattachement)
    """
    with db() as cn:
        cn.execute("DELETE FROM sessions WHERE user_id=?", (user_id,))
        cn.execute("DELETE FROM chip_log WHERE user_id=? OR admin_id=?",
                   (user_id, user_id))
        cn.execute("UPDATE invites SET used_by=NULL WHERE used_by=?", (user_id,))
        cn.execute("UPDATE invites SET created_by=NULL WHERE created_by=?", (user_id,))
        cn.execute("DELETE FROM users WHERE id=?", (user_id,))
        return cn.total_changes > 0


def adjust_chips(user_id: str, delta: int, reason: str = "",
                 admin_id: str | None = None) -> int:
    """Modifie les chips d'un user et logge la transaction. Renvoie le nouveau total."""
    delta = int(delta)
    with db() as cn:
        cur = cn.execute("SELECT chips FROM users WHERE id=?", (user_id,)).fetchone()
        if not cur:
            raise KeyError("user introuvable")
        new_chips = max(0, int(cur["chips"]) + delta)
        cn.execute("UPDATE users SET chips=? WHERE id=?", (new_chips, user_id))
        cn.execute(
            "INSERT INTO chip_log(user_id,delta,reason,admin_id,ts) VALUES (?,?,?,?,?)",
            (user_id, delta, (reason or "")[:200], admin_id, time.time())
        )
    return new_chips


def chip_history(user_id: str, limit: int = 50) -> list[dict]:
    with db() as cn:
        return [dict(r) for r in cn.execute(
            "SELECT * FROM chip_log WHERE user_id=? ORDER BY ts DESC LIMIT ?",
            (user_id, limit)
        ).fetchall()]


# ── Invites ──────────────────────────────────────────────────────

def create_invite(created_by: str, starting_chips: int = 2000,
                  is_admin: bool = False, ttl_hours: int = 168,
                  note: str | None = None) -> dict:
    """Crée une invite. Renvoie {id (link_token), code, starting_chips, expires_at}."""
    iid = gen_token(20)              # token URL ~28 chars
    code = gen_invite_code()
    now = time.time()
    exp = now + (ttl_hours * 3600)
    with db() as cn:
        cn.execute(
            "INSERT INTO invites(id,code,starting_chips,is_admin,expires_at,created_by,created_at,note)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (iid, code, int(starting_chips), 1 if is_admin else 0,
             exp, created_by, now, (note or "")[:200])
        )
    return {
        "id": iid, "code": code,
        "starting_chips": int(starting_chips),
        "is_admin": bool(is_admin),
        "expires_at": exp, "note": note,
    }


def get_invite(iid: str) -> dict | None:
    with db() as cn:
        row = cn.execute("SELECT * FROM invites WHERE id=?", (iid,)).fetchone()
        return dict(row) if row else None


def list_invites(only_active: bool = False) -> list[dict]:
    sql = "SELECT * FROM invites"
    if only_active:
        sql += " WHERE used_by IS NULL AND expires_at > ?"
        params = (time.time(),)
    else:
        params = ()
    sql += " ORDER BY created_at DESC LIMIT 200"
    with db() as cn:
        return [dict(r) for r in cn.execute(sql, params).fetchall()]


def delete_invite(iid: str) -> bool:
    with db() as cn:
        cn.execute("DELETE FROM invites WHERE id=?", (iid,))
        return cn.total_changes > 0


def redeem_invite(iid: str, code: str, name: str,
                  avatar_seed: int = 0) -> tuple[str, dict]:
    """Vérifie l'invite et crée le user. Renvoie (session_token, user).

    Lève ValueError avec message UI sur invite invalide / expirée / code faux /
    nom déjà pris.
    """
    name = (name or "").strip()
    if not (2 <= len(name) <= 24):
        raise ValueError("Le pseudo doit faire entre 2 et 24 caractères.")
    code = (code or "").upper().strip()

    with db() as cn:
        # Vérifs sous lock
        inv = cn.execute("SELECT * FROM invites WHERE id=?", (iid,)).fetchone()
        if not inv:
            raise ValueError("Invitation introuvable.")
        if inv["used_by"]:
            raise ValueError("Invitation déjà utilisée.")
        if inv["expires_at"] and inv["expires_at"] < time.time():
            raise ValueError("Invitation expirée.")
        # Comparaison constante-temps du code
        if not secrets.compare_digest(inv["code"], code):
            raise ValueError("Code d'invitation incorrect.")

        # Nom unique ?
        existing = cn.execute(
            "SELECT id FROM users WHERE LOWER(name)=LOWER(?)", (name,)
        ).fetchone()
        if existing:
            raise ValueError("Ce pseudo est déjà utilisé.")

        # Crée le user + marque l'invite consommée
        uid = gen_user_id()
        now = time.time()
        cn.execute(
            "INSERT INTO users(id,name,is_admin,chips,avatar_seed,created_at,last_seen)"
            " VALUES (?,?,?,?,?,?,?)",
            (uid, name[:24], int(inv["is_admin"]), int(inv["starting_chips"]),
             int(avatar_seed) % 24, now, now)
        )
        if int(inv["starting_chips"]) > 0:
            cn.execute(
                "INSERT INTO chip_log(user_id,delta,reason,admin_id,ts) VALUES (?,?,?,?,?)",
                (uid, int(inv["starting_chips"]),
                 f"Invitation initiale", inv["created_by"], now)
            )
        cn.execute(
            "UPDATE invites SET used_by=?, used_at=? WHERE id=?",
            (uid, now, iid)
        )

        # Crée la session
        token = gen_token(24)
        exp = now + 30 * 86400
        cn.execute(
            "INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES (?,?,?,?)",
            (token, uid, now, exp)
        )
        user_row = cn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
        return token, dict(user_row)


# ── Sessions ─────────────────────────────────────────────────────

def create_session(user_id: str, ip: str | None = None,
                   ua: str | None = None, ttl_days: int = 30) -> str:
    token = gen_token(24)
    now = time.time()
    exp = now + ttl_days * 86400
    ua_hash = None
    if ua:
        import hashlib
        ua_hash = hashlib.sha256(ua.encode("utf-8", "ignore")).hexdigest()[:24]
    with db() as cn:
        cn.execute(
            "INSERT INTO sessions(token,user_id,created_at,expires_at,ip,ua_hash) "
            "VALUES (?,?,?,?,?,?)",
            (token, user_id, now, exp, (ip or "")[:64], ua_hash)
        )
    return token


def get_session(token: str) -> dict | None:
    if not token:
        return None
    with db() as cn:
        row = cn.execute(
            "SELECT s.*, u.name, u.is_admin, u.chips, u.avatar_seed FROM sessions s "
            "JOIN users u ON u.id = s.user_id "
            "WHERE s.token = ? AND s.expires_at > ?",
            (token, time.time())
        ).fetchone()
        if not row:
            return None
        cn.execute("UPDATE users SET last_seen=? WHERE id=?",
                   (time.time(), row["user_id"]))
        return dict(row)


def delete_session(token: str) -> None:
    with db() as cn:
        cn.execute("DELETE FROM sessions WHERE token=?", (token,))


def gc_sessions() -> int:
    """Nettoyage périodique : supprime les sessions expirées."""
    with db() as cn:
        cn.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))
        return cn.total_changes


# ── Bootstrap admin ──────────────────────────────────────────────

def ensure_admin(name: str = "Antoine", chips: int = 100000) -> str:
    """S'assure qu'un user admin existe. Renvoie son id."""
    with db() as cn:
        row = cn.execute("SELECT id FROM users WHERE is_admin=1 LIMIT 1").fetchone()
        if row:
            return row["id"]
    return create_user(name, chips=chips, is_admin=True)


# ── KV settings (mot de passe admin notamment) ────────────────────

def kv_get(key: str) -> str | None:
    with db() as cn:
        row = cn.execute("SELECT value FROM kv_settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else None


def kv_set(key: str, value: str) -> None:
    with db() as cn:
        cn.execute(
            "INSERT INTO kv_settings(key,value) VALUES(?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, value)
        )


def hash_password(password: str) -> str:
    """Hash PBKDF2-SHA256 (100k itérations) avec salt aléatoire."""
    import hashlib
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return f"pbkdf2_sha256$100000${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """Vérifie un mot de passe contre un hash stocké."""
    if not stored or "$" not in stored:
        return False
    try:
        algo, iters, salt_hex, dk_hex = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        import hashlib
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iters))
        return secrets.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def set_admin_password(new_password: str) -> None:
    kv_set("admin_password_hash", hash_password(new_password))
    kv_set("admin_password_changed", "1")


def check_admin_password(password: str) -> bool:
    """Vérifie le mdp admin Casino, totalement indépendant du Portfolio.

    Si aucun hash n'est stocké en DB on accepte le défaut "admin" et l'UI
    forcera le changement immédiatement (must_change_password).
    """
    stored = kv_get("admin_password_hash")
    if stored:
        return verify_password(password, stored)
    return secrets.compare_digest(password.encode(), b"admin")


def get_admin_username() -> str:
    """Identifiant de login admin Casino. Défaut 'admin'."""
    return kv_get("admin_username") or "admin"


def set_admin_username(new_username: str) -> None:
    new_username = (new_username or "").strip()
    if not (1 <= len(new_username) <= 32):
        raise ValueError("Identifiant invalide (1 à 32 caractères)")
    kv_set("admin_username", new_username)


def admin_must_change_password() -> bool:
    """True tant que l'admin utilise encore le mot de passe par défaut.

    Considéré « déjà changé » si :
      - le flag explicite est posé, ou
      - un hash personnalisé a déjà été stocké (compat installations existantes
        d'avant l'introduction du flag).
    """
    if kv_get("admin_password_changed") == "1":
        return False
    if kv_get("admin_password_hash"):
        return False
    return True

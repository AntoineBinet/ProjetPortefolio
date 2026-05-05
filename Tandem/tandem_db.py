"""Tandem — couche SQLite (users, sessions, channels, messages, files, invites).

Toute la persistance se fait dans `tandem.db` (gitignoré). Mots de passe hashés
PBKDF2-SHA256 200k itérations. Sessions par cookie HttpOnly opaque (32 bytes).
"""
from __future__ import annotations

import hashlib
import hmac
import secrets
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Iterable, Optional

TANDEM_DIR = Path(__file__).resolve().parent
DB_PATH = TANDEM_DIR / "tandem.db"

_PBKDF2_ITERS = 200_000
_SESSION_TTL_DAYS = 30


# ── Helpers PBKDF2 ───────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, _PBKDF2_ITERS,
    )
    return f"pbkdf2_sha256${_PBKDF2_ITERS}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    if not stored or "$" not in stored:
        return False
    try:
        algo, iters_s, salt_hex, dk_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, int(iters_s),
        )
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


# ── Connexion ────────────────────────────────────────────────────

def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys = ON")
    c.execute("PRAGMA journal_mode = WAL")
    return c


# ── Schéma ───────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role         TEXT NOT NULL DEFAULT 'member',  -- 'admin' | 'member'
  avatar_color TEXT NOT NULL DEFAULT 'oklch(0.7 0.16 220)',
  job_title    TEXT NOT NULL DEFAULT '',
  created_at   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  ip          TEXT,
  ua          TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS channels (
  id          TEXT PRIMARY KEY,
  slug        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'channel',  -- 'channel' | 'announcement'
  is_private  INTEGER NOT NULL DEFAULT 0,
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id  TEXT NOT NULL,
  user_id     TEXT NOT NULL,
  joined_at   INTEGER NOT NULL,
  PRIMARY KEY (channel_id, user_id),
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
  id          TEXT PRIMARY KEY,
  channel_id  TEXT NOT NULL,
  user_id     TEXT,
  body        TEXT NOT NULL DEFAULT '',
  file_id     TEXT,
  created_at  INTEGER NOT NULL,
  edited_at   INTEGER,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (file_id)    REFERENCES files(id)    ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);

CREATE TABLE IF NOT EXISTS files (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT,
  channel_id    TEXT,                     -- null = drive perso
  filename      TEXT NOT NULL,            -- nom stocké sur disque
  original_name TEXT NOT NULL,            -- nom affiché
  mime          TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  uploaded_at   INTEGER NOT NULL,
  FOREIGN KEY (owner_id)   REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_files_channel ON files(channel_id, uploaded_at);
CREATE INDEX IF NOT EXISTS idx_files_owner   ON files(owner_id, uploaded_at);

CREATE TABLE IF NOT EXISTS invites (
  id          TEXT PRIMARY KEY,
  code        TEXT NOT NULL,              -- code court à saisir
  email       TEXT,                       -- pré-rempli optionnel
  role        TEXT NOT NULL DEFAULT 'member',
  created_by  TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used_by     TEXT,
  used_at     INTEGER,
  note        TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (used_by)    REFERENCES users(id) ON DELETE SET NULL
);
"""

_AVATAR_COLORS = [
    "oklch(0.7 0.16 220)",  # cyan
    "oklch(0.7 0.18 25)",   # warm red
    "oklch(0.72 0.15 160)", # green
    "oklch(0.7 0.18 290)",  # violet
    "oklch(0.72 0.16 60)",  # amber
    "oklch(0.7 0.15 340)",  # pink
    "oklch(0.7 0.16 190)",  # teal
    "oklch(0.72 0.15 90)",  # olive
]


def init() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _conn() as c:
        c.executescript(_SCHEMA)
        c.commit()


def now() -> int:
    return int(time.time())


# ── Utilitaires admin/seed ───────────────────────────────────────

def ensure_admin(email: str, name: str, password: str) -> str:
    """Crée l'admin s'il n'existe pas. Retourne son id."""
    init()
    with _conn() as c:
        row = c.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if row:
            return row["id"]
        uid = uuid.uuid4().hex
        c.execute(
            "INSERT INTO users (id, email, name, password_hash, role, avatar_color, "
            "job_title, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?,?)",
            (uid, email.lower(), name, hash_password(password), "admin",
             _AVATAR_COLORS[0], "Administrateur", now(), now()),
        )
        c.commit()
        return uid


def ensure_default_channels(admin_id: str) -> None:
    """Crée les channels de seed si la table est vide."""
    seeds = [
        ("general", "Général", "Espace de discussion ouvert à toute l'équipe.", "channel"),
        ("announces", "Annonces", "Communiqués officiels — lecture seule pour les membres.", "announcement"),
        ("design", "Design", "Brainstorming, mockups, retours visuels.", "channel"),
        ("documents", "Documents", "Fichiers partagés — drive de l'équipe.", "channel"),
    ]
    with _conn() as c:
        n = c.execute("SELECT COUNT(*) FROM channels").fetchone()[0]
        if n:
            return
        for slug, name, desc, kind in seeds:
            cid = uuid.uuid4().hex
            c.execute(
                "INSERT INTO channels (id, slug, name, description, kind, is_private, "
                "created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
                (cid, slug, name, desc, kind, 0, admin_id, now()),
            )
            c.execute(
                "INSERT INTO channel_members (channel_id, user_id, joined_at) "
                "VALUES (?,?,?)",
                (cid, admin_id, now()),
            )
        # Message de bienvenue dans #general
        gen = c.execute("SELECT id FROM channels WHERE slug='general'").fetchone()
        if gen:
            c.execute(
                "INSERT INTO messages (id, channel_id, user_id, body, created_at) "
                "VALUES (?,?,?,?,?)",
                (uuid.uuid4().hex, gen["id"], admin_id,
                 "Bienvenue sur Tandem 👋 Cet espace est partagé avec votre équipe : "
                 "discussions, décisions, fichiers. Glissez un document dans l'onglet "
                 "Fichiers pour le partager avec tout le monde.",
                 now()),
            )
        c.commit()


# ── Sessions ─────────────────────────────────────────────────────

def create_session(user_id: str, ip: str = "", ua: str = "") -> str:
    token = secrets.token_urlsafe(32)
    expires = now() + _SESSION_TTL_DAYS * 86400
    with _conn() as c:
        c.execute(
            "INSERT INTO sessions (token, user_id, ip, ua, created_at, expires_at) "
            "VALUES (?,?,?,?,?,?)",
            (token, user_id, ip[:64], ua[:200], now(), expires),
        )
        c.execute("UPDATE users SET last_seen = ? WHERE id = ?", (now(), user_id))
        c.commit()
    return token


def delete_session(token: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM sessions WHERE token = ?", (token,))
        c.commit()


def get_session_user(token: str) -> Optional[dict]:
    if not token:
        return None
    with _conn() as c:
        row = c.execute(
            "SELECT u.* FROM sessions s "
            "JOIN users u ON u.id = s.user_id "
            "WHERE s.token = ? AND s.expires_at > ?",
            (token, now()),
        ).fetchone()
        if not row:
            return None
        # Touch last_seen
        c.execute("UPDATE users SET last_seen = ? WHERE id = ?", (now(), row["id"]))
        c.commit()
        return _row_to_user(row)


def _row_to_user(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "avatar_color": row["avatar_color"],
        "job_title": row["job_title"],
        "created_at": row["created_at"],
        "last_seen": row["last_seen"],
    }


# ── Users ────────────────────────────────────────────────────────

def login_user(email: str, password: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
            (email.strip(),),
        ).fetchone()
        if not row:
            return None
        if not verify_password(password, row["password_hash"]):
            return None
        return _row_to_user(row)


def create_user(email: str, name: str, password: str, role: str = "member",
                job_title: str = "") -> str:
    avatar = _AVATAR_COLORS[secrets.randbelow(len(_AVATAR_COLORS))]
    uid = uuid.uuid4().hex
    with _conn() as c:
        c.execute(
            "INSERT INTO users (id, email, name, password_hash, role, avatar_color, "
            "job_title, created_at, last_seen) VALUES (?,?,?,?,?,?,?,?,?)",
            (uid, email.lower(), name, hash_password(password), role, avatar,
             job_title, now(), now()),
        )
        # Auto-join tous les channels publics
        publics = c.execute(
            "SELECT id FROM channels WHERE is_private = 0",
        ).fetchall()
        for ch in publics:
            c.execute(
                "INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) "
                "VALUES (?,?,?)",
                (ch["id"], uid, now()),
            )
        c.commit()
    return uid


def get_user(uid: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
        return _row_to_user(row) if row else None


def get_user_by_email(email: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
            (email,),
        ).fetchone()
        return _row_to_user(row) if row else None


def list_users() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM users ORDER BY created_at ASC",
        ).fetchall()
    return [_row_to_user(r) for r in rows]


def update_user(uid: str, *, name: Optional[str] = None,
                job_title: Optional[str] = None,
                role: Optional[str] = None,
                avatar_color: Optional[str] = None) -> Optional[dict]:
    fields = []
    args: list[Any] = []
    if name is not None:
        fields.append("name = ?"); args.append(name)
    if job_title is not None:
        fields.append("job_title = ?"); args.append(job_title)
    if role is not None and role in ("admin", "member"):
        fields.append("role = ?"); args.append(role)
    if avatar_color is not None:
        fields.append("avatar_color = ?"); args.append(avatar_color)
    if not fields:
        return get_user(uid)
    args.append(uid)
    with _conn() as c:
        c.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = ?", args)
        c.commit()
    return get_user(uid)


def change_password(uid: str, new_password: str) -> None:
    with _conn() as c:
        c.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                  (hash_password(new_password), uid))
        # Invalide toutes les sessions sauf l'actuelle (caller gérera)
        c.commit()


def delete_user(uid: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM users WHERE id = ?", (uid,))
        c.commit()


# ── Channels ─────────────────────────────────────────────────────

def list_channels_for(user_id: str) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT c.*, "
            "(SELECT COUNT(*) FROM channel_members m WHERE m.channel_id = c.id) AS member_count, "
            "(SELECT COUNT(*) FROM messages mm WHERE mm.channel_id = c.id) AS message_count "
            "FROM channels c "
            "INNER JOIN channel_members m ON m.channel_id = c.id "
            "WHERE m.user_id = ? "
            "ORDER BY c.name COLLATE NOCASE ASC",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def create_channel(name: str, description: str, kind: str, created_by: str,
                   is_private: bool = False) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Nom requis")
    if len(name) > 60:
        raise ValueError("Nom trop long")
    slug = _slugify(name)
    if not slug:
        raise ValueError("Nom invalide")
    cid = uuid.uuid4().hex
    with _conn() as c:
        # Garantit l'unicité du slug
        existing = c.execute("SELECT slug FROM channels WHERE slug = ?", (slug,)).fetchone()
        i = 2
        base = slug
        while existing:
            slug = f"{base}-{i}"
            existing = c.execute("SELECT slug FROM channels WHERE slug = ?", (slug,)).fetchone()
            i += 1
        c.execute(
            "INSERT INTO channels (id, slug, name, description, kind, is_private, "
            "created_by, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (cid, slug, name, description[:500], kind if kind in ("channel", "announcement") else "channel",
             1 if is_private else 0, created_by, now()),
        )
        c.execute(
            "INSERT INTO channel_members (channel_id, user_id, joined_at) "
            "VALUES (?,?,?)",
            (cid, created_by, now()),
        )
        # Si public, auto-join tous
        if not is_private:
            users = c.execute("SELECT id FROM users WHERE id != ?", (created_by,)).fetchall()
            for u in users:
                c.execute(
                    "INSERT OR IGNORE INTO channel_members (channel_id, user_id, joined_at) "
                    "VALUES (?,?,?)",
                    (cid, u["id"], now()),
                )
        c.commit()
    return get_channel(cid)


def _slugify(text: str) -> str:
    out = []
    for ch in text.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_", "/"):
            out.append("-")
    s = "".join(out).strip("-")
    while "--" in s:
        s = s.replace("--", "-")
    return s[:48]


def get_channel(cid: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM channels WHERE id = ?", (cid,)).fetchone()
        return dict(row) if row else None


def is_member(channel_id: str, user_id: str) -> bool:
    with _conn() as c:
        row = c.execute(
            "SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?",
            (channel_id, user_id),
        ).fetchone()
    return row is not None


def channel_members(channel_id: str) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT u.id, u.name, u.email, u.role, u.avatar_color, u.job_title, u.last_seen "
            "FROM channel_members m JOIN users u ON u.id = m.user_id "
            "WHERE m.channel_id = ? ORDER BY u.name COLLATE NOCASE",
            (channel_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def delete_channel(channel_id: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM channels WHERE id = ?", (channel_id,))
        c.commit()


# ── Messages ─────────────────────────────────────────────────────

def post_message(channel_id: str, user_id: str, body: str,
                 file_id: Optional[str] = None) -> dict:
    body = body.strip()
    if not body and not file_id:
        raise ValueError("Message vide")
    if len(body) > 4000:
        raise ValueError("Message trop long")
    mid = uuid.uuid4().hex
    with _conn() as c:
        c.execute(
            "INSERT INTO messages (id, channel_id, user_id, body, file_id, created_at) "
            "VALUES (?,?,?,?,?,?)",
            (mid, channel_id, user_id, body, file_id, now()),
        )
        c.commit()
    return get_message(mid)


def get_message(mid: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute(
            "SELECT m.*, u.name AS author_name, u.avatar_color AS author_color, "
            "u.role AS author_role "
            "FROM messages m LEFT JOIN users u ON u.id = m.user_id "
            "WHERE m.id = ?", (mid,),
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        if d.get("file_id"):
            f = c.execute("SELECT * FROM files WHERE id = ?", (d["file_id"],)).fetchone()
            d["file"] = dict(f) if f else None
        return d


def list_messages(channel_id: str, limit: int = 100,
                  before_id: Optional[str] = None) -> list[dict]:
    with _conn() as c:
        params = [channel_id]
        cond = ""
        if before_id:
            row = c.execute(
                "SELECT created_at FROM messages WHERE id = ?", (before_id,),
            ).fetchone()
            if row:
                cond = " AND m.created_at < ?"
                params.append(row["created_at"])
        rows = c.execute(
            "SELECT m.*, u.name AS author_name, u.avatar_color AS author_color, "
            "u.role AS author_role "
            "FROM messages m LEFT JOIN users u ON u.id = m.user_id "
            f"WHERE m.channel_id = ?{cond} "
            "ORDER BY m.created_at DESC LIMIT ?",
            (*params, limit),
        ).fetchall()
        items = [dict(r) for r in rows]
        # On veut chronologique ascendant
        items.reverse()
        # Joindre les fichiers
        file_ids = [m["file_id"] for m in items if m.get("file_id")]
        if file_ids:
            qmarks = ",".join("?" * len(file_ids))
            frows = c.execute(
                f"SELECT * FROM files WHERE id IN ({qmarks})", file_ids,
            ).fetchall()
            fmap = {f["id"]: dict(f) for f in frows}
            for m in items:
                if m.get("file_id") in fmap:
                    m["file"] = fmap[m["file_id"]]
    return items


def delete_message(mid: str, user_id: str, is_admin: bool = False) -> bool:
    with _conn() as c:
        row = c.execute("SELECT user_id FROM messages WHERE id = ?", (mid,)).fetchone()
        if not row:
            return False
        if not is_admin and row["user_id"] != user_id:
            return False
        c.execute("DELETE FROM messages WHERE id = ?", (mid,))
        c.commit()
    return True


# ── Files ────────────────────────────────────────────────────────

def register_file(*, file_id: str, owner_id: str, channel_id: Optional[str],
                  filename: str, original_name: str, mime: str,
                  size_bytes: int) -> dict:
    with _conn() as c:
        c.execute(
            "INSERT INTO files (id, owner_id, channel_id, filename, original_name, "
            "mime, size_bytes, uploaded_at) VALUES (?,?,?,?,?,?,?,?)",
            (file_id, owner_id, channel_id, filename, original_name, mime,
             size_bytes, now()),
        )
        c.commit()
    return get_file(file_id)


def get_file(fid: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute(
            "SELECT f.*, u.name AS owner_name, u.avatar_color AS owner_color "
            "FROM files f LEFT JOIN users u ON u.id = f.owner_id "
            "WHERE f.id = ?", (fid,),
        ).fetchone()
    return dict(row) if row else None


def list_channel_files(channel_id: str, limit: int = 100) -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT f.*, u.name AS owner_name, u.avatar_color AS owner_color "
            "FROM files f LEFT JOIN users u ON u.id = f.owner_id "
            "WHERE f.channel_id = ? ORDER BY f.uploaded_at DESC LIMIT ?",
            (channel_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def list_recent_files(limit: int = 100) -> list[dict]:
    """Tous les fichiers récents (drive global)."""
    with _conn() as c:
        rows = c.execute(
            "SELECT f.*, u.name AS owner_name, u.avatar_color AS owner_color, "
            "c.name AS channel_name, c.slug AS channel_slug "
            "FROM files f "
            "LEFT JOIN users u ON u.id = f.owner_id "
            "LEFT JOIN channels c ON c.id = f.channel_id "
            "ORDER BY f.uploaded_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


def delete_file(fid: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM files WHERE id = ?", (fid,))
        c.commit()


# ── Invites ──────────────────────────────────────────────────────

def create_invite(*, role: str, ttl_hours: int, created_by: str,
                  email: str = "", note: str = "") -> dict:
    iid = uuid.uuid4().hex
    code = secrets.token_urlsafe(8).replace("-", "").replace("_", "")[:10].upper()
    expires = now() + ttl_hours * 3600
    with _conn() as c:
        c.execute(
            "INSERT INTO invites (id, code, email, role, created_by, created_at, "
            "expires_at, note) VALUES (?,?,?,?,?,?,?,?)",
            (iid, code, email.lower() if email else "",
             role if role in ("admin", "member") else "member",
             created_by, now(), expires, note[:200]),
        )
        c.commit()
        row = c.execute("SELECT * FROM invites WHERE id = ?", (iid,)).fetchone()
    return dict(row)


def list_invites() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT i.*, u.name AS used_by_name FROM invites i "
            "LEFT JOIN users u ON u.id = i.used_by "
            "ORDER BY i.created_at DESC",
        ).fetchall()
    return [dict(r) for r in rows]


def get_invite(iid: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM invites WHERE id = ?", (iid,)).fetchone()
    return dict(row) if row else None


def get_invite_by_code(code: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM invites WHERE code = ?", (code.upper(),),
        ).fetchone()
    return dict(row) if row else None


def consume_invite(invite_id: str, code: str, *, email: str, name: str,
                   password: str, job_title: str = "") -> tuple[str, str]:
    """Crée un user à partir d'une invite. Retourne (user_id, session_token).

    Lève ValueError si l'invite est invalide / expirée / déjà consommée /
    si l'email est déjà pris.
    """
    code = code.upper().strip()
    email = email.strip().lower()
    name = name.strip()
    if len(name) < 2 or len(name) > 60:
        raise ValueError("Nom invalide (2-60 caractères)")
    if "@" not in email or len(email) > 200:
        raise ValueError("Email invalide")
    if len(password) < 6:
        raise ValueError("Mot de passe trop court (min 6)")
    with _conn() as c:
        inv = c.execute(
            "SELECT * FROM invites WHERE id = ? AND code = ?",
            (invite_id, code),
        ).fetchone()
        if not inv:
            raise ValueError("Lien d'invitation invalide")
        if inv["used_by"]:
            raise ValueError("Lien déjà utilisé")
        if inv["expires_at"] < now():
            raise ValueError("Lien expiré")
        # Email déjà pris ?
        existing = c.execute(
            "SELECT id FROM users WHERE email = ? COLLATE NOCASE", (email,),
        ).fetchone()
        if existing:
            raise ValueError("Cet email a déjà un compte")
        uid = create_user(email, name, password, role=inv["role"],
                          job_title=job_title)
        c.execute(
            "UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?",
            (uid, now(), invite_id),
        )
        c.commit()
    token = create_session(uid)
    return uid, token


def delete_invite(iid: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM invites WHERE id = ?", (iid,))
        c.commit()


# ── Stats ────────────────────────────────────────────────────────

def workspace_stats() -> dict:
    with _conn() as c:
        users = c.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        channels = c.execute("SELECT COUNT(*) FROM channels").fetchone()[0]
        messages = c.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
        files = c.execute("SELECT COUNT(*) FROM files").fetchone()[0]
        size = c.execute("SELECT COALESCE(SUM(size_bytes), 0) FROM files").fetchone()[0]
    return {
        "users": users,
        "channels": channels,
        "messages": messages,
        "files": files,
        "files_size_bytes": size,
    }

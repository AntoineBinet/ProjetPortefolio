"""TYLA Maison — couche SQLite (users, sessions, rooms, devices, scenes,
schedules, action_history, kv).

Toute la persistance se fait dans `tyla.db` (gitignoré). Mots de passe hashés
PBKDF2-SHA256 200k itérations. Sessions par cookie HttpOnly opaque (32 bytes).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Optional

TYLA_DIR = Path(__file__).resolve().parent
DB_PATH = TYLA_DIR / "tyla.db"

_PBKDF2_ITERS = 200_000
_SESSION_TTL_DAYS = 30


# ── Hashing ──────────────────────────────────────────────────────

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


def now() -> int:
    return int(time.time())


# ── Schéma ───────────────────────────────────────────────────────

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id                       TEXT PRIMARY KEY,
  username                 TEXT UNIQUE NOT NULL,
  password_hash            TEXT NOT NULL,
  must_change_password     INTEGER NOT NULL DEFAULT 0,
  created_at               INTEGER NOT NULL,
  last_login               INTEGER NOT NULL DEFAULT 0
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

CREATE TABLE IF NOT EXISTS rooms (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  icon        TEXT NOT NULL DEFAULT 'home',
  color       TEXT NOT NULL DEFAULT 'oklch(0.7 0.14 230)',
  pos_x       REAL NOT NULL DEFAULT 0.2,
  pos_y       REAL NOT NULL DEFAULT 0.2,
  pos_w       REAL NOT NULL DEFAULT 0.25,
  pos_h       REAL NOT NULL DEFAULT 0.25,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,           -- tuya_bulb, tuya_plug, roborock, denon, siemens, generic
  name         TEXT NOT NULL,
  room_id      TEXT,
  config_json  TEXT NOT NULL DEFAULT '{}',
  state_json   TEXT NOT NULL DEFAULT '{}',
  online       INTEGER NOT NULL DEFAULT 0,
  last_seen    INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_devices_room ON devices(room_id);
CREATE INDEX IF NOT EXISTS idx_devices_type ON devices(type);

CREATE TABLE IF NOT EXISTS scenes (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  icon         TEXT NOT NULL DEFAULT 'sparkle',
  color        TEXT NOT NULL DEFAULT 'oklch(0.72 0.15 80)',
  actions_json TEXT NOT NULL DEFAULT '[]',  -- list of {device_id, action, params}
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS schedules (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'scene',  -- 'scene' | 'device'
  target_id   TEXT NOT NULL,                  -- scene_id ou device_id
  action      TEXT,                           -- pour kind='device'
  params_json TEXT NOT NULL DEFAULT '{}',
  time_hhmm   TEXT NOT NULL,                  -- 'HH:MM'
  weekdays    TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',  -- 0=lundi..6=dimanche
  enabled     INTEGER NOT NULL DEFAULT 1,
  last_run    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS action_history (
  id           TEXT PRIMARY KEY,
  device_id    TEXT,
  device_name  TEXT,
  action       TEXT NOT NULL,
  params_json  TEXT NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'ok',     -- 'ok' | 'error'
  message      TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'scene' | 'schedule'
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_history_created ON action_history(created_at);
CREATE INDEX IF NOT EXISTS idx_history_device  ON action_history(device_id, created_at);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);
"""


def init() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _conn() as c:
        c.executescript(_SCHEMA)
        c.commit()


# ── Bootstrap admin ──────────────────────────────────────────────

def ensure_admin(default_user: str = "admin",
                 default_pass: str = "admin") -> str:
    """Crée l'admin par défaut au premier démarrage avec must_change_password=1.
    Retourne son id."""
    init()
    with _conn() as c:
        row = c.execute(
            "SELECT id FROM users WHERE username = ?", (default_user,),
        ).fetchone()
        if row:
            return row["id"]
        # Aucun user existant : crée l'admin par défaut.
        any_user = c.execute("SELECT id FROM users LIMIT 1").fetchone()
        uid = uuid.uuid4().hex
        c.execute(
            "INSERT INTO users (id, username, password_hash, "
            "must_change_password, created_at) VALUES (?,?,?,?,?)",
            (uid, default_user, hash_password(default_pass),
             1 if not any_user else 0, now()),
        )
        c.commit()
        return uid


def ensure_default_rooms() -> None:
    """Crée 5 pièces par défaut au premier démarrage."""
    seeds = [
        ("Salon",      "salon",      "sofa",    0.07, 0.10, 0.42, 0.42, "oklch(0.72 0.14 70)"),
        ("Cuisine",    "cuisine",    "kitchen", 0.51, 0.10, 0.42, 0.32, "oklch(0.72 0.16 130)"),
        ("Chambre",    "chambre",    "bed",     0.07, 0.56, 0.42, 0.36, "oklch(0.7  0.16 290)"),
        ("Bureau",     "bureau",     "desk",    0.51, 0.46, 0.20, 0.46, "oklch(0.72 0.13 220)"),
        ("Salle de bain", "salle-de-bain", "drop", 0.73, 0.46, 0.20, 0.46, "oklch(0.73 0.12 200)"),
    ]
    with _conn() as c:
        n = c.execute("SELECT COUNT(*) FROM rooms").fetchone()[0]
        if n:
            return
        for i, (name, slug, icon, x, y, w, h, color) in enumerate(seeds):
            c.execute(
                "INSERT INTO rooms (id, name, slug, icon, color, pos_x, pos_y, "
                "pos_w, pos_h, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (uuid.uuid4().hex, name, slug, icon, color,
                 x, y, w, h, i, now()),
            )
        c.commit()


def ensure_default_scenes() -> None:
    """Crée des scènes vides par défaut au premier démarrage. L'utilisateur
    peuplera les actions une fois ses devices ajoutés."""
    seeds = [
        ("Bonjour",  "sun",         "oklch(0.78 0.16 80)"),
        ("Cinéma",   "play",        "oklch(0.55 0.18 280)"),
        ("Détente",  "leaf",        "oklch(0.7  0.14 160)"),
        ("Dodo",     "moon",        "oklch(0.6  0.12 250)"),
        ("Tout off", "power",       "oklch(0.65 0.14 25)"),
    ]
    with _conn() as c:
        n = c.execute("SELECT COUNT(*) FROM scenes").fetchone()[0]
        if n:
            return
        for i, (name, icon, color) in enumerate(seeds):
            c.execute(
                "INSERT INTO scenes (id, name, icon, color, actions_json, "
                "sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
                (uuid.uuid4().hex, name, icon, color, "[]", i, now()),
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
        c.execute("UPDATE users SET last_login = ? WHERE id = ?", (now(), user_id))
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
        return _row_to_user(row) if row else None


def _row_to_user(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "must_change_password": bool(row["must_change_password"]),
        "created_at": row["created_at"],
        "last_login": row["last_login"],
    }


# ── Users ────────────────────────────────────────────────────────

def login(username: str, password: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute(
            "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
            (username.strip(),),
        ).fetchone()
        if not row:
            return None
        if not verify_password(password, row["password_hash"]):
            return None
        return _row_to_user(row)


def get_user(uid: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return _row_to_user(row) if row else None


def change_password(uid: str, new_password: str) -> None:
    with _conn() as c:
        c.execute(
            "UPDATE users SET password_hash = ?, must_change_password = 0 "
            "WHERE id = ?",
            (hash_password(new_password), uid),
        )
        # Invalide toutes les autres sessions par sécurité.
        c.execute("DELETE FROM sessions WHERE user_id = ?", (uid,))
        c.commit()


def change_username(uid: str, new_username: str) -> bool:
    new_username = new_username.strip()
    if not new_username:
        return False
    with _conn() as c:
        existing = c.execute(
            "SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?",
            (new_username, uid),
        ).fetchone()
        if existing:
            return False
        c.execute(
            "UPDATE users SET username = ? WHERE id = ?",
            (new_username, uid),
        )
        c.commit()
    return True


# ── Rooms ────────────────────────────────────────────────────────

def list_rooms() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT r.*, "
            "(SELECT COUNT(*) FROM devices d WHERE d.room_id = r.id) AS device_count "
            "FROM rooms r "
            "ORDER BY r.sort_order ASC, r.name ASC",
        ).fetchall()
    return [dict(r) for r in rows]


def get_room(rid: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM rooms WHERE id = ?", (rid,)).fetchone()
    return dict(row) if row else None


def create_room(name: str, icon: str = "home",
                color: str = "oklch(0.7 0.14 230)",
                pos_x: float = 0.2, pos_y: float = 0.2,
                pos_w: float = 0.25, pos_h: float = 0.25) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Nom requis")
    if len(name) > 60:
        raise ValueError("Nom trop long")
    slug = _slugify(name)
    if not slug:
        raise ValueError("Nom invalide")
    rid = uuid.uuid4().hex
    with _conn() as c:
        # Garantir l'unicité du slug
        i = 2
        base = slug
        while c.execute("SELECT 1 FROM rooms WHERE slug = ?", (slug,)).fetchone():
            slug = f"{base}-{i}"
            i += 1
        max_order = c.execute("SELECT COALESCE(MAX(sort_order),-1) FROM rooms").fetchone()[0]
        c.execute(
            "INSERT INTO rooms (id, name, slug, icon, color, pos_x, pos_y, "
            "pos_w, pos_h, sort_order, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (rid, name, slug, icon, color,
             max(0.0, min(1.0, pos_x)),
             max(0.0, min(1.0, pos_y)),
             max(0.05, min(1.0, pos_w)),
             max(0.05, min(1.0, pos_h)),
             max_order + 1, now()),
        )
        c.commit()
    return get_room(rid)


def update_room(rid: str, **fields) -> Optional[dict]:
    allowed = {"name", "icon", "color", "pos_x", "pos_y", "pos_w", "pos_h", "sort_order"}
    sets = []
    args: list[Any] = []
    for k, v in fields.items():
        if k not in allowed or v is None:
            continue
        if k in ("pos_x", "pos_y", "pos_w", "pos_h"):
            v = float(v)
            if k in ("pos_w", "pos_h"):
                v = max(0.05, min(1.0, v))
            else:
                v = max(0.0, min(1.0, v))
        if k == "name":
            v = str(v).strip()[:60]
            if not v:
                continue
        sets.append(f"{k} = ?")
        args.append(v)
    if not sets:
        return get_room(rid)
    args.append(rid)
    with _conn() as c:
        c.execute(f"UPDATE rooms SET {', '.join(sets)} WHERE id = ?", args)
        c.commit()
    return get_room(rid)


def delete_room(rid: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM rooms WHERE id = ?", (rid,))
        c.commit()


def _slugify(text: str) -> str:
    out = []
    for ch in text.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_", "/", "'"):
            out.append("-")
    s = "".join(out).strip("-")
    while "--" in s:
        s = s.replace("--", "-")
    return s[:48]


# ── Devices ──────────────────────────────────────────────────────

def list_devices() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT d.*, r.name AS room_name, r.color AS room_color "
            "FROM devices d LEFT JOIN rooms r ON r.id = d.room_id "
            "ORDER BY d.sort_order ASC, d.name ASC",
        ).fetchall()
    return [_dev_row(r) for r in rows]


def get_device(did: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute(
            "SELECT d.*, r.name AS room_name, r.color AS room_color "
            "FROM devices d LEFT JOIN rooms r ON r.id = d.room_id "
            "WHERE d.id = ?", (did,),
        ).fetchone()
    return _dev_row(row) if row else None


def _dev_row(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:
        d["config"] = json.loads(d.pop("config_json", "{}") or "{}")
    except Exception:
        d["config"] = {}
    try:
        d["state"] = json.loads(d.pop("state_json", "{}") or "{}")
    except Exception:
        d["state"] = {}
    d["online"] = bool(d.get("online"))
    return d


def create_device(*, type_: str, name: str, room_id: Optional[str],
                  config: dict) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Nom requis")
    if len(name) > 60:
        raise ValueError("Nom trop long (60 max)")
    if not type_:
        raise ValueError("Type requis")
    did = uuid.uuid4().hex
    with _conn() as c:
        max_order = c.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM devices",
        ).fetchone()[0]
        c.execute(
            "INSERT INTO devices (id, type, name, room_id, config_json, "
            "state_json, online, sort_order, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (did, type_, name, room_id or None,
             json.dumps(config or {}, ensure_ascii=False),
             "{}", 0, max_order + 1, now()),
        )
        c.commit()
    return get_device(did)


def update_device(did: str, **fields) -> Optional[dict]:
    allowed = {"name", "room_id", "config", "sort_order"}
    sets = []
    args: list[Any] = []
    for k, v in fields.items():
        if k not in allowed or v is None:
            continue
        if k == "config":
            sets.append("config_json = ?")
            args.append(json.dumps(v or {}, ensure_ascii=False))
        elif k == "name":
            v = str(v).strip()[:60]
            if not v:
                continue
            sets.append("name = ?"); args.append(v)
        elif k == "room_id":
            sets.append("room_id = ?"); args.append(v or None)
        else:
            sets.append(f"{k} = ?"); args.append(v)
    if not sets:
        return get_device(did)
    args.append(did)
    with _conn() as c:
        c.execute(f"UPDATE devices SET {', '.join(sets)} WHERE id = ?", args)
        c.commit()
    return get_device(did)


def update_device_state(did: str, state: dict, *, online: bool,
                        last_error: str = "") -> None:
    with _conn() as c:
        c.execute(
            "UPDATE devices SET state_json = ?, online = ?, "
            "last_seen = ?, last_error = ? WHERE id = ?",
            (json.dumps(state or {}, ensure_ascii=False),
             1 if online else 0, now() if online else 0,
             (last_error or "")[:300], did),
        )
        c.commit()


def delete_device(did: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM devices WHERE id = ?", (did,))
        c.commit()


# ── Scenes ───────────────────────────────────────────────────────

def list_scenes() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM scenes ORDER BY sort_order ASC, name ASC",
        ).fetchall()
    return [_scene_row(r) for r in rows]


def get_scene(sid: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM scenes WHERE id = ?", (sid,)).fetchone()
    return _scene_row(row) if row else None


def _scene_row(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:
        d["actions"] = json.loads(d.pop("actions_json", "[]") or "[]")
    except Exception:
        d["actions"] = []
    return d


def create_scene(name: str, icon: str = "sparkle",
                 color: str = "oklch(0.72 0.15 80)",
                 actions: Optional[list] = None) -> dict:
    name = name.strip()
    if not name:
        raise ValueError("Nom requis")
    sid = uuid.uuid4().hex
    with _conn() as c:
        max_order = c.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM scenes",
        ).fetchone()[0]
        c.execute(
            "INSERT INTO scenes (id, name, icon, color, actions_json, "
            "sort_order, created_at) VALUES (?,?,?,?,?,?,?)",
            (sid, name, icon or "sparkle", color or "oklch(0.72 0.15 80)",
             json.dumps(actions or [], ensure_ascii=False),
             max_order + 1, now()),
        )
        c.commit()
    return get_scene(sid)


def update_scene(sid: str, **fields) -> Optional[dict]:
    allowed = {"name", "icon", "color", "actions", "sort_order"}
    sets, args = [], []
    for k, v in fields.items():
        if k not in allowed or v is None:
            continue
        if k == "actions":
            sets.append("actions_json = ?")
            args.append(json.dumps(v or [], ensure_ascii=False))
        elif k == "name":
            v = str(v).strip()[:60]
            if not v:
                continue
            sets.append("name = ?"); args.append(v)
        else:
            sets.append(f"{k} = ?"); args.append(v)
    if not sets:
        return get_scene(sid)
    args.append(sid)
    with _conn() as c:
        c.execute(f"UPDATE scenes SET {', '.join(sets)} WHERE id = ?", args)
        c.commit()
    return get_scene(sid)


def delete_scene(sid: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM scenes WHERE id = ?", (sid,))
        c.commit()


# ── Schedules ────────────────────────────────────────────────────

def list_schedules() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM schedules ORDER BY time_hhmm ASC, name ASC",
        ).fetchall()
    return [_sched_row(r) for r in rows]


def _sched_row(row: sqlite3.Row) -> dict:
    d = dict(row)
    try:
        d["params"] = json.loads(d.pop("params_json", "{}") or "{}")
    except Exception:
        d["params"] = {}
    d["enabled"] = bool(d.get("enabled"))
    d["weekdays"] = [int(x) for x in (d.get("weekdays") or "").split(",") if x.strip().isdigit()]
    return d


def create_schedule(*, name: str, kind: str, target_id: str,
                    action: str, params: dict,
                    time_hhmm: str, weekdays: list[int],
                    enabled: bool = True) -> dict:
    if kind not in ("scene", "device"):
        raise ValueError("kind invalide")
    if not _valid_hhmm(time_hhmm):
        raise ValueError("Heure invalide (HH:MM)")
    wd = ",".join(str(int(x)) for x in weekdays if 0 <= int(x) <= 6)
    sid = uuid.uuid4().hex
    with _conn() as c:
        c.execute(
            "INSERT INTO schedules (id, name, kind, target_id, action, "
            "params_json, time_hhmm, weekdays, enabled, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?,?)",
            (sid, name.strip()[:60] or "Programmation",
             kind, target_id, action or "",
             json.dumps(params or {}, ensure_ascii=False),
             time_hhmm, wd or "0,1,2,3,4,5,6",
             1 if enabled else 0, now()),
        )
        c.commit()
    return get_schedule(sid)


def get_schedule(sid: str) -> Optional[dict]:
    with _conn() as c:
        row = c.execute("SELECT * FROM schedules WHERE id = ?", (sid,)).fetchone()
    return _sched_row(row) if row else None


def update_schedule(sid: str, **fields) -> Optional[dict]:
    allowed = {"name", "kind", "target_id", "action", "params",
               "time_hhmm", "weekdays", "enabled", "last_run"}
    sets, args = [], []
    for k, v in fields.items():
        if k not in allowed or v is None:
            continue
        if k == "params":
            sets.append("params_json = ?")
            args.append(json.dumps(v or {}, ensure_ascii=False))
        elif k == "weekdays":
            wd = ",".join(str(int(x)) for x in v if 0 <= int(x) <= 6)
            sets.append("weekdays = ?"); args.append(wd or "0,1,2,3,4,5,6")
        elif k == "enabled":
            sets.append("enabled = ?"); args.append(1 if v else 0)
        elif k == "time_hhmm":
            if not _valid_hhmm(v):
                continue
            sets.append("time_hhmm = ?"); args.append(v)
        else:
            sets.append(f"{k} = ?"); args.append(v)
    if not sets:
        return get_schedule(sid)
    args.append(sid)
    with _conn() as c:
        c.execute(f"UPDATE schedules SET {', '.join(sets)} WHERE id = ?", args)
        c.commit()
    return get_schedule(sid)


def delete_schedule(sid: str) -> None:
    with _conn() as c:
        c.execute("DELETE FROM schedules WHERE id = ?", (sid,))
        c.commit()


def _valid_hhmm(s: str) -> bool:
    try:
        h, m = s.split(":")
        return 0 <= int(h) <= 23 and 0 <= int(m) <= 59
    except Exception:
        return False


# ── Action history ──────────────────────────────────────────────

def log_action(*, device_id: Optional[str], device_name: str,
               action: str, params: dict,
               status: str = "ok", message: str = "",
               source: str = "user") -> None:
    hid = uuid.uuid4().hex
    with _conn() as c:
        c.execute(
            "INSERT INTO action_history (id, device_id, device_name, action, "
            "params_json, status, message, source, created_at) "
            "VALUES (?,?,?,?,?,?,?,?,?)",
            (hid, device_id, (device_name or "")[:60], action,
             json.dumps(params or {}, ensure_ascii=False),
             status if status in ("ok", "error") else "ok",
             (message or "")[:300],
             source if source in ("user", "scene", "schedule") else "user",
             now()),
        )
        # Conserve les 1000 dernières lignes max.
        c.execute(
            "DELETE FROM action_history WHERE id NOT IN ("
            "  SELECT id FROM action_history ORDER BY created_at DESC LIMIT 1000"
            ")"
        )
        c.commit()


def list_history(limit: int = 100, device_id: Optional[str] = None) -> list[dict]:
    with _conn() as c:
        if device_id:
            rows = c.execute(
                "SELECT * FROM action_history WHERE device_id = ? "
                "ORDER BY created_at DESC LIMIT ?",
                (device_id, max(1, min(500, int(limit)))),
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM action_history ORDER BY created_at DESC LIMIT ?",
                (max(1, min(500, int(limit))),),
            ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["params"] = json.loads(d.pop("params_json", "{}") or "{}")
        except Exception:
            d["params"] = {}
        out.append(d)
    return out


# ── KV (config) ─────────────────────────────────────────────────

def kv_get(key: str, default: Any = None) -> Any:
    with _conn() as c:
        row = c.execute("SELECT value FROM kv WHERE key = ?", (key,)).fetchone()
    if not row:
        return default
    try:
        return json.loads(row["value"])
    except Exception:
        return default


def kv_set(key: str, value: Any) -> None:
    with _conn() as c:
        c.execute(
            "INSERT INTO kv (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value, ensure_ascii=False)),
        )
        c.commit()


# ── Stats ───────────────────────────────────────────────────────

def stats() -> dict:
    with _conn() as c:
        rooms = c.execute("SELECT COUNT(*) FROM rooms").fetchone()[0]
        devices = c.execute("SELECT COUNT(*) FROM devices").fetchone()[0]
        online = c.execute("SELECT COUNT(*) FROM devices WHERE online = 1").fetchone()[0]
        scenes = c.execute("SELECT COUNT(*) FROM scenes").fetchone()[0]
        schedules = c.execute("SELECT COUNT(*) FROM schedules").fetchone()[0]
    return {
        "rooms": rooms,
        "devices": devices,
        "devices_online": online,
        "scenes": scenes,
        "schedules": schedules,
    }

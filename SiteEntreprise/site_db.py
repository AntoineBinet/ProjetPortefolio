"""SiteEntreprise — base SQLite locale pour gérer les comptes admin de la
démo Up Technologies (séparée des credentials Portfolio).

Stockage : site_users.db (gitignored), à côté de content.json.

Schéma :
    users (id, username, password_hash, created_at, updated_at)

Bootstrap : si la table est vide, crée un compte admin/admin par défaut.
Le mot de passe est ensuite changeable via l'UI admin.
"""
from __future__ import annotations

import datetime
import sqlite3
import threading
from pathlib import Path
from typing import Optional

from werkzeug.security import check_password_hash, generate_password_hash

_HERE = Path(__file__).resolve().parent
_DB_FILE = _HERE / "site_users.db"

_lock = threading.Lock()
_initialized = False


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def _conn() -> sqlite3.Connection:
    c = sqlite3.connect(str(_DB_FILE), timeout=10, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA foreign_keys=ON")
    return c


def init_db() -> None:
    """Crée la table users et un compte admin par défaut si nécessaire."""
    global _initialized
    with _lock:
        if _initialized:
            return
        with _conn() as c:
            c.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id            INTEGER PRIMARY KEY AUTOINCREMENT,
                    username      TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    created_at    TEXT NOT NULL,
                    updated_at    TEXT NOT NULL
                )
                """
            )
            row = c.execute("SELECT COUNT(*) AS n FROM users").fetchone()
            if row["n"] == 0:
                now = _now()
                c.execute(
                    "INSERT INTO users (username, password_hash, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?)",
                    ("admin", generate_password_hash("admin"), now, now),
                )
        _initialized = True


def verify_credentials(username: str, password: str) -> Optional[dict]:
    """Renvoie {id, username} si les creds matchent, None sinon."""
    if not username or not password:
        return None
    with _conn() as c:
        row = c.execute(
            "SELECT id, username, password_hash FROM users WHERE username = ?",
            (username.strip(),),
        ).fetchone()
    if row is None:
        return None
    if not check_password_hash(row["password_hash"], password):
        return None
    return {"id": row["id"], "username": row["username"]}


def list_users() -> list[dict]:
    with _conn() as c:
        rows = c.execute(
            "SELECT id, username, created_at, updated_at FROM users ORDER BY id ASC"
        ).fetchall()
    return [dict(r) for r in rows]


def get_user(username: str) -> Optional[dict]:
    with _conn() as c:
        r = c.execute(
            "SELECT id, username, created_at, updated_at FROM users WHERE username = ?",
            (username,),
        ).fetchone()
    return dict(r) if r else None


def count_users() -> int:
    with _conn() as c:
        r = c.execute("SELECT COUNT(*) AS n FROM users").fetchone()
    return int(r["n"])


def create_user(username: str, password: str) -> dict:
    """Crée un user. Lève ValueError si username existe ou champs invalides."""
    username = (username or "").strip()
    password = password or ""
    if not username:
        raise ValueError("Identifiant requis")
    if len(username) > 64:
        raise ValueError("Identifiant trop long (max 64)")
    if len(password) < 4:
        raise ValueError("Mot de passe trop court (min 4 caractères)")
    now = _now()
    try:
        with _conn() as c:
            c.execute(
                "INSERT INTO users (username, password_hash, created_at, updated_at) "
                "VALUES (?, ?, ?, ?)",
                (username, generate_password_hash(password), now, now),
            )
    except sqlite3.IntegrityError:
        raise ValueError(f"Identifiant '{username}' déjà utilisé")
    return get_user(username)


def set_password(username: str, password: str) -> None:
    if not username:
        raise ValueError("Identifiant requis")
    if len(password) < 4:
        raise ValueError("Mot de passe trop court (min 4 caractères)")
    with _conn() as c:
        cur = c.execute(
            "UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ?",
            (generate_password_hash(password), _now(), username.strip()),
        )
        if cur.rowcount == 0:
            raise ValueError(f"Utilisateur '{username}' introuvable")


def rename_user(old_username: str, new_username: str) -> None:
    new_username = (new_username or "").strip()
    if not new_username:
        raise ValueError("Nouvel identifiant requis")
    if len(new_username) > 64:
        raise ValueError("Identifiant trop long (max 64)")
    if old_username == new_username:
        return
    try:
        with _conn() as c:
            cur = c.execute(
                "UPDATE users SET username = ?, updated_at = ? WHERE username = ?",
                (new_username, _now(), old_username),
            )
            if cur.rowcount == 0:
                raise ValueError(f"Utilisateur '{old_username}' introuvable")
    except sqlite3.IntegrityError:
        raise ValueError(f"Identifiant '{new_username}' déjà utilisé")


def delete_user(username: str) -> None:
    """Supprime un user. Refuse si c'est le dernier."""
    if count_users() <= 1:
        raise ValueError("Impossible de supprimer le dernier compte admin")
    with _conn() as c:
        cur = c.execute("DELETE FROM users WHERE username = ?", (username.strip(),))
        if cur.rowcount == 0:
            raise ValueError(f"Utilisateur '{username}' introuvable")

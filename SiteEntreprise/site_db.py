"""SiteEntreprise — store du mot de passe admin (mini-CMS Up Technologies).

Pas de comptes utilisateurs, pas de DB : un seul mot de passe sert à
déverrouiller le mode édition via le cadenas en haut à droite.

Stockage : `admin_pass.json` (gitignored) à côté de content.json.
Format :
    {"hash": "<werkzeug_hash>", "changed": false}

`changed=False` → le mot de passe est encore le défaut (« admin »), l'UI
forcera le changement à la première utilisation.
"""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import Optional

from werkzeug.security import check_password_hash, generate_password_hash

_HERE = Path(__file__).resolve().parent
_PASS_FILE = _HERE / "admin_pass.json"
_DEFAULT_PASSWORD = "admin"

_lock = threading.Lock()


def _load() -> dict:
    try:
        return json.loads(_PASS_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except Exception:
        return {}


def _save(data: dict) -> None:
    _PASS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")


def init_db() -> None:
    """Bootstrap : crée admin_pass.json avec le mot de passe par défaut si absent."""
    with _lock:
        cfg = _load()
        if not cfg.get("hash"):
            _save({
                "hash": generate_password_hash(_DEFAULT_PASSWORD),
                "changed": False,
            })


def verify_password(password: str) -> bool:
    """True si le mot de passe correspond au mot de passe stocké."""
    if not password:
        return False
    cfg = _load()
    h = cfg.get("hash")
    if not h:
        return password == _DEFAULT_PASSWORD
    return check_password_hash(h, password)


def must_change_password() -> bool:
    """True tant que le mot de passe est encore le défaut (jamais modifié)."""
    cfg = _load()
    return not bool(cfg.get("changed"))


def set_password(new_password: str) -> None:
    """Change le mot de passe. Min 8 caractères. Marque comme changé."""
    if not new_password or len(new_password) < 8:
        raise ValueError("Mot de passe trop court (min 8 caractères)")
    with _lock:
        _save({
            "hash": generate_password_hash(new_password),
            "changed": True,
        })

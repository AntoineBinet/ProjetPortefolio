"""Rate-limiter en mémoire — anti-brute-force partagé par les pages de connexion.

Le serveur tourne en process unique (Waitress) : un dict protégé par un Lock
suffit. L'état est volontairement non persistant — il est perdu au redémarrage,
ce qui est acceptable puisque le redémarrage exige désormais une authentification.

Usage type dans un endpoint d'authentification ::

    key = f"login:{client_ip()}"
    wait = retry_after(key)
    if wait > 0:
        return jsonify(ok=False, error="Trop de tentatives"), 429
    ...vérifier les identifiants...
    if ok:
        reset(key)
    else:
        register_failure(key)
"""
from __future__ import annotations

import threading
import time

_lock = threading.Lock()
_failures: dict[str, list[float]] = {}     # clé -> timestamps d'échec récents
_blocked_until: dict[str, float] = {}      # clé -> timestamp de fin de blocage

DEFAULT_MAX_ATTEMPTS = 8
DEFAULT_WINDOW = 300.0      # fenêtre glissante : 5 min
DEFAULT_BLOCK = 900.0       # durée de blocage : 15 min


def retry_after(key: str) -> float:
    """Secondes restantes avant déblocage (0.0 si la requête est autorisée)."""
    now = time.time()
    with _lock:
        until = _blocked_until.get(key, 0.0)
        if until <= now:
            _blocked_until.pop(key, None)
            return 0.0
        return until - now


def register_failure(key: str, *, max_attempts: int = DEFAULT_MAX_ATTEMPTS,
                     window: float = DEFAULT_WINDOW,
                     block: float = DEFAULT_BLOCK) -> None:
    """Enregistre un échec. Au-delà de `max_attempts` échecs dans `window`
    secondes, la clé est bloquée pendant `block` secondes."""
    now = time.time()
    with _lock:
        fails = [t for t in _failures.get(key, []) if t > now - window]
        fails.append(now)
        if len(fails) >= max_attempts:
            _blocked_until[key] = now + block
            _failures.pop(key, None)
        else:
            _failures[key] = fails


def reset(key: str) -> None:
    """Remet la clé à zéro — à appeler après une authentification réussie."""
    with _lock:
        _failures.pop(key, None)
        _blocked_until.pop(key, None)


def client_ip() -> str:
    """IP du client. Derrière le tunnel Cloudflare, l'en-tête CF-Connecting-IP
    porte l'IP réelle (posée par Cloudflare, non falsifiable par le client)."""
    from flask import request
    return (request.headers.get("CF-Connecting-IP")
            or (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
            or request.remote_addr
            or "?")


# ── Jauge de connexions concurrentes (anti-saturation SSE — M7) ──────────
_active: dict[str, int] = {}       # clé -> nombre de connexions ouvertes


def acquire(key: str, limit: int) -> bool:
    """Réserve un slot de connexion concurrente pour `key`.

    Renvoie True si le slot est accordé (le compteur était sous `limit`),
    False sinon. Tout appel renvoyant True DOIT être suivi d'un `release(key)`
    (typiquement dans un bloc `finally`)."""
    with _lock:
        n = _active.get(key, 0)
        if n >= limit:
            return False
        _active[key] = n + 1
        return True


def release(key: str) -> None:
    """Libère un slot réservé par `acquire`."""
    with _lock:
        n = _active.get(key, 0)
        if n <= 1:
            _active.pop(key, None)
        else:
            _active[key] = n - 1

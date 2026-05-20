"""Casino — Flask Blueprint autonome.

Cette entité est indépendante du Portfolio : tout son backend (auth, DB, rooms
multijoueur, SSE) vit ici. Elle s'enregistre dans l'app Flask hôte via
`app.register_blueprint(casino_bp)` mais pourrait tourner dans une autre app
sans modifications.

Routes :
    /casino                        → SPA (index.html)
    /casino/static/<f>             → assets
    /casino/api/me                 → profil courant
    /casino/api/auth/admin-login   → login admin par mdp Portfolio
    /casino/api/auth/logout
    /casino/api/auth/invite/<id>   → infos publiques sur une invitation
    /casino/api/auth/redeem        → consomme une invitation
    /casino/api/admin/users
    /casino/api/admin/users/<uid>             (POST/DELETE)
    /casino/api/admin/users/<uid>/chips       (POST)
    /casino/api/admin/users/<uid>/log         (GET)
    /casino/api/admin/invites                 (GET/POST)
    /casino/api/admin/invites/<iid>           (DELETE)
    /casino/api/chips/cashout
    /casino/api/room/...           → multijoueur (rooms en mémoire, SSE)
"""
from __future__ import annotations

import json
import os
import random
import secrets
import sqlite3
import time
import uuid
from collections import deque
from pathlib import Path
from queue import Empty, Queue
from threading import Lock

from flask import Blueprint, Response, jsonify, request, send_from_directory

from . import casino_db


CASINO_DIR = Path(__file__).resolve().parent
_ROOM_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

# Multijoueur — stockage en mémoire (les rooms ne survivent pas au restart)
_rooms: dict[str, dict] = {}
_rooms_lock = Lock()

# Cookie de session Casino — distinct de la session Portfolio
CASINO_COOKIE = "casino_session"


# ── Init DB au chargement du module ──────────────────────────────
casino_db.init()
casino_db.ensure_admin(
    name="admin",
    chips=int(os.environ.get("CASINO_ADMIN_CHIPS", "100000")),
)
# Révocation unique des credentials fuités via casino.db versionnée dans git
# (audit sécurité — faille C1). Idempotent : ne s'exécute qu'au 1er démarrage
# après déploiement de ce correctif.
casino_db.purge_compromised_credentials("security_rotation_2026_05_C1")


# ── Blueprint ────────────────────────────────────────────────────
casino_bp = Blueprint("casino", __name__)


# ── Helpers HTTP ─────────────────────────────────────────────────

def _client_ip() -> str:
    return (request.headers.get("X-Forwarded-For") or
            request.remote_addr or "")[:64]


def _require_same_origin():
    """Refuse les requêtes cross-origin (CSRF basique)."""
    origin = request.headers.get("Origin") or ""
    referer = request.headers.get("Referer") or ""
    host = request.host_url.rstrip("/")
    if origin and not origin.startswith(host):
        return jsonify(ok=False, error="Origine non autorisée"), 403
    if not origin and referer and not referer.startswith(host):
        return jsonify(ok=False, error="Referer non autorisé"), 403
    return None


def _set_casino_cookie(resp, token: str, ttl_days: int = 30):
    """Cookie HttpOnly + SameSite=Lax (+ Secure si HTTPS), scope `/`.

    Le scope `/` est nécessaire pour que le middleware d'isolation Portfolio
    voie le cookie depuis n'importe quelle route. La sécurité repose sur :
      - HttpOnly : non accessible par JS
      - SameSite=Lax : pas envoyé en cross-site (anti-CSRF basique)
      - Secure (HTTPS) : pas envoyé sur HTTP en prod
    """
    secure = (request.is_secure or
              (request.headers.get("X-Forwarded-Proto") == "https"))
    resp.set_cookie(
        CASINO_COOKIE, token,
        max_age=ttl_days * 86400,
        httponly=True,
        secure=bool(secure),
        samesite="Lax",
        path="/",
    )


def _clear_casino_cookie(resp):
    resp.set_cookie(CASINO_COOKIE, "", max_age=0, path="/",
                    httponly=True, samesite="Lax")


def _casino_user() -> dict | None:
    token = request.cookies.get(CASINO_COOKIE)
    if not token:
        return None
    return casino_db.get_session(token)


def _require_user():
    u = _casino_user()
    if not u:
        return None, (jsonify(ok=False, error="Non authentifié"), 401)
    return u, None


def _require_admin():
    u, err = _require_user()
    if err:
        return None, err
    if not u.get("is_admin"):
        return None, (jsonify(ok=False, error="Admin requis"), 403)
    return u, None


# ── SPA (index + assets) ─────────────────────────────────────────

@casino_bp.route("/casino")
@casino_bp.route("/casino/")
def index():
    """Sert le SPA Casino — page autoporteuse, pas de chrome Portfolio."""
    _gc_rooms()
    try:
        html = (CASINO_DIR / "index.html").read_text(encoding="utf-8")
    except FileNotFoundError:
        return "Casino indisponible", 503
    return Response(html, mimetype="text/html")


@casino_bp.route("/casino/static/<path:filename>")
def static_file(filename: str):
    """Sert les assets du SPA Casino. `Cache-Control: no-store` pour que
    les iterations de design ne soient jamais bloquées par un cache stale."""
    resp = send_from_directory(str(CASINO_DIR / "static"), filename, max_age=0)
    resp.headers["Cache-Control"] = "no-store, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    return resp


# ── Auth ─────────────────────────────────────────────────────────

def _user_payload(u: dict) -> dict:
    return {
        "id": u.get("id") or u.get("user_id"),
        "name": u["name"],
        "is_admin": bool(u["is_admin"]),
        "chips": int(u["chips"]),
        "avatar_seed": int(u.get("avatar_seed") or 0),
    }


@casino_bp.get("/casino/api/me")
def api_me():
    u = _casino_user()
    payload = {
        "user": _user_payload(u) if u else None,
        "must_change_password": bool(
            u and u.get("is_admin") and casino_db.admin_must_change_password()
        ),
    }
    return jsonify(ok=True, **payload)


@casino_bp.post("/casino/api/auth/admin-login")
def api_admin_login():
    chk = _require_same_origin()
    if chk: return chk
    data = request.get_json(silent=True) or {}
    user_in = (data.get("username") or "").strip()
    pwd = (data.get("password") or "").strip()
    expected_user = casino_db.get_admin_username()
    if not secrets.compare_digest(user_in, expected_user) or not casino_db.check_admin_password(pwd):
        time.sleep(0.5)
        return jsonify(ok=False, error="Identifiants invalides"), 401
    admin_id = casino_db.ensure_admin(
        name="admin",
        chips=int(os.environ.get("CASINO_ADMIN_CHIPS", "100000")),
    )
    token = casino_db.create_session(
        admin_id, ip=_client_ip(), ua=request.headers.get("User-Agent"),
    )
    user = casino_db.get_user(admin_id)
    resp = jsonify(
        ok=True,
        user=_user_payload(user),
        must_change_password=casino_db.admin_must_change_password(),
    )
    _set_casino_cookie(resp, token)
    return resp


@casino_bp.post("/casino/api/auth/admin-password")
def api_admin_change_password():
    """Change le mot de passe admin Casino. Requiert l'admin connecté + l'ancien mdp.

    Permet aussi de changer l'identifiant admin en une seule étape (utile au
    forçage du premier changement).
    """
    admin, err = _require_admin()
    if err: return err
    chk = _require_same_origin()
    if chk: return chk
    data = request.get_json(silent=True) or {}
    old = (data.get("old_password") or "").strip()
    new = (data.get("new_password") or "").strip()
    new_user = (data.get("new_username") or "").strip()
    if len(new) < 6:
        return jsonify(ok=False, error="Nouveau mot de passe trop court (min 6)"), 400
    if not casino_db.check_admin_password(old):
        time.sleep(0.5)
        return jsonify(ok=False, error="Ancien mot de passe incorrect"), 401
    casino_db.set_admin_password(new)
    if new_user and new_user != casino_db.get_admin_username():
        try:
            casino_db.set_admin_username(new_user)
        except ValueError as e:
            return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, message="Mot de passe mis à jour",
                   admin_username=casino_db.get_admin_username())


@casino_bp.post("/casino/api/auth/logout")
def api_logout():
    token = request.cookies.get(CASINO_COOKIE)
    if token:
        casino_db.delete_session(token)
    resp = jsonify(ok=True)
    _clear_casino_cookie(resp)
    return resp


@casino_bp.get("/casino/api/auth/invite/<iid>")
def api_invite_info(iid: str):
    inv = casino_db.get_invite(iid)
    if not inv or inv.get("used_by"):
        return jsonify(ok=False, error="Lien invalide ou déjà utilisé"), 404
    if inv.get("expires_at") and inv["expires_at"] < time.time():
        return jsonify(ok=False, error="Lien expiré"), 410
    return jsonify(ok=True, invite={
        "id": inv["id"],
        "starting_chips": int(inv["starting_chips"]),
        "is_admin": bool(inv["is_admin"]),
        "expires_at": inv["expires_at"],
        "note": inv.get("note") or "",
    })


@casino_bp.post("/casino/api/auth/redeem")
def api_redeem():
    chk = _require_same_origin()
    if chk: return chk
    data = request.get_json(silent=True) or {}
    iid = (data.get("invite_id") or "").strip()
    code = (data.get("code") or "").strip().upper()
    name = (data.get("name") or "").strip()
    avatar = int(data.get("avatar_seed") or 0)
    try:
        token, user = casino_db.redeem_invite(iid, code, name, avatar_seed=avatar)
    except ValueError as e:
        time.sleep(0.4)
        return jsonify(ok=False, error=str(e)), 400
    resp = jsonify(ok=True, user=_user_payload(user))
    _set_casino_cookie(resp, token)
    return resp


# ── Admin ────────────────────────────────────────────────────────

@casino_bp.get("/casino/api/admin/users")
def api_admin_users():
    _, err = _require_admin()
    if err: return err
    return jsonify(ok=True, users=casino_db.list_users())


@casino_bp.post("/casino/api/admin/users/<uid>/chips")
def api_admin_chips(uid: str):
    admin, err = _require_admin()
    if err: return err
    chk = _require_same_origin()
    if chk: return chk
    data = request.get_json(silent=True) or {}
    if "delta" in data:
        delta = int(data["delta"])
        reason = (data.get("reason") or "Ajustement manuel")[:120]
    elif "set" in data:
        u = casino_db.get_user(uid)
        if not u: return jsonify(ok=False, error="User inconnu"), 404
        delta = int(data["set"]) - int(u["chips"])
        reason = (data.get("reason") or "Réinitialisation manuelle")[:120]
    else:
        return jsonify(ok=False, error="delta ou set requis"), 400
    try:
        new_chips = casino_db.adjust_chips(
            uid, delta, reason=reason,
            admin_id=admin.get("user_id") or admin.get("id"),
        )
    except KeyError:
        return jsonify(ok=False, error="User inconnu"), 404
    return jsonify(ok=True, chips=new_chips)


@casino_bp.post("/casino/api/admin/users/<uid>")
def api_admin_update_user(uid: str):
    admin, err = _require_admin()
    if err: return err
    chk = _require_same_origin()
    if chk: return chk
    data = request.get_json(silent=True) or {}
    fields = {}
    if "name" in data:
        n = (data["name"] or "").strip()
        if not (2 <= len(n) <= 24):
            return jsonify(ok=False, error="Nom invalide"), 400
        fields["name"] = n
    if "notes" in data:
        fields["notes"] = (data["notes"] or "")[:500]
    if "avatar_seed" in data:
        fields["avatar_seed"] = int(data["avatar_seed"]) % 24
    admin_id = admin.get("user_id") or admin.get("id")
    if "is_admin" in data and admin_id != uid:
        fields["is_admin"] = 1 if data["is_admin"] else 0
    try:
        ok = casino_db.update_user(uid, **fields)
    except sqlite3.IntegrityError:
        return jsonify(ok=False, error="Pseudo déjà pris"), 409
    return jsonify(ok=ok, user=casino_db.get_user(uid))


@casino_bp.delete("/casino/api/admin/users/<uid>")
def api_admin_delete_user(uid: str):
    admin, err = _require_admin()
    if err: return err
    chk = _require_same_origin()
    if chk: return chk
    admin_id = admin.get("user_id") or admin.get("id")
    if uid == admin_id:
        return jsonify(ok=False, error="Impossible de supprimer son propre compte"), 400
    casino_db.delete_user(uid)
    return jsonify(ok=True)


@casino_bp.post("/casino/api/admin/invites")
def api_admin_create_invite():
    admin, err = _require_admin()
    if err: return err
    chk = _require_same_origin()
    if chk: return chk
    data = request.get_json(silent=True) or {}
    inv = casino_db.create_invite(
        created_by=admin.get("user_id") or admin.get("id"),
        starting_chips=max(0, int(data.get("starting_chips") or 2000)),
        is_admin=bool(data.get("is_admin")),
        ttl_hours=max(1, min(24*30, int(data.get("ttl_hours") or 168))),
        note=(data.get("note") or "").strip()[:200],
    )
    return jsonify(ok=True, invite=inv)


@casino_bp.get("/casino/api/admin/invites")
def api_admin_list_invites():
    _, err = _require_admin()
    if err: return err
    return jsonify(ok=True, invites=casino_db.list_invites())


@casino_bp.delete("/casino/api/admin/invites/<iid>")
def api_admin_delete_invite(iid: str):
    _, err = _require_admin()
    if err: return err
    chk = _require_same_origin()
    if chk: return chk
    casino_db.delete_invite(iid)
    return jsonify(ok=True)


@casino_bp.get("/casino/api/admin/users/<uid>/log")
def api_admin_user_log(uid: str):
    _, err = _require_admin()
    if err: return err
    return jsonify(ok=True, log=casino_db.chip_history(uid, limit=100))


# ── Self ─────────────────────────────────────────────────────────

@casino_bp.post("/casino/api/chips/cashout")
def api_chips_cashout():
    user, err = _require_user()
    if err: return err
    chk = _require_same_origin()
    if chk: return chk
    data = request.get_json(silent=True) or {}
    delta = int(data.get("delta") or 0)
    delta = max(-100_000, min(100_000, delta))
    reason = (data.get("reason") or "Solo")[:120]
    new_chips = casino_db.adjust_chips(
        user.get("user_id") or user.get("id"), delta, reason=reason,
    )
    return jsonify(ok=True, chips=new_chips)


# ── Multijoueur (rooms en mémoire, SSE) ─────────────────────────

def _gen_room_code() -> str:
    for _ in range(50):
        code = "".join(random.choice(_ROOM_ALPHA) for _ in range(6))
        if code not in _rooms:
            return code
    return uuid.uuid4().hex[:6].upper()


def _new_room(host_name: str, max_players: int = 6, blinds=(10, 20),
              starting_stack: int = 2000) -> dict:
    code = _gen_room_code()
    host_id = uuid.uuid4().hex
    room = {
        "code": code, "created": time.time(),
        "host_id": host_id, "phase": "lobby",
        "max_players": max_players,
        "blinds": list(blinds), "starting_stack": starting_stack,
        "players": [{
            "id": host_id, "name": (host_name or "Hôte")[:18],
            "ready": False, "is_host": True, "connected_at": time.time(),
        }],
        "seq": 0, "events": deque(maxlen=200),
        "subscribers": [], "game": None,
        "last_activity": time.time(),
    }
    _rooms[code] = room
    _publish(room, {"type": "room", "room": _public_room(room)})
    return room


def _public_room(room: dict) -> dict:
    return {
        "code": room["code"], "phase": room["phase"],
        "max_players": room["max_players"],
        "blinds": room["blinds"], "starting_stack": room["starting_stack"],
        "host_id": room["host_id"],
        "players": [
            {"id": p["id"], "name": p["name"], "ready": p["ready"], "is_host": p["is_host"]}
            for p in room["players"]
        ],
    }


def _publish(room: dict, event: dict):
    room["seq"] += 1
    event["seq"] = room["seq"]
    event["t"] = time.time()
    room["events"].append(event)
    room["last_activity"] = time.time()
    dead = []
    for q in room["subscribers"]:
        try: q.put_nowait(event)
        except Exception: dead.append(q)
    for q in dead:
        try: room["subscribers"].remove(q)
        except ValueError: pass


def _gc_rooms():
    cutoff = time.time() - 2 * 3600
    with _rooms_lock:
        for code in list(_rooms.keys()):
            if _rooms[code]["last_activity"] < cutoff:
                _rooms.pop(code, None)


@casino_bp.post("/casino/api/room/create")
def api_room_create():
    data = request.get_json(silent=True) or {}
    host_name = (data.get("name") or "Hôte").strip() or "Hôte"
    max_players = max(2, min(6, int(data.get("max_players") or 6)))
    sb = max(1, int(data.get("small_blind") or 10))
    bb = max(2, int(data.get("big_blind") or 2 * sb))
    stack = max(100, int(data.get("starting_stack") or 2000))
    with _rooms_lock:
        room = _new_room(host_name, max_players, (sb, bb), stack)
    return jsonify(ok=True, code=room["code"], host_id=room["host_id"],
                   room=_public_room(room))


@casino_bp.post("/casino/api/room/<code>/join")
def api_room_join(code: str):
    code = code.upper().strip()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "Joueur").strip()[:18] or "Joueur"
    with _rooms_lock:
        room = _rooms.get(code)
        if not room:
            return jsonify(ok=False, error="Room introuvable"), 404
        if room["phase"] != "lobby":
            return jsonify(ok=False, error="Partie déjà lancée"), 409
        if len(room["players"]) >= room["max_players"]:
            return jsonify(ok=False, error="Room complète"), 409
        existing = {p["name"].lower() for p in room["players"]}
        base = name; n = 2
        while name.lower() in existing:
            name = f"{base} {n}"; n += 1
        pid = uuid.uuid4().hex
        room["players"].append({
            "id": pid, "name": name, "ready": False,
            "is_host": False, "connected_at": time.time(),
        })
        _publish(room, {"type": "player_joined", "player": {
            "id": pid, "name": name, "is_host": False, "ready": False,
        }})
    return jsonify(ok=True, player_id=pid, room=_public_room(room))


@casino_bp.post("/casino/api/room/<code>/leave")
def api_room_leave(code: str):
    code = code.upper().strip()
    data = request.get_json(silent=True) or {}
    pid = data.get("player_id")
    with _rooms_lock:
        room = _rooms.get(code)
        if not room: return jsonify(ok=True)
        before = len(room["players"])
        room["players"] = [p for p in room["players"] if p["id"] != pid]
        if before != len(room["players"]):
            _publish(room, {"type": "player_left", "player_id": pid})
        if not room["players"]:
            _rooms.pop(code, None)
    return jsonify(ok=True)


@casino_bp.post("/casino/api/room/<code>/ready")
def api_room_ready(code: str):
    code = code.upper().strip()
    data = request.get_json(silent=True) or {}
    pid = data.get("player_id"); ready = bool(data.get("ready", True))
    with _rooms_lock:
        room = _rooms.get(code)
        if not room: return jsonify(ok=False, error="Room introuvable"), 404
        for p in room["players"]:
            if p["id"] == pid:
                p["ready"] = ready
                _publish(room, {"type": "player_ready", "player_id": pid, "ready": ready})
                return jsonify(ok=True)
    return jsonify(ok=False, error="Joueur introuvable"), 404


@casino_bp.post("/casino/api/room/<code>/start")
def api_room_start(code: str):
    code = code.upper().strip()
    data = request.get_json(silent=True) or {}
    pid = data.get("player_id")
    with _rooms_lock:
        room = _rooms.get(code)
        if not room: return jsonify(ok=False, error="Room introuvable"), 404
        if pid != room["host_id"]:
            return jsonify(ok=False, error="Seul l'hôte peut lancer"), 403
        if len(room["players"]) < 2:
            return jsonify(ok=False, error="≥ 2 joueurs requis"), 400
        room["phase"] = "playing"
        _publish(room, {"type": "game_start"})
    return jsonify(ok=True)


@casino_bp.post("/casino/api/room/<code>/action")
def api_room_action(code: str):
    code = code.upper().strip()
    data = request.get_json(silent=True) or {}
    pid = data.get("player_id"); payload = data.get("payload") or {}
    msg_type = data.get("type") or "action"
    target = data.get("to")
    with _rooms_lock:
        room = _rooms.get(code)
        if not room: return jsonify(ok=False, error="Room introuvable"), 404
        if not any(p["id"] == pid for p in room["players"]):
            return jsonify(ok=False, error="Pas dans la room"), 403
        evt = {"type": msg_type, "from": pid, "payload": payload}
        if target: evt["to"] = target
        _publish(room, evt)
    return jsonify(ok=True)


@casino_bp.get("/casino/api/room/<code>/stream")
def api_room_stream(code: str):
    code = code.upper().strip()
    pid = request.args.get("player_id") or ""
    since = int(request.args.get("since") or 0)
    with _rooms_lock:
        room = _rooms.get(code)
        if not room: return jsonify(ok=False, error="Room introuvable"), 404
        backlog = [e for e in list(room["events"]) if e.get("seq", 0) > since
                   and (not e.get("to") or e["to"] == pid)]
        q: Queue = Queue(maxsize=64)
        room["subscribers"].append(q)

    def gen():
        try:
            yield "retry: 3000\n\n"
            yield f"data: {json.dumps({'type':'hello','room': _public_room(room)})}\n\n"
            for e in backlog:
                yield f"data: {json.dumps(e)}\n\n"
            heartbeat = 0
            while True:
                try:
                    e = q.get(timeout=15)
                    if e.get("to") and e["to"] != pid:
                        continue
                    yield f"data: {json.dumps(e)}\n\n"
                except Empty:
                    heartbeat += 1
                    yield f": ping {heartbeat}\n\n"
        except GeneratorExit:
            pass
        finally:
            try: room["subscribers"].remove(q)
            except (ValueError, KeyError): pass

    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache",
                             "X-Accel-Buffering": "no",
                             "Connection": "keep-alive"})


@casino_bp.get("/casino/api/room/<code>")
def api_room_info(code: str):
    code = code.upper().strip()
    with _rooms_lock:
        room = _rooms.get(code)
        if not room: return jsonify(ok=False, error="Room introuvable"), 404
        return jsonify(ok=True, room=_public_room(room))

"""TYLA Maison — Blueprint Flask (domotique).

Toutes les routes sont préfixées /tyla/. Auth indépendante du Portfolio :
cookie `tyla_session` (HttpOnly, Secure en prod, SameSite=Lax). Aucune
élévation cross-app — un partage du lien /tyla ne donne pas accès à /admin.

Première connexion :
    user : admin / pass : admin
    → forcera un changement de mot de passe avant accès aux autres routes.

Routes :
    /tyla                                     SPA
    /tyla/static/<path>                       assets
    /tyla/api/auth/{me,login,logout,change-password}
    /tyla/api/rooms                           GET, POST
    /tyla/api/rooms/<id>                      PATCH, DELETE
    /tyla/api/devices                         GET, POST
    /tyla/api/devices/<id>                    PATCH, DELETE
    /tyla/api/devices/<id>/action             POST
    /tyla/api/devices/<id>/refresh            POST
    /tyla/api/devices/<id>/test               POST
    /tyla/api/discover                        POST  (LAN broadcast Tuya)
    /tyla/api/types                           GET   (capabilities + actions par type)
    /tyla/api/scenes                          GET, POST
    /tyla/api/scenes/<id>                     PATCH, DELETE
    /tyla/api/scenes/<id>/run                 POST
    /tyla/api/schedules                       GET, POST
    /tyla/api/schedules/<id>                  PATCH, DELETE
    /tyla/api/history                         GET
    /tyla/api/stats                           GET
"""
from __future__ import annotations

import threading
import time
from datetime import datetime
from pathlib import Path

from flask import Blueprint, Response, jsonify, request, send_from_directory

from . import tyla_db, tyla_devices

TYLA_DIR = Path(__file__).resolve().parent
TYLA_COOKIE = "tyla_session"


# ── Init au chargement ───────────────────────────────────────────
tyla_db.init()
_admin_id = tyla_db.ensure_admin()
tyla_db.ensure_default_rooms()
tyla_db.ensure_default_scenes()


# ── Blueprint ────────────────────────────────────────────────────

tyla_bp = Blueprint("tyla", __name__)


# ── Helpers ──────────────────────────────────────────────────────

def _client_ip() -> str:
    return (
        request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or request.remote_addr
        or ""
    )[:64]


def _require_same_origin():
    origin = request.headers.get("Origin") or ""
    referer = request.headers.get("Referer") or ""

    def _strip(url: str) -> str:
        for s in ("https://", "http://"):
            if url.lower().startswith(s):
                return url[len(s):]
        return url

    host = _strip(request.host_url.rstrip("/"))
    if origin and not _strip(origin).startswith(host):
        return jsonify(ok=False, error="Origine non autorisée"), 403
    if not origin and referer and not _strip(referer).startswith(host):
        return jsonify(ok=False, error="Referer non autorisé"), 403
    if not origin and not referer:
        return jsonify(ok=False, error="Origin ou Referer requis"), 403
    return None


def _set_cookie(resp, token: str, ttl_days: int = 30):
    secure = (
        request.is_secure
        or (request.headers.get("X-Forwarded-Proto") == "https")
    )
    resp.set_cookie(
        TYLA_COOKIE, token,
        max_age=ttl_days * 86400,
        httponly=True,
        secure=bool(secure),
        samesite="Lax",
        path="/",
    )


def _clear_cookie(resp):
    resp.set_cookie(TYLA_COOKIE, "", max_age=0, path="/",
                    httponly=True, samesite="Lax")


def _current_user():
    token = request.cookies.get(TYLA_COOKIE)
    if not token:
        return None
    return tyla_db.get_session_user(token)


def _require_user(*, allow_must_change: bool = False):
    """Retourne (user, error_response). Si must_change_password=True et que
    `allow_must_change` est False, renvoie une erreur 403 demandant à l'utilisateur
    de changer son mot de passe avant tout autre appel."""
    u = _current_user()
    if not u:
        return None, (jsonify(ok=False, error="Non authentifié"), 401)
    if u.get("must_change_password") and not allow_must_change:
        return None, (jsonify(
            ok=False, error="must_change_password",
            message="Changement de mot de passe requis avant toute action.",
        ), 403)
    return u, None


# ── SPA + assets ─────────────────────────────────────────────────

@tyla_bp.route("/tyla")
@tyla_bp.route("/tyla/")
def index():
    try:
        html = (TYLA_DIR / "index.html").read_text(encoding="utf-8")
    except FileNotFoundError:
        return "TYLA Maison indisponible", 503
    return Response(html, mimetype="text/html")


@tyla_bp.route("/tyla/static/<path:filename>")
def static_file(filename: str):
    resp = send_from_directory(str(TYLA_DIR / "static"), filename, max_age=0)
    resp.headers["Cache-Control"] = "no-store, must-revalidate"
    return resp


# ── Auth ─────────────────────────────────────────────────────────

@tyla_bp.get("/tyla/api/auth/me")
def api_me():
    u = _current_user()
    if not u:
        return jsonify(ok=True, user=None)
    return jsonify(ok=True, user=u, has_tinytuya=tyla_devices.has_tinytuya())


@tyla_bp.post("/tyla/api/auth/login")
def api_login():
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    username = (body.get("username") or "").strip()
    password = (body.get("password") or "").strip()
    if not username or not password:
        return jsonify(ok=False, error="Identifiants requis"), 400
    u = tyla_db.login(username, password)
    if not u:
        time.sleep(0.4)
        return jsonify(ok=False, error="Identifiants invalides"), 401
    token = tyla_db.create_session(
        u["id"], ip=_client_ip(), ua=request.headers.get("User-Agent", ""),
    )
    resp = jsonify(ok=True, user=u)
    _set_cookie(resp, token)
    return resp


@tyla_bp.post("/tyla/api/auth/logout")
def api_logout():
    token = request.cookies.get(TYLA_COOKIE)
    if token:
        tyla_db.delete_session(token)
    resp = jsonify(ok=True)
    _clear_cookie(resp)
    return resp


@tyla_bp.post("/tyla/api/auth/change-password")
def api_change_password():
    user, err = _require_user(allow_must_change=True)
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    old = (body.get("old_password") or "").strip()
    new = (body.get("new_password") or "").strip()
    if len(new) < 8:
        return jsonify(ok=False, error="Mot de passe trop court (min 8)"), 400
    if old == new:
        return jsonify(ok=False, error="Le nouveau doit différer de l'ancien"), 400
    if not tyla_db.login(user["username"], old):
        time.sleep(0.4)
        return jsonify(ok=False, error="Ancien mot de passe incorrect"), 401
    tyla_db.change_password(user["id"], new)
    # Recrée une session fraîche après changement (les autres ont été tuées)
    token = tyla_db.create_session(
        user["id"], ip=_client_ip(), ua=request.headers.get("User-Agent", ""),
    )
    resp = jsonify(ok=True, user=tyla_db.get_user(user["id"]))
    _set_cookie(resp, token)
    return resp


@tyla_bp.post("/tyla/api/auth/change-username")
def api_change_username():
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    new = (body.get("username") or "").strip()
    if len(new) < 2 or len(new) > 40:
        return jsonify(ok=False, error="Nom d'utilisateur invalide (2-40)"), 400
    ok = tyla_db.change_username(user["id"], new)
    if not ok:
        return jsonify(ok=False, error="Nom déjà pris"), 400
    return jsonify(ok=True, user=tyla_db.get_user(user["id"]))


# ── Types & capabilities ─────────────────────────────────────────

@tyla_bp.get("/tyla/api/types")
def api_types():
    user, err = _require_user()
    if err:
        return err
    return jsonify(
        ok=True,
        types=tyla_devices.all_capabilities(),
        has_tinytuya=tyla_devices.has_tinytuya(),
    )


# ── Rooms ────────────────────────────────────────────────────────

@tyla_bp.get("/tyla/api/rooms")
def api_list_rooms():
    user, err = _require_user()
    if err:
        return err
    return jsonify(ok=True, rooms=tyla_db.list_rooms())


@tyla_bp.post("/tyla/api/rooms")
def api_create_room():
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    try:
        room = tyla_db.create_room(
            name=body.get("name") or "",
            icon=body.get("icon") or "home",
            color=body.get("color") or "oklch(0.7 0.14 230)",
            pos_x=float(body.get("pos_x", 0.2)),
            pos_y=float(body.get("pos_y", 0.2)),
            pos_w=float(body.get("pos_w", 0.25)),
            pos_h=float(body.get("pos_h", 0.25)),
        )
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 500
    return jsonify(ok=True, room=room)


@tyla_bp.patch("/tyla/api/rooms/<rid>")
def api_update_room(rid: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    room = tyla_db.update_room(rid, **body)
    if not room:
        return jsonify(ok=False, error="Pièce introuvable"), 404
    return jsonify(ok=True, room=room)


@tyla_bp.delete("/tyla/api/rooms/<rid>")
def api_delete_room(rid: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    if not tyla_db.get_room(rid):
        return jsonify(ok=False, error="Pièce introuvable"), 404
    tyla_db.delete_room(rid)
    return jsonify(ok=True)


# ── Devices ──────────────────────────────────────────────────────

@tyla_bp.get("/tyla/api/devices")
def api_list_devices():
    user, err = _require_user()
    if err:
        return err
    return jsonify(ok=True, devices=tyla_db.list_devices())


@tyla_bp.post("/tyla/api/devices")
def api_create_device():
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    type_ = (body.get("type") or "").strip().lower()
    if type_ not in tyla_devices.SUPPORTED_TYPES:
        return jsonify(ok=False, error=f"Type non supporté : {type_}"), 400
    try:
        dev = tyla_db.create_device(
            type_=type_,
            name=body.get("name") or "",
            room_id=(body.get("room_id") or None),
            config=body.get("config") or {},
        )
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 500
    # Tente une lecture de status immédiate pour récupérer l'état initial.
    _refresh_device_state(dev["id"])
    return jsonify(ok=True, device=tyla_db.get_device(dev["id"]))


@tyla_bp.patch("/tyla/api/devices/<did>")
def api_update_device(did: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    dev = tyla_db.update_device(did, **body)
    if not dev:
        return jsonify(ok=False, error="Appareil introuvable"), 404
    return jsonify(ok=True, device=dev)


@tyla_bp.delete("/tyla/api/devices/<did>")
def api_delete_device(did: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    if not tyla_db.get_device(did):
        return jsonify(ok=False, error="Appareil introuvable"), 404
    tyla_db.delete_device(did)
    return jsonify(ok=True)


@tyla_bp.post("/tyla/api/devices/<did>/action")
def api_device_action(did: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    dev = tyla_db.get_device(did)
    if not dev:
        return jsonify(ok=False, error="Appareil introuvable"), 404
    body = request.get_json(silent=True) or {}
    action = (body.get("action") or "").strip()
    params = body.get("params") or {}
    state, online, error = _execute_device_action(dev, action, params, source="user")
    return jsonify(
        ok=(not error),
        device=tyla_db.get_device(did),
        state=state,
        online=online,
        error=error or None,
    )


@tyla_bp.post("/tyla/api/devices/<did>/refresh")
def api_device_refresh(did: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    if not tyla_db.get_device(did):
        return jsonify(ok=False, error="Appareil introuvable"), 404
    state, online, error = _refresh_device_state(did)
    return jsonify(
        ok=True, device=tyla_db.get_device(did),
        state=state, online=online, error=error or None,
    )


@tyla_bp.post("/tyla/api/devices/<did>/test")
def api_device_test(did: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    dev = tyla_db.get_device(did)
    if not dev:
        return jsonify(ok=False, error="Appareil introuvable"), 404
    adapter = tyla_devices.get_adapter(dev["type"], dev["config"])
    state, online, error = adapter.get_status()
    tyla_db.update_device_state(did, state, online=online, last_error=error or "")
    return jsonify(
        ok=online,
        state=state, online=online, error=error or None,
        device=tyla_db.get_device(did),
    )


# ── Discovery ───────────────────────────────────────────────────

@tyla_bp.post("/tyla/api/discover")
def api_discover():
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    if not tyla_devices.has_tinytuya():
        return jsonify(
            ok=False,
            error="tinytuya non installé. `pip install tinytuya` puis redémarrer.",
            devices=[],
        ), 200
    devices = tyla_devices.discover_tuya_devices(timeout=6)
    # Repère ceux déjà connus (par device_id)
    known = {d["config"].get("device_id"): d for d in tyla_db.list_devices()}
    for d in devices:
        d["already_added"] = bool(known.get(d.get("device_id")))
    return jsonify(ok=True, devices=devices)


# ── Scenes ───────────────────────────────────────────────────────

@tyla_bp.get("/tyla/api/scenes")
def api_list_scenes():
    user, err = _require_user()
    if err:
        return err
    return jsonify(ok=True, scenes=tyla_db.list_scenes())


@tyla_bp.post("/tyla/api/scenes")
def api_create_scene():
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    try:
        sc = tyla_db.create_scene(
            name=body.get("name") or "",
            icon=body.get("icon") or "sparkle",
            color=body.get("color") or "oklch(0.72 0.15 80)",
            actions=body.get("actions") or [],
        )
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, scene=sc)


@tyla_bp.patch("/tyla/api/scenes/<sid>")
def api_update_scene(sid: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    sc = tyla_db.update_scene(sid, **body)
    if not sc:
        return jsonify(ok=False, error="Scène introuvable"), 404
    return jsonify(ok=True, scene=sc)


@tyla_bp.delete("/tyla/api/scenes/<sid>")
def api_delete_scene(sid: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    if not tyla_db.get_scene(sid):
        return jsonify(ok=False, error="Scène introuvable"), 404
    tyla_db.delete_scene(sid)
    return jsonify(ok=True)


@tyla_bp.post("/tyla/api/scenes/<sid>/run")
def api_run_scene(sid: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    sc = tyla_db.get_scene(sid)
    if not sc:
        return jsonify(ok=False, error="Scène introuvable"), 404
    results = _run_scene(sc, source="user")
    return jsonify(ok=True, results=results)


# ── Schedules ────────────────────────────────────────────────────

@tyla_bp.get("/tyla/api/schedules")
def api_list_schedules():
    user, err = _require_user()
    if err:
        return err
    return jsonify(ok=True, schedules=tyla_db.list_schedules())


@tyla_bp.post("/tyla/api/schedules")
def api_create_schedule():
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    try:
        sched = tyla_db.create_schedule(
            name=body.get("name") or "Programmation",
            kind=body.get("kind") or "scene",
            target_id=body.get("target_id") or "",
            action=body.get("action") or "",
            params=body.get("params") or {},
            time_hhmm=body.get("time_hhmm") or "08:00",
            weekdays=body.get("weekdays") or [0, 1, 2, 3, 4, 5, 6],
            enabled=bool(body.get("enabled", True)),
        )
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, schedule=sched)


@tyla_bp.patch("/tyla/api/schedules/<sid>")
def api_update_schedule(sid: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    sched = tyla_db.update_schedule(sid, **body)
    if not sched:
        return jsonify(ok=False, error="Programmation introuvable"), 404
    return jsonify(ok=True, schedule=sched)


@tyla_bp.delete("/tyla/api/schedules/<sid>")
def api_delete_schedule(sid: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    if not tyla_db.get_schedule(sid):
        return jsonify(ok=False, error="Programmation introuvable"), 404
    tyla_db.delete_schedule(sid)
    return jsonify(ok=True)


# ── History ──────────────────────────────────────────────────────

@tyla_bp.get("/tyla/api/history")
def api_list_history():
    user, err = _require_user()
    if err:
        return err
    limit = max(1, min(500, int(request.args.get("limit", "100"))))
    device_id = request.args.get("device_id") or None
    return jsonify(ok=True, history=tyla_db.list_history(limit=limit, device_id=device_id))


@tyla_bp.get("/tyla/api/stats")
def api_stats():
    user, err = _require_user()
    if err:
        return err
    return jsonify(ok=True, stats=tyla_db.stats())


# ── Internal helpers (action exec, scene run, schedule loop) ────

def _refresh_device_state(did: str) -> tuple[dict, bool, str]:
    dev = tyla_db.get_device(did)
    if not dev:
        return {}, False, "Appareil introuvable"
    adapter = tyla_devices.get_adapter(dev["type"], dev["config"])
    try:
        state, online, error = adapter.get_status()
    except Exception as e:
        state, online, error = {}, False, str(e)[:200]
    tyla_db.update_device_state(did, state, online=online, last_error=error or "")
    return state, online, error


def _execute_device_action(dev: dict, action: str, params: dict,
                           *, source: str) -> tuple[dict, bool, str]:
    adapter = tyla_devices.get_adapter(dev["type"], dev["config"])
    try:
        state, online, error = adapter.execute(action, params or {})
    except Exception as e:
        state, online, error = {}, False, str(e)[:200]
    tyla_db.update_device_state(dev["id"], state, online=online,
                                last_error=error or "")
    tyla_db.log_action(
        device_id=dev["id"], device_name=dev["name"],
        action=action, params=params or {},
        status="ok" if online and not error else "error",
        message=error or "", source=source,
    )
    return state, online, error


def _run_scene(scene: dict, *, source: str) -> list[dict]:
    """Exécute toutes les actions d'une scène en séquence. Retourne un
    résumé par action."""
    results = []
    actions = scene.get("actions") or []
    for step in actions:
        if not isinstance(step, dict):
            continue
        device_id = step.get("device_id")
        action = step.get("action")
        params = step.get("params") or {}
        if not device_id or not action:
            continue
        dev = tyla_db.get_device(device_id)
        if not dev:
            results.append({
                "device_id": device_id, "action": action,
                "ok": False, "error": "Appareil introuvable",
            })
            continue
        state, online, error = _execute_device_action(
            dev, action, params, source=source,
        )
        results.append({
            "device_id": device_id, "device_name": dev["name"],
            "action": action, "ok": online and not error,
            "online": online, "error": error or None, "state": state,
        })
    tyla_db.log_action(
        device_id=None, device_name=f"Scène: {scene.get('name', '')}",
        action="run_scene", params={"scene_id": scene.get("id")},
        status="ok",
        message=f"{sum(1 for r in results if r['ok'])}/{len(results)} OK",
        source=source,
    )
    return results


# ── Scheduler thread ────────────────────────────────────────────

_scheduler_started = False
_scheduler_lock = threading.Lock()


def _scheduler_loop():
    """Tourne en arrière-plan, vérifie chaque minute si une schedule doit
    s'exécuter. Les schedules sont déclenchées au passage de leur heure HH:MM
    sur le bon jour de semaine, et marquées last_run pour éviter les doubles
    déclenchements la même minute."""
    last_minute = ""
    while True:
        try:
            now = datetime.now()
            current_minute = now.strftime("%Y-%m-%d %H:%M")
            if current_minute != last_minute:
                last_minute = current_minute
                _check_and_run_schedules(now)
        except Exception:
            pass
        # sleep court mais pas trop : on veut un tick par minute environ
        time.sleep(20)


def _check_and_run_schedules(now: datetime) -> None:
    hhmm = now.strftime("%H:%M")
    # Python: Monday=0 .. Sunday=6 (idem notre convention)
    weekday = now.weekday()
    today_iso = now.strftime("%Y-%m-%d")
    schedules = tyla_db.list_schedules()
    for sched in schedules:
        if not sched.get("enabled"):
            continue
        if sched.get("time_hhmm") != hhmm:
            continue
        if weekday not in (sched.get("weekdays") or []):
            continue
        # Évite double déclenchement : compare last_run à la minute actuelle
        last_run_ts = sched.get("last_run") or 0
        if last_run_ts:
            try:
                last_dt = datetime.fromtimestamp(last_run_ts)
                if last_dt.strftime("%Y-%m-%d %H:%M") == now.strftime("%Y-%m-%d %H:%M"):
                    continue
            except Exception:
                pass
        # Exécute
        try:
            if sched["kind"] == "scene":
                sc = tyla_db.get_scene(sched["target_id"])
                if sc:
                    _run_scene(sc, source="schedule")
            elif sched["kind"] == "device":
                dev = tyla_db.get_device(sched["target_id"])
                if dev and sched.get("action"):
                    _execute_device_action(
                        dev, sched["action"], sched.get("params") or {},
                        source="schedule",
                    )
            tyla_db.update_schedule(sched["id"], last_run=int(now.timestamp()))
        except Exception:
            tyla_db.log_action(
                device_id=None,
                device_name=f"Programmation: {sched.get('name')}",
                action="schedule_error", params={"id": sched["id"]},
                status="error", message="Exception scheduler",
                source="schedule",
            )


def _ensure_scheduler():
    global _scheduler_started
    with _scheduler_lock:
        if _scheduler_started:
            return
        t = threading.Thread(target=_scheduler_loop, daemon=True,
                             name="tyla-scheduler")
        t.start()
        _scheduler_started = True


_ensure_scheduler()

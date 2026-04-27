"""Portfolio (marienour.work) — Flask app.

Site public (landing scroll-snap + page apps avec dock bulles Apple Watch),
plus une zone /admin/* protégée par login pour la maintenance et le système
de mise à jour Git via SSE (boutons MAJ / Rollback / Restart).
"""
from __future__ import annotations

import datetime
import json
import os
import secrets
import subprocess
import sys
import threading
import time
from functools import wraps
from pathlib import Path

from flask import (
    Blueprint,
    Flask,
    Response,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
)

APP_VERSION = "0.4.2"
APP_DIR = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORTFOLIO_PORT", "8001"))
ADMIN_USER = os.environ.get("PORTFOLIO_USER", "admin")
ADMIN_PASS = os.environ.get("PORTFOLIO_PASS", "admin")

STUDIO_NAME = os.environ.get("PORTFOLIO_NAME", "Antoine Binet")
STUDIO_TAGLINE = os.environ.get(
    "PORTFOLIO_TAGLINE",
    "Designer & developer indépendant. Une collection d'idées d'apps et de sites en cours.",
)
CONTACT_EMAIL = os.environ.get("PORTFOLIO_EMAIL", "hello@marienour.work")

# Liste des projets affichés sur la landing et /apps. Une app = un dossier
# à la racine + une entrée ici. `accent` accepte oklch/hsl/hex, `type` =
# "mobile" ou "web". Les nouveaux projets se créent via /new-app ou
# l'agent app-creator (cf. .claude/).
PROJECTS = [
    {"id": 1, "slug": "casino", "name": "Casino", "tagline": "Texas Hold'em No-Limit — solo vs IA ou multijoueur (lien d'invitation).", "tags": ["web", "poker", "multi"], "year": 2026, "accent": "oklch(0.62 0.18 25)", "type": "web", "demo": "/casino", "cta_label": "Ouvrir l'app"},
]

app = Flask(__name__)
app.secret_key = os.environ.get("PORTFOLIO_SECRET") or secrets.token_hex(32)


@app.after_request
def _no_cache_html(resp):
    """Empêche le cache navigateur/CDN sur les pages HTML.

    Les .css/.js ont leur propre cache-buster (?v=mtime) côté URL, donc on
    peut leur laisser le cache CDN par défaut (4h Cloudflare). Mais le HTML
    doit toujours être frais — sinon les nouvelles classes CSS ne matchent
    pas l'ancien markup en cache et la page rend cassée.
    """
    ct = (resp.headers.get("Content-Type") or "").lower()
    if ct.startswith("text/html"):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp


def _static_v(filename: str) -> str:
    """Cache-buster basé sur le mtime du fichier static.

    Sans ça, Cloudflare met les .css/.js en cache 4h par défaut et le navigateur
    sert l'ancien fichier après une modif.
    """
    try:
        p = APP_DIR / "static" / filename
        return str(int(p.stat().st_mtime))
    except Exception:
        return APP_VERSION


@app.context_processor
def _inject_globals():
    return {
        "studio_name": STUDIO_NAME,
        "studio_tagline": STUDIO_TAGLINE,
        "contact_email": CONTACT_EMAIL,
        "current_year": datetime.datetime.now().year,
        "app_version": APP_VERSION,
        "static_v": _static_v,
    }


# ── Auth helpers ──────────────────────────────────────────────────

def _logged_in() -> bool:
    return bool(session.get("user"))


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not _logged_in():
            return redirect(url_for("login", next=request.path))
        return view(*args, **kwargs)
    return wrapper


def _require_same_origin():
    origin = request.headers.get("Origin") or ""
    referer = request.headers.get("Referer") or ""
    host = request.host_url.rstrip("/")
    if origin and not origin.startswith(host):
        return jsonify(ok=False, error="Origine non autorisée"), 403
    if not origin and referer and not referer.startswith(host):
        return jsonify(ok=False, error="Referer non autorisé"), 403
    return None


# ── Pages publiques ───────────────────────────────────────────────

@app.route("/")
def index():
    """Racine = landing Portfolio (page de présentation : hero + scroll-snap
    par projet + about). Casino et les futures apps apparaissent comme des
    sections en bas. La page apps liste (/apps) est une vue d'index annexe."""
    return render_template("landing.html", projects=PROJECTS)


@app.route("/apps")
def apps_page():
    """Vue d'index annexe — liste verticale des apps avec recherche."""
    return render_template("apps.html", projects=PROJECTS)


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        u = (request.form.get("username") or "").strip()
        p = (request.form.get("password") or "").strip()
        if u == ADMIN_USER and p == ADMIN_PASS:
            session["user"] = u
            return redirect(request.args.get("next") or url_for("admin_parametres"))
        error = "Identifiants invalides"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


# ── Admin ─────────────────────────────────────────────────────────

@app.route("/admin/parametres")
@login_required
def admin_parametres():
    return render_template(
        "admin/parametres.html",
        app_dir=str(APP_DIR),
        user=session.get("user"),
    )


# Compatibilité historique : ancien lien /parametres.
@app.route("/parametres")
def parametres_legacy():
    return redirect(url_for("admin_parametres"), code=301)


# ── Restart ───────────────────────────────────────────────────────

def _schedule_restart(delay: float = 10.0):
    """Quitte avec exit code 42 → boucle du _run_serveur.bat relance.

    Si lancé hors .bat (dev direct), spawn un nouveau process puis exit 0.
    """
    def _do():
        time.sleep(float(delay))
        launcher = (os.environ.get("PORTFOLIO_LAUNCHER") or "").strip().upper()
        if launcher == "BAT":
            os._exit(42)
        try:
            args = [sys.executable] + sys.argv
            flags = 0
            if sys.platform == "win32":
                try:
                    flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
                except AttributeError:
                    flags = subprocess.CREATE_NEW_PROCESS_GROUP
            subprocess.Popen(
                args,
                cwd=str(APP_DIR),
                creationflags=flags if sys.platform == "win32" else 0,
                start_new_session=(sys.platform != "win32"),
            )
            time.sleep(1.5)
        except Exception:
            pass
        os._exit(0)

    threading.Thread(target=_do, daemon=True).start()


# ── Deploy blueprint ──────────────────────────────────────────────

deploy_bp = Blueprint("deploy", __name__)


def _git(*args, timeout=10):
    return subprocess.run(
        ["git", *args], cwd=str(APP_DIR),
        capture_output=True, text=True, timeout=timeout,
    )


@deploy_bp.post("/api/deploy/pull")
@login_required
def api_deploy_pull():
    chk = _require_same_origin()
    if chk:
        return chk

    def gen():
        try:
            yield f"data: {json.dumps({'step': 'log', 'line': f'Dossier : {APP_DIR}'})}\n\n"
            cp = _git("rev-parse", "--git-dir", timeout=2)
            if cp.returncode != 0:
                yield f"data: {json.dumps({'step': 'error', 'error': 'Pas un dépôt git'})}\n\n"
                return

            remote = _git("remote", "get-url", "origin", timeout=2)
            if remote.returncode == 0:
                yield f"data: {json.dumps({'step': 'log', 'line': f'Remote : {remote.stdout.strip()}'})}\n\n"

            yield f"data: {json.dumps({'step': 'fetch', 'message': 'git fetch origin main…'})}\n\n"
            fetch = _git("fetch", "--prune", "origin", "main", timeout=20)
            if fetch.returncode != 0:
                yield f"data: {json.dumps({'step': 'error', 'error': fetch.stderr.strip() or 'fetch failed'})}\n\n"
                return

            local = _git("rev-parse", "HEAD", timeout=2).stdout.strip()
            remote_h = _git("rev-parse", "origin/main", timeout=2).stdout.strip()
            if local == remote_h:
                yield f"data: {json.dumps({'step': 'done', 'updated': False, 'message': 'Déjà à jour', 'local_hash': local[:7], 'remote_hash': remote_h[:7]})}\n\n"
                return

            try:
                (APP_DIR / ".last_commit_hash").write_text(local, encoding="utf-8")
                yield f"data: {json.dumps({'step': 'log', 'line': f'Commit actuel sauvegardé ({local[:7]})'})}\n\n"
            except Exception:
                pass

            # Stash si modifs locales
            status = _git("status", "--porcelain", timeout=5)
            if status.stdout.strip():
                yield f"data: {json.dumps({'step': 'log', 'line': 'Modifs locales → stash'})}\n\n"
                _git("stash", "push", "-m", f"auto-stash {remote_h[:7]}", timeout=5)

            # S'assurer d'être sur main
            cur = _git("branch", "--show-current", timeout=2).stdout.strip()
            if cur and cur != "main":
                co = _git("checkout", "main", timeout=5)
                if co.returncode != 0:
                    _git("checkout", "-B", "main", "origin/main", timeout=5)

            yield f"data: {json.dumps({'step': 'pull', 'message': 'git pull --ff-only…'})}\n\n"
            pull = _git("pull", "--ff-only", "origin", "main", timeout=20)
            if pull.returncode != 0:
                yield f"data: {json.dumps({'step': 'log', 'line': 'ff-only échoué → reset --hard origin/main'})}\n\n"
                reset = _git("reset", "--hard", "origin/main", timeout=10)
                if reset.returncode != 0:
                    yield f"data: {json.dumps({'step': 'error', 'error': reset.stderr.strip()})}\n\n"
                    return

            # pip install si requirements.txt
            req = APP_DIR / "requirements.txt"
            if req.exists():
                yield f"data: {json.dumps({'step': 'log', 'line': 'pip install -r requirements.txt…'})}\n\n"
                try:
                    subprocess.run(
                        [sys.executable, "-m", "pip", "install", "-r", str(req), "--quiet"],
                        cwd=str(APP_DIR), capture_output=True, text=True, timeout=120,
                    )
                except Exception:
                    pass

            new_hash = _git("rev-parse", "HEAD", timeout=2).stdout.strip()
            try:
                (APP_DIR / ".last_commit_hash").write_text(local, encoding="utf-8")
            except Exception:
                pass

            _schedule_restart(delay=10.0)
            yield f"data: {json.dumps({'step': 'done', 'updated': True, 'restarting': True, 'local_hash': local[:7], 'remote_hash': new_hash[:7], 'message': 'MAJ appliquée, redémarrage dans 10 s'})}\n\n"
        except subprocess.TimeoutExpired:
            yield f"data: {json.dumps({'step': 'error', 'error': 'Timeout'})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'step': 'error', 'error': str(e)})}\n\n"

    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@deploy_bp.post("/api/deploy/restart")
@login_required
def api_deploy_restart():
    _schedule_restart(delay=5.0)
    return jsonify(ok=True, message="Redémarrage dans 5 s")


@deploy_bp.post("/api/deploy/pull-from-404")
def api_deploy_pull_from_404():
    chk = _require_same_origin()
    if chk:
        return chk
    try:
        cur = _git("rev-parse", "HEAD", timeout=2).stdout.strip()
        if cur:
            try:
                (APP_DIR / ".last_commit_hash").write_text(cur, encoding="utf-8")
            except Exception:
                pass
        cur_b = _git("branch", "--show-current", timeout=2).stdout.strip()
        if cur_b and cur_b != "main":
            co = _git("checkout", "main", timeout=5)
            if co.returncode != 0:
                _git("checkout", "-B", "main", "origin/main", timeout=5)
        _git("fetch", "--prune", "origin", "main", timeout=20)
        pull = _git("pull", "--ff-only", "origin", "main", timeout=20)
        if pull.returncode != 0:
            reset = _git("reset", "--hard", "origin/main", timeout=10)
            if reset.returncode != 0:
                return jsonify(ok=False, error=reset.stderr.strip()), 500
        _schedule_restart(delay=5.0)
        return jsonify(ok=True, message="MAJ + redémarrage dans 5 s")
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 500


@deploy_bp.post("/api/deploy/rollback")
def api_deploy_rollback():
    chk = _require_same_origin()
    if chk:
        return chk
    try:
        last = APP_DIR / ".last_commit_hash"
        if not last.exists():
            prev = _git("rev-parse", "HEAD~1", timeout=2)
            if prev.returncode != 0:
                return jsonify(ok=False, error="Aucun commit précédent"), 400
            target = prev.stdout.strip()
        else:
            target = last.read_text(encoding="utf-8").strip()
        if not target:
            return jsonify(ok=False, error="Hash invalide"), 400
        chk2 = _git("cat-file", "-e", target, timeout=2)
        if chk2.returncode != 0:
            return jsonify(ok=False, error=f"Commit {target[:7]} introuvable"), 400
        reset = _git("reset", "--hard", target, timeout=10)
        if reset.returncode != 0:
            return jsonify(ok=False, error=reset.stderr.strip()), 500
        _schedule_restart(delay=5.0)
        return jsonify(ok=True, message=f"Rollback vers {target[:7]} + redémarrage dans 5 s",
                       commit_hash=target[:7])
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 500


@deploy_bp.get("/api/deploy/health")
def api_deploy_health():
    try:
        cur = _git("rev-parse", "HEAD", timeout=2).stdout.strip()[:7] or "unknown"
        last = APP_DIR / ".last_commit_hash"
        can_rollback = last.exists()
        rb = None
        if can_rollback:
            try:
                rb = last.read_text(encoding="utf-8").strip()[:7]
            except Exception:
                can_rollback = False
        return jsonify(ok=True, current_hash=cur, can_rollback=can_rollback,
                       rollback_hash=rb, version=APP_VERSION,
                       server_time=datetime.datetime.now().isoformat(timespec="seconds"))
    except Exception as e:
        return jsonify(ok=False, error=str(e)), 500


@deploy_bp.get("/api/deploy/remote")
@login_required
def api_deploy_remote_get():
    cp = _git("remote", "get-url", "origin", timeout=3)
    if cp.returncode != 0:
        return jsonify(ok=False, error="Pas de remote origin"), 400
    return jsonify(ok=True, url=cp.stdout.strip(), app_dir=str(APP_DIR))


app.register_blueprint(deploy_bp)


# ── Casino : SPA + multijoueur ────────────────────────────────────
#
# /casino                 → SPA (Texas Hold'em No-Limit) — page autoporteuse
# /casino/static/<f>      → assets (CSS, JS) du SPA
# /casino/api/room/...    → backend multijoueur (rooms en mémoire, SSE)
#
# Chaque room a un code à 6 caractères (alphabet sans I/O/0/1) et une URL
# d'invitation `marienour.work/casino/#/join/<CODE>`. Un joueur ne peut accéder
# qu'à la room dont il connaît le code (pas de listing public).

import random
import uuid
from collections import deque
from queue import Empty, Queue
from threading import Lock as _ThLock

CASINO_DIR = APP_DIR / "Casino"
_ROOM_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"   # sans I, O, 0, 1
_rooms: dict[str, dict] = {}
_rooms_lock = _ThLock()


def _gen_room_code() -> str:
    """Code lisible 6 chars, garanti unique parmi les rooms actives."""
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
        "code": code,
        "created": time.time(),
        "host_id": host_id,
        "phase": "lobby",          # lobby | playing | ended
        "max_players": max_players,
        "blinds": list(blinds),
        "starting_stack": starting_stack,
        "players": [{
            "id": host_id,
            "name": (host_name or "Hôte")[:18],
            "ready": False,
            "is_host": True,
            "connected_at": time.time(),
        }],
        "seq": 0,                  # incrémenté à chaque mutation
        "events": deque(maxlen=200),
        "subscribers": [],         # liste de Queue() pour SSE
        "game": None,              # rempli par le client hôte (autorité partagée minimale)
        "last_activity": time.time(),
    }
    _rooms[code] = room
    _publish(room, {"type": "room", "room": _public_room(room)})
    return room


def _public_room(room: dict) -> dict:
    """Vue publique d'une room (sans game state — celui-là transite via events)."""
    return {
        "code": room["code"],
        "phase": room["phase"],
        "max_players": room["max_players"],
        "blinds": room["blinds"],
        "starting_stack": room["starting_stack"],
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
        try:
            q.put_nowait(event)
        except Exception:
            dead.append(q)
    for q in dead:
        try:
            room["subscribers"].remove(q)
        except ValueError:
            pass


def _gc_rooms():
    """Purge les rooms inactives depuis > 2 h."""
    cutoff = time.time() - 2 * 3600
    with _rooms_lock:
        for code in list(_rooms.keys()):
            if _rooms[code]["last_activity"] < cutoff:
                _rooms.pop(code, None)


@app.route("/casino")
@app.route("/casino/")
def casino_index():
    """Sert le SPA Casino — page autoporteuse, sans nav portfolio."""
    _gc_rooms()
    try:
        html = (CASINO_DIR / "index.html").read_text(encoding="utf-8")
    except FileNotFoundError:
        return "Casino indisponible", 503
    return Response(html, mimetype="text/html")


@app.route("/casino/static/<path:filename>")
def casino_static(filename: str):
    """Sert les assets du SPA Casino (CSS, JS) depuis Casino/static/."""
    from flask import send_from_directory
    return send_from_directory(str(CASINO_DIR / "static"), filename, max_age=0)


# ── API multijoueur Casino ────────────────────────────────────────

@app.post("/casino/api/room/create")
def casino_room_create():
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


@app.post("/casino/api/room/<code>/join")
def casino_room_join(code: str):
    code = code.upper().strip()
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "Joueur").strip()[:18] or "Joueur"
    with _rooms_lock:
        room = _rooms.get(code)
        if not room:
            return jsonify(ok=False, error="Room introuvable"), 404
        if room["phase"] != "lobby":
            # on autorise toujours l'inscription en spectateur
            return jsonify(ok=False, error="Partie déjà lancée"), 409
        if len(room["players"]) >= room["max_players"]:
            return jsonify(ok=False, error="Room complète"), 409
        # nom unique au sein de la room
        existing = {p["name"].lower() for p in room["players"]}
        base = name
        n = 2
        while name.lower() in existing:
            name = f"{base} {n}"
            n += 1
        pid = uuid.uuid4().hex
        player = {
            "id": pid, "name": name, "ready": False,
            "is_host": False, "connected_at": time.time(),
        }
        room["players"].append(player)
        _publish(room, {"type": "player_joined", "player": {
            "id": pid, "name": name, "is_host": False, "ready": False,
        }})
    return jsonify(ok=True, player_id=pid, room=_public_room(room))


@app.post("/casino/api/room/<code>/leave")
def casino_room_leave(code: str):
    code = code.upper().strip()
    data = request.get_json(silent=True) or {}
    pid = data.get("player_id")
    with _rooms_lock:
        room = _rooms.get(code)
        if not room:
            return jsonify(ok=True)
        before = len(room["players"])
        room["players"] = [p for p in room["players"] if p["id"] != pid]
        if before != len(room["players"]):
            _publish(room, {"type": "player_left", "player_id": pid})
        if not room["players"]:
            _rooms.pop(code, None)
    return jsonify(ok=True)


@app.post("/casino/api/room/<code>/ready")
def casino_room_ready(code: str):
    code = code.upper().strip()
    data = request.get_json(silent=True) or {}
    pid = data.get("player_id")
    ready = bool(data.get("ready", True))
    with _rooms_lock:
        room = _rooms.get(code)
        if not room:
            return jsonify(ok=False, error="Room introuvable"), 404
        for p in room["players"]:
            if p["id"] == pid:
                p["ready"] = ready
                _publish(room, {"type": "player_ready", "player_id": pid, "ready": ready})
                return jsonify(ok=True)
    return jsonify(ok=False, error="Joueur introuvable"), 404


@app.post("/casino/api/room/<code>/start")
def casino_room_start(code: str):
    code = code.upper().strip()
    data = request.get_json(silent=True) or {}
    pid = data.get("player_id")
    with _rooms_lock:
        room = _rooms.get(code)
        if not room:
            return jsonify(ok=False, error="Room introuvable"), 404
        if pid != room["host_id"]:
            return jsonify(ok=False, error="Seul l'hôte peut lancer"), 403
        if len(room["players"]) < 2:
            return jsonify(ok=False, error="≥ 2 joueurs requis"), 400
        room["phase"] = "playing"
        _publish(room, {"type": "game_start"})
    return jsonify(ok=True)


@app.post("/casino/api/room/<code>/action")
def casino_room_action(code: str):
    """Relais d'action de jeu : le serveur ne joue pas — il diffuse aux pairs.

    L'hôte fait office d'autorité côté client (deck mélangé + état dérivé).
    L'anti-cheat repose sur le fait que les hole cards des autres joueurs ne
    sont jamais publiées en clair côté serveur — c'est l'hôte qui envoie des
    snapshots ciblés `to=<player_id>` que seul le destinataire reçoit.
    """
    code = code.upper().strip()
    data = request.get_json(silent=True) or {}
    pid = data.get("player_id")
    payload = data.get("payload") or {}
    msg_type = data.get("type") or "action"
    target = data.get("to")          # None = broadcast, sinon player_id
    with _rooms_lock:
        room = _rooms.get(code)
        if not room:
            return jsonify(ok=False, error="Room introuvable"), 404
        # Vérif appartenance
        if not any(p["id"] == pid for p in room["players"]):
            return jsonify(ok=False, error="Pas dans la room"), 403
        evt = {"type": msg_type, "from": pid, "payload": payload}
        if target:
            evt["to"] = target
        _publish(room, evt)
    return jsonify(ok=True)


@app.get("/casino/api/room/<code>/stream")
def casino_room_stream(code: str):
    """SSE — flux d'événements de la room. ?player_id=<pid> requis pour filtrer
    les messages ciblés (`to=<pid>`)."""
    code = code.upper().strip()
    pid = request.args.get("player_id") or ""
    since = int(request.args.get("since") or 0)

    with _rooms_lock:
        room = _rooms.get(code)
        if not room:
            return jsonify(ok=False, error="Room introuvable"), 404
        # Replay des events manquants
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
            try:
                room["subscribers"].remove(q)
            except (ValueError, KeyError):
                pass

    return Response(gen(), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache",
                             "X-Accel-Buffering": "no",
                             "Connection": "keep-alive"})


@app.get("/casino/api/room/<code>")
def casino_room_info(code: str):
    code = code.upper().strip()
    with _rooms_lock:
        room = _rooms.get(code)
        if not room:
            return jsonify(ok=False, error="Room introuvable"), 404
        return jsonify(ok=True, room=_public_room(room))


# ── 404 (mécanisme de réparation) ─────────────────────────────────

@app.errorhandler(404)
def not_found(_e):
    return render_template("404.html"), 404


# ── Main ──────────────────────────────────────────────────────────

if __name__ == "__main__":
    is_prod = "--prod" in sys.argv
    print(f"[Portfolio] v{APP_VERSION} → http://127.0.0.1:{PORT}  (prod={is_prod})")
    if is_prod:
        from waitress import serve
        serve(app, host="0.0.0.0", port=PORT, threads=8)
    else:
        app.run(host="0.0.0.0", port=PORT, debug=True, use_reloader=False)

"""Portfolio (marienour.work) — Flask app.

Site public (landing scroll-snap + page apps avec dock bulles Apple Watch),
plus une zone /admin/* protégée par login pour la maintenance et le système
de mise à jour Git via SSE (boutons MAJ / Rollback / Restart).
"""
from __future__ import annotations

import datetime
import json
import logging
import os
import secrets
import subprocess
import sys
import threading
import time
import traceback
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
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

import ratelimit

APP_VERSION = "0.4.7"
APP_DIR = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORTFOLIO_PORT", "8001"))
ADMIN_USER = os.environ.get("PORTFOLIO_USER", "admin")

CONFIG_FILE = APP_DIR / ".portfolio_config.json"
DEMANDES_FILE = APP_DIR / ".demandes_modifs.json"
_DEMANDES_LOCK = threading.Lock()


def _load_config() -> dict:
    try:
        return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_config(data: dict) -> None:
    CONFIG_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def _load_demandes() -> list:
    try:
        data = json.loads(DEMANDES_FILE.read_text(encoding="utf-8"))
        if isinstance(data, list):
            return data
    except Exception:
        pass
    return []


def _save_demandes(items: list) -> None:
    DEMANDES_FILE.write_text(json.dumps(items, indent=2, ensure_ascii=False), encoding="utf-8")


def _now_iso() -> str:
    return datetime.datetime.now().isoformat(timespec="seconds")


_local_cfg = _load_config()
if _local_cfg.get("admin_user"):
    ADMIN_USER = _local_cfg["admin_user"]

# Mot de passe admin — stocké haché (jamais en clair). Migration : un ancien
# champ `admin_pass` en clair dans .portfolio_config.json est haché puis effacé.
ADMIN_PASS_HASH = _local_cfg.get("admin_pass_hash")
if not ADMIN_PASS_HASH and _local_cfg.get("admin_pass"):
    ADMIN_PASS_HASH = generate_password_hash(_local_cfg["admin_pass"])
    _local_cfg["admin_pass_hash"] = ADMIN_PASS_HASH
    _local_cfg.pop("admin_pass", None)
    try:
        _save_config(_local_cfg)
    except Exception:
        pass

# Persist a stable Flask secret_key across restarts so that /maj (which
# triggers a process restart) doesn't invalidate every session cookie. Order:
# env var > value stored in .portfolio_config.json > fresh random (persisted).
SECRET_KEY = os.environ.get("PORTFOLIO_SECRET") or _local_cfg.get("secret_key")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_hex(32)
    _local_cfg["secret_key"] = SECRET_KEY
    try:
        _save_config(_local_cfg)
    except Exception:
        pass

# Jeton secret pour /api/deploy/restart-internal — lu depuis
# .portfolio_config.json par l'outil local qui redémarre le Portfolio.
# Remplace l'ancien contrôle d'IP, inopérant derrière le tunnel Cloudflare.
RESTART_TOKEN = os.environ.get("PORTFOLIO_RESTART_TOKEN") or _local_cfg.get("restart_token")
if not RESTART_TOKEN:
    RESTART_TOKEN = secrets.token_hex(32)
    _local_cfg["restart_token"] = RESTART_TOKEN
    try:
        _save_config(_local_cfg)
    except Exception:
        pass


def _verify_admin_password(p: str) -> bool:
    """Vérifie le mot de passe admin Portfolio.

    Priorité : variable d'env PORTFOLIO_PASS (mot de passe en clair fixé au
    déploiement) > hash werkzeug stocké dans .portfolio_config.json > défaut.
    """
    env_pass = os.environ.get("PORTFOLIO_PASS")
    if env_pass:
        return secrets.compare_digest(p, env_pass)
    if ADMIN_PASS_HASH:
        return check_password_hash(ADMIN_PASS_HASH, p)
    return secrets.compare_digest(p, "admin")


def _using_default_password() -> bool:
    """True tant que le mot de passe « admin » fonctionne encore."""
    return _verify_admin_password("admin")

STUDIO_NAME = os.environ.get("PORTFOLIO_NAME", "Antoine Binet")
STUDIO_TAGLINE = os.environ.get(
    "PORTFOLIO_TAGLINE",
    "Designer & developer indépendant. Une collection d'idées d'apps et de sites en cours.",
)
CONTACT_EMAIL = os.environ.get("PORTFOLIO_EMAIL", "hello@marienour.work")

PROJECTS = [
    {"id": 1, "slug": "casino", "name": "Casino", "tagline": "Texas Hold'em No-Limit — solo vs IA ou multijoueur (lien d'invitation).", "tags": ["web", "poker", "multi"], "year": 2026, "accent": "oklch(0.62 0.18 25)", "type": "web", "demo": "/casino", "cta_label": "Ouvrir l'app"},
    {"id": 2, "slug": "site-entreprise", "name": "Site d'entreprise", "tagline": "Site vitrine professionnel — identité, services et contact.", "tags": ["web", "vitrine", "branding"], "year": 2026, "accent": "oklch(0.62 0.18 210)", "type": "web", "demo": "/site-entreprise", "cta_label": "Voir le site"},
]

app = Flask(__name__)
app.secret_key = SECRET_KEY
# Trust X-Forwarded-Proto from Cloudflare/nginx so request.host_url returns
# https:// instead of http://, fixing the _require_same_origin() check.
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

if not app.logger.handlers:
    _h = logging.StreamHandler()
    _h.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s %(message)s"))
    app.logger.addHandler(_h)
app.logger.setLevel(logging.INFO)


@app.after_request
def _no_cache_html(resp):
    ct = (resp.headers.get("Content-Type") or "").lower()
    if ct.startswith("text/html"):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    return resp


def _static_v(filename: str) -> str:
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

    def _strip_scheme(url: str) -> str:
        for s in ("https://", "http://"):
            if url.lower().startswith(s):
                return url[len(s):]
        return url

    host = _strip_scheme(request.host_url.rstrip("/"))
    if origin:
        if not _strip_scheme(origin).startswith(host):
            return jsonify(ok=False, error="Origine non autorisée"), 403
        return None
    if referer:
        if not _strip_scheme(referer).startswith(host):
            return jsonify(ok=False, error="Referer non autorisé"), 403
        return None
    # Fail-closed : sans Origin ni Referer, on refuse. Un navigateur envoie
    # toujours l'un des deux sur une requête mutante same-origin ; leur absence
    # trahit un appel scripté (curl, etc.).
    return jsonify(ok=False, error="Origine non vérifiable"), 403


@app.route("/")
def index():
    return render_template("landing.html", projects=PROJECTS)


@app.route("/apps")
def apps_page():
    return render_template("apps.html", projects=PROJECTS)


@app.route("/login", methods=["GET", "POST"])
def login():
    error = None
    if request.method == "POST":
        rl_key = f"portfolio-login:{ratelimit.client_ip()}"
        wait = ratelimit.retry_after(rl_key)
        if wait > 0:
            return render_template(
                "login.html",
                error=f"Trop de tentatives. Réessaie dans {int(wait // 60) + 1} min.",
            ), 429
        u = (request.form.get("username") or "").strip()
        p = (request.form.get("password") or "").strip()
        if secrets.compare_digest(u, ADMIN_USER) and _verify_admin_password(p):
            ratelimit.reset(rl_key)
            session["user"] = u
            session.permanent = True
            return redirect(request.args.get("next") or url_for("admin_parametres"))
        ratelimit.register_failure(rl_key)
        error = "Identifiants invalides"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/admin/parametres")
@login_required
def admin_parametres():
    try:
        return render_template(
            "admin/parametres.html",
            app_dir=str(APP_DIR),
            user=session.get("user"),
            must_change_password=_using_default_password(),
        )
    except Exception:
        app.logger.exception("admin_parametres render failed")
        raise


@app.route("/parametres")
def parametres_legacy():
    return redirect(url_for("admin_parametres"), code=301)


def _schedule_restart(delay: float = 10.0):
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


deploy_bp = Blueprint("deploy", __name__)

# Tant que le mot de passe admin est resté « admin », toute opération de
# déploiement est bloquée — seul le changement de mot de passe est autorisé.
_DEFAULT_PW_ALLOWED = {
    "deploy.api_change_password",
    "deploy.api_deploy_health",
    "deploy.api_prospup_status",
}


@deploy_bp.before_request
def _block_while_default_password():
    if not _logged_in() or not _using_default_password():
        return None
    if request.endpoint in _DEFAULT_PW_ALLOWED:
        return None
    return jsonify(
        ok=False, must_change_password=True,
        error="Mot de passe par défaut actif — change-le avant toute autre opération.",
    ), 403


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

            status = _git("status", "--porcelain", timeout=5)
            if status.stdout.strip():
                yield f"data: {json.dumps({'step': 'log', 'line': 'Modifs locales → stash'})}\n\n"
                _git("stash", "push", "-m", f"auto-stash {remote_h[:7]}", timeout=5)

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
    if not _logged_in():
        return jsonify(ok=False, error="Authentification requise",
                       login_required=True), 401
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
    if not _logged_in():
        return jsonify(ok=False, error="Authentification requise",
                       login_required=True), 401
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


@deploy_bp.post("/api/deploy/change-password")
def api_change_password():
    if not _logged_in():
        return jsonify(ok=False, error="Non autorisé — reconnecte-toi"), 401
    chk = _require_same_origin()
    if chk:
        return chk
    data = request.get_json(silent=True) or {}
    old_pass = (data.get("old_password") or "").strip()
    new_pass = (data.get("password") or "").strip()
    if not _verify_admin_password(old_pass):
        return jsonify(ok=False, error="Mot de passe actuel incorrect"), 403
    if len(new_pass) < 8:
        return jsonify(ok=False, error="Mot de passe trop court (min 8 caractères)"), 400
    if new_pass.lower() == "admin" or _verify_admin_password(new_pass):
        return jsonify(ok=False, error="Choisis un mot de passe différent de l'actuel et autre que « admin »."), 400
    global ADMIN_PASS_HASH
    ADMIN_PASS_HASH = generate_password_hash(new_pass)
    _local_cfg["admin_pass_hash"] = ADMIN_PASS_HASH
    _local_cfg.pop("admin_pass", None)
    _save_config(_local_cfg)
    return jsonify(ok=True, message="Mot de passe mis à jour")


@deploy_bp.get("/api/deploy/prospup-status")
def api_prospup_status():
    if not _logged_in():
        return jsonify(ok=False, error="Non autorisé"), 401
    import socket
    try:
        s = socket.create_connection(("127.0.0.1", 8000), timeout=1)
        s.close()
        running = True
    except Exception:
        running = False
    return jsonify(ok=True, running=running)


@deploy_bp.get("/api/deploy/remote")
@login_required
def api_deploy_remote_get():
    cp = _git("remote", "get-url", "origin", timeout=3)
    if cp.returncode != 0:
        return jsonify(ok=False, error="Pas de remote origin"), 400
    return jsonify(ok=True, url=cp.stdout.strip(), app_dir=str(APP_DIR))


@deploy_bp.post("/api/deploy/restart-internal")
def api_deploy_restart_internal():
    # Authentifié par un jeton secret partagé (RESTART_TOKEN), lu depuis
    # .portfolio_config.json par l'outil local appelant. L'ancien contrôle
    # « réseau local uniquement » était inopérant : derrière le tunnel
    # Cloudflare, REMOTE_ADDR vaut toujours 127.0.0.1 pour toute requête.
    token = (request.headers.get("X-Restart-Token")
             or (request.get_json(silent=True) or {}).get("token")
             or "")
    if not token or not secrets.compare_digest(str(token), RESTART_TOKEN):
        return jsonify(ok=False, error="Jeton de redémarrage invalide"), 403
    _schedule_restart(delay=5.0)
    return jsonify(ok=True, message="Redémarrage du Portfolio dans 5 s")


def _make_launch_html():
    """Build the launch-prospup emergency page without any JS string escape issues."""
    lines = [
        "<!DOCTYPE html>",
        '<html lang="fr">',
        "<head>",
        '  <meta charset="utf-8">',
        "  <title>Relancer ProspUp</title>",
        "  <style>",
        "    body{font-family:system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 20px}",
        "    h1{font-size:1.4rem;margin-bottom:4px}",
        "    p{color:#555;margin-top:0}",
        "    button{padding:10px 22px;font-size:1rem;cursor:pointer;background:#2563eb;color:#fff;border:none;border-radius:6px}",
        "    button:disabled{opacity:.5;cursor:not-allowed}",
        "    pre{background:#111;color:#cfc;padding:16px;border-radius:8px;font-size:.82rem;",
        "        white-space:pre-wrap;word-break:break-all;min-height:60px;margin-top:16px}",
        "    .ok{color:#4ade80}.err{color:#f87171}",
        "  </style>",
        "</head>",
        "<body>",
        "  <h1>&#9888;&#65039; Relancer ProspUp</h1>",
        "  <p>Effectue un <code>git pull</code> dans le dossier ProspUp puis lance <code>python app.py --prod</code>.</p>",
        '  <button id="btn" onclick="doLaunch()">&#9654; Lancer ProspUp maintenant</button>',
        '  <pre id="out">En attente...</pre>',
        "  <script>",
        "    function doLaunch() {",
        "      var btn = document.getElementById('btn');",
        "      var out = document.getElementById('out');",
        "      btn.disabled = true;",
        "      out.textContent = 'Lancement en cours...';",
        "      fetch('/api/deploy/launch-prospup', {method:'POST'})",
        "        .then(function(r){return r.json();})",
        "        .then(function(d){",
        "          out.className = d.ok ? 'ok' : 'err';",
        "          out.textContent = JSON.stringify(d, null, 2);",
        "          if (d.ok) { out.textContent += ' ProspUp en cours de demarrage. Attends 20 s.'; }",
        "        })",
        "        .catch(function(e){",
        "          out.className = 'err';",
        "          out.textContent = 'Erreur : ' + e.message;",
        "          btn.disabled = false;",
        "        });",
        "    }",
        "  </script>",
        "</body>",
        "</html>",
    ]
    return "\n".join(lines)


@deploy_bp.get("/api/deploy/launch-prospup")
@login_required
def api_deploy_launch_prospup_page():
    return _make_launch_html()


@deploy_bp.post("/api/deploy/launch-prospup")
@login_required
def api_deploy_launch_prospup():
    prospup_dir = None
    candidates = [
        os.environ.get("PROSPUP_DIR"),
        str(APP_DIR.parent / "Prosp_UpV30"),
        str(APP_DIR.parent / "prosp_upv30"),
        str(APP_DIR.parent / "ProspUp"),
        str(APP_DIR.parent / "prospup"),
        str(APP_DIR.parent / "Prospup"),
    ]
    for c in candidates:
        if c and Path(c).is_dir() and (Path(c) / "app.py").exists():
            prospup_dir = Path(c)
            break

    if prospup_dir is None:
        tried = [c for c in candidates if c]
        return jsonify(
            ok=False,
            error="Repertoire ProspUp introuvable. Definissez PROSPUP_DIR. Essaye: " + str(tried),
        ), 404

    log = ["Repertoire trouve : " + str(prospup_dir)]

    try:
        pull = subprocess.run(
            ["git", "pull", "origin", "main"],
            cwd=str(prospup_dir),
            capture_output=True, text=True, timeout=30,
        )
        log.append("git pull -> code " + str(pull.returncode))
        if pull.stdout.strip():
            log.append(pull.stdout.strip()[:300])
        if pull.returncode != 0 and pull.stderr.strip():
            log.append("stderr : " + pull.stderr.strip()[:300])
    except Exception as exc:
        log.append("git pull erreur : " + str(exc))

    try:
        args = [sys.executable, "app.py", "--prod"]
        flags = 0
        if sys.platform == "win32":
            try:
                flags = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
            except AttributeError:
                flags = subprocess.CREATE_NEW_PROCESS_GROUP
        proc = subprocess.Popen(
            args,
            cwd=str(prospup_dir),
            creationflags=flags if sys.platform == "win32" else 0,
            start_new_session=(sys.platform != "win32"),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        log.append("ProspUp lance PID " + str(proc.pid))
        return jsonify(ok=True, pid=proc.pid, prospup_dir=str(prospup_dir), log=log)
    except Exception as exc:
        log.append("Erreur lancement : " + str(exc))
        return jsonify(ok=False, error=str(exc), log=log), 500


@deploy_bp.get("/api/demandes-modifs")
@login_required
def api_demandes_list():
    archived = request.args.get("archived", "0") in ("1", "true", "yes")
    items = [d for d in _load_demandes() if bool(d.get("archived")) == archived]
    items.sort(key=lambda d: d.get("created_at", ""), reverse=True)
    return jsonify(ok=True, items=items)


@deploy_bp.post("/api/demandes-modifs")
@login_required
def api_demandes_create():
    chk = _require_same_origin()
    if chk:
        return chk
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify(ok=False, error="Texte vide"), 400
    if len(text) > 4000:
        return jsonify(ok=False, error="Texte trop long (max 4000)"), 400
    now = _now_iso()
    item = {
        "id": secrets.token_hex(8),
        "text": text,
        "created_at": now,
        "updated_at": now,
        "archived": False,
        "archived_at": None,
    }
    with _DEMANDES_LOCK:
        items = _load_demandes()
        items.append(item)
        _save_demandes(items)
    return jsonify(ok=True, item=item)


@deploy_bp.patch("/api/demandes-modifs/<demande_id>")
@login_required
def api_demandes_update(demande_id):
    chk = _require_same_origin()
    if chk:
        return chk
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify(ok=False, error="Texte vide"), 400
    if len(text) > 4000:
        return jsonify(ok=False, error="Texte trop long (max 4000)"), 400
    with _DEMANDES_LOCK:
        items = _load_demandes()
        for it in items:
            if it.get("id") == demande_id:
                it["text"] = text
                it["updated_at"] = _now_iso()
                _save_demandes(items)
                return jsonify(ok=True, item=it)
    return jsonify(ok=False, error="Introuvable"), 404


@deploy_bp.post("/api/demandes-modifs/<demande_id>/archive")
@login_required
def api_demandes_archive(demande_id):
    chk = _require_same_origin()
    if chk:
        return chk
    data = request.get_json(silent=True) or {}
    archived = bool(data.get("archived", True))
    with _DEMANDES_LOCK:
        items = _load_demandes()
        for it in items:
            if it.get("id") == demande_id:
                it["archived"] = archived
                it["archived_at"] = _now_iso() if archived else None
                it["updated_at"] = _now_iso()
                _save_demandes(items)
                return jsonify(ok=True, item=it)
    return jsonify(ok=False, error="Introuvable"), 404


@deploy_bp.delete("/api/demandes-modifs/<demande_id>")
@login_required
def api_demandes_delete(demande_id):
    chk = _require_same_origin()
    if chk:
        return chk
    with _DEMANDES_LOCK:
        items = _load_demandes()
        new_items = [it for it in items if it.get("id") != demande_id]
        if len(new_items) == len(items):
            return jsonify(ok=False, error="Introuvable"), 404
        _save_demandes(new_items)
    return jsonify(ok=True)


@app.route("/admin/demandes-archivees")
@login_required
def admin_demandes_archivees():
    return render_template(
        "admin/demandes_archivees.html",
        user=session.get("user"),
    )


app.register_blueprint(deploy_bp)


from Casino import casino_bp  # noqa: E402
from SiteEntreprise import site_entreprise_bp  # noqa: E402

app.register_blueprint(casino_bp)
app.register_blueprint(site_entreprise_bp)


@app.errorhandler(404)
def not_found(_e):
    return render_template("404.html"), 404


@app.errorhandler(500)
def internal_error(e):
    error_id = secrets.token_hex(4)
    app.logger.error("500 [%s] %s %s\n%s", error_id, request.method, request.path,
                     "".join(traceback.format_exception(type(e), e, e.__traceback__)))
    try:
        return render_template("500.html", error_id=error_id), 500
    except Exception:
        return ("<h1>500 — erreur serveur</h1>"
                f"<p>Référence : {error_id}</p>"
                '<p><a href="/">Retour à l\'accueil</a></p>'), 500


@app.errorhandler(Exception)
def unhandled_exception(e):
    from werkzeug.exceptions import HTTPException
    if isinstance(e, HTTPException):
        return e
    return internal_error(e)


if __name__ == "__main__":
    is_prod = "--prod" in sys.argv
    print(f"[Portfolio] v{APP_VERSION} -> http://127.0.0.1:{PORT}  (prod={is_prod})")
    if is_prod:
        from waitress import serve
        serve(app, host="0.0.0.0", port=PORT, threads=8)
    else:
        app.run(host="0.0.0.0", port=PORT, debug=True, use_reloader=False)

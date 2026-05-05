"""Portfolio (marienour.work) — Flask app.

Site public (landing scroll-snap + page apps avec dock bulles Apple Watch),
plus une zone /admin/* protégée par login pour la maintenance et le système
de mise à jour Git via SSE (boutons MAJ / Rollback / Restart).
"""
from __future__ import annotations

import datetime
import hashlib
import hmac
import json
import os
import secrets
import subprocess
import sys
import threading
import time
from collections import defaultdict, deque
from datetime import timedelta
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

APP_VERSION = "2.0.0"
APP_DIR = Path(__file__).resolve().parent
PORT = int(os.environ.get("PORTFOLIO_PORT", "8001"))
ADMIN_USER = os.environ.get("PORTFOLIO_USER", "admin")
ADMIN_PASS = os.environ.get("PORTFOLIO_PASS", "admin")

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


# ── Hashing & vérif mot de passe (PBKDF2-SHA256) ─────────────────
# Le mdp admin Portfolio n'est jamais stocké en clair sur disque.
# Format : "pbkdf2_sha256$<iters>$<salt_hex>$<hash_hex>"

def _hash_password(password: str, iters: int = 200_000) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iters)
    return f"pbkdf2_sha256${iters}${salt.hex()}${dk.hex()}"


def _verify_password(password: str, stored: str) -> bool:
    if not stored or not isinstance(stored, str) or "$" not in stored:
        return False
    try:
        algo, iters_s, salt_hex, dk_hex = stored.split("$", 3)
        if algo != "pbkdf2_sha256":
            return False
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, int(iters_s)
        )
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


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

# ── Migration douce du mdp admin Portfolio ──────────────────────
# Si la config contient un `admin_pass` en clair (ancienne installation),
# on le hash automatiquement et on remplace par `admin_pass_hash`. Le clair
# n'est plus jamais conservé sur disque. Si seul `admin_pass_hash` est
# présent, on l'utilise directement.
_clear_pass = _local_cfg.pop("admin_pass", None)
if _clear_pass and not _local_cfg.get("admin_pass_hash"):
    _local_cfg["admin_pass_hash"] = _hash_password(_clear_pass)
    try:
        _save_config(_local_cfg)
    except Exception:
        pass

ADMIN_PASS_HASH = _local_cfg.get("admin_pass_hash") or ""
# Si l'env force un mdp et qu'aucun hash n'est encore stocké, on le hash.
_env_pass = os.environ.get("PORTFOLIO_PASS")
if _env_pass and _env_pass != "admin" and not ADMIN_PASS_HASH:
    ADMIN_PASS_HASH = _hash_password(_env_pass)
    _local_cfg["admin_pass_hash"] = ADMIN_PASS_HASH
    try:
        _save_config(_local_cfg)
    except Exception:
        pass

# Fallback ultime : si rien n'est défini, on conserve la valeur de ADMIN_PASS
# (env var ou défaut "admin") pour comparaison directe — utile au premier
# démarrage avant que l'admin n'ait défini son mot de passe.
_LEGACY_FALLBACK = ADMIN_PASS if not ADMIN_PASS_HASH else None


def _check_admin_password(password: str) -> bool:
    """Vérifie un mot de passe admin contre le hash (ou le fallback)."""
    if ADMIN_PASS_HASH:
        return _verify_password(password, ADMIN_PASS_HASH)
    if _LEGACY_FALLBACK is not None:
        return hmac.compare_digest(
            password.encode("utf-8"), _LEGACY_FALLBACK.encode("utf-8")
        )
    return False


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


# ── Rate limiting in-memory (anti brute-force login) ─────────────
# Garde une fenêtre glissante de tentatives ratées par IP. Pas besoin
# d'une DB : c'est local au process et survit jusqu'au restart (~suffisant
# pour bloquer un attaquant naïf, le restart 10s du /maj ne pose pas de
# souci en pratique).
_LOGIN_FAILURES: dict[str, deque] = defaultdict(lambda: deque(maxlen=20))
_LOGIN_LOCK = threading.Lock()
_RATE_LIMIT_WINDOW = 900   # 15 minutes
_RATE_LIMIT_MAX = 5        # 5 essais par fenêtre


def _client_ip_for_rate() -> str:
    return (
        request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        or request.remote_addr
        or "unknown"
    )[:64]


def _is_rate_limited(ip: str) -> tuple[bool, int]:
    """Renvoie (is_limited, retry_after_seconds)."""
    now = time.time()
    with _LOGIN_LOCK:
        attempts = _LOGIN_FAILURES[ip]
        # Évacue les essais hors fenêtre
        while attempts and attempts[0] < now - _RATE_LIMIT_WINDOW:
            attempts.popleft()
        if len(attempts) >= _RATE_LIMIT_MAX:
            retry_in = int(_RATE_LIMIT_WINDOW - (now - attempts[0]))
            return True, max(1, retry_in)
    return False, 0


def _record_failure(ip: str) -> None:
    with _LOGIN_LOCK:
        _LOGIN_FAILURES[ip].append(time.time())


def _reset_failures(ip: str) -> None:
    with _LOGIN_LOCK:
        _LOGIN_FAILURES.pop(ip, None)

STUDIO_NAME = os.environ.get("PORTFOLIO_NAME", "Antoine Binet")
STUDIO_TAGLINE = os.environ.get(
    "PORTFOLIO_TAGLINE",
    "Designer & developer indépendant. Une collection d'idées d'apps et de sites en cours.",
)
CONTACT_EMAIL = os.environ.get("PORTFOLIO_EMAIL", "hello@marienour.work")

PROJECTS = [
    {"id": 1, "slug": "casino", "name": "Casino", "tagline": "Texas Hold'em No-Limit — solo vs IA ou multijoueur (lien d'invitation).", "tags": ["web", "poker", "multi"], "year": 2026, "accent": "oklch(0.62 0.18 25)", "type": "web", "demo": "/casino", "cta_label": "Ouvrir l'app"},
    {"id": 2, "slug": "site-entreprise", "name": "Site d'entreprise", "tagline": "Site vitrine professionnel — identité, services et contact.", "tags": ["web", "vitrine", "branding"], "year": 2026, "accent": "oklch(0.62 0.18 210)", "type": "web", "demo": "/site-entreprise", "cta_label": "Voir le site"},
    {"id": 3, "slug": "nimbus", "name": "Nimbus", "tagline": "Vitrine produit tech — casque audio premium, animations CSS et configurateur de couleurs.", "tags": ["web", "vitrine", "produit"], "year": 2026, "accent": "oklch(0.6 0.2 285)", "type": "web", "demo": "/nimbus", "cta_label": "Voir le site"},
    {"id": 4, "slug": "tandem", "name": "Tandem", "tagline": "Plateforme collaborative — channels de discussion, partage de fichiers et invitations.", "tags": ["web", "saas", "collab"], "year": 2026, "accent": "oklch(0.7 0.12 215)", "type": "web", "demo": "/tandem", "cta_label": "Ouvrir l'app"},
]

app = Flask(__name__)
app.secret_key = SECRET_KEY
# Trust X-Forwarded-Proto from Cloudflare/nginx so request.host_url returns
# https:// instead of http://, fixing the _require_same_origin() check.
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

# ── Cookies session durcis ───────────────────────────────────────
# En prod (servi par waitress derrière le tunnel Cloudflare HTTPS), on force
# Secure=True pour que le cookie ne fuite jamais sur HTTP. En dev local
# (`python app.py` sans `--prod`), Secure=False pour que le cookie soit
# accepté par le navigateur sur http://localhost.
_IS_PROD = ("--prod" in sys.argv) or (os.environ.get("PORTFOLIO_LAUNCHER") == "BAT")
app.config.update(
    SESSION_COOKIE_SECURE=_IS_PROD,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)


# ── Headers de sécurité HTTP globaux ─────────────────────────────
# CSP volontairement permissive (unsafe-inline pour le JS inline des
# templates, fonts.googleapis.com pour Space Grotesk). frame-src 'self'
# autorise l'iframe des sous-apps depuis la landing. frame-ancestors 'self'
# remplace X-Frame-Options.
_CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "frame-src 'self'",
    "frame-ancestors 'self'",
    "connect-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
])


@app.after_request
def _security_headers(resp):
    # No-cache pour le HTML (déjà fait avant la consolidation).
    ct = (resp.headers.get("Content-Type") or "").lower()
    if ct.startswith("text/html"):
        resp.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        resp.headers["Pragma"] = "no-cache"
        resp.headers["Expires"] = "0"
    # Headers de sécurité globaux (poses idempotentes).
    resp.headers.setdefault("Content-Security-Policy", _CSP)
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    resp.headers.setdefault(
        "Permissions-Policy",
        "geolocation=(), camera=(), microphone=(), payment=(), usb=()",
    )
    # HSTS : on est toujours derrière Cloudflare HTTPS en prod. 1 an. Le
    # tunnel cloudflared ne pose pas systématiquement X-Forwarded-Proto, donc
    # on s'appuie sur le flag --prod (waitress) plutôt que sur la requête.
    if _IS_PROD:
        resp.headers.setdefault(
            "Strict-Transport-Security",
            "max-age=31536000; includeSubDomains",
        )
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
    if origin and not _strip_scheme(origin).startswith(host):
        return jsonify(ok=False, error="Origine non autorisée"), 403
    if not origin and referer and not _strip_scheme(referer).startswith(host):
        return jsonify(ok=False, error="Referer non autorisé"), 403
    return None


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
        ip = _client_ip_for_rate()
        limited, retry_after = _is_rate_limited(ip)
        if limited:
            error = (
                f"Trop de tentatives. Réessaie dans {retry_after // 60} min "
                f"{retry_after % 60} s."
            )
            return render_template("login.html", error=error), 429

        # CSRF basique : refuse les POST cross-origin.
        chk = _require_same_origin()
        if chk:
            return render_template(
                "login.html",
                error="Origine non autorisée",
            ), 403

        u = (request.form.get("username") or "").strip()
        p = (request.form.get("password") or "").strip()
        # Comparaison constante-temps pour éviter le timing attack sur l'user.
        ok_user = hmac.compare_digest(u.encode("utf-8"),
                                      ADMIN_USER.encode("utf-8"))
        ok_pass = _check_admin_password(p)
        if ok_user and ok_pass:
            _reset_failures(ip)
            # Régénère l'identifiant de session (anti session-fixation).
            session.clear()
            session["user"] = u
            session.permanent = True
            return redirect(request.args.get("next") or url_for("admin_parametres"))
        _record_failure(ip)
        time.sleep(0.3)  # ralentit légèrement les essais
        error = "Identifiants invalides"
    return render_template("login.html", error=error)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for("index"))


@app.route("/admin/parametres")
@login_required
def admin_parametres():
    return render_template(
        "admin/parametres.html",
        app_dir=str(APP_DIR),
        user=session.get("user"),
    )


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
@login_required
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
@login_required
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
    """Réponse minimale pour les visiteurs (juste alive), détaillée pour l'admin."""
    if not _logged_in():
        return jsonify(ok=True, version=APP_VERSION)
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
@login_required
def api_change_password():
    chk = _require_same_origin()
    if chk:
        return chk
    data = request.get_json(silent=True) or {}
    new_pass = (data.get("password") or "").strip()
    if len(new_pass) < 8:
        return jsonify(
            ok=False,
            error="Mot de passe trop court (min 8 caractères)",
        ), 400
    global ADMIN_PASS_HASH, _LEGACY_FALLBACK
    ADMIN_PASS_HASH = _hash_password(new_pass)
    _LEGACY_FALLBACK = None  # plus de fallback en clair après changement
    cfg = _load_config()
    cfg.pop("admin_pass", None)  # purge tout reste de mdp en clair
    cfg["admin_pass_hash"] = ADMIN_PASS_HASH
    _save_config(cfg)
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
    remote = request.environ.get("REMOTE_ADDR") or request.remote_addr or ""
    if remote not in ("127.0.0.1", "::1"):
        return jsonify(ok=False, error="Accès refusé — réseau local uniquement"), 403
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
from Nimbus import nimbus_bp  # noqa: E402
from Tandem import tandem_bp  # noqa: E402

app.register_blueprint(casino_bp)
app.register_blueprint(site_entreprise_bp)
app.register_blueprint(nimbus_bp)
app.register_blueprint(tandem_bp)


@app.errorhandler(404)
def not_found(_e):
    return render_template("404.html"), 404


if __name__ == "__main__":
    is_prod = "--prod" in sys.argv
    print(f"[Portfolio] v{APP_VERSION} -> http://127.0.0.1:{PORT}  (prod={is_prod})")
    if is_prod:
        from waitress import serve
        serve(app, host="0.0.0.0", port=PORT, threads=8)
    else:
        app.run(host="0.0.0.0", port=PORT, debug=True, use_reloader=False)

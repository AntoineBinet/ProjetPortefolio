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
    {"id": 2, "slug": "site-entreprise", "name": "Site d'entreprise", "tagline": "Site vitrine professionnel — identité, services et contact.", "tags": ["web", "vitrine", "branding"], "year": 2026, "accent": "oklch(0.62 0.18 210)", "type": "web", "demo": "/site-entreprise", "cta_label": "Voir le site"},
]

app = Flask(__name__)
app.secret_key = os.environ.get("PORTFOLIO_SECRET") or secrets.token_hex(32)


@app.before_request
def _isolate_portfolio_from_casino_users():
    """Cloison Portfolio ↔ Casino.

    Tout utilisateur loggé côté Casino (cookie `casino_session`) est REDIRIGé
    vers `/casino` s'il essaie d'accéder à une route Portfolio (landing,
    /apps, /admin/*, /login, etc.). L'admin Portfolio (session Flask `user`)
    garde un accès illimité car c'est lui qui héberge.

    Les visiteurs anonymes (pas de cookie casino) accèdent normalement aux
    pages publiques du Portfolio.

    Routes JAMAIS interceptées :
      - /casino/* (Casino)
      - /api/deploy/* (mécanisme MAJ admin)
      - /static/* (assets Portfolio)
      - /favicon.ico, /robots.txt
    """
    p = request.path
    if (p.startswith("/casino")
            or p.startswith("/api/deploy")
            or p.startswith("/static")
            or p in ("/favicon.ico", "/robots.txt")):
        return None
    # Admin Portfolio : accès libre
    if session.get("user"):
        return None
    # User Casino sans session Portfolio → redirect
    cookie = request.cookies.get("casino_session")
    if cookie:
        try:
            from Casino import casino_db
            if casino_db.get_session(cookie):
                return redirect("/casino", code=302)
        except Exception:
            pass
    return None


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


# ── Auth helpers ────────────────────────────────────────────

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


# ── Pages publiques ───────────────────────────────────────────

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


# ── Admin ─────────────────────────────────────────────────

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


# ── Restart ───────────────────────────────────────────────

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


# ── Deploy blueprint ───────────────────────────────────────────

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


@deploy_bp.post("/api/deploy/restart-internal")
def api_deploy_restart_internal():
    """Redémarrage depuis localhost uniquement — appelé par ProspUp (:8000)."""
    remote = request.environ.get("REMOTE_ADDR") or request.remote_addr or ""
    if remote not in ("127.0.0.1", "::1"):
        return jsonify(ok=False, error="Accès refusé — réseau local uniquement"), 403
    _schedule_restart(delay=5.0)
    return jsonify(ok=True, message="Redémarrage du Portfolio dans 5 s")


@deploy_bp.get("/api/deploy/launch-prospup")
@login_required
def api_deploy_launch_prospup_page():
    """Page d'urgence pour relancer ProspUp depuis le Portfolio (admin uniquement)."""
    return """
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Relancer ProspUp — urgence</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 60px auto; padding: 0 20px; }
    h1 { font-size: 1.4rem; margin-bottom: 4px; }
    p  { color: #555; margin-top: 0; }
    button { padding: 10px 22px; font-size: 1rem; cursor: pointer;
             background: #2563eb; color: #fff; border: none; border-radius: 6px; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    pre  { background: #111; color: #cfc; padding: 16px; border-radius: 8px;
           font-size: .82rem; white-space: pre-wrap; word-break: break-all;
           min-height: 60px; margin-top: 16px; }
    .ok  { color: #4ade80; }
    .err { color: #f87171; }
  </style>
</head>
<body>
  <h1>⚠️ Relancer ProspUp</h1>
  <p>Cette page effectue un <code>git pull</code> dans le dossier ProspUp puis lance <code>python app.py --prod</code>.</p>
  <button id="btn" onclick="launch()">&#9654; Lancer ProspUp maintenant</button>
  <pre id="out">En attente…</pre>
  <script>
    async function launch() {
      const btn = document.getElementById('btn');
      const out  = document.getElementById('out');
      btn.disabled = true;
      out.textContent = 'Lancement en cours…';
      try {
        const r = await fetch('/api/deploy/launch-prospup', { method: 'POST' });
        const d = await r.json();
        out.className = d.ok ? 'ok' : 'err';
        out.textContent = JSON.stringify(d, null, 2);
        if (d.ok) {
          out.textContent += '\n\nProspUp est en train de démarrer.\nAttends 15–20 secondes puis ouvre prospup.work';
        }
      } catch(e) {
        out.className = 'err';
        out.textContent = 'Erreur réseau : ' + e.message;
        btn.disabled = false;
      }
    }
  </script>
</body>
</html>
"""


@deploy_bp.post("/api/deploy/launch-prospup")
@login_required
def api_deploy_launch_prospup():
    """Fait un git pull dans le dossier ProspUp puis le lance en processus détaché.

    Détection automatique du répertoire (frère du Portfolio) ou via
    la variable d'environnement PROSPUP_DIR.
    """
    # Trouver le répertoire ProspUp
    prospup_dir: Path | None = None
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
            error=(
                f"Répertoire ProspUp introuvable parmi : {tried}. "
                "Définissez la variable d'environnement PROSPUP_DIR."
            ),
        ), 404

    log = [f"Répertoire ProspUp trouvé : {prospup_dir}"]

    # git pull pour récupérer le correctif
    try:
        pull = subprocess.run(
            ["git", "pull", "origin", "main"],
            cwd=str(prospup_dir),
            capture_output=True, text=True, timeout=30,
        )
        log.append(f"git pull → code {pull.returncode}")
        if pull.stdout.strip():
            log.append(pull.stdout.strip()[:300])
        if pull.returncode != 0 and pull.stderr.strip():
            log.append(f"stderr : {pull.stderr.strip()[:300]}")
    except Exception as exc:
        log.append(f"git pull erreur : {exc}")

    # Lancer ProspUp en processus détaché
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
        log.append(f"ProspUp lancé (PID {proc.pid}) — attends 15–20 s")
        return jsonify(ok=True, pid=proc.pid, prospup_dir=str(prospup_dir), log=log)
    except Exception as exc:
        log.append(f"Erreur lancement : {exc}")
        return jsonify(ok=False, error=str(exc), log=log), 500


app.register_blueprint(deploy_bp)


# ── Casino (entité indépendante) ──────────────────────────────────
#
# Toute la logique du casino (SPA, DB, auth invite, multijoueur, jeux) vit
# dans le package Casino/. Le Blueprint expose les routes /casino/* sans rien
# importer du Portfolio.
from Casino import casino_bp  # noqa: E402
from SiteEntreprise import site_entreprise_bp  # noqa: E402

app.register_blueprint(casino_bp)
app.register_blueprint(site_entreprise_bp)


# ── 404 (mécanisme de réparation) ─────────────────────────────

@app.errorhandler(404)
def not_found(_e):
    return render_template("404.html"), 404


# ── Main ───────────────────────────────────────────────────

if __name__ == "__main__":
    is_prod = "--prod" in sys.argv
    print(f"[Portfolio] v{APP_VERSION} -> http://127.0.0.1:{PORT}  (prod={is_prod})")
    if is_prod:
        from waitress import serve
        serve(app, host="0.0.0.0", port=PORT, threads=8)
    else:
        app.run(host="0.0.0.0", port=PORT, debug=True, use_reloader=False)

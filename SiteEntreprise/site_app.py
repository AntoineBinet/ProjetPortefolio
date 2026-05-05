"""SiteEntreprise — Up Technologies (Vite/React build) + mini-CMS.

- `dist/` : assets buildés (cache 1 an)
- `index.html` : SPA (no-cache, géré par _no_cache_html dans app.py)
- `content.json` : tout le contenu éditable (texts, listes, contacts, articles…)
- `uploads/` : images uploadées par l'admin via /api/upload

API :
- GET  /site-entreprise/api/content        public, renvoie le JSON éditable
- POST /site-entreprise/api/content        admin, écrase le contenu
- GET  /site-entreprise/api/auth/me        renvoie {authenticated, user}
- POST /site-entreprise/api/auth/login     username/password → set Flask session
- POST /site-entreprise/api/auth/logout    clear session
- POST /site-entreprise/api/upload         admin, multipart fichier → URL
- GET  /site-entreprise/uploads/<file>     sert les uploads (cache 1 an)

Auth admin = même session Flask que /admin/parametres (cookie partagé sur le
domaine marienour.work). Donc se connecter au portefolio donne accès admin sur
le site démo automatiquement, et inversement.
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

from flask import (
    Blueprint,
    abort,
    jsonify,
    request,
    send_from_directory,
    session,
)
from werkzeug.utils import secure_filename

site_entreprise_bp = Blueprint(
    "site_entreprise",
    __name__,
    url_prefix="/site-entreprise",
)

_HERE = Path(__file__).resolve().parent
_DIST = _HERE / "dist"
_CONTENT_FILE = _HERE / "content.json"
_DEFAULT_CONTENT_FILE = _HERE / "content.json"  # même fichier, sert de fallback
_UPLOADS_DIR = _HERE / "uploads"

_ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
_MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB


def _is_admin() -> bool:
    return bool(session.get("user"))


def _portfolio_credentials() -> tuple[str, str]:
    """Lit les credentials admin depuis l'env + .portfolio_config.json."""
    user = os.environ.get("PORTFOLIO_USER", "admin")
    pwd = os.environ.get("PORTFOLIO_PASS", "admin")
    cfg = _HERE.parent / ".portfolio_config.json"
    if cfg.exists():
        try:
            data = json.loads(cfg.read_text(encoding="utf-8"))
            if data.get("admin_user"):
                user = data["admin_user"]
            if data.get("admin_pass"):
                pwd = data["admin_pass"]
        except Exception:
            pass
    return user, pwd


def _load_content() -> dict:
    try:
        return json.loads(_CONTENT_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    except Exception:
        return {}


def _save_content(data: dict) -> None:
    _CONTENT_FILE.write_text(
        json.dumps(data, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


# ---------------- API ----------------

@site_entreprise_bp.get("/api/content")
def api_get_content():
    return jsonify(_load_content())


@site_entreprise_bp.post("/api/content")
def api_save_content_route():
    if not _is_admin():
        return jsonify(ok=False, error="Non autorisé"), 401
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify(ok=False, error="Format JSON invalide"), 400
    _save_content(data)
    return jsonify(ok=True)


@site_entreprise_bp.get("/api/auth/me")
def api_auth_me():
    return jsonify(authenticated=_is_admin(), user=session.get("user"))


@site_entreprise_bp.post("/api/auth/login")
def api_auth_login():
    body = request.get_json(silent=True) or {}
    u = (body.get("username") or "").strip()
    p = (body.get("password") or "").strip()
    admin_user, admin_pass = _portfolio_credentials()
    if u == admin_user and p == admin_pass:
        session["user"] = u
        session.permanent = True
        return jsonify(ok=True, user=u)
    return jsonify(ok=False, error="Identifiants invalides"), 401


@site_entreprise_bp.post("/api/auth/logout")
def api_auth_logout():
    session.pop("user", None)
    return jsonify(ok=True)


@site_entreprise_bp.post("/api/upload")
def api_upload():
    if not _is_admin():
        return jsonify(ok=False, error="Non autorisé"), 401
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify(ok=False, error="Aucun fichier"), 400
    ext = Path(secure_filename(f.filename)).suffix.lower()
    if ext not in _ALLOWED_IMAGE_EXT:
        return jsonify(ok=False, error=f"Format non supporté ({ext})"), 400
    f.stream.seek(0, os.SEEK_END)
    size = f.stream.tell()
    f.stream.seek(0)
    if size > _MAX_UPLOAD_BYTES:
        return jsonify(ok=False, error="Fichier trop lourd (>8 Mo)"), 400
    _UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}{ext}"
    f.save(_UPLOADS_DIR / name)
    return jsonify(ok=True, url=f"/site-entreprise/uploads/{name}", filename=name)


@site_entreprise_bp.get("/uploads/<path:filename>")
def serve_upload(filename):
    if not _UPLOADS_DIR.exists():
        abort(404)
    return send_from_directory(_UPLOADS_DIR, filename, max_age=31_536_000)


# ---------------- Static SPA ----------------

@site_entreprise_bp.route("/assets/<path:filename>")
def serve_asset(filename):
    if not _DIST.exists():
        abort(503)
    return send_from_directory(_DIST / "assets", filename, max_age=31_536_000)


@site_entreprise_bp.route("/", defaults={"path": ""})
@site_entreprise_bp.route("/<path:path>")
def index(path):
    # /api/* et /uploads/* sont déjà capturés par les routes ci-dessus grâce
    # au matching plus spécifique de Flask, mais on garde un garde-fou explicite.
    if path.startswith("api/") or path.startswith("uploads/"):
        abort(404)
    if not _DIST.exists():
        abort(503)
    return send_from_directory(_DIST, "index.html")

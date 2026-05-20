"""SiteEntreprise — Up Technologies (Vite/React build) + mini-CMS.

- `dist/` : assets buildés (cache 1 an)
- `index.html` : SPA (no-cache, géré par _no_cache_html dans app.py)
- `content.json` : tout le contenu éditable (texts, listes, contacts, articles…)
- `uploads/` : images uploadées par l'admin via /api/upload
- `admin_pass.json` : un seul mot de passe (pas de DB ni de comptes)

API publiques :
- GET  /site-entreprise/api/content        renvoie le JSON éditable
- GET  /site-entreprise/api/auth/me        {authenticated, must_change_password}
- POST /site-entreprise/api/auth/login     password seul (pas de username)
- POST /site-entreprise/api/auth/logout    clear site_authed
- POST /site-entreprise/api/auth/change-password  change le mot de passe (requiert auth + ancien)

API admin (auth requise) :
- POST /site-entreprise/api/content        sauve content.json
- POST /site-entreprise/api/upload         upload image

Auth admin = `session["site_authed"]` (vrai/faux). Le portfolio admin n'est
plus auto-grant : Up Technologies a son propre cadenas / mot de passe.
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

import ratelimit

from . import site_db

site_entreprise_bp = Blueprint(
    "site_entreprise",
    __name__,
    url_prefix="/site-entreprise",
)

_HERE = Path(__file__).resolve().parent
_DIST = _HERE / "dist"
_CONTENT_FILE = _HERE / "content.json"
_UPLOADS_DIR = _HERE / "uploads"

_ALLOWED_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}
_MAX_UPLOAD_BYTES = 8 * 1024 * 1024  # 8 MB

# Init store password au chargement (idempotent).
site_db.init_db()


# ---------------- Helpers auth ----------------

def _is_admin() -> bool:
    return bool(session.get("site_authed"))


def _auth_status() -> dict:
    return {
        "authenticated": _is_admin(),
        "must_change_password": site_db.must_change_password(),
    }


# ---------------- Content store ----------------

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


# ---------------- API : content ----------------

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


# ---------------- API : auth ----------------

@site_entreprise_bp.get("/api/auth/me")
def api_auth_me():
    return jsonify(_auth_status())


@site_entreprise_bp.post("/api/auth/login")
def api_auth_login():
    rl_key = f"site-login:{ratelimit.client_ip()}"
    wait = ratelimit.retry_after(rl_key)
    if wait > 0:
        return jsonify(ok=False, error=f"Trop de tentatives. Réessaie dans {int(wait // 60) + 1} min."), 429
    body = request.get_json(silent=True) or {}
    pwd = body.get("password") or ""
    if not site_db.verify_password(pwd):
        ratelimit.register_failure(rl_key)
        return jsonify(ok=False, error="Mot de passe incorrect"), 401
    ratelimit.reset(rl_key)
    session["site_authed"] = True
    session.permanent = True
    return jsonify(ok=True, **_auth_status())


@site_entreprise_bp.post("/api/auth/logout")
def api_auth_logout():
    session.pop("site_authed", None)
    return jsonify(ok=True)


@site_entreprise_bp.post("/api/auth/change-password")
def api_auth_change_password():
    if not _is_admin():
        return jsonify(ok=False, error="Non autorisé"), 401
    body = request.get_json(silent=True) or {}
    old = body.get("old_password") or ""
    new = body.get("new_password") or ""
    if not site_db.verify_password(old):
        return jsonify(ok=False, error="Ancien mot de passe incorrect"), 401
    try:
        site_db.set_password(new)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, **_auth_status())


# ---------------- API : upload ----------------

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
    # Durcissement : un fichier uploadé (un SVG notamment) ne doit jamais
    # pouvoir exécuter de script. Téléchargement forcé en navigation directe,
    # CSP verrouillée, pas de MIME sniffing.
    resp = send_from_directory(_UPLOADS_DIR, filename, max_age=31_536_000,
                               as_attachment=True)
    resp.headers["Content-Security-Policy"] = "default-src 'none'; sandbox"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


# ---------------- Static SPA ----------------

@site_entreprise_bp.route("/assets/<path:filename>")
def serve_asset(filename):
    if not _DIST.exists():
        abort(503)
    return send_from_directory(_DIST / "assets", filename, max_age=31_536_000)


@site_entreprise_bp.route("/", defaults={"path": ""})
@site_entreprise_bp.route("/<path:path>")
def index(path):
    if path.startswith("api/") or path.startswith("uploads/"):
        abort(404)
    if not _DIST.exists():
        abort(503)
    # Sert les fichiers statiques de dist/ (ex. up-favicon.svg) tels quels.
    if path:
        candidate = _DIST / path
        try:
            candidate_resolved = candidate.resolve()
            if (candidate_resolved.is_file()
                    and _DIST.resolve() in candidate_resolved.parents):
                return send_from_directory(_DIST, path, max_age=86_400)
        except Exception:
            pass
    return send_from_directory(_DIST, "index.html")

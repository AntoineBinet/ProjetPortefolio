"""SiteEntreprise — Up Technologies (Vite/React build) + mini-CMS.

- `dist/` : assets buildés (cache 1 an)
- `index.html` : SPA (no-cache, géré par _no_cache_html dans app.py)
- `content.json` : tout le contenu éditable (texts, listes, contacts, articles…)
- `uploads/` : images uploadées par l'admin via /api/upload
- `site_users.db` : SQLite, comptes admin spécifiques au site démo

API publiques :
- GET  /site-entreprise/api/content        renvoie le JSON éditable
- GET  /site-entreprise/api/auth/me        {authenticated, user, source}
- POST /site-entreprise/api/auth/login     username/password (creds Up Tech)
- POST /site-entreprise/api/auth/logout    clear site_user (pas la session Portfolio)

API admin (auth requise) :
- POST /site-entreprise/api/content        sauve content.json
- POST /site-entreprise/api/upload         upload image
- GET  /site-entreprise/api/admin/users          liste les users
- POST /site-entreprise/api/admin/users          crée un user
- POST /site-entreprise/api/admin/users/<u>      change pass / rename
- POST /site-entreprise/api/admin/users/<u>/me   change son propre pass (avec ancien)
- DELETE /site-entreprise/api/admin/users/<u>    supprime un user

Auth admin = un de :
- session["site_user"]  (login direct sur Up Tech)
- session["user"]       (admin Portfolio → auto-grant, "viens du portefolio")
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

# Init DB au chargement du module (idempotent).
site_db.init_db()


# ---------------- Helpers auth ----------------

def _portfolio_user() -> str | None:
    """Renvoie le user Portfolio loggé (s'il y en a un)."""
    return session.get("user")


def _site_user() -> str | None:
    """Renvoie le user Up Tech loggé (s'il y en a un)."""
    return session.get("site_user")


def _is_admin() -> bool:
    return bool(_portfolio_user() or _site_user())


def _current_admin_info() -> dict:
    if u := _site_user():
        return {"authenticated": True, "user": u, "source": "site"}
    if u := _portfolio_user():
        return {"authenticated": True, "user": u, "source": "portfolio"}
    return {"authenticated": False, "user": None, "source": None}


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
    return jsonify(_current_admin_info())


@site_entreprise_bp.post("/api/auth/login")
def api_auth_login():
    body = request.get_json(silent=True) or {}
    u = (body.get("username") or "").strip()
    p = body.get("password") or ""
    user = site_db.verify_credentials(u, p)
    if not user:
        return jsonify(ok=False, error="Identifiants invalides"), 401
    session["site_user"] = user["username"]
    session.permanent = True
    return jsonify(ok=True, user=user["username"], source="site")


@site_entreprise_bp.post("/api/auth/logout")
def api_auth_logout():
    # On retire seulement la session Up Tech, pas celle du Portfolio.
    session.pop("site_user", None)
    return jsonify(ok=True)


# ---------------- API : user management (admin only) ----------------

def _admin_only():
    if not _is_admin():
        return jsonify(ok=False, error="Non autorisé"), 401
    return None


@site_entreprise_bp.get("/api/admin/users")
def api_admin_list_users():
    if (err := _admin_only()):
        return err
    info = _current_admin_info()
    return jsonify(
        ok=True,
        users=site_db.list_users(),
        current_user=info["user"],
        current_source=info["source"],
    )


@site_entreprise_bp.post("/api/admin/users")
def api_admin_create_user():
    if (err := _admin_only()):
        return err
    body = request.get_json(silent=True) or {}
    username = body.get("username") or ""
    password = body.get("password") or ""
    try:
        user = site_db.create_user(username, password)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, user=user)


@site_entreprise_bp.post("/api/admin/users/<username>")
def api_admin_update_user(username):
    if (err := _admin_only()):
        return err
    body = request.get_json(silent=True) or {}
    new_password = body.get("password")
    new_username = body.get("new_username")
    try:
        if new_password:
            site_db.set_password(username, new_password)
        if new_username and new_username != username:
            site_db.rename_user(username, new_username)
            # Si l'utilisateur connecté s'est renommé lui-même, mettre à jour la session.
            if session.get("site_user") == username:
                session["site_user"] = new_username
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, user=site_db.get_user(new_username or username))


@site_entreprise_bp.delete("/api/admin/users/<username>")
def api_admin_delete_user(username):
    if (err := _admin_only()):
        return err
    try:
        site_db.delete_user(username)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    # Si l'utilisateur s'est supprimé lui-même, virer aussi sa session.
    if session.get("site_user") == username:
        session.pop("site_user", None)
    return jsonify(ok=True)


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

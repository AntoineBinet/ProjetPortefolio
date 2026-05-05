"""Tandem — plateforme collaborative (chat + partage de fichiers).

Toutes les routes sont préfixées /tandem/. Auth indépendante du Portfolio :
cookie `tandem_session` (HttpOnly, Secure en prod, SameSite=Lax). Aucune
élévation cross-app — un partage du lien /tandem ne donne pas accès à /admin.

Routes principales :
    /tandem                                → SPA
    /tandem/static/<path>                  → assets
    /tandem/files/<file_id>                → download (auth requise)
    /tandem/api/auth/{me,login,logout,register,change-password,invite/<id>,redeem}
    /tandem/api/channels (GET, POST)
    /tandem/api/channels/<id> (DELETE)
    /tandem/api/channels/<id>/messages (GET, POST)
    /tandem/api/channels/<id>/files (GET)
    /tandem/api/channels/<id>/members (GET)
    /tandem/api/messages/<id> (DELETE)
    /tandem/api/files (POST upload, GET recent)
    /tandem/api/files/<id> (DELETE)
    /tandem/api/admin/users (GET, PATCH, DELETE)
    /tandem/api/admin/invites (GET, POST, DELETE)
    /tandem/api/stats (GET)
"""
from __future__ import annotations

import mimetypes
import os
import time
import uuid
from pathlib import Path

from flask import (
    Blueprint,
    Response,
    abort,
    jsonify,
    request,
    send_from_directory,
)
from werkzeug.utils import secure_filename

from . import tandem_db


TANDEM_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = TANDEM_DIR / "uploads"

TANDEM_COOKIE = "tandem_session"

# Limites
_MAX_UPLOAD_BYTES = 16 * 1024 * 1024  # 16 MB

# Liste blanche d'extensions. Le SVG est volontairement exclu (XSS via balise
# <script> embarquée). Les exécutables et scripts sont également bloqués.
_ALLOWED_EXTS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt",
    ".txt", ".md", ".csv", ".tsv", ".log",
    ".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic",
    ".mp4", ".webm", ".mov", ".m4a", ".mp3", ".wav",
    ".zip", ".tar", ".gz", ".7z",
    ".json", ".xml",
    ".sketch", ".fig", ".psd", ".ai",
}
_BLOCKED_EXTS = {
    ".svg", ".exe", ".bat", ".cmd", ".ps1", ".sh", ".com", ".scr", ".vbs",
    ".html", ".htm", ".js", ".jar", ".dll", ".php", ".py", ".rb", ".pl",
}

# ── Init au chargement ───────────────────────────────────────────
tandem_db.init()
ADMIN_EMAIL = os.environ.get("TANDEM_ADMIN_EMAIL", "admin@tandem.local")
ADMIN_NAME = os.environ.get("TANDEM_ADMIN_NAME", "Admin")
ADMIN_PASS = os.environ.get("TANDEM_ADMIN_PASS", "tandem")
_admin_id = tandem_db.ensure_admin(ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASS)
tandem_db.ensure_default_channels(_admin_id)

UPLOADS_DIR.mkdir(parents=True, exist_ok=True)


# ── Blueprint ────────────────────────────────────────────────────

tandem_bp = Blueprint("tandem", __name__)


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
        TANDEM_COOKIE, token,
        max_age=ttl_days * 86400,
        httponly=True,
        secure=bool(secure),
        samesite="Lax",
        path="/",
    )


def _clear_cookie(resp):
    resp.set_cookie(TANDEM_COOKIE, "", max_age=0, path="/",
                    httponly=True, samesite="Lax")


def _current_user():
    token = request.cookies.get(TANDEM_COOKIE)
    if not token:
        return None
    return tandem_db.get_session_user(token)


def _require_user():
    u = _current_user()
    if not u:
        return None, (jsonify(ok=False, error="Non authentifié"), 401)
    return u, None


def _require_admin():
    u, err = _require_user()
    if err:
        return None, err
    if u["role"] != "admin":
        return None, (jsonify(ok=False, error="Admin requis"), 403)
    return u, None


def _safe_ext(name: str) -> str:
    return Path(secure_filename(name) or "x").suffix.lower()


# ── SPA + assets ─────────────────────────────────────────────────

@tandem_bp.route("/tandem")
@tandem_bp.route("/tandem/")
def index():
    try:
        html = (TANDEM_DIR / "index.html").read_text(encoding="utf-8")
    except FileNotFoundError:
        return "Tandem indisponible", 503
    return Response(html, mimetype="text/html")


@tandem_bp.route("/tandem/static/<path:filename>")
def static_file(filename: str):
    resp = send_from_directory(str(TANDEM_DIR / "static"), filename, max_age=0)
    resp.headers["Cache-Control"] = "no-store, must-revalidate"
    return resp


# ── Auth ─────────────────────────────────────────────────────────

@tandem_bp.get("/tandem/api/auth/me")
def api_me():
    u = _current_user()
    if not u:
        return jsonify(ok=True, user=None)
    return jsonify(ok=True, user=u)


@tandem_bp.post("/tandem/api/auth/login")
def api_login():
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    email = (body.get("email") or "").strip()
    password = (body.get("password") or "").strip()
    if not email or not password:
        return jsonify(ok=False, error="Email + mot de passe requis"), 400
    u = tandem_db.login_user(email, password)
    if not u:
        time.sleep(0.4)
        return jsonify(ok=False, error="Identifiants invalides"), 401
    token = tandem_db.create_session(
        u["id"], ip=_client_ip(), ua=request.headers.get("User-Agent", ""),
    )
    resp = jsonify(ok=True, user=u)
    _set_cookie(resp, token)
    return resp


@tandem_bp.post("/tandem/api/auth/logout")
def api_logout():
    token = request.cookies.get(TANDEM_COOKIE)
    if token:
        tandem_db.delete_session(token)
    resp = jsonify(ok=True)
    _clear_cookie(resp)
    return resp


@tandem_bp.post("/tandem/api/auth/change-password")
def api_change_password():
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    old = (body.get("old_password") or "").strip()
    new = (body.get("new_password") or "").strip()
    if len(new) < 6:
        return jsonify(ok=False, error="Mot de passe trop court (min 6)"), 400
    if not tandem_db.login_user(user["email"], old):
        time.sleep(0.4)
        return jsonify(ok=False, error="Ancien mot de passe incorrect"), 401
    tandem_db.change_password(user["id"], new)
    return jsonify(ok=True)


@tandem_bp.get("/tandem/api/auth/invite/<iid>")
def api_invite_info(iid: str):
    inv = tandem_db.get_invite(iid)
    if not inv or inv.get("used_by"):
        return jsonify(ok=False, error="Lien invalide ou déjà utilisé"), 404
    if inv["expires_at"] < tandem_db.now():
        return jsonify(ok=False, error="Lien expiré"), 410
    return jsonify(ok=True, invite={
        "id": inv["id"],
        "email_hint": inv.get("email") or "",
        "role": inv["role"],
        "expires_at": inv["expires_at"],
        "note": inv.get("note") or "",
    })


@tandem_bp.post("/tandem/api/auth/redeem")
def api_redeem():
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    iid = (body.get("invite_id") or "").strip()
    code = (body.get("code") or "").strip()
    name = (body.get("name") or "").strip()
    email = (body.get("email") or "").strip()
    password = (body.get("password") or "").strip()
    job_title = (body.get("job_title") or "").strip()[:80]
    try:
        uid, token = tandem_db.consume_invite(
            iid, code, email=email, name=name, password=password,
            job_title=job_title,
        )
    except ValueError as e:
        time.sleep(0.4)
        return jsonify(ok=False, error=str(e)), 400
    u = tandem_db.get_user(uid)
    resp = jsonify(ok=True, user=u)
    _set_cookie(resp, token)
    return resp


@tandem_bp.patch("/tandem/api/auth/profile")
def api_update_profile():
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    name = body.get("name")
    job_title = body.get("job_title")
    avatar_color = body.get("avatar_color")
    if name is not None:
        name = name.strip()
        if len(name) < 2 or len(name) > 60:
            return jsonify(ok=False, error="Nom invalide"), 400
    if job_title is not None:
        job_title = job_title[:80]
    if avatar_color is not None:
        avatar_color = avatar_color[:64]
    u = tandem_db.update_user(
        user["id"], name=name, job_title=job_title, avatar_color=avatar_color,
    )
    return jsonify(ok=True, user=u)


# ── Channels ─────────────────────────────────────────────────────

@tandem_bp.get("/tandem/api/channels")
def api_list_channels():
    user, err = _require_user()
    if err:
        return err
    return jsonify(ok=True, channels=tandem_db.list_channels_for(user["id"]))


@tandem_bp.post("/tandem/api/channels")
def api_create_channel():
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    try:
        ch = tandem_db.create_channel(
            name=body.get("name") or "",
            description=body.get("description") or "",
            kind=body.get("kind") or "channel",
            created_by=user["id"],
            is_private=bool(body.get("is_private")),
        )
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, channel=ch)


@tandem_bp.delete("/tandem/api/channels/<cid>")
def api_delete_channel(cid: str):
    user, err = _require_admin()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    ch = tandem_db.get_channel(cid)
    if not ch:
        return jsonify(ok=False, error="Channel introuvable"), 404
    tandem_db.delete_channel(cid)
    return jsonify(ok=True)


@tandem_bp.get("/tandem/api/channels/<cid>/messages")
def api_list_messages(cid: str):
    user, err = _require_user()
    if err:
        return err
    if not tandem_db.is_member(cid, user["id"]):
        return jsonify(ok=False, error="Pas dans ce channel"), 403
    before = request.args.get("before") or None
    limit = max(1, min(200, int(request.args.get("limit", "100"))))
    messages = tandem_db.list_messages(cid, limit=limit, before_id=before)
    return jsonify(ok=True, messages=messages)


@tandem_bp.post("/tandem/api/channels/<cid>/messages")
def api_post_message(cid: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    if not tandem_db.is_member(cid, user["id"]):
        return jsonify(ok=False, error="Pas dans ce channel"), 403
    ch = tandem_db.get_channel(cid)
    if not ch:
        return jsonify(ok=False, error="Channel introuvable"), 404
    if ch["kind"] == "announcement" and user["role"] != "admin":
        return jsonify(ok=False, error="Channel en lecture seule"), 403
    body = request.get_json(silent=True) or {}
    text = body.get("body") or ""
    file_id = body.get("file_id") or None
    if file_id:
        # Vérifie que le file appartient au user
        f = tandem_db.get_file(file_id)
        if not f or f["owner_id"] != user["id"]:
            return jsonify(ok=False, error="Fichier introuvable"), 400
    try:
        msg = tandem_db.post_message(cid, user["id"], text, file_id=file_id)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, message=msg)


@tandem_bp.delete("/tandem/api/messages/<mid>")
def api_delete_message(mid: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    ok = tandem_db.delete_message(mid, user["id"], is_admin=(user["role"] == "admin"))
    if not ok:
        return jsonify(ok=False, error="Suppression refusée"), 403
    return jsonify(ok=True)


@tandem_bp.get("/tandem/api/channels/<cid>/files")
def api_list_channel_files(cid: str):
    user, err = _require_user()
    if err:
        return err
    if not tandem_db.is_member(cid, user["id"]):
        return jsonify(ok=False, error="Pas dans ce channel"), 403
    return jsonify(ok=True, files=tandem_db.list_channel_files(cid))


@tandem_bp.get("/tandem/api/channels/<cid>/members")
def api_list_members(cid: str):
    user, err = _require_user()
    if err:
        return err
    if not tandem_db.is_member(cid, user["id"]):
        return jsonify(ok=False, error="Pas dans ce channel"), 403
    return jsonify(ok=True, members=tandem_db.channel_members(cid))


# ── Files ────────────────────────────────────────────────────────

@tandem_bp.post("/tandem/api/files")
def api_upload_file():
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    f = request.files.get("file")
    if not f or not f.filename:
        return jsonify(ok=False, error="Aucun fichier"), 400
    original = secure_filename(f.filename) or "file"
    ext = Path(original).suffix.lower()
    if ext in _BLOCKED_EXTS:
        return jsonify(ok=False, error=f"Type de fichier interdit ({ext})"), 400
    if ext not in _ALLOWED_EXTS:
        return jsonify(ok=False,
                       error=f"Extension non supportée ({ext or 'aucune'})"), 400
    f.stream.seek(0, os.SEEK_END)
    size = f.stream.tell()
    f.stream.seek(0)
    if size > _MAX_UPLOAD_BYTES:
        return jsonify(ok=False, error="Fichier trop lourd (>16 Mo)"), 400
    if size <= 0:
        return jsonify(ok=False, error="Fichier vide"), 400
    file_id = uuid.uuid4().hex
    stored_name = f"{file_id}{ext}"
    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    f.save(UPLOADS_DIR / stored_name)
    mime = f.mimetype or mimetypes.guess_type(original)[0] or "application/octet-stream"
    channel_id = (request.form.get("channel_id") or "").strip() or None
    if channel_id and not tandem_db.is_member(channel_id, user["id"]):
        # Empêche d'attacher à un channel non-membre
        try:
            (UPLOADS_DIR / stored_name).unlink(missing_ok=True)
        except Exception:
            pass
        return jsonify(ok=False, error="Pas dans ce channel"), 403
    rec = tandem_db.register_file(
        file_id=file_id,
        owner_id=user["id"],
        channel_id=channel_id,
        filename=stored_name,
        original_name=original,
        mime=mime,
        size_bytes=size,
    )
    return jsonify(ok=True, file=rec)


@tandem_bp.get("/tandem/api/files")
def api_list_files():
    user, err = _require_user()
    if err:
        return err
    return jsonify(ok=True, files=tandem_db.list_recent_files())


@tandem_bp.delete("/tandem/api/files/<fid>")
def api_delete_file(fid: str):
    user, err = _require_user()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    f = tandem_db.get_file(fid)
    if not f:
        return jsonify(ok=False, error="Introuvable"), 404
    if f["owner_id"] != user["id"] and user["role"] != "admin":
        return jsonify(ok=False, error="Suppression refusée"), 403
    try:
        (UPLOADS_DIR / f["filename"]).unlink(missing_ok=True)
    except Exception:
        pass
    tandem_db.delete_file(fid)
    return jsonify(ok=True)


@tandem_bp.get("/tandem/files/<fid>")
def serve_file(fid: str):
    """Download d'un fichier — auth requise. Pas de cache pour respecter la
    confidentialité (un user désinscrit ne doit plus pouvoir DL via cache)."""
    user, err = _require_user()
    if err:
        return err
    f = tandem_db.get_file(fid)
    if not f:
        abort(404)
    # Si le fichier est attaché à un channel, vérifie l'appartenance
    if f.get("channel_id") and not tandem_db.is_member(f["channel_id"], user["id"]):
        if user["role"] != "admin":
            abort(403)
    # Path traversal protection : on ne sert que le filename stocké en DB
    fname = f["filename"]
    if "/" in fname or "\\" in fname or ".." in fname:
        abort(400)
    full = UPLOADS_DIR / fname
    if not full.exists():
        abort(404)
    resp = send_from_directory(
        str(UPLOADS_DIR), fname,
        as_attachment=("download" in request.args),
        download_name=f["original_name"],
        max_age=0,
    )
    resp.headers["Cache-Control"] = "private, no-store"
    # Empêche un fichier HTML uploadé de s'exécuter dans le contexte de
    # marienour.work (même si on bloque .html à l'upload, double rideau).
    resp.headers["Content-Security-Policy"] = "sandbox; default-src 'none'"
    resp.headers["X-Content-Type-Options"] = "nosniff"
    return resp


# ── Admin ────────────────────────────────────────────────────────

@tandem_bp.get("/tandem/api/admin/users")
def api_admin_users():
    _, err = _require_admin()
    if err:
        return err
    return jsonify(ok=True, users=tandem_db.list_users())


@tandem_bp.patch("/tandem/api/admin/users/<uid>")
def api_admin_update_user(uid: str):
    admin, err = _require_admin()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    name = body.get("name")
    role = body.get("role")
    job_title = body.get("job_title")
    if role and role not in ("admin", "member"):
        return jsonify(ok=False, error="Rôle invalide"), 400
    if uid == admin["id"] and role == "member":
        return jsonify(ok=False, error="Impossible de se déclasser soi-même"), 400
    u = tandem_db.update_user(uid, name=name, role=role, job_title=job_title)
    if not u:
        return jsonify(ok=False, error="Introuvable"), 404
    return jsonify(ok=True, user=u)


@tandem_bp.delete("/tandem/api/admin/users/<uid>")
def api_admin_delete_user(uid: str):
    admin, err = _require_admin()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    if uid == admin["id"]:
        return jsonify(ok=False, error="Impossible de supprimer son propre compte"), 400
    tandem_db.delete_user(uid)
    return jsonify(ok=True)


@tandem_bp.get("/tandem/api/admin/invites")
def api_admin_invites():
    _, err = _require_admin()
    if err:
        return err
    return jsonify(ok=True, invites=tandem_db.list_invites())


@tandem_bp.post("/tandem/api/admin/invites")
def api_admin_create_invite():
    admin, err = _require_admin()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    body = request.get_json(silent=True) or {}
    inv = tandem_db.create_invite(
        role=body.get("role") or "member",
        ttl_hours=max(1, min(24 * 30, int(body.get("ttl_hours") or 168))),
        created_by=admin["id"],
        email=body.get("email") or "",
        note=body.get("note") or "",
    )
    return jsonify(ok=True, invite=inv)


@tandem_bp.delete("/tandem/api/admin/invites/<iid>")
def api_admin_delete_invite(iid: str):
    _, err = _require_admin()
    if err:
        return err
    chk = _require_same_origin()
    if chk:
        return chk
    tandem_db.delete_invite(iid)
    return jsonify(ok=True)


@tandem_bp.get("/tandem/api/stats")
def api_stats():
    user, err = _require_user()
    if err:
        return err
    s = tandem_db.workspace_stats()
    return jsonify(ok=True, stats=s)

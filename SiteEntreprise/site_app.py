"""SiteEntreprise — Up Technologies (Vite/React build).

Sert le build de production depuis dist/.
- Les assets (JS/CSS avec hash de contenu) sont mis en cache 1 an.
- index.html est servi sans cache (géré par _no_cache_html dans app.py).
"""
from pathlib import Path

from flask import Blueprint, abort, send_from_directory

site_entreprise_bp = Blueprint(
    "site_entreprise",
    __name__,
    url_prefix="/site-entreprise",
)

_DIST = Path(__file__).resolve().parent / "dist"


@site_entreprise_bp.route("/assets/<path:filename>")
def serve_asset(filename):
    if not _DIST.exists():
        abort(503)
    return send_from_directory(_DIST / "assets", filename, max_age=31_536_000)


@site_entreprise_bp.route("/", defaults={"path": ""})
@site_entreprise_bp.route("/<path:path>")
def index(path):
    if not _DIST.exists():
        abort(503)
    return send_from_directory(_DIST, "index.html")

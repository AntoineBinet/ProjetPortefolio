"""SiteEntreprise — Up Technologies (Vite/React build)."""
from pathlib import Path

from flask import Blueprint, send_file, send_from_directory

site_entreprise_bp = Blueprint(
    "site_entreprise",
    __name__,
    url_prefix="/site-entreprise",
)

_DIR = Path(__file__).resolve().parent
_DIST = _DIR / "dist"


@site_entreprise_bp.route("/assets/<path:filename>")
def serve_asset(filename):
    return send_from_directory(_DIST / "assets", filename)


@site_entreprise_bp.route("/", defaults={"path": ""})
@site_entreprise_bp.route("/<path:path>")
def index(path):
    return send_file(_DIST / "index.html")

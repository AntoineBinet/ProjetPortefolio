"""SiteEntreprise — Blueprint Flask (placeholder)."""
from pathlib import Path

from flask import Blueprint, send_file

site_entreprise_bp = Blueprint(
    "site_entreprise",
    __name__,
    url_prefix="/site-entreprise",
    static_folder="static",
    static_url_path="/site-entreprise/static",
)

_DIR = Path(__file__).resolve().parent


@site_entreprise_bp.route("/", defaults={"path": ""})
@site_entreprise_bp.route("/<path:path>")
def index(path):
    return send_file(_DIR / "index.html")

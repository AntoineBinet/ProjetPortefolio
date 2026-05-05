"""Nimbus — vitrine produit tech (casque audio premium imaginaire).

Site statique avec une seule route HTML. Aucun mécanisme d'auth/DB : c'est un
exemple de site de produit tech, donc l'objectif est purement visuel.

Routes :
    /nimbus                   → page principale
    /nimbus/static/<path>     → assets (CSS/JS/images SVG)
"""
from __future__ import annotations

from pathlib import Path

from flask import Blueprint, Response, send_from_directory


NIMBUS_DIR = Path(__file__).resolve().parent

nimbus_bp = Blueprint("nimbus", __name__)


@nimbus_bp.route("/nimbus")
@nimbus_bp.route("/nimbus/")
def index():
    try:
        html = (NIMBUS_DIR / "index.html").read_text(encoding="utf-8")
    except FileNotFoundError:
        return "Nimbus indisponible", 503
    return Response(html, mimetype="text/html")


@nimbus_bp.route("/nimbus/static/<path:filename>")
def static_file(filename: str):
    resp = send_from_directory(str(NIMBUS_DIR / "static"), filename, max_age=0)
    resp.headers["Cache-Control"] = "no-store, must-revalidate"
    return resp

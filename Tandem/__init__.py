"""Tandem — plateforme collaborative (chat + partage de documents).

Le Blueprint `tandem_app.tandem_bp` regroupe toutes les routes /tandem/*.
Auth indépendante du Portfolio (cookie `tandem_session`, DB SQLite).
"""
from .tandem_app import tandem_bp

__all__ = ["tandem_bp"]

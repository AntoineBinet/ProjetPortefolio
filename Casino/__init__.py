"""Casino — entité indépendante du Portfolio.

Le Blueprint `casino_app.casino_bp` regroupe toutes les routes /casino/*.
La DB SQLite (`casino.db`) et les fichiers de l'app (Casino/static/, index.html)
restent confinés dans ce dossier.
"""
from .casino_app import casino_bp

__all__ = ["casino_bp"]

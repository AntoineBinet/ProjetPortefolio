"""TYLA Maison — domotique du Portfolio.

Le Blueprint `tyla_app.tyla_bp` regroupe toutes les routes /tyla/*.
Auth indépendante du Portfolio (cookie `tyla_session`, DB SQLite).

Première connexion :
    user : admin
    pass : admin
    → forcera un changement de mot de passe immédiat.

Adaptateurs supportés :
    - Tuya / Smart Life (ampoules, prises, capteurs) via tinytuya
    - Roborock (stub, à connecter)
    - Denon HEOS (stub, à connecter)
    - Siemens projector (stub, à connecter)
    - Generic (toggle/scene par webhook)
"""
from .tyla_app import tyla_bp

__all__ = ["tyla_bp"]

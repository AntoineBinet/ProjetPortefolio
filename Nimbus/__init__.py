"""Nimbus — site vitrine pour un produit tech imaginaire (casque audio premium).

Site purement statique : pas d'auth, pas de DB. Le Blueprint sert un index.html
et les assets dans /nimbus/static/.
"""
from .nimbus_app import nimbus_bp

__all__ = ["nimbus_bp"]

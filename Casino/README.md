# Casino

Première app du portfolio. Le contenu de ce dossier est libre — c'est ici qu'Antoine
travaille sur l'app Casino.

## Conventions du portfolio

Pour qu'une app apparaisse sur **marienour.work/apps** et dans la landing scroll-snap,
elle doit être déclarée dans la liste `PROJECTS` de [`../app.py`](../app.py). Champs attendus :

```python
{
    "id": <int>,           # identifiant numérique (unique, sert d'ancre #project-X)
    "slug": "casino",      # slug URL-friendly
    "name": "Casino",      # nom affiché
    "tagline": "...",      # phrase courte sous le nom
    "tags": ["mobile", "..."],
    "year": 2026,
    "accent": "oklch(...)",  # couleur d'accent (oklch / hsl / hex)
    "type": "mobile" | "web",
    "demo": "..."          # URL ou "#"
}
```

## TODO

- [ ] Choisir le concept exact de l'app
- [ ] Définir l'accent color final (placeholder pour l'instant)
- [ ] Mockup mobile/web ou prototype HTML
- [ ] Page de démo (si web app) ou capture (si mobile)

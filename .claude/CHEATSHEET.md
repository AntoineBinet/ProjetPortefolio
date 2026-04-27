# Cheatsheet — Portfolio (marienour.work)

Quick reference for common operations. For deeper context (architecture, conventions), see [`../CLAUDE.md`](../CLAUDE.md).

## Daily ops

| Quoi                             | Comment                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| Pull GitHub                      | `git pull origin main` (depuis `C:\Users\binet\Desktop\Portfolio`)   |
| Push (auto à fin de session)     | rien — le hook `Stop` dans `.claude/settings.json` s'en charge       |
| Restart serveur                  | `/restart` (slash command) — bouton MAJ flottant dans l'UI marche aussi |
| Pull GitHub + restart            | `/maj`                                                               |
| Créer une nouvelle app           | `/new-app <Nom>` (ou agent `app-creator`)                            |
| Voir le serveur tourner          | `netstat -ano \| grep :8001` doit dire LISTENING                     |
| Voir l'état du tunnel            | `tail -20 tunnel.err.log` — pas d'erreurs `connection refused`       |

## Git

```bash
# Le hook Stop auto-commit/push à la fin de chaque réponse Claude.
# Pour pousser manuellement maintenant :
git add -A && git commit -m "..." && git push origin main

# Pour vérifier ce qui est parti :
git log --oneline -5
```

## API admin (depuis bash)

Login + appel API protégé :
```bash
curl -s -c /tmp/c.txt -d "username=admin&password=admin" http://127.0.0.1:8001/login -L -o /dev/null
curl -s -b /tmp/c.txt -X POST http://127.0.0.1:8001/api/deploy/restart \
  -H "Origin: http://127.0.0.1:8001" -H "Referer: http://127.0.0.1:8001/admin/parametres"
```

Endpoints disponibles : `/api/deploy/{pull,restart,rollback,health,remote,pull-from-404}`. Voir `app.py` `deploy_bp`.

## Patterns Flask de ce projet

```python
# Ajouter une route protégée
@app.route("/admin/<chemin>")
@login_required
def admin_chemin():
    return render_template("admin/chemin.html")

# Ajouter un projet à la landing+/apps
PROJECTS.append({
    "id": 13, "slug": "...", "name": "...", "tagline": "...",
    "tags": [...], "year": 2026, "accent": "oklch(...)",
    "type": "mobile" | "web", "demo": "#"
})
# → restart serveur pour voir l'effet (modif app.py)
```

## Patterns CSS / templates

- **Variables design** : `var(--fg)`, `var(--muted)`, `var(--bg)`, `var(--line)`, `var(--accent)` (par projet)
- **Fonts** : `var(--font-display)` (Space Grotesk), `var(--font-body)` (Inter Tight), `var(--font-mono)` (JetBrains Mono)
- **Couleurs** : palette `oklch()` privilégiée (cohérence perceptuelle)
- **Topbar partagée** : copier le bloc `<header class="topbar">` depuis [`templates/landing.html`](../templates/landing.html)
- **Responsive** : breakpoint unique à `880px` (voir bas du `static/style.css`)

## Modifier ≠ restart

| Modif                                  | Restart nécessaire ? |
| -------------------------------------- | -------------------- |
| `templates/*.html`                     | non — rendus à chaque requête |
| `static/*.css`, `static/*.js`          | non — F5 dans le navigateur   |
| `app.py` (routes, PROJECTS, helpers)   | **oui** — `/restart` ou bouton MAJ |
| `requirements.txt`                     | reinstall pip + restart       |

## Anti-régression checklist (avant de marquer une tâche done)

- [ ] Page modifiée chargée localement (`http://127.0.0.1:8001/<route>`) — HTTP 200
- [ ] Page modifiée chargée via tunnel (`https://marienour.work/<route>`) — HTTP 200
- [ ] Pas d'erreur dans `tunnel.err.log` (queue les 5 dernières lignes)
- [ ] Si modif `app.py` : restart fait + nouveau PID confirmé
- [ ] Si nouvelle app ajoutée : visible sur `/apps` ET sur landing scroll-snap
- [ ] Prospup intact : `netstat -ano \| grep :8000` montre toujours LISTENING (PID inchangé)

## Les pièges

- **Port collision** : si `python app.py` plante avec "address already in use", c'est qu'un python orphelin tient encore 8001. `taskkill /F /PID <pid>` puis relance via `_run_serveur.bat`.
- **Sortie code 42** : c'est volontaire — c'est le restart propre. `_run_serveur.bat` boucle dessus.
- **`mnwork.yml` manquant** : config tunnel locale, gitignorée (chemin user-spécifique). Si perdu : régénérer via `cloudflared tunnel route dns mnwork marienour.work` + réécrire le yml.
- **Hook auto-push silencieux** : si rien ne push à la fin d'un turn, ouvrir `/hooks` une fois pour recharger la config (le watcher ne voit pas `.claude/` créé en cours de session).

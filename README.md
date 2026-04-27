# Portfolio (marienour.work)

Site Flask en français — landing publique avec scroll-snap, page « Apps »
avec dock bulles façon Apple Watch, et un panneau admin protégé pour la
maintenance + le système de mise à jour Git via SSE (boutons MAJ /
Rollback / Restart). Inspiré de Prosp'Up pour la partie déploiement.

## Routes

Public :
- `/` — landing : hero + 12 sections projets en scroll-snap + about
- `/apps` — vue d'ensemble des projets en bulles (Apple Watch dock)
- `/login`, `/logout`

Admin (login requis) :
- `/admin/parametres` — état serveur + boutons MAJ / Rollback / Restart
- `/parametres` — redirection 301 vers `/admin/parametres` (compat)

API déploiement :
- `POST /api/deploy/pull` (SSE, login)
- `POST /api/deploy/restart` (login)
- `POST /api/deploy/rollback`
- `POST /api/deploy/pull-from-404` (sans auth, pour réparer depuis n'importe quelle URL cassée)
- `GET  /api/deploy/health`
- `GET  /api/deploy/remote` (login)

Toute URL inconnue → page 404 publique avec un bouton « Réparer &
redémarrer » qui appelle `pull-from-404`.

## Lancement

Double-clic sur `PORTFOLIO.bat`. Le script lance :
1. le serveur Waitress sur `http://127.0.0.1:8001` (boucle de restart auto sur exit code 42),
2. le tunnel Cloudflare `mnwork` (config locale dans `mnwork.yml`),
3. `https://marienour.work` dans le navigateur.

Local dev :
- `python app.py` → mode dev port 8001 (debug)
- `python app.py --prod` → Waitress en prod

## Mise à jour à distance

`https://marienour.work/admin/parametres` → bouton **Mettre à jour et
redémarrer**. Le serveur fait `git pull origin main` + `pip install` +
restart automatique en ~10 s.

## Identifiants

`admin / admin` par défaut. Configurables via env :
- `PORTFOLIO_USER`, `PORTFOLIO_PASS`
- `PORTFOLIO_NAME` (nom affiché), `PORTFOLIO_TAGLINE`, `PORTFOLIO_EMAIL`
- `PORTFOLIO_PORT` (8001), `PORTFOLIO_SECRET`

## Édition des projets

Les 12 projets sont dans `app.py` (liste `PROJECTS`). Chaque entrée :
`id`, `slug`, `name`, `tagline`, `tags[]`, `year`, `accent` (CSS color,
`oklch(...)` recommandé), `type` (`mobile` ou `web`), `demo`.

# Portfolio (marienour.work) — v1.0

Site Flask en français — landing publique avec scroll-snap, page « Apps »
en liste verticale, et un panneau admin protégé pour la maintenance + le
système de mise à jour Git via SSE (boutons MAJ / Rollback / Restart).

Publié à <https://marienour.work> via tunnel Cloudflare `mnwork`.
**Le site est conçu pour être partagé** — visiteurs publics ne voient
jamais ni l'admin, ni les boutons d'édition des sous-apps.

## Routes

Public :
- `/` — landing : hero + projets en scroll-snap + about
- `/apps` — liste verticale des projets, lien direct vers chaque app
- `/casino` — sous-app Texas Hold'em (auth séparée)
- `/site-entreprise` — sous-app vitrine Up Technologies (auth séparée)
- `/login`, `/logout`
- `/api/deploy/health` — réponse minimale `{ok, version}` pour les visiteurs

Admin (login requis) :
- `/admin/parametres` — état serveur + boutons MAJ / Rollback / Restart
                       + sécurité + demandes de modifs
- `/admin/demandes-archivees` — archives
- `/parametres` — redirection 301 vers `/admin/parametres`

API déploiement (toutes `@login_required` + même-origine) :
- `POST /api/deploy/pull` (SSE)
- `POST /api/deploy/restart`
- `POST /api/deploy/rollback`
- `POST /api/deploy/pull-from-404` *(était public en v0.x — corrigé en v1.0)*
- `POST /api/deploy/change-password`
- `GET  /api/deploy/remote`
- `GET  /api/deploy/prospup-status`
- `POST /api/deploy/restart-internal` *(127.0.0.1 uniquement, sans login)*
- `POST /api/deploy/launch-prospup`

API demandes de modifs (login + même-origine) :
- `GET  /api/demandes-modifs[?archived=1]`
- `POST /api/demandes-modifs`
- `PATCH /api/demandes-modifs/<id>`
- `POST /api/demandes-modifs/<id>/archive`
- `DELETE /api/demandes-modifs/<id>`

Toute URL inconnue → page 404 publique avec un bouton « Réparer &
redémarrer » **visible seulement quand on est loggé admin**.

## Lancement

Double-clic sur `PORTFOLIO.bat`. Le script lance :
1. le serveur Waitress sur `http://127.0.0.1:8001` (boucle de restart auto
   sur exit code 42 via `_run_serveur.bat`),
2. le tunnel Cloudflare `mnwork` (config locale dans `mnwork.yml`),
3. `https://marienour.work` dans le navigateur.

Local dev :
- `python app.py` → mode dev port 8001 (debug, cookies non-Secure)
- `python app.py --prod` → Waitress en prod (cookies Secure activés)

## Mise à jour à distance

`https://marienour.work/admin/parametres` → bouton **Mettre à jour et
redémarrer**. Le serveur fait `git pull origin main` + `pip install` +
restart automatique en ~10 s.

## Identifiants

Premier login : `admin / admin`. Le mot de passe doit être changé via
`/admin/parametres` → section **Sécurité**. Le hash PBKDF2-SHA256
(200 000 itérations + salt 16 octets) est stocké dans
`.portfolio_config.json` (gitignored, jamais en clair).

Configurables via env :
- `PORTFOLIO_USER`, `PORTFOLIO_PASS` (défaut `admin/admin`)
- `PORTFOLIO_NAME`, `PORTFOLIO_TAGLINE`, `PORTFOLIO_EMAIL`
- `PORTFOLIO_PORT` (8001), `PORTFOLIO_SECRET`

## Sécurité (v1.0)

- **Hash PBKDF2** pour le mdp admin Portfolio (200k itérations).
  Migration douce : tout ancien `admin_pass` en clair dans la config est
  hashé puis supprimé au premier démarrage.
- **Rate limiting** sur `/login` : 5 essais ratés / 15 min / IP.
- **Cookies session** : `Secure`, `HttpOnly`, `SameSite=Lax`,
  durée 30 jours. `Secure=True` automatique en `--prod`.
- **CSRF basique** sur tous les POST mutants (vérification Origin/Referer
  + SameSite=Lax).
- **Headers HTTP** : CSP, HSTS (1 an), X-Frame-Options, X-Content-Type-Options,
  Referrer-Policy, Permissions-Policy.
- **Auth séparée par sous-app** : Casino (cookie + DB SQLite + PBKDF2),
  SiteEntreprise (session Flask + werkzeug hash). Aucune élévation
  croisée — partager un lien `/site-entreprise` ou `/casino` ne donne
  jamais accès à l'admin Portfolio.
- **Anti session-fixation** : `session.clear()` avant d'élever les droits
  au login.
- **Uploads SiteEntreprise** : `.svg` exclu (XSS persistant).

## Édition des projets

Les projets sont dans `app.py` (liste `PROJECTS`). Chaque entrée :
`id`, `slug`, `name`, `tagline`, `tags[]`, `year`, `accent` (CSS color,
`oklch(...)` recommandé), `type` (`mobile` ou `web`), `demo`,
`cta_label`.

## Sous-apps

Voir [`Casino/README.md`](Casino/README.md) (Texas Hold'em No-Limit avec
SSE multijoueur) et [`SiteEntreprise/`](SiteEntreprise/) (Vite/React +
mini-CMS via `content.json`).

Pour scaffolder une nouvelle app : `/new-app <Nom>` ou subagent
`app-creator` (cf. `.claude/agents/`).

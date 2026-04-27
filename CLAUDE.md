# Portfolio — marienour.work

Site Flask publié à **https://marienour.work** via un tunnel Cloudflare nommé `mnwork`.
Une zone `/admin/*` (login admin) sert à piloter MAJ / Rollback / Restart depuis le navigateur.

## Le voisin Prospup — règle d'or

**Prospup tourne sur le port 8000** (autre projet Flask, autre tunnel Cloudflare). Le Portfolio doit
**impérativement** rester sur le port **8001** et utiliser **uniquement** sa propre config tunnel
`mnwork.yml`. Ne jamais :

- killer un process Python sans avoir vérifié son PID/port (Prospup et Portfolio sont tous deux du
  `python.exe`)
- toucher au `config.yml` global de cloudflared dans `~/.cloudflared/`
- lancer un second tunnel `mnwork` si un est déjà actif (vérifier `tasklist | grep cloudflared`)

Pour identifier sans risque le process Portfolio : `netstat -ano | grep :8001`.

## Architecture

- `app.py` — Flask app, port `8001` (env `PORTFOLIO_PORT`), version dans `APP_VERSION`
  - Pages publiques : `/` (landing), `/apps`
  - Auth : `/login`, `/logout`, sessions Flask
  - Admin : `/admin/parametres` (protégé par `@login_required`)
  - API SSE deploy : `/api/deploy/{pull,restart,rollback,health,remote,pull-from-404}`
  - 404 custom avec mécanisme de réparation (`/api/deploy/pull-from-404`)
- `templates/` — Jinja2 (landing, apps, login, base, 404, admin/parametres)
- `static/` — CSS + JS (`landing.js`, `apps.js`, `style.css`)
- `_run_serveur.bat` — boucle de relance : `python app.py --prod`, exit code 42 = restart
- `PORTFOLIO.bat` — lance serveur (via `_run_serveur.bat`) **+** tunnel cloudflared
- `mnwork.yml` — config tunnel locale (gitignorée — chemin absolu user-spécifique)
- `requirements.txt` — `flask>=3.0`, `waitress>=3.0`

## Démarrage / arrêt

- **Tout démarrer (serveur + tunnel)** : double-clic sur `PORTFOLIO.bat` (ou exécution manuelle)
- **Serveur seul** (si le tunnel tourne déjà) : `_run_serveur.bat` — c'est le bon choix quand un
  `cloudflared.exe` du tunnel `mnwork` est déjà actif
- **Restart depuis l'app** : bouton dans `/admin/parametres` (exit code 42 → relancé par le `.bat`)
- **Vérifier l'état du serveur local** : `netstat -ano | grep :8001` doit retourner LISTENING
- **Vérifier le tunnel** : `tail -f tunnel.err.log` dans ce dossier — pas d'erreurs `connection refused`

Mode prod = waitress (`--prod` flag), mode dev = `app.run(debug=True)` directement.

## Variables d'environnement

| Variable           | Défaut                | Usage                              |
| ------------------ | --------------------- | ---------------------------------- |
| `PORTFOLIO_PORT`   | `8001`                | port d'écoute Flask                |
| `PORTFOLIO_USER`   | `admin`               | login admin                        |
| `PORTFOLIO_PASS`   | `admin`               | password admin                     |
| `PORTFOLIO_SECRET` | random hex            | secret_key Flask (sessions)        |
| `PORTFOLIO_NAME`   | `Antoine Binet`       | nom affiché                        |
| `PORTFOLIO_TAGLINE`| —                     | tagline landing                    |
| `PORTFOLIO_EMAIL`  | `hello@marienour.work`| contact                            |
| `PORTFOLIO_LAUNCHER`| (vide)               | mis à `BAT` par `_run_serveur.bat` |

## Git workflow

- Remote : `https://github.com/AntoineBinet/ProjetPortefolio.git` (origin)
- Branche de travail : **`main`** directement (pas de feature branch en local)
- **Auto-push activé** : un hook `Stop` configuré dans `.claude/settings.json` commit + push
  toutes les modifs locales sur `main` à la fin de chaque réponse Claude. Message de commit
  générique. Le user a explicitement accepté le risque de pousser du WIP / code cassé.
- L'app a son propre mécanisme de pull/rollback via `/admin/parametres` (utile depuis le navigateur
  une fois en prod)

## Apps du portfolio

Chaque app du portfolio = un dossier à la racine (ex: [`Casino/`](Casino/)) + une entrée dans
`PROJECTS` dans [`app.py`](app.py). Voir [`Casino/README.md`](Casino/README.md) pour le format
attendu de l'entrée PROJECTS.

Pour scaffolder une nouvelle app :
- Slash command : `/new-app <Nom>`
- Ou subagent : `app-creator` (procédure complète : dossier + PROJECTS + restart + vérif)

## Environnement Claude Code

`.claude/` contient l'outillage de travail :

| Fichier                                                          | Rôle                                                |
| ---------------------------------------------------------------- | --------------------------------------------------- |
| [`.claude/CHEATSHEET.md`](.claude/CHEATSHEET.md)                 | Quick reference : ops courantes, curl admin, patterns |
| [`.claude/WORKFLOW.md`](.claude/WORKFLOW.md)                     | Règles de travail (branche unique, modif→vérif→done, etc.) |
| [`.claude/settings.json`](.claude/settings.json)                 | Hooks Claude Code (notamment Stop = auto-push)      |
| [`.claude/agents/app-creator.md`](.claude/agents/app-creator.md) | Subagent : scaffold une nouvelle app de A à Z       |
| [`.claude/agents/ui-polisher.md`](.claude/agents/ui-polisher.md) | Subagent : raffinements visuels (typo, espacement, couleur) |
| [`.claude/agents/cloudflare-ops.md`](.claude/agents/cloudflare-ops.md) | Subagent : ops Cloudflare (tunnel, KV, D1, R2, Workers) |
| [`.claude/commands/restart.md`](.claude/commands/restart.md)     | Slash : `/restart` — restart serveur via API admin   |
| [`.claude/commands/maj.md`](.claude/commands/maj.md)             | Slash : `/maj` — pull GitHub + restart               |
| [`.claude/commands/new-app.md`](.claude/commands/new-app.md)     | Slash : `/new-app <Nom>` — délègue à `app-creator`   |

`settings.local.json` (permissions locales d'Antoine) et `auto-push.log` sont gitignorés.

## Cloudflare

- Tunnel : `mnwork` (UUID `5040bce7-4796-4a6d-9672-17d6a7335433`)
- Credentials : `C:\Users\binet\.cloudflared\5040bce7-4796-4a6d-9672-17d6a7335433.json`
- Config locale : `mnwork.yml` (gitignoré)
- Ingress : `marienour.work` → `http://localhost:8001`
- Logs locaux : `tunnel.out.log`, `tunnel.err.log`
- Outils MCP Cloudflare disponibles dans Claude Code (account/D1/KV/R2/Workers/Hyperdrive) — utiles
  si on étend l'architecture côté Cloudflare, mais pas requis pour le fonctionnement quotidien

## Pièges connus

- **Le serveur ne répond pas mais le tunnel tourne** → le serveur Flask a crashé / n'a pas démarré.
  Symptôme dans `tunnel.err.log` : `dial tcp [::1]:8001: connectex: No connection could be made`.
  Solution : relancer `_run_serveur.bat` (le tunnel n'a pas besoin d'être relancé).
- **Auto-restart en boucle** → vérifier que la dernière exception ne fait pas exit 42 en chaîne.
- **`mnwork.yml` manquant** après clone → le bootstrap doit le régénérer (chemin absolu spécifique
  à la machine).

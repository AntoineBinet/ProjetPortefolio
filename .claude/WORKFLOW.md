# Workflow — Portfolio

Règles pour travailler sur ce repo. Inspiré de la convention Prosp_Up : **branche unique
`main`, push après chaque session, mécanisme de restart/rollback dans l'app**.

## Règle 1 — Toujours sur `main`

Pas de feature branch. Le repo a une seule branche active : `main`. Les modifs partent
direct sur l'origin via le hook Stop (auto-commit + push à fin de chaque réponse).

**Pourquoi** : itérations courtes, 1 dev (Antoine), MAJ immédiates en prod (le tunnel
sert depuis localhost qui pull la dernière version de main).

**Exception** : si un changement est risqué (refactor large, migration data), proposer à
Antoine de bosser dans une branche temporaire avant de merger. Mais c'est l'exception.

## Règle 2 — Modif → vérif → done

L'ordre rigide pour toute tâche qui touche du code :

1. Lire les fichiers concernés (Read / Grep)
2. Faire la modif (Edit / Write)
3. **Vérifier** :
   - Si `templates/`, `static/` : F5 mental + WebFetch sur `https://marienour.work/<route>`
   - Si `app.py` : restart serveur + WebFetch
4. Cocher la todo `completed`
5. Reporter à Antoine

Ne jamais marquer une tâche done sans avoir vérifié le résultat. La preuve = HTTP 200 +
contenu attendu visible.

## Règle 3 — Ne pas casser Prospup

ProspUp tourne sur le port **8000** (autre projet Flask, autre tunnel `prospup` →
prospup.work). Plusieurs `python.exe` cohabitent sur la machine :

- Identifier le process Portfolio : `netstat -ano | grep :8001` → PID
- Identifier le process Prospup : `netstat -ano | grep :8000` → PID (ne PAS y toucher)
- Ne jamais kill un python "au hasard" — toujours par PID après vérif port
- Ne jamais toucher au `config.yml` global de cloudflared (`~/.cloudflared/config.yml`)
- Le tunnel Portfolio = `mnwork.yml` (local au dossier)

## Règle 4 — Une app = un dossier

Convention pour les apps du portfolio :

- Chaque app a un dossier à la racine (ex : `Casino/`, `Atlas/`, etc.)
- Chaque dossier contient ce qu'Antoine veut (libre — code, mockups, README, assets)
- L'app est référencée dans `PROJECTS` dans [`../app.py`](../app.py) avec un `id` unique
- Le `slug` du dossier (lowercase) doit matcher le `slug` du dict PROJECTS

Pour scaffolder une nouvelle app : utiliser `/new-app <Nom>` ou l'agent `app-creator`.

## Règle 5 — Tout passe par l'admin UI

Toute opération de maintenance doit avoir un équivalent UI dans `/admin/parametres` :

- Pull GitHub → bouton "MAJ"
- Rollback → bouton "Rollback"
- Restart → bouton "Restart"

Si Antoine demande une nouvelle opération de maintenance (ex: clear cache, rebuild,
purge logs…), proposer de l'ajouter à `/admin/parametres` plutôt que de la faire en CLI.

## Règle 6 — Cohérence design

- Palette en `oklch()` (pas de hex sauf cas particulier)
- Polices fixes : Space Grotesk (display), Inter Tight (body), JetBrains Mono (code/labels)
- Pas de framework UI — vanilla HTML/CSS/JS, philosophie "designer-developer"
- Topbar identique sur toutes les pages publiques
- Le footer doit toujours contenir : email, MAJ, ADMIN

## Règle 7 — Versionner via APP_VERSION

À chaque ensemble de modifs significatives, bumper `APP_VERSION` dans `app.py` :
- Patch (`0.2.0` → `0.2.1`) : bugfix, micro-ajustement
- Minor (`0.2.x` → `0.3.0`) : nouvelle feature, nouvelle app
- Major (`0.x.y` → `1.0.0`) : refonte structurelle

Affiché en bas de `/admin/parametres` (`{{ app_version }}`).

## Pre-commit checks (faits par le hook Stop, mais à savoir)

Le hook auto-push ne lance pas de tests (le projet n'en a pas pour l'instant). Les
warnings CRLF dans `.claude/auto-push.log` sont normaux (Windows + git core.autocrlf).

Si Antoine veut ajouter des tests : pytest + créer un répertoire `tests/`. Le hook
Stop pourra alors être étendu pour bloquer le push si les tests échouent (mais ce n'est
pas le mode actuel — Antoine a explicitement accepté de pousser du WIP cassé).

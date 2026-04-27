---
description: Scaffold une nouvelle app dans le Portfolio. Crée le dossier, l'inscrit dans PROJECTS (app.py), restart le serveur, vérifie qu'elle apparaît sur /apps. Usage : /new-app <Nom>
---

Create a new app named `$ARGUMENTS` in the Portfolio.

Delegate this to the **`app-creator`** subagent — it knows the full procedure (folder
template, PROJECTS schema, accent color rotation, restart pattern, verification).

If `$ARGUMENTS` is empty or ambiguous, ask Antoine for the app name once, then proceed.

Use the Agent tool with:
- `subagent_type: "app-creator"`
- `description: "Scaffold app <Name>"`
- `prompt: "Create a new app named '<Name>' in the Portfolio. Follow your standard procedure: create folder, register in PROJECTS, bump APP_VERSION, restart server, verify on /apps."`

After the agent reports back, summarize to Antoine in 2 sentences: app name, folder
path, accent color, position on /apps.

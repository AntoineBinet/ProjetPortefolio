---
description: Pull les dernières modifs depuis GitHub (origin/main) puis restart le serveur. Équivalent du bouton "MAJ" de /admin/parametres mais en CLI.
allowed-tools: Bash
---

Pull from GitHub, install any new pip deps, restart the server, verify.

```bash
cd C:/Users/binet/Desktop/Portfolio
echo "--- git fetch ---"
git fetch origin main
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)
if [ "$LOCAL" = "$REMOTE" ]; then
  echo "Already up to date ($LOCAL)"
  exit 0
fi
echo "--- new commits ---"
git log --oneline HEAD..origin/main
echo "--- saving rollback hash ($LOCAL) ---"
echo "$LOCAL" > .last_commit_hash
echo "--- pull --ff-only ---"
git pull --ff-only origin main || (echo "ff failed, hard reset to origin/main" && git reset --hard origin/main)
echo "--- pip install (if requirements changed) ---"
python -m pip install -r requirements.txt --quiet
```

Then trigger a restart via `/restart` (or inline the curl from `.claude/commands/restart.md`).

Report the diff of commits pulled and confirm new PID is up.

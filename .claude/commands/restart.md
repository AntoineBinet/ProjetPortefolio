---
description: Redémarre le serveur Portfolio (port 8001) via /api/deploy/restart-internal, authentifié par le jeton X-Restart-Token. Mécanisme exit-42 + boucle _run_serveur.bat — n'interrompt pas le tunnel Cloudflare.
allowed-tools: Bash
---

Restart the Portfolio Flask server cleanly via the token-authenticated internal endpoint.

`/api/deploy/restart-internal` is protected by a shared secret — `restart_token`
in `.portfolio_config.json`, sent as the `X-Restart-Token` header. No admin login
needed: this works regardless of the admin password state (and even while the
default-password banner blocks the session-authenticated `/api/deploy/restart`).

Run this command and report the new PID + an HTTP 200 confirmation:

```bash
TOKEN=$(python -c "import json;print(json.load(open('.portfolio_config.json'))['restart_token'])")
if [ -z "$TOKEN" ]; then echo "restart_token introuvable dans .portfolio_config.json"; exit 1; fi
echo "--- restart posted ---"
curl -s -X POST http://127.0.0.1:8001/api/deploy/restart-internal -H "X-Restart-Token: $TOKEN"
echo ""
echo "--- waiting for restart cycle (down -> up) ---"
seen_down=0
for i in $(seq 1 45); do
  sleep 1
  code=$(curl -s -m 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/ 2>/dev/null)
  if [ "$code" != "200" ]; then seen_down=1; fi
  if [ "$seen_down" = "1" ] && [ "$code" = "200" ]; then echo "restart done at ~${i}s"; break; fi
done
echo "--- new PID on 8001 ---"
netstat -ano -p tcp 2>/dev/null | grep LISTENING | grep ":8001"
echo "--- HTTP test ---"
curl -sS -o /dev/null -w "HTTP %{http_code} (%{time_total}s)\n" http://127.0.0.1:8001/
```

If the restart fails (no new PID, HTTP error), fall back to:
1. `taskkill /F /PID <old-pid>` to kill the stuck python
2. `Start-Process` to relaunch `_run_serveur.bat` in a new window (PowerShell tool)

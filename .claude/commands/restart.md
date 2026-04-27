---
description: Redémarre le serveur Portfolio (port 8001) via l'API admin /api/deploy/restart. Utilise le mécanisme exit-42 + boucle du _run_serveur.bat — n'interrompt pas le tunnel Cloudflare.
allowed-tools: Bash
---

Restart the Portfolio Flask server cleanly via the admin API.

Run this command and report the new PID + an HTTP 200 confirmation:

```bash
COOKIE=/tmp/portfolio-restart-cookies.txt
rm -f $COOKIE
curl -s -c $COOKIE -d "username=admin&password=admin" http://127.0.0.1:8001/login -L -o /dev/null
echo "--- restart posted ---"
curl -s -b $COOKIE -X POST http://127.0.0.1:8001/api/deploy/restart \
  -H "Origin: http://127.0.0.1:8001" -H "Referer: http://127.0.0.1:8001/admin/parametres"
echo ""
echo "--- waiting 8s for restart ---"
sleep 8
echo "--- new PID on 8001 ---"
netstat -ano -p tcp 2>/dev/null | grep LISTENING | grep ":8001"
echo "--- HTTP test ---"
curl -sS -o /dev/null -w "HTTP %{http_code} (%{time_total}s)\n" http://127.0.0.1:8001/
```

If the restart fails (no new PID, HTTP error), fall back to:
1. `taskkill /F /PID <old-pid>` to kill the stuck python
2. `Start-Process` to relaunch `_run_serveur.bat` in a new window (PowerShell tool)

@echo off
setlocal
cd /d "%~dp0"
title Portfolio - marienour.work

echo  ============================================
echo    Portfolio - marienour.work  (port 8001)
echo  ============================================
echo.
echo Lancement (idempotent, ne touche pas Prospup)...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0boot_portfolio.ps1"
set "RC=%errorlevel%"

echo.
if "%RC%"=="0" (
    echo  OK : https://marienour.work
    echo  Local : http://127.0.0.1:8001
    start "" https://marienour.work
) else (
    echo  ERREUR : boot_portfolio.ps1 a renvoye le code %RC%
    echo  Voir boot.log dans ce dossier.
)

echo.
echo ^(Fenetre fermable - le serveur et le tunnel tournent en arriere-plan.^)
timeout /t 5 /nobreak >nul
endlocal
exit /b %RC%

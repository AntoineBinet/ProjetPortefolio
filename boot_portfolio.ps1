# boot_portfolio.ps1
# Lance Flask Portfolio (port 8001) + tunnel cloudflared mnwork si pas deja actifs.
# Strictement idempotent. Ne touche JAMAIS aux process Prospup (port 8000, tunnel prospup).
# Concu pour la tache planifiee Windows (au logon).

$ErrorActionPreference = 'Continue'
$portfolioDir = 'C:\Users\binet\Desktop\Portfolio'
$flaskOut     = Join-Path $portfolioDir 'flask.out.log'
$flaskErr     = Join-Path $portfolioDir 'flask.err.log'
$tunnelOut    = Join-Path $portfolioDir 'tunnel.out.log'
$tunnelErr    = Join-Path $portfolioDir 'tunnel.err.log'
$tunnelConfig = Join-Path $portfolioDir 'mnwork.yml'
$bootLog      = Join-Path $portfolioDir 'boot.log'

function Log($msg) {
    $line = "[{0}] {1}" -f (Get-Date -Format 's'), $msg
    Add-Content -Path $bootLog -Value $line -Encoding utf8
}

Log '=== boot_portfolio.ps1 demarre ==='

# --- Localiser cloudflared ---
$cfCandidates = @(
    "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe",
    'C:\Program Files (x86)\cloudflared\cloudflared.exe',
    'C:\Program Files\cloudflared\cloudflared.exe',
    "$env:LOCALAPPDATA\cloudflared\cloudflared.exe"
)
$cloudflared = $cfCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $cloudflared) {
    Log 'ERREUR : cloudflared.exe introuvable.'
    exit 2
}
Log "cloudflared: $cloudflared"

if (-not (Test-Path $tunnelConfig)) {
    Log "ERREUR : $tunnelConfig introuvable."
    exit 3
}

# --- 1. Flask Portfolio sur :8001 ---
$flaskListening = $false
try {
    $conn = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction Stop
    if ($conn) { $flaskListening = $true }
} catch {
    $flaskListening = $false
}

if ($flaskListening) {
    Log 'Flask deja actif sur :8001 (skip).'
} else {
    Log 'Demarrage de Flask (python app.py --prod)...'
    $env:PYTHONIOENCODING = 'utf-8'
    Start-Process -FilePath 'python' `
        -ArgumentList 'app.py','--prod' `
        -WorkingDirectory $portfolioDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $flaskOut `
        -RedirectStandardError  $flaskErr | Out-Null
    # attendre qu'il ecoute (max 20s)
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        try {
            $conn = Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction Stop
            if ($conn) { $flaskListening = $true; break }
        } catch {}
    }
    if ($flaskListening) {
        Log 'Flask en ecoute sur :8001.'
    } else {
        Log 'ATTENTION : Flask n''ecoute toujours pas apres 20s. Voir flask.err.log'
    }
}

# --- 2. Tunnel cloudflared mnwork ---
$tunnelRunning = $false
$mnworkUuid = '5040bce7-4796-4a6d-9672-17d6a7335433'
try {
    $procs = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction Stop
    foreach ($p in $procs) {
        if ($p.CommandLine -and ($p.CommandLine -match 'mnwork' -or $p.CommandLine -match $mnworkUuid)) {
            $tunnelRunning = $true
            break
        }
    }
} catch {
    $tunnelRunning = $false
}

if ($tunnelRunning) {
    Log 'Tunnel mnwork deja actif (skip).'
} else {
    Log 'Demarrage du tunnel mnwork...'
    Start-Process -FilePath $cloudflared `
        -ArgumentList '--config',$tunnelConfig,'tunnel','run','mnwork' `
        -WorkingDirectory $portfolioDir `
        -WindowStyle Hidden `
        -RedirectStandardOutput $tunnelOut `
        -RedirectStandardError  $tunnelErr | Out-Null
    Start-Sleep -Seconds 5
    Log 'Tunnel mnwork lance.'
}

Log '=== boot_portfolio.ps1 termine ==='
exit 0

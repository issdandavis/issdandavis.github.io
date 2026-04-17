<#
.SYNOPSIS
    Start the Polly backend server, optionally wired to ProtonVPN port forwarding.

.DESCRIPTION
    1. Loads environment variables from .env if it exists.
    2. Auto-detects the ProtonVPN-assigned port forwarding port (Windows app state).
    3. Opens a Windows Firewall inbound rule for the port.
    4. Starts uvicorn on the resolved port.

.NOTES
    Run from the scripts/polly-backend directory.
    Run as Administrator (or answer "yes" when prompted) for the firewall rule.
#>

[CmdletBinding()]
param(
    [switch]$NoFirewall,
    [switch]$NoBanner
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Banner ────────────────────────────────────────────────────────────────────
if (-not $NoBanner) {
    Write-Host ""
    Write-Host "  P O L L Y   B A C K E N D" -ForegroundColor Cyan
    Write-Host "  SCBE-AETHERMOORE | Sacred Egg Flywheel" -ForegroundColor DarkCyan
    Write-Host ""
}

# ── Load .env ─────────────────────────────────────────────────────────────────
$envFile = Join-Path $PSScriptRoot ".env"
if (Test-Path $envFile) {
    Write-Host "[env]  Loading $envFile" -ForegroundColor DarkGray
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -match '^([^#=\s]+)\s*=\s*(.*)$') {
            $key   = $Matches[1]
            $value = $Matches[2].Trim('"').Trim("'")
            [System.Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
} else {
    Write-Warning "No .env found. Copy .env.example to .env and set your values."
}

# ── Detect ProtonVPN port forwarding port ─────────────────────────────────────
function Get-ProtonVpnPort {
    # ProtonVPN stores connection state in LocalAppData.
    # Try several known locations across app versions.
    $searchPaths = @(
        "$env:LOCALAPPDATA\ProtonVPN\Settings",
        "$env:LOCALAPPDATA\ProtonVPN",
        "$env:APPDATA\ProtonVPN"
    )

    foreach ($dir in $searchPaths) {
        if (-not (Test-Path $dir)) { continue }

        # Look for JSON state files that might contain the forwarded port
        $candidates = Get-ChildItem -Path $dir -Recurse -Include "*.json","*.dat","*.state" -ErrorAction SilentlyContinue
        foreach ($f in $candidates) {
            try {
                $raw = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
                if ($raw -match '"[Pp]ort[Ff]orwarding[Pp]ort"\s*:\s*(\d{4,5})') {
                    return [int]$Matches[1]
                }
                if ($raw -match '"[Aa]ctive[Pp]ort"\s*:\s*(\d{4,5})') {
                    return [int]$Matches[1]
                }
                if ($raw -match '"[Pp]ort"\s*:\s*(\d{4,5})') {
                    $candidate = [int]$Matches[1]
                    # ProtonVPN forwarded ports are typically 1024-65535 and not standard ports
                    if ($candidate -gt 1024 -and $candidate -notin @(8080, 8443, 3000, 5000, 8000, 8001)) {
                        return $candidate
                    }
                }
            } catch {}
        }
    }
    return $null
}

$detectedPort = $null
Write-Host "[vpn]  Checking ProtonVPN port forwarding state..." -ForegroundColor DarkGray
$detectedPort = Get-ProtonVpnPort

# ── Resolve the port to use ───────────────────────────────────────────────────
$envPort = $env:POLLY_PORT
$finalPort = $null

if ($detectedPort) {
    Write-Host "[vpn]  Detected ProtonVPN forwarded port: $detectedPort" -ForegroundColor Green
    if ($envPort -and [int]$envPort -ne $detectedPort) {
        Write-Warning "POLLY_PORT=$envPort in .env but ProtonVPN assigned $detectedPort. Using ProtonVPN port."
    }
    $finalPort = $detectedPort
    [System.Environment]::SetEnvironmentVariable('POLLY_PORT', "$finalPort", 'Process')
} elseif ($envPort) {
    Write-Host "[port] Using POLLY_PORT from .env: $envPort" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  NOTE: Could not auto-detect ProtonVPN port." -ForegroundColor DarkYellow
    Write-Host "  To find it: ProtonVPN app → hover over 'Port forwarding' shortcut" -ForegroundColor DarkYellow
    Write-Host "  Update POLLY_PORT in .env to match, then restart." -ForegroundColor DarkYellow
    Write-Host ""
    $finalPort = [int]$envPort
} else {
    Write-Host ""
    Write-Host "  ACTION REQUIRED: Set your port." -ForegroundColor Red
    Write-Host "  1. Open ProtonVPN app" -ForegroundColor White
    Write-Host "  2. Connect to a P2P server (double-arrow icon)" -ForegroundColor White
    Write-Host "  3. Enable Port Forwarding in app settings" -ForegroundColor White
    Write-Host "  4. Hover over the 'Port forwarding' shortcut to see your port number" -ForegroundColor White
    Write-Host "  5. Set POLLY_PORT=<that number> in .env" -ForegroundColor White
    Write-Host "  6. Re-run this script" -ForegroundColor White
    Write-Host ""
    $finalPort = 8001
    Write-Warning "Defaulting to port 8001 (internal only, not Proton-exposed)."
}

# ── Windows Firewall rule ─────────────────────────────────────────────────────
if (-not $NoFirewall) {
    $ruleName = "Polly Backend - Port $finalPort"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

    if ($existing) {
        Write-Host "[fw]   Firewall rule already exists: '$ruleName'" -ForegroundColor DarkGray
    } else {
        try {
            New-NetFirewallRule `
                -DisplayName $ruleName `
                -Direction Inbound `
                -Protocol TCP `
                -LocalPort $finalPort `
                -Action Allow `
                -Profile Any `
                -Description "Polly backend — Proton VPN port forwarding" `
                -ErrorAction Stop | Out-Null
            Write-Host "[fw]   Created inbound firewall rule for port $finalPort" -ForegroundColor Green
        } catch {
            Write-Warning "Could not create firewall rule (run as Administrator): $_"
            Write-Host "[fw]   Manual alternative:" -ForegroundColor Yellow
            Write-Host "       netsh advfirewall firewall add rule name=`"$ruleName`" dir=in action=allow protocol=TCP localport=$finalPort" -ForegroundColor Gray
        }
    }
}

# ── Check Python + uvicorn ───────────────────────────────────────────────────
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) {
    $python = Get-Command python3 -ErrorAction SilentlyContinue
}
if (-not $python) {
    Write-Error "Python not found. Install Python 3.11+ and add it to PATH."
}

Write-Host "[deps] Checking dependencies..." -ForegroundColor DarkGray
& $python.Source -c "import fastapi, uvicorn, httpx" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[deps] Installing requirements..." -ForegroundColor Yellow
    & $python.Source -m pip install -r "$PSScriptRoot\requirements.txt" --quiet
}

# ── Start server ──────────────────────────────────────────────────────────────
$host_  = if ($env:POLLY_HOST) { $env:POLLY_HOST } else { "0.0.0.0" }

Write-Host ""
Write-Host "  Starting Polly backend" -ForegroundColor Cyan
Write-Host "  Bind   : $host_`:$finalPort" -ForegroundColor White
Write-Host "  Model  : $env:OLLAMA_MODEL (via $env:OLLAMA_BASE_URL)" -ForegroundColor White
Write-Host "  Eggs   : $(if ($env:POLLY_EGG_DIR) { $env:POLLY_EGG_DIR } else { 'eggs/' }) (clutch=$env:POLLY_CLUTCH_SIZE)" -ForegroundColor White
if ($detectedPort) {
    Write-Host "  VPN    : ProtonVPN port forwarding active on $finalPort" -ForegroundColor Green
}
Write-Host ""
Write-Host "  Health check: http://localhost:$finalPort/health" -ForegroundColor DarkCyan
Write-Host ""

Push-Location $PSScriptRoot
try {
    & $python.Source -m uvicorn server:app --host $host_ --port $finalPort --no-access-log
} finally {
    Pop-Location
}

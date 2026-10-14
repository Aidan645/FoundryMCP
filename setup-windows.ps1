# Setup Script for Foundry Tabletop Hub on Windows
# Creates directory junction for Foundry VTT, configures Python venv, and installs dependencies.

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Foundry Tabletop Hub & MCP Bridge - Windows Setup       " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure Node.js and npm are accessible in current session
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Program Files\nodejs") {
        Write-Host "[+] Adding C:\Program Files\nodejs to session PATH..." -ForegroundColor Yellow
        $env:PATH = "C:\Program Files\nodejs;$env:PATH"
    }
}

# 2. Setup Foundry VTT Module Directory Junction
$FoundryDataDir = Join-Path $env:LOCALAPPDATA "FoundryVTT\Data"
$FoundryModulesDir = Join-Path $FoundryDataDir "modules"
$BridgeModuleSource = (Resolve-Path "$PSScriptRoot\foundry-module").Path
$JunctionTarget = Join-Path $FoundryModulesDir "foundry-hub-bridge"

Write-Host "[*] Checking Foundry VTT modules directory at: $FoundryModulesDir" -ForegroundColor Gray

if (Test-Path $FoundryModulesDir) {
    if (-not (Test-Path $JunctionTarget)) {
        Write-Host "[+] Creating Directory Junction: $JunctionTarget -> $BridgeModuleSource" -ForegroundColor Green
        New-Item -ItemType Junction -Path $JunctionTarget -Target $BridgeModuleSource | Out-Null
    } else {
        Write-Host "[i] Module junction already exists at: $JunctionTarget" -ForegroundColor Yellow
    }

    # Verify junction path
    $verifiedItem = Get-Item $JunctionTarget
    Write-Host "[SUCCESS] Verified Foundry Bridge Module Junction: $($verifiedItem.FullName) -> $($verifiedItem.Target)" -ForegroundColor Green
} else {
    Write-Host "[!] Warning: Foundry modules directory ($FoundryModulesDir) was not found. Please verify Foundry VTT installation." -ForegroundColor Yellow
}

# 3. Python Virtual Environment Setup
$VenvPath = Join-Path $PSScriptRoot ".venv"
$PythonExe = Join-Path $VenvPath "Scripts\python.exe"
$PipExe = Join-Path $VenvPath "Scripts\pip.exe"

if (-not (Test-Path $PythonExe)) {
    Write-Host "[+] Creating Python virtual environment at .venv..." -ForegroundColor Green
    python -m venv $VenvPath
} else {
    Write-Host "[i] Virtual environment already exists at $VenvPath" -ForegroundColor Gray
}

Write-Host "[+] Installing backend dependencies from backend\requirements.txt..." -ForegroundColor Green
& $PipExe install --upgrade pip | Out-Null
& $PipExe install -r (Join-Path $PSScriptRoot "backend\requirements.txt")

Write-Host "[SUCCESS] Backend Python dependencies installed successfully." -ForegroundColor Green

# 4. Frontend Initialization & Dependencies
$FrontendDir = Join-Path $PSScriptRoot "frontend"
if (Test-Path (Join-Path $FrontendDir "package.json")) {
    Write-Host "[+] Installing frontend npm dependencies..." -ForegroundColor Green
    Push-Location $FrontendDir
    try {
        npm install
    } finally {
        Pop-Location
    }
    Write-Host "[SUCCESS] Frontend dependencies installed successfully." -ForegroundColor Green
}

Write-Host "`nSetup complete! You can now start the environment using: .\start-dev.ps1" -ForegroundColor Cyan
exit 0

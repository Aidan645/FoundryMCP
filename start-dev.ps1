# Launch Foundry Tabletop Hub (Backend & Frontend) as background services
# Adheres to Windows non-blocking agent loop rules

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Foundry Tabletop Hub & MCP Bridge - Background Launcher " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Ensure Node.js and npm in PATH
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    if (Test-Path "C:\Program Files\nodejs") {
        $env:PATH = "C:\Program Files\nodejs;$env:PATH"
    }
}

$VenvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $VenvPython)) {
    Write-Host "[!] Virtual environment not found. Please run .\setup-windows.ps1 first." -ForegroundColor Red
    exit 1
}

# 2. Spawn FastAPI/MCP Backend in Background
$BackendDir = Join-Path $PSScriptRoot "backend"
Write-Host "[+] Launching FastAPI & FastMCP Backend on http://0.0.0.0:8080..." -ForegroundColor Green
$BackendProc = Start-Process -NoNewWindow -PassThru -FilePath $VenvPython -ArgumentList "-m", "uvicorn", "main:app", "--app-dir", $BackendDir, "--host", "0.0.0.0", "--port", "8080"
Write-Host "    Backend PID: $($BackendProc.Id)" -ForegroundColor Gray

# 3. Spawn Vite Frontend in Background
$FrontendDir = Join-Path $PSScriptRoot "frontend"
Write-Host "[+] Launching Vite Player & Tabletop Frontend on http://localhost:5173..." -ForegroundColor Green
$FrontendProc = Start-Process -NoNewWindow -PassThru -WorkingDirectory $FrontendDir -FilePath "npm.cmd" -ArgumentList "run", "dev", "--", "--host"
Write-Host "    Frontend PID: $($FrontendProc.Id)" -ForegroundColor Gray

Write-Host "`nAll services launched successfully in background!" -ForegroundColor Cyan
Write-Host "  * Player Web UI:    http://localhost:5173" -ForegroundColor White
Write-Host "  * REST API & State: http://localhost:8080/api/state" -ForegroundColor White
Write-Host "  * Foundry WS Relay: ws://localhost:8080/ws/foundry" -ForegroundColor White
Write-Host "  * Client WS Relay:  ws://localhost:8080/ws/client" -ForegroundColor White
Write-Host "  * MCP SSE Endpoint: http://localhost:8080/mcp/sse" -ForegroundColor White
Write-Host "`nTo stop background processes, use: Stop-Process -Id $($BackendProc.Id), $($FrontendProc.Id)" -ForegroundColor Yellow

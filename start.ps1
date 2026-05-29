# VeilVault1 - Start all services
# Usage: .\start.ps1
#        .\start.ps1 -WithProver

param([switch]$WithProver)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host "  VeilVault1 - Starting up"             -ForegroundColor Cyan
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

# Free ports 3000 and 5173 if occupied
foreach ($port in @(3000, 5173)) {
    $owner = (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess
    if ($owner) {
        Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
        Write-Host "  Freed port $port" -ForegroundColor Yellow
    }
}

# Install deps if missing
if (-not (Test-Path "backend\node_modules")) {
    Write-Host "  Installing backend dependencies..." -ForegroundColor Yellow
    npm install --prefix backend --silent
}
if (-not (Test-Path "frontend\node_modules")) {
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Yellow
    npm install --prefix frontend --silent
}
if (-not (Test-Path "node_modules")) {
    Write-Host "  Installing root dependencies..." -ForegroundColor Yellow
    npm install --silent
}

Write-Host "  Backend  -> http://localhost:3000" -ForegroundColor Green
Write-Host "  Frontend -> http://localhost:5173" -ForegroundColor Magenta
Write-Host ""

if ($WithProver) {
    $proverBin = "prover\target\release\veilpool-prover.exe"
    Write-Host "  Prover binary: $proverBin" -ForegroundColor Blue
    Write-Host "  To generate a proof, open a separate terminal and run:" -ForegroundColor Blue
    Write-Host "    cd prover" -ForegroundColor DarkGray
    Write-Host "    cargo run --release -- prove --help" -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "  Press Ctrl+C to stop all services"    -ForegroundColor DarkGray
Write-Host "=======================================" -ForegroundColor Cyan
Write-Host ""

npm run dev

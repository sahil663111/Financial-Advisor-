$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendPath = Join-Path $repoRoot "backend"
$frontendPath = Join-Path $repoRoot "frontend"
$pythonPath = Join-Path $backendPath ".venv\Scripts\python.exe"

if (-not (Test-Path $pythonPath)) {
    throw "Backend virtual environment not found: $pythonPath"
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm was not found. Install Node.js, then run this launcher again."
}

$backendCommand = @"
Set-Location -LiteralPath '$backendPath'
& '$pythonPath' -m uvicorn app.main:app --host 0.0.0.0 --port 8000
"@

$frontendCommand = @"
Set-Location -LiteralPath '$frontendPath'
`$env:NEXT_PUBLIC_API_URL = 'http://localhost:8000'
npm run dev -- --hostname 0.0.0.0 --port 3000
"@

Start-Process powershell.exe -WorkingDirectory $backendPath -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $backendCommand
)

Start-Process powershell.exe -WorkingDirectory $frontendPath -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $frontendCommand
)

Start-Sleep -Seconds 3
Start-Process "http://localhost:3000"

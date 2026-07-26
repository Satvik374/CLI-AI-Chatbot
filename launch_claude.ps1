# Set EvoMap model ID to evomap-deepseek-v4-flash
$env:EVOMAP_MODEL_ID="evomap-deepseek-v4-flash"

# Start the proxy server in a hidden window to isolate it from Ctrl+C interrupts in the parent console session
$proxyProcess = Start-Process python -ArgumentList "-u", "`"$PSScriptRoot\evomap_proxy.py`"" -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\evomap_proxy_out.log" -RedirectStandardError "$env:TEMP\evomap_proxy_err.log" -PassThru

# Wait for port 4000 to become active
Write-Host "🕒 Waiting for EvoMap proxy server to initialize..." -ForegroundColor Yellow
$timeout = 10
$started = $false
for ($i = 0; $i -lt $timeout; $i++) {
    try {
        $conn = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
        if ($conn) {
            $started = $true
            break
        }
    } catch {}
    Start-Sleep -Seconds 1
}

if (-not $started) {
    Write-Host "❌ Failed to start the proxy server on port 4000." -ForegroundColor Red
    if ($proxyProcess) { Stop-Process -Id $proxyProcess.Id -Force -ErrorAction SilentlyContinue }
    exit 1
}

Write-Host "🚀 Proxy server is active! Starting Claude Code..." -ForegroundColor Green

# Set env variables and start Claude Code interactively
$env:ANTHROPIC_BASE_URL="http://localhost:4000"
$env:ANTHROPIC_API_KEY="sk-dummy"

try {
    # If the user passed arguments to this script, forward them to claude using splatting
    if ($args) {
        claude @args
    } else {
        claude
    }
} finally {
    # Clean up background proxy server process
    Write-Host "`n⚡️ Cleaning up proxy server..." -ForegroundColor Cyan
    if ($proxyProcess) {
        Stop-Process -Id $proxyProcess.Id -Force -ErrorAction SilentlyContinue
    }
    $stray = Get-NetTCPConnection -LocalPort 4000 -ErrorAction SilentlyContinue
    if ($stray) {
        Stop-Process -Id $stray.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    Write-Host "✅ Done!" -ForegroundColor Green
}

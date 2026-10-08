param([int]$Port = 5260)
$ErrorActionPreference = 'Stop'
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $PSScriptRoot 'launcher.ps1'
$statePath = Join-Path $projectDir ".launcher\server-$Port.json"
$url = "http://localhost:$Port/__notebook/health"
$checks = @()
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message }; Write-Output "PASS $Message"; $script:checks += $Message }
function Run-Launcher([string]$Action) {
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $launcher -Action $Action -Port $Port -NoBrowser -Quiet
    if ($LASTEXITCODE -ne 0) { throw "Launcher action failed: $Action" }
}
try {
    Run-Launcher 'Start'
    $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    $health = Invoke-RestMethod -Uri $url -TimeoutSec 5
    Assert ($health.app -eq 'zhixu-open-source-notebook') 'Hidden server starts in Chinese workspace path'
    $ipv4 = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/__notebook/health" -TimeoutSec 5
    Assert ($ipv4.workspaceId -eq $health.workspaceId) 'Both localhost and the previous IPv4 URL stay reachable'
    Run-Launcher 'Start'
    $again = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    Assert ($state.processId -eq $again.processId) 'Repeated launch reuses the same process'
    $original = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8
    try {
        $stale = $original | ConvertFrom-Json
        $stale.startedTicks = '1'
        $stale | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
        Run-Launcher 'Stop'
        $stillRunning = Invoke-RestMethod -Uri $url -TimeoutSec 5
        Assert ($stillRunning.app -eq 'zhixu-open-source-notebook') 'Stale PID metadata cannot terminate a process'
    } finally { $original | Set-Content -LiteralPath $statePath -Encoding UTF8 }
    Run-Launcher 'Stop'
    $stopped = -not (Get-Process -Id $state.processId -ErrorAction SilentlyContinue)
    Assert $stopped 'Stop terminates only the owned background process'
    Assert (-not (Test-Path -LiteralPath $statePath)) 'Stopped process state is removed'
    Run-Launcher 'Stop'
    Assert ($LASTEXITCODE -eq 0) 'Repeated stop is harmless'
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $Port)
    $listener.Start()
    try {
        & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $launcher -Action Start -Port $Port -NoBrowser -Quiet
        Assert ($LASTEXITCODE -eq 1) 'Occupied port is reported instead of switching data origin'
        Assert $listener.Server.IsBound 'Unrelated service on the port is preserved'
    } finally { $listener.Stop() }
    @{ checks = $checks; port = $Port } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $projectDir '.launcher\launcher-checks.json') -Encoding UTF8
} finally {
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $launcher -Action Stop -Port $Port -NoBrowser -Quiet
}

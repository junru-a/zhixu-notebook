param(
    [ValidateSet('Start', 'Stop')][string]$Action = 'Start',
    [ValidateRange(1024, 65535)][int]$Port = 5290,
    [switch]$NoBrowser,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$appDir = Join-Path $projectDir 'app'
$runtimeDir = Join-Path $projectDir '.launcher'
$statePath = Join-Path $runtimeDir "server-$Port.json"
$url = "http://localhost:$Port/"
$hash = [Security.Cryptography.SHA256]::Create()
try { $workspaceId = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($appDir.Replace('\', '/').ToLowerInvariant())))).Replace('-', '').ToLowerInvariant() }
finally { $hash.Dispose() }
$mutex = New-Object Threading.Mutex($false, "Local\ZhixuLauncher-$workspaceId-$Port")
$locked = $false

function Notify([string]$Message, [bool]$Failure = $false) {
    if ($Quiet) { Write-Output $Message; return }
    Add-Type -AssemblyName System.Windows.Forms
    $icon = if ($Failure) { [Windows.Forms.MessageBoxIcon]::Error } else { [Windows.Forms.MessageBoxIcon]::Information }
    [void][Windows.Forms.MessageBox]::Show($Message, '知序 · 科研记录本（开源版）', [Windows.Forms.MessageBoxButtons]::OK, $icon)
}

function Read-Health {
    $response = $null
    try {
        $request = [Net.HttpWebRequest]::Create("http://127.0.0.1:$Port/__notebook/health")
        $request.Timeout = 1200; $request.ReadWriteTimeout = 1200; $request.Proxy = $null
        $response = $request.GetResponse()
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        try { return ($reader.ReadToEnd() | ConvertFrom-Json) } finally { $reader.Dispose() }
    } catch { return $null }
    finally { if ($response) { $response.Dispose() } }
}

function Is-OurApp($Health) {
    return $Health -and $Health.app -eq 'zhixu-open-source-notebook' -and $Health.workspaceId -eq $workspaceId
}

function Port-IsBusy {
    foreach ($address in @('127.0.0.1', '::1')) {
        $client = New-Object Net.Sockets.TcpClient
        try {
            $task = $client.ConnectAsync($address, $Port)
            if ($task.Wait(400) -and $client.Connected) { return $true }
        } catch { } finally { $client.Dispose() }
    }
    return $false
}

function Get-OwnedProcess {
    if (-not (Test-Path -LiteralPath $statePath)) { return $null }
    try {
        $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($state.workspaceId -ne $workspaceId -or $state.port -ne $Port) { return $null }
        $process = Get-Process -Id $state.processId -ErrorAction Stop
        # Bind a handle before checking identity. Never stop an arbitrary process
        # merely because it has reused the stored PID or occupies the same port.
        $null = $process.Handle
        if ($process.ProcessName -ne 'node' -or $process.Path -ne $state.nodePath -or $process.StartTime.ToUniversalTime().Ticks.ToString() -ne $state.startedTicks) { $process.Dispose(); return $null }
        return $process
    } catch { return $null }
}

function Open-Notebook {
    if (-not $NoBrowser) { Start-Process -FilePath $url | Out-Null }
    Write-Output "科研记录本已就绪：$url"
}

try {
    try { $locked = $mutex.WaitOne(15000) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw '另一个启动器正在工作，请稍候再试。' }
    if (-not (Test-Path -LiteralPath $runtimeDir)) { [void](New-Item -ItemType Directory -Path $runtimeDir) }

    if ($Action -eq 'Stop') {
        $owned = Get-OwnedProcess
        if ($owned) {
            try { $owned.Kill(); [void]$owned.WaitForExit(5000) } finally { $owned.Dispose() }
            Remove-Item -LiteralPath $statePath -ErrorAction SilentlyContinue
            Notify '科研记录本后台服务已停止。浏览器中的记录不会被删除，下次双击启动即可继续使用。'
        } elseif (Is-OurApp (Read-Health)) {
            Notify '当前服务由其他终端启动，启动器没有结束它。请在原来的终端按 Ctrl+C 一次，之后即可使用双击启动和停止。'
        } else { Notify '科研记录本后台服务当前没有运行。' }
    } else {
        if (Is-OurApp (Read-Health)) { Open-Notebook; exit 0 }
        if (Port-IsBusy) { throw "端口 $Port 已被其他程序或旧版服务占用。请先停止占用它的服务，再重新双击启动。本启动器不会自动换端口，以免打开不同的记录存储。" }
        if (-not (Test-Path -LiteralPath (Join-Path $appDir 'package.json'))) { throw '找不到 app/package.json。请将启动器与 app、scripts 文件夹放在同一个项目目录。' }
        $nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
        $nodePath = if ($nodeCommand) { $nodeCommand.Source } else { $null }
        if (-not $nodePath) {
            foreach ($candidate in @("$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
                if (Test-Path -LiteralPath $candidate) { $nodePath = $candidate; break }
            }
        }
        if (-not $nodePath) { throw '尚未找到 Node.js。请安装 Node.js 的长期支持版本，然后重新双击启动。' }
        $vitePath = Join-Path $appDir 'node_modules\vite\bin\vite.js'
        if (-not (Test-Path -LiteralPath $vitePath)) {
            $npmPath = Join-Path (Split-Path $nodePath) 'node_modules\npm\bin\npm-cli.js'
            if (-not (Test-Path -LiteralPath $npmPath)) { throw 'Node.js 安装不完整，找不到 npm。请修复 Node.js 安装后重试。' }
            $installLog = Join-Path $runtimeDir 'install.log'
            $installError = Join-Path $runtimeDir 'install-error.log'
            $install = Start-Process -FilePath $nodePath -ArgumentList @('"' + $npmPath + '"', 'ci', '--no-audit', '--no-fund') -WorkingDirectory $appDir -WindowStyle Hidden -RedirectStandardOutput $installLog -RedirectStandardError $installError -PassThru
            try {
                if (-not $install.WaitForExit(300000)) { $install.Kill(); throw "首次安装依赖超时，请检查网络后重试。详细日志：$installError" }
                if ($install.ExitCode -ne 0) { throw "首次安装依赖失败，请检查网络后重试。详细日志：$installError" }
            } finally { $install.Dispose() }
        }
        $stdout = Join-Path $runtimeDir "server-$Port.log"
        $stderr = Join-Path $runtimeDir "server-$Port-error.log"
        $process = Start-Process -FilePath $nodePath -ArgumentList @('"' + $vitePath + '"', '--host', '127.0.0.1', '--port', "$Port", '--strictPort') -WorkingDirectory $appDir -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
        $started = $false
        try {
            @{ processId = $process.Id; startedTicks = $process.StartTime.ToUniversalTime().Ticks.ToString(); nodePath = $nodePath; workspaceId = $workspaceId; port = $Port } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
            $deadline = [DateTime]::UtcNow.AddSeconds(30)
            do {
                if ($process.HasExited) { throw "后台服务启动失败。详细日志：$stderr" }
                if (Is-OurApp (Read-Health)) { $started = $true; break }
                Start-Sleep -Milliseconds 350
            } while ([DateTime]::UtcNow -lt $deadline)
            if (-not $started) { throw "启动等待超时。详细日志：$stderr" }
            Open-Notebook
        } finally {
            if (-not $started) {
                if (-not $process.HasExited) { $process.Kill() }
                Remove-Item -LiteralPath $statePath -ErrorAction SilentlyContinue
            }
            $process.Dispose()
        }
    }
} catch {
    $message = $_.Exception.Message
    if (Test-Path -LiteralPath $runtimeDir) { $message | Set-Content -LiteralPath (Join-Path $runtimeDir 'launcher-error.log') -Encoding UTF8 }
    Notify $message $true
    exit 1
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}

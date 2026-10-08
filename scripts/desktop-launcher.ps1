param([ValidateSet('Start','Stop')][string]$Action='Start')
$ErrorActionPreference='Stop'
$executable=Join-Path $env:LOCALAPPDATA 'Programs\ZhixuNotebookOpenSource\知序科研记录本（开源版）.exe'
$registration=Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq '知序科研记录本（开源版）' -and $_.InstallLocation } | Select-Object -First 1
if($registration){$executable=Join-Path $registration.InstallLocation '知序科研记录本（开源版）.exe'}
if(-not(Test-Path -LiteralPath $executable)){throw '请先安装开源版，或在项目根目录运行 npm run desktop。'}
$options=@{FilePath=$executable;WorkingDirectory=(Split-Path $executable);WindowStyle='Normal'}
if($Action -eq 'Stop'){$options.ArgumentList=@('--quit');$options.WindowStyle='Hidden'}
Start-Process @options | Out-Null

# Makes Tidy Nook start silently every time you log in to Windows.
# Run:  powershell -ExecutionPolicy Bypass -File install-startup.ps1
# Undo: powershell -ExecutionPolicy Bypass -File install-startup.ps1 -Remove
param([switch]$Remove)

$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'Tidy Nook.lnk'

if ($Remove) {
  if (Test-Path $lnk) { Remove-Item $lnk -Confirm:$false; Write-Host 'Removed Tidy Nook from startup.' }
  else { Write-Host 'Tidy Nook was not in startup.' }
  return
}

$vbs = Join-Path $PSScriptRoot 'start-hidden.vbs'
$ws = New-Object -ComObject WScript.Shell
$s = $ws.CreateShortcut($lnk)
$s.TargetPath = "$env:WINDIR\System32\wscript.exe"
$s.Arguments = "`"$vbs`""
$s.WorkingDirectory = $PSScriptRoot
$s.Description = 'Tidy Nook local hub (http://localhost:4321)'
$s.Save()
Write-Host "Added to startup: $lnk"

# Start it now too, unless it's already running.
try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:4321/api/music' | Out-Null; Write-Host 'Server already running.' }
catch { Start-Process "$env:WINDIR\System32\wscript.exe" -ArgumentList "`"$vbs`""; Write-Host 'Server started.' }
Write-Host 'Open http://localhost:4321 and set it as your browser home / startup page.'

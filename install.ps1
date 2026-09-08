param([string]$Executable = (Join-Path $PSScriptRoot 'dist/Food Tracker.exe'))
$ErrorActionPreference = 'Stop'
$foodInstall = Join-Path $env:LOCALAPPDATA 'Programs/FoodTracker'
New-Item -ItemType Directory -Path $foodInstall -Force | Out-Null
$foodTarget = Join-Path $foodInstall 'Food Tracker.exe'
Copy-Item -LiteralPath $Executable -Destination $foodTarget -Force
$foodDesktop = [Environment]::GetFolderPath('Desktop')
$foodShell = New-Object -ComObject WScript.Shell
$foodShortcut = $foodShell.CreateShortcut((Join-Path $foodDesktop 'Food Tracker.lnk'))
$foodShortcut.TargetPath = $foodTarget
$foodShortcut.WorkingDirectory = $foodInstall
$foodShortcut.IconLocation = "$foodTarget,0"
$foodShortcut.Description = 'Diário alimentar pessoal'
$foodShortcut.Save()
Write-Host "Instalado: $foodTarget"
Write-Host "Atalho: $foodDesktop/Food Tracker.lnk"

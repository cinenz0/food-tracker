param(
    [string]$Executable = (Join-Path $PSScriptRoot 'dist/Food Tracker.exe'),
    [string]$CloudUrl = ''
)
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
if ($CloudUrl) {
    $foodUri = [Uri]$CloudUrl
    if ($foodUri.Scheme -ne 'https' -or $foodUri.UserInfo -or $foodUri.Query -or $foodUri.Fragment -or $foodUri.AbsolutePath -ne '/') {
        throw 'Informe apenas o endereço HTTPS inicial do seu Food Tracker.'
    }
    $foodConfigDir = Join-Path $env:LOCALAPPDATA 'FoodTracker'
    New-Item -ItemType Directory -Path $foodConfigDir -Force | Out-Null
    @{ url = $foodUri.GetLeftPart([UriPartial]::Authority) } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $foodConfigDir 'cloud-settings.json') -Encoding UTF8
}
Write-Host "Instalado: $foodTarget"
Write-Host "Atalho: $foodDesktop/Food Tracker.lnk"

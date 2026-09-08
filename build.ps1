$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path '.venv/Scripts/python.exe')) {
    python -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao criar ambiente Python.' }
}
& '.venv/Scripts/python.exe' -m pip install -r requirements-desktop.txt
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências.' }
& '.venv/Scripts/python.exe' -m PyInstaller --noconfirm 'Food Tracker.spec'
if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar executável.' }
Write-Host 'Executável pronto: dist/Food Tracker.exe'

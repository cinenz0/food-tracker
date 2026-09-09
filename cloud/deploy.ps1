param(
    [Parameter(Mandatory=$true)][string]$SupabaseUrl,
    [Parameter(Mandatory=$true)][string]$SupabaseAnonKey,
    [Parameter(Mandatory=$true)][string]$OwnerEmail
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$env:WRANGLER_SEND_METRICS='false'
if ($SupabaseUrl -notmatch '^https://[a-z0-9-]+\.supabase\.co/?$') { throw 'Use a URL HTTPS do projeto Supabase.' }
if ($OwnerEmail -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$') { throw 'Informe o e-mail da conta autorizada.' }
if (-not (Test-Path node_modules/.bin/wrangler.cmd)) { npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências.' } }
$foodKeyPath=Join-Path $env:LOCALAPPDATA 'FoodTracker/data/gemini-settings.bin'
if (Test-Path $foodKeyPath) {
    Add-Type -AssemblyName System.Security
    $foodKeyBytes=[System.Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($foodKeyPath),$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
    $foodGeminiKey=[Text.Encoding]::UTF8.GetString($foodKeyBytes)
    [Array]::Clear($foodKeyBytes,0,$foodKeyBytes.Length)
} else {
    $foodSecureKey=Read-Host 'Chave Gemini do Google AI Studio' -AsSecureString
    $foodKeyPointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($foodSecureKey)
    try { $foodGeminiKey=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($foodKeyPointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($foodKeyPointer) }
}
if (-not $foodGeminiKey) { throw 'A chave Gemini está vazia.' }
try {
    & node_modules/.bin/wrangler.cmd deploy --config cloud/wrangler.jsonc
    if ($LASTEXITCODE -ne 0) { throw 'Autentique com npx wrangler login e tente novamente.' }
    @{SUPABASE_URL=$SupabaseUrl.TrimEnd('/');SUPABASE_ANON_KEY=$SupabaseAnonKey;OWNER_EMAIL=$OwnerEmail;GEMINI_API_KEY=$foodGeminiKey} |
        ConvertTo-Json -Compress | & node_modules/.bin/wrangler.cmd secret bulk --config cloud/wrangler.jsonc
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao configurar segredos do servidor.' }
} finally { $foodGeminiKey=$null }
Write-Host 'Publicação enviada. Confira o login, a autorização da conta no banco e a primeira consulta.'

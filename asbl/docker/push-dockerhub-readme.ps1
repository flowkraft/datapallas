<#
.SYNOPSIS
    Publishes the Docker Hub overview and short description for flowkraft/datapallas-server.

.DESCRIPTION
    `docker push` uploads layers and the manifest, and NOTHING else. The overview
    ("No overview available") and the one-line short description shown in search
    results live on the Hub *repository* record and are only reachable through the
    Hub API. This script pushes both from README-dockerhub.md.

    Run it after the two `docker push` calls documented at the bottom of
    pack-datapallas.bat. It is independent of the image, so it can also be run on
    its own whenever the overview text changes — no rebuild needed.

    Categories (the Hub sidebar taxonomy) have no dependable public API. Set those
    once by hand under Repository -> Settings on hub.docker.com; they persist.

.PARAMETER Pat
    Docker Hub Personal Access Token with read/write scope on the repository.
    Falls back to $env:DOCKERHUB_PAT, then to an interactive prompt.
    NOTE: the credentials stored by `docker login` are registry credentials and
    cannot be used here — the Hub API needs its own token.

.EXAMPLE
    .\docker\push-dockerhub-readme.ps1

.EXAMPLE
    $env:DOCKERHUB_PAT = "dckr_pat_..."; .\docker\push-dockerhub-readme.ps1
#>
[CmdletBinding()]
param(
    [string] $Repository = "flowkraft/datapallas-server",

    [string] $ReadmePath = (Join-Path $PSScriptRoot "README-dockerhub.md"),

    # Hub caps the short description at 100 characters. The repository name is
    # already displayed above it, so this deliberately omits the "DataPallas
    # Server - " prefix carried by the image's `description` LABEL.
    [string] $ShortDescription = "Business Intelligence, Reporting, and Document Distribution in the Age of AI",

    [string] $User = "flowkraft",

    [string] $Pat
)

$ErrorActionPreference = "Stop"

# Windows PowerShell 5.1 can still negotiate TLS 1.0 by default, which Docker Hub refuses.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Show-ApiError($ErrorRecord) {
    $response = $ErrorRecord.Exception.Response
    if ($response) {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        $body = $reader.ReadToEnd()
        $reader.Close()
        if ($body) { Write-Host "Docker Hub responded: $body" -ForegroundColor Yellow }
    }
}

# --- Validate inputs before spending a round trip ---------------------------

if (-not (Test-Path $ReadmePath)) {
    throw "Overview file not found: $ReadmePath"
}

if ($ShortDescription.Length -gt 100) {
    throw "Short description is $($ShortDescription.Length) characters; Docker Hub caps it at 100."
}

# ReadAllText, not Get-Content -Raw: Get-Content attaches PSPath/PSProvider/etc.
# as ETS properties, and PowerShell 5.1's ConvertTo-Json then serialises the value
# as an OBJECT ({"value": "...", "PSPath": "..."}) instead of a bare JSON string.
$fullDescription = [System.IO.File]::ReadAllText(
    (Resolve-Path $ReadmePath).ProviderPath, [System.Text.Encoding]::UTF8)

if ([string]::IsNullOrWhiteSpace($fullDescription)) {
    throw "Overview file is empty: $ReadmePath"
}

# --- Resolve the token ------------------------------------------------------

if ([string]::IsNullOrWhiteSpace($Pat)) { $Pat = $env:DOCKERHUB_PAT }

if ([string]::IsNullOrWhiteSpace($Pat)) {
    $secure = Read-Host "Docker Hub Personal Access Token for '$User'" -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $Pat = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
}

if ([string]::IsNullOrWhiteSpace($Pat)) { throw "No Docker Hub token supplied." }

Write-Host "Authenticating to Docker Hub as '$User' ..."

# /v2/auth/token issues a bearer token from a PAT. (The older /v2/users/login/
# endpoint returns its token under `token` and expects an `Authorization: JWT`
# header instead of `Bearer` — mixing the two yields a silent 401.)
try {
    $authBody = @{ identifier = $User; secret = $Pat } | ConvertTo-Json -Compress
    $auth = Invoke-RestMethod -Method Post -Uri "https://hub.docker.com/v2/auth/token" `
        -ContentType "application/json" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($authBody))
} catch {
    Show-ApiError $_
    throw "Docker Hub authentication failed. Check that the token is valid and has read/write scope."
}

$token = $auth.access_token
if ([string]::IsNullOrWhiteSpace($token)) { throw "Docker Hub returned no access_token." }

# --- Push the description ---------------------------------------------------

Write-Host "Updating description for '$Repository' ($($fullDescription.Length) chars of overview) ..."

$payload = @{
    description      = $ShortDescription
    full_description = $fullDescription
} | ConvertTo-Json -Depth 3

try {
    # UTF-8 bytes, not the string: PowerShell 5.1 otherwise sends the body as
    # ISO-8859-1 and mangles every non-ASCII character in the overview.
    Invoke-RestMethod -Method Patch `
        -Uri "https://hub.docker.com/v2/repositories/$Repository/" `
        -Headers @{ Authorization = "Bearer $token" } `
        -ContentType "application/json" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($payload)) | Out-Null
} catch {
    Show-ApiError $_
    throw "Failed to update the description for '$Repository'."
}

Write-Host "Done. https://hub.docker.com/r/$Repository" -ForegroundColor Green

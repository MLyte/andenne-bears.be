param(
  [string] $HostName = $env:OVH_FTP_HOST,
  [string] $UserName = $env:OVH_FTP_USER,
  [string] $Password = $env:OVH_FTP_PASSWORD,
  [string] $RemotePath = $(if ($env:OVH_FTP_PATH) { $env:OVH_FTP_PATH } else { "www" }),
  [switch] $DryRun,
  [switch] $PlainFtp
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Curl = Get-Command curl.exe -ErrorAction Stop

if (-not $HostName -or -not $UserName -or -not $Password) {
  throw "Missing OVH FTP config. Set OVH_FTP_HOST, OVH_FTP_USER and OVH_FTP_PASSWORD before running this script."
}

$ItemsToDeploy = @(
  "index.html",
  "bears.css",
  "fonts",
  "images"
)

function Join-RemotePath {
  param(
    [string] $Base,
    [string] $Child
  )

  $normalizedBase = $Base.Trim("/")
  $normalizedChild = $Child.Replace("\", "/").TrimStart("/")

  if ($normalizedBase.Length -eq 0) {
    return $normalizedChild
  }

  return "$normalizedBase/$normalizedChild"
}

$Files = foreach ($item in $ItemsToDeploy) {
  $path = Join-Path $ProjectRoot $item

  if (-not (Test-Path -LiteralPath $path)) {
    throw "Deploy item not found: $item"
  }

  Get-Item -LiteralPath $path | ForEach-Object {
    if ($_.PSIsContainer) {
      Get-ChildItem -LiteralPath $_.FullName -File -Recurse
    } else {
      $_
    }
  }
}

$Files = $Files | Sort-Object FullName

function Get-RelativeDeployPath {
  param(
    [string] $BasePath,
    [string] $FilePath
  )

  $baseUri = New-Object System.Uri (($BasePath.TrimEnd("\") + "\"))
  $fileUri = New-Object System.Uri $FilePath
  return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fileUri).ToString()).Replace("\", "/")
}

Write-Host "Deploy target: ftp://$HostName/$($RemotePath.Trim('/'))"
Write-Host "Files: $($Files.Count)"

foreach ($file in $Files) {
  $relativePath = Get-RelativeDeployPath -BasePath $ProjectRoot -FilePath $file.FullName
  $remoteFile = Join-RemotePath -Base $RemotePath -Child $relativePath
  $remoteUrl = "ftp://$HostName/$remoteFile"

  if ($DryRun) {
    Write-Host "DRY RUN  $relativePath -> $remoteUrl"
    continue
  }

  Write-Host "UPLOAD   $relativePath"

  $args = @(
    "--fail",
    "--show-error",
    "--ftp-create-dirs",
    "--user", "${UserName}:${Password}",
    "--upload-file", $file.FullName,
    $remoteUrl
  )

  if (-not $PlainFtp) {
    $args = @("--ssl-reqd") + $args
  }

  & $Curl.Source @args

  if ($LASTEXITCODE -ne 0) {
    throw "Upload failed for $relativePath"
  }
}

if ($DryRun) {
  Write-Host "Dry run complete. Nothing was uploaded."
} else {
  Write-Host "OVH deploy complete."
}

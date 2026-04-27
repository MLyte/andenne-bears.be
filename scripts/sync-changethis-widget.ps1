param(
  [string] $ChangeThisRoot = $(if ($env:CHANGETHIS_ROOT) { $env:CHANGETHIS_ROOT } else { (Resolve-Path (Join-Path $PSScriptRoot "..\..\ChangeThis")).Path }),
  [switch] $SkipBuild
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$WidgetDist = Join-Path $ChangeThisRoot "packages\widget\dist\widget.global.js"
$DestinationDir = Join-Path $ProjectRoot "scripts\vendor"
$Destination = Join-Path $DestinationDir "changethis-widget.global.js"

if (-not (Test-Path -LiteralPath $ChangeThisRoot)) {
  throw "ChangeThis root not found: $ChangeThisRoot. Set CHANGETHIS_ROOT or pass -ChangeThisRoot."
}

if (-not $SkipBuild) {
  Push-Location $ChangeThisRoot
  try {
    npm.cmd run widget:build
  } finally {
    Pop-Location
  }
}

if (-not (Test-Path -LiteralPath $WidgetDist)) {
  throw "ChangeThis widget bundle not found: $WidgetDist"
}

New-Item -ItemType Directory -Force -Path $DestinationDir | Out-Null
Copy-Item -LiteralPath $WidgetDist -Destination $Destination -Force
Write-Host "Synced ChangeThis widget: $Destination"

# Regenerate the upload folder. This script does not connect to the server.
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$DistPath = [IO.Path]::GetFullPath((Join-Path $ProjectRoot 'dist'))

$PublicFiles = @(
  '.ovhconfig', 'robots.txt', 'sitemap.xml',
  'index.html', 'journee-familiale.html', 'camp-blegny.html',
  'camp-blegny-comite.html', 'export-inscriptions.html', 'tirage-equipes.html',
  'bears.css', 'camp-dashboard.css', 'tirage-equipes.css', 'membres.css',
  'contact.php', 'family-day.php', 'camp-registration.php',
  'suivi-inscriptions.php', 'suivi-camp-blegny.php', 'tirage-equipes.php', 'changethis.php',
  'membres.php', 'membres-staff.php', 'membres-photo.php', 'membres-data.php', 'membres-image.php', 'private-backup.php',
  'config/family-day-config.php'
)
$ResourceTypes = @{
  'scripts' = @('.js', '.mjs')
  'images' = @('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.avif')
  'fonts' = @('.ttf', '.otf', '.woff', '.woff2')
}
$SelectedFiles = @($PublicFiles)
foreach ($Folder in $ResourceTypes.Keys) {
  $FolderPath = Join-Path $ProjectRoot $Folder
  $SelectedFiles += @(Get-ChildItem -LiteralPath $FolderPath -Recurse -File | Where-Object {
    $_.Extension.ToLowerInvariant() -in $ResourceTypes[$Folder] -or $_.Name -eq '.htaccess'
  } | ForEach-Object { $_.FullName.Substring($ProjectRoot.Length + 1) })
}
# Include runtime configuration so dist is a complete www folder.
# Registration CSVs live outside www and are never copied into dist.
foreach ($OptionalFile in @('.htaccess', 'config/contact-config.php', 'config/changethis-config.php', 'config/members-config.php')) {
  if (Test-Path -LiteralPath (Join-Path $ProjectRoot $OptionalFile) -PathType Leaf) {
    $SelectedFiles += $OptionalFile
  }
}
$SelectedFiles = @($SelectedFiles | Sort-Object -Unique)
foreach ($RelativeFile in $SelectedFiles) {
  $SourcePath = Join-Path $ProjectRoot $RelativeFile
  if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    throw "Missing website file: $RelativeFile"
  }
  if ((Get-Item -LiteralPath $SourcePath).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw "Linked source file is not allowed: $RelativeFile"
  }
}

# The only directory this script can clear is <project>/dist.
if ((Split-Path -Parent $DistPath) -ne $ProjectRoot -or (Split-Path -Leaf $DistPath) -ne 'dist') {
  throw 'Invalid output path.'
}
if (Test-Path -LiteralPath $DistPath) {
  $ExistingItems = @((Get-Item -LiteralPath $DistPath)) + @(Get-ChildItem -LiteralPath $DistPath -Recurse -Force)
  if ($ExistingItems | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }) {
    throw 'Refusing to clear a dist folder containing symbolic links or junctions.'
  }
  Remove-Item -LiteralPath $DistPath -Recurse -Force
}
New-Item -ItemType Directory -Path $DistPath | Out-Null
foreach ($RelativeFile in $SelectedFiles) {
  $DestinationPath = Join-Path $DistPath $RelativeFile
  New-Item -ItemType Directory -Path (Split-Path -Parent $DestinationPath) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $ProjectRoot $RelativeFile) -Destination $DestinationPath
}
Write-Host "Ready: $($SelectedFiles.Count) files in $DistPath"
Write-Host 'Upload the CONTENTS of dist to www/. Registration CSVs remain outside www.'

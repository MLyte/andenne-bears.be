param(
  [string] $HostName = $(if ($env:OVH_FTP_HOST) { $env:OVH_FTP_HOST } else { "ftp.cluster115.hosting.ovh.net" }),
  [string] $UserName = $(if ($env:OVH_FTP_USER) { $env:OVH_FTP_USER } else { "andennebh" }),
  [string] $Password = $env:OVH_FTP_PASSWORD,
  [string] $RemotePath = $(if ($env:OVH_FTP_PATH) { $env:OVH_FTP_PATH } else { "www" }),
  [switch] $UseFileZilla,
  [switch] $Ssl,
  [switch] $Active,
  [switch] $DryRun,
  [switch] $ChangedOnly,
  [switch] $ForceAll,
  [switch] $SkipChangeThisSync
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ManifestName = ".deploy-manifest-sha256.txt"
$RemoteManifestHashes = @{}
$LocalManifestHashes = @{}

if ($ForceAll) {
  $ChangedOnly = $false
}

$ItemsToDeploy = @(
  ".ovhconfig",
  "index.html",
  "bears.css",
  "contact.php",
  "changethis.php",
  "config/contact-config.php",
  "fonts",
  "images",
  "scripts"
)

$OptionalItemsToDeploy = @(
  "config/changethis-config.php"
)

function Import-FileZillaServer {
  param([string] $PreferredUser)

  $paths = @(
    "$env:APPDATA\FileZilla\recentservers.xml",
    "$env:APPDATA\FileZilla\sitemanager.xml"
  )

  foreach ($path in $paths) {
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }

    [xml] $xml = Get-Content -LiteralPath $path
    $servers = @($xml.SelectNodes("//Server"))
    if ($PreferredUser) {
      $servers = @($servers | Where-Object { $_.User -eq $PreferredUser })
    }

    $server = $servers | Select-Object -First 1
    if ($server) {
      $encodedPassword = [string] $server.Pass.InnerText
      return [pscustomobject]@{
        HostName = [string] $server.Host
        UserName = [string] $server.User
        Password = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedPassword))
      }
    }
  }

  throw "No matching FileZilla FTP entry found. Pass -HostName, -UserName and -Password, or set OVH_FTP_* env vars."
}

if (-not $SkipChangeThisSync) {
  & (Join-Path $PSScriptRoot "sync-changethis-widget.ps1")
}

if ($UseFileZilla) {
  $providedHostName = $HostName
  $fileZilla = Import-FileZillaServer -PreferredUser $UserName
  $HostName = if ($providedHostName) { $providedHostName } else { $fileZilla.HostName }
  $UserName = $fileZilla.UserName
  $Password = $fileZilla.Password
}

if (-not $DryRun -and (-not $HostName -or -not $UserName -or -not $Password)) {
  if (-not $HostName -or -not $UserName) {
    throw "Missing FTP config. Set OVH_FTP_HOST and OVH_FTP_USER, pass parameters, or use -UseFileZilla."
  }

  $securePassword = Read-Host "FTP password for $UserName@$HostName" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Join-RemotePath {
  param([string] $Base, [string] $Child)

  $normalizedBase = $Base.Trim("/")
  $normalizedChild = $Child.Replace("\", "/").TrimStart("/")

  if ($normalizedBase.Length -eq 0) {
    return $normalizedChild
  }

  return "$normalizedBase/$normalizedChild"
}

function Get-RelativeDeployPath {
  param([string] $BasePath, [string] $FilePath)

  $baseUri = [Uri] ($BasePath.TrimEnd("\") + "\")
  $fileUri = [Uri] $FilePath
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($fileUri).ToString()).Replace("\", "/")
}

function New-FtpRequest {
  param([string] $RemotePathValue, [string] $Method)

  $remoteUrl = "ftp://$HostName/$RemotePathValue"
  $request = [Net.FtpWebRequest] [Net.WebRequest]::Create($remoteUrl)
  $request.Method = $Method
  $request.Credentials = [Net.NetworkCredential]::new($UserName, $Password)
  $request.EnableSsl = [bool] $Ssl
  $request.UseBinary = $true
  $request.UsePassive = -not [bool] $Active
  $request.KeepAlive = $false
  $request.Timeout = 30000
  $request.ReadWriteTimeout = 30000
  return $request
}

function Ensure-RemoteDirectory {
  param([string] $DirectoryPath)

  $parts = @($DirectoryPath.Trim("/").Split("/") | Where-Object { $_ })
  $current = ""

  foreach ($part in $parts) {
    $current = Join-RemotePath -Base $current -Child $part
    try {
      $request = New-FtpRequest -RemotePathValue $current -Method ([Net.WebRequestMethods+Ftp]::MakeDirectory)
      $response = $request.GetResponse()
      $response.Close()
    } catch [Net.WebException] {
      $response = $_.Exception.Response
      if ($response) {
        $response.Close()
      }
    }
  }
}

function Send-FtpFile {
  param([string] $LocalPath, [string] $RemoteFilePath)

  $remoteDirectory = Split-Path $RemoteFilePath.Replace("/", "\") -Parent
  if ($remoteDirectory) {
    Ensure-RemoteDirectory -DirectoryPath $remoteDirectory.Replace("\", "/")
  }

  $request = New-FtpRequest -RemotePathValue $RemoteFilePath -Method ([Net.WebRequestMethods+Ftp]::UploadFile)
  $bytes = [IO.File]::ReadAllBytes($LocalPath)
  $request.ContentLength = $bytes.Length
  $stream = $request.GetRequestStream()
  $stream.Write($bytes, 0, $bytes.Length)
  $stream.Close()
  $response = $request.GetResponse()
  $response.Close()
}

function Send-FtpBytes {
  param([byte[]] $Bytes, [string] $RemoteFilePath)

  $remoteDirectory = Split-Path $RemoteFilePath.Replace("/", "\") -Parent
  if ($remoteDirectory) {
    Ensure-RemoteDirectory -DirectoryPath $remoteDirectory.Replace("\", "/")
  }

  $request = New-FtpRequest -RemotePathValue $RemoteFilePath -Method ([Net.WebRequestMethods+Ftp]::UploadFile)
  $request.ContentLength = $Bytes.Length
  $stream = $request.GetRequestStream()
  $stream.Write($Bytes, 0, $Bytes.Length)
  $stream.Close()
  $response = $request.GetResponse()
  $response.Close()
}

function Receive-FtpTextFile {
  param([string] $RemoteFilePath)

  $request = New-FtpRequest -RemotePathValue $RemoteFilePath -Method ([Net.WebRequestMethods+Ftp]::DownloadFile)
  try {
    $response = $request.GetResponse()
    try {
      $stream = $response.GetResponseStream()
      $reader = [IO.StreamReader]::new($stream, [Text.Encoding]::UTF8)
      try {
        return $reader.ReadToEnd()
      } finally {
        $reader.Close()
      }
    } finally {
      $response.Close()
    }
  } catch [Net.WebException] {
    $response = $_.Exception.Response
    if ($response) {
      $response.Close()
    }
    return $null
  }
}

function Get-FileSha256 {
  param([string] $LocalPath)

  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [IO.File]::OpenRead($LocalPath)
  try {
    $hashBytes = $sha.ComputeHash($stream)
    return ([BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
  } finally {
    $stream.Close()
    $sha.Dispose()
  }
}

function Import-Manifest {
  param([string] $Content)

  $hashes = @{}
  if (-not $Content) {
    return $hashes
  }

  foreach ($line in ($Content -split "`r?`n")) {
    if ($line -match "^([0-9a-fA-F]{64})  (.+)$") {
      $hashes[$Matches[2]] = $Matches[1].ToLowerInvariant()
    }
  }

  return $hashes
}

function ConvertTo-ManifestContent {
  param([hashtable] $Hashes)

  $lines = foreach ($key in ($Hashes.Keys | Sort-Object)) {
    "$($Hashes[$key])  $key"
  }

  return ($lines -join "`n") + "`n"
}

function Test-ShouldUploadFile {
  param([string] $LocalPath, [string] $RelativePath)

  if (-not $ChangedOnly) {
    return $true
  }

  $localHash = Get-FileSha256 -LocalPath $LocalPath
  $LocalManifestHashes[$RelativePath] = $localHash

  if (-not $RemoteManifestHashes.ContainsKey($RelativePath)) {
    return $true
  }

  return $RemoteManifestHashes[$RelativePath] -ne $localHash
}

function Test-FtpLogin {
  $request = New-FtpRequest -RemotePathValue "" -Method ([Net.WebRequestMethods+Ftp]::PrintWorkingDirectory)
  try {
    $response = $request.GetResponse()
    $description = $response.StatusDescription.Trim()
    $response.Close()
    Write-Host "LOGIN    $description"
  } catch [Net.WebException] {
    $response = $_.Exception.Response
    $message = if ($response) { $response.StatusDescription.Trim() } else { $_.Exception.Message }
    if ($response) {
      $response.Close()
    }
    throw "FTP login failed for $UserName@$HostName. Server said: $message"
  }
}

$Files = foreach ($item in $ItemsToDeploy) {
  $path = Join-Path $ProjectRoot $item
  if (-not (Test-Path -LiteralPath $path)) {
    throw "Deploy item not found: $item"
  }

  $entry = Get-Item -LiteralPath $path
  if ($entry.PSIsContainer) {
    Get-ChildItem -LiteralPath $entry.FullName -File -Recurse
  } else {
    $entry
  }
}

$Files += foreach ($item in $OptionalItemsToDeploy) {
  $path = Join-Path $ProjectRoot $item
  if (-not (Test-Path -LiteralPath $path)) {
    continue
  }

  $entry = Get-Item -LiteralPath $path
  if ($entry.PSIsContainer) {
    Get-ChildItem -LiteralPath $entry.FullName -File -Recurse
  } else {
    $entry
  }
}

$Files = $Files | Sort-Object FullName

Write-Host "Deploy target: ftp://$HostName/$($RemotePath.Trim('/'))"
Write-Host "Files: $($Files.Count)"
Write-Host "TLS: $(if ($Ssl) { "enabled" } else { "disabled" })"
Write-Host "FTP mode: $(if ($Active) { "active" } else { "passive" })"
Write-Host "Changed-only: $(if ($ChangedOnly) { "enabled" } else { "disabled" })"

if (-not $DryRun) {
  Test-FtpLogin
}

$remoteManifestFile = Join-RemotePath -Base $RemotePath -Child $ManifestName
if ($ChangedOnly -and -not $DryRun) {
  $manifestContent = Receive-FtpTextFile -RemoteFilePath $remoteManifestFile
  $RemoteManifestHashes = Import-Manifest -Content $manifestContent
  if ($RemoteManifestHashes.Count -gt 0) {
    Write-Host "Manifest: loaded remote hash list ($($RemoteManifestHashes.Count) entries)"
  } else {
    Write-Host "Manifest: not found remotely, first changed-only run will upload all files"
  }
}

$index = 0
foreach ($file in $Files) {
  $index += 1
  $relativePath = Get-RelativeDeployPath -BasePath $ProjectRoot -FilePath $file.FullName
  $remoteFile = Join-RemotePath -Base $RemotePath -Child $relativePath

  if ($DryRun) {
    Write-Host "DRY RUN  [$index/$($Files.Count)] $relativePath -> $remoteFile"
    continue
  }

  if (-not (Test-ShouldUploadFile -LocalPath $file.FullName -RelativePath $relativePath)) {
    Write-Host "SKIP     [$index/$($Files.Count)] $relativePath (unchanged)"
    continue
  }

  Write-Host "UPLOAD   [$index/$($Files.Count)] $relativePath"
  Send-FtpFile -LocalPath $file.FullName -RemoteFilePath $remoteFile
  Write-Host "DONE     [$index/$($Files.Count)] $relativePath"
}

if ($ChangedOnly -and -not $DryRun) {
  $manifestBytes = [Text.Encoding]::UTF8.GetBytes((ConvertTo-ManifestContent -Hashes $LocalManifestHashes))
  Send-FtpBytes -Bytes $manifestBytes -RemoteFilePath $remoteManifestFile
  Write-Host "DONE     manifest $ManifestName"
}

if ($DryRun) {
  Write-Host "Dry run complete. Nothing was uploaded."
} else {
  Write-Host "OVH deploy complete."
}

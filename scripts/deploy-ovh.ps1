param(
  [string] $HostName = $(if ($env:OVH_FTP_HOST) { $env:OVH_FTP_HOST } else { "ftp.cluster115.hosting.ovh.net" }),
  [string] $UserName = $(if ($env:OVH_FTP_USER) { $env:OVH_FTP_USER } else { "andennebh" }),
  [string] $Password = $env:OVH_FTP_PASSWORD,
  [string] $RemotePath = $(if ($env:OVH_FTP_PATH) { $env:OVH_FTP_PATH } else { "www" }),
  [switch] $UseFileZilla,
  [switch] $Ssl,
  [switch] $Active,
  [switch] $DryRun
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

$ItemsToDeploy = @(
  ".ovhconfig",
  "index.html",
  "bears.css",
  "contact.php",
  "config/contact-config.php",
  "fonts",
  "images",
  "scripts"
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

if ($UseFileZilla) {
  $providedHostName = $HostName
  $fileZilla = Import-FileZillaServer -PreferredUser $UserName
  $HostName = if ($providedHostName) { $providedHostName } else { $fileZilla.HostName }
  $UserName = $fileZilla.UserName
  $Password = $fileZilla.Password
}

if (-not $HostName -or -not $UserName -or -not $Password) {
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

$Files = $Files | Sort-Object FullName

Write-Host "Deploy target: ftp://$HostName/$($RemotePath.Trim('/'))"
Write-Host "Files: $($Files.Count)"
Write-Host "TLS: $(if ($Ssl) { "enabled" } else { "disabled" })"
Write-Host "FTP mode: $(if ($Active) { "active" } else { "passive" })"

if (-not $DryRun) {
  Test-FtpLogin
}

foreach ($file in $Files) {
  $relativePath = Get-RelativeDeployPath -BasePath $ProjectRoot -FilePath $file.FullName
  $remoteFile = Join-RemotePath -Base $RemotePath -Child $relativePath

  if ($DryRun) {
    Write-Host "DRY RUN  $relativePath -> $remoteFile"
    continue
  }

  Write-Host "UPLOAD   $relativePath"
  Send-FtpFile -LocalPath $file.FullName -RemoteFilePath $remoteFile
}

if ($DryRun) {
  Write-Host "Dry run complete. Nothing was uploaded."
} else {
  Write-Host "OVH deploy complete."
}

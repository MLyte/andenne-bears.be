Add-Type -AssemblyName System.Drawing

$manifestPath = Join-Path $PSScriptRoot 'heatmap-manifest.json'
$manifest = Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json

function New-HeatBrush {
  param(
    [float]$X,
    [float]$Y,
    [float]$Rx,
    [float]$Ry,
    [float]$Weight
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddEllipse($X - $Rx, $Y - $Ry, $Rx * 2, $Ry * 2)
  $brush = [System.Drawing.Drawing2D.PathGradientBrush]::new($path)
  $brush.CenterPoint = [System.Drawing.PointF]::new($X, $Y)
  $brush.CenterColor = [System.Drawing.Color]::FromArgb([int](150 + 90 * $Weight), 255, 28, 28)
  $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 166, 255))
  return @{ Brush = $brush; Path = $path }
}

foreach ($result in $manifest.results) {
  $width = [int]$result.width
  $height = [int]$result.height
  $bitmap = [System.Drawing.Bitmap]::new($width, $height)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

  foreach ($segment in $result.segments) {
    $segmentImage = [System.Drawing.Image]::FromFile($segment.path)
    $graphics.DrawImage($segmentImage, 0, [int]$segment.y, [int]$segment.width, [int]$segment.height)
    $segmentImage.Dispose()
  }

  $veil = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(25, 0, 0, 0))
  $graphics.FillRectangle($veil, 0, 0, $width, $height)
  $veil.Dispose()

  foreach ($spot in $result.hotspots) {
    $heat = New-HeatBrush -X ([float]$spot.x) -Y ([float]$spot.y) -Rx ([float]$spot.rx) -Ry ([float]$spot.ry) -Weight ([float]$spot.w)
    $graphics.FillPath($heat.Brush, $heat.Path)
    $heat.Brush.Dispose()
    $heat.Path.Dispose()

    $inner = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb([int](50 + 80 * [float]$spot.w), 255, 188, 0))
    $graphics.FillEllipse($inner, [float]$spot.x - [float]$spot.rx * 0.35, [float]$spot.y - [float]$spot.ry * 0.35, [float]$spot.rx * 0.7, [float]$spot.ry * 0.7)
    $inner.Dispose()
  }

  $legendBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(190, 0, 0, 0))
  $graphics.FillRectangle($legendBrush, 18, $height - 58, 320, 40)
  $legendBrush.Dispose()
  $font = [System.Drawing.Font]::new('Arial', 10, [System.Drawing.FontStyle]::Bold)
  $textBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $graphics.DrawString("Attention simulee", $font, $textBrush, 30, $height - 48)
  $textBrush.Dispose()
  $font.Dispose()

  $bitmap.Save($result.heatmapPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Save($result.screenshotPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()

  Write-Output "Generated $($result.heatmapPath)"
}

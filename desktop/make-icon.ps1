$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetDir = Join-Path $PSScriptRoot 'assets'
[void][IO.Directory]::CreateDirectory($assetDir)
$images = @()
foreach ($size in @(16, 32, 48, 256)) {
  $bitmap = New-Object Drawing.Bitmap($size, $size)
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([Drawing.Color]::Transparent)
  $graphics.ScaleTransform(($size / 256.0), ($size / 256.0))
  $background = New-Object Drawing.SolidBrush([Drawing.ColorTranslator]::FromHtml('#245fae'))
  $shape = New-Object Drawing.Drawing2D.GraphicsPath
  $shape.AddArc(8, 8, 60, 60, 180, 90); $shape.AddArc(188, 8, 60, 60, 270, 90)
  $shape.AddArc(188, 188, 60, 60, 0, 90); $shape.AddArc(8, 188, 60, 60, 90, 90); $shape.CloseFigure()
  $graphics.FillPath($background, $shape)
  $pen = New-Object Drawing.Pen([Drawing.Color]::White, 11)
  $pen.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
  $pen.StartCap = [Drawing.Drawing2D.LineCap]::Round; $pen.EndCap = [Drawing.Drawing2D.LineCap]::Round
  $left = [Drawing.PointF[]]@([Drawing.PointF]::new(128,78), [Drawing.PointF]::new(92,65), [Drawing.PointF]::new(53,65), [Drawing.PointF]::new(53,177), [Drawing.PointF]::new(91,177), [Drawing.PointF]::new(128,191), [Drawing.PointF]::new(128,78))
  $right = [Drawing.PointF[]]@([Drawing.PointF]::new(128,78), [Drawing.PointF]::new(164,65), [Drawing.PointF]::new(203,65), [Drawing.PointF]::new(203,177), [Drawing.PointF]::new(165,177), [Drawing.PointF]::new(128,191))
  $graphics.DrawLines($pen, $left); $graphics.DrawLines($pen, $right)
  $pen.Width = 7; $graphics.DrawLine($pen, 77, 104, 103, 110); $graphics.DrawLine($pen, 77, 133, 103, 139)
  $graphics.DrawLine($pen, 153, 110, 179, 104); $graphics.DrawLine($pen, 153, 139, 179, 133)
  $stream = New-Object IO.MemoryStream
  $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
  $images += ,$stream.ToArray()
  if ($size -eq 256) { $bitmap.Save((Join-Path $assetDir 'icon.png'), [Drawing.Imaging.ImageFormat]::Png) }
  $stream.Dispose(); $pen.Dispose(); $background.Dispose(); $shape.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
$output = [IO.File]::Create((Join-Path $assetDir 'icon.ico'))
$writer = New-Object IO.BinaryWriter($output)
try {
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$images.Count)
  $offset = 6 + 16 * $images.Count
  for ($i = 0; $i -lt $images.Count; $i++) {
    $size = @(16,32,48,0)[$i]
    $writer.Write([byte]$size); $writer.Write([byte]$size); $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
    $offset += $images[$i].Length
  }
  foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
} finally { $writer.Dispose(); $output.Dispose() }
Write-Output 'Application icon created.'

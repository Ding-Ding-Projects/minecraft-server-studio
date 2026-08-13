[CmdletBinding()]
param(
    [string]$Source = (Join-Path $PSScriptRoot '..\assets\minecraft-server-studio.svg'),
    [string]$Output = (Join-Path $PSScriptRoot '..\assets\minecraft-server-studio.ico')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Get-Swatch {
    param(
        [Parameter(Mandatory = $true)][string]$Svg,
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Fallback
    )

    $match = [regex]::Match(
        $Svg,
        ('id="{0}"[^>]*fill="(?<colour>#[0-9A-Fa-f]{{6}})"' -f [regex]::Escape($Id)),
        [System.Text.RegularExpressions.RegexOptions]::Singleline
    )

    if ($match.Success) {
        return [System.Drawing.ColorTranslator]::FromHtml($match.Groups['colour'].Value)
    }

    return [System.Drawing.ColorTranslator]::FromHtml($Fallback)
}

function Add-RoundedRectangle {
    param(
        [Parameter(Mandatory = $true)][System.Drawing.Drawing2D.GraphicsPath]$Path,
        [Parameter(Mandatory = $true)][System.Drawing.RectangleF]$Bounds,
        [Parameter(Mandatory = $true)][single]$Radius
    )

    $diameter = [Math]::Min($Radius * 2, [Math]::Min($Bounds.Width, $Bounds.Height))
    $arc = [System.Drawing.RectangleF]::new([single]$Bounds.X, [single]$Bounds.Y, [single]$diameter, [single]$diameter)
    $Path.AddArc($arc, 180, 90)
    $arc.X = $Bounds.Right - $diameter
    $Path.AddArc($arc, 270, 90)
    $arc.Y = $Bounds.Bottom - $diameter
    $Path.AddArc($arc, 0, 90)
    $arc.X = $Bounds.X
    $Path.AddArc($arc, 90, 90)
    $Path.CloseFigure()
}

function Save-PngBytes {
    param([Parameter(Mandatory = $true)][System.Drawing.Bitmap]$Bitmap)

    $stream = New-Object System.IO.MemoryStream
    try {
        $Bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        return $stream.ToArray()
    }
    finally {
        $stream.Dispose()
    }
}

function New-IconBitmap {
    param(
        [Parameter(Mandatory = $true)][int]$Size,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$Grass,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$GrassHighlight,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$RackOutline,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$Line,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$LightGreen,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$LightBlue,
        [Parameter(Mandatory = $true)][System.Drawing.Color]$Spark
    )

    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    try {
        [double]$scale = ([double]$Size) / 256
        $darkA = [System.Drawing.ColorTranslator]::FromHtml('#164B38')
        $darkB = [System.Drawing.ColorTranslator]::FromHtml('#0B2D23')
        $rackA = [System.Drawing.ColorTranslator]::FromHtml('#2D7A54')
        $rackB = [System.Drawing.ColorTranslator]::FromHtml('#174C36')

        $canvas = [System.Drawing.RectangleF]::new([single](16 * $scale), [single](16 * $scale), [single](224 * $scale), [single](224 * $scale))
        $backgroundPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        try {
            Add-RoundedRectangle -Path $backgroundPath -Bounds $canvas -Radius (52 * $scale)
            $backgroundStart = [System.Drawing.PointF]::new([single](16 * $scale), [single](16 * $scale))
            $backgroundEnd = [System.Drawing.PointF]::new([single](240 * $scale), [single](240 * $scale))
            $backgroundBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($backgroundStart, $backgroundEnd, $darkA, $darkB)
            try { $graphics.FillPath($backgroundBrush, $backgroundPath) }
            finally { $backgroundBrush.Dispose() }
        }
        finally { $backgroundPath.Dispose() }

        $grassBlocks = @(
            [pscustomobject]@{ X = 47; Y = 73; Width = 22; Height = 47 },
            [pscustomobject]@{ X = 69; Y = 58; Width = 21; Height = 62 },
            [pscustomobject]@{ X = 90; Y = 72; Width = 20; Height = 48 },
            [pscustomobject]@{ X = 110; Y = 53; Width = 23; Height = 67 },
            [pscustomobject]@{ X = 133; Y = 72; Width = 19; Height = 48 },
            [pscustomobject]@{ X = 152; Y = 59; Width = 22; Height = 61 },
            [pscustomobject]@{ X = 174; Y = 73; Width = 21; Height = 47 },
            [pscustomobject]@{ X = 195; Y = 90; Width = 20; Height = 30 }
        )
        $grassBrush = [System.Drawing.SolidBrush]::new($Grass)
        $highlightBrush = [System.Drawing.SolidBrush]::new($GrassHighlight)
        try {
            foreach ($block in $grassBlocks) {
                $graphics.FillRectangle($grassBrush, $block.X * $scale, $block.Y * $scale, $block.Width * $scale, $block.Height * $scale)
                $highlightHeight = [Math]::Max(2, [int]($block.Height * 0.35 * $scale))
                $graphics.FillRectangle($highlightBrush, $block.X * $scale, $block.Y * $scale, $block.Width * $scale, $highlightHeight)
            }
        }
        finally {
            $grassBrush.Dispose()
            $highlightBrush.Dispose()
        }

        $rackBounds = [System.Drawing.RectangleF]::new([single](47 * $scale), [single](92 * $scale), [single](162 * $scale), [single](116 * $scale))
        $rackPath = New-Object System.Drawing.Drawing2D.GraphicsPath
        try {
            Add-RoundedRectangle -Path $rackPath -Bounds $rackBounds -Radius (22 * $scale)
            $rackStart = [System.Drawing.PointF]::new([single](47 * $scale), [single](92 * $scale))
            $rackEnd = [System.Drawing.PointF]::new([single](47 * $scale), [single](208 * $scale))
            $rackBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new($rackStart, $rackEnd, $rackA, $rackB)
            $rackPen = [System.Drawing.Pen]::new($RackOutline, [single][Math]::Max(1, 8 * $scale))
            try {
                $graphics.FillPath($rackBrush, $rackPath)
                $graphics.DrawPath($rackPen, $rackPath)
            }
            finally {
                $rackBrush.Dispose()
                $rackPen.Dispose()
            }
        }
        finally { $rackPath.Dispose() }

        $lineBrush = [System.Drawing.SolidBrush]::new($Line)
        try {
            foreach ($lineY in @(118, 148, 178)) {
                $linePath = New-Object System.Drawing.Drawing2D.GraphicsPath
                try {
                    Add-RoundedRectangle -Path $linePath -Bounds ([System.Drawing.RectangleF]::new(70 * $scale, $lineY * $scale, 76 * $scale, 10 * $scale)) -Radius (5 * $scale)
                    $graphics.FillPath($lineBrush, $linePath)
                }
                finally { $linePath.Dispose() }
            }
        }
        finally { $lineBrush.Dispose() }

        $lightGreenBrush = [System.Drawing.SolidBrush]::new($LightGreen)
        $lightBlueBrush = [System.Drawing.SolidBrush]::new($LightBlue)
        try {
            $radius = [Math]::Max(1, 8 * $scale)
            $diameter = $radius * 2
            $graphics.FillEllipse($lightGreenBrush, (174 * $scale) - $radius, (123 * $scale) - $radius, $diameter, $diameter)
            $graphics.FillEllipse($lightBlueBrush, (174 * $scale) - $radius, (153 * $scale) - $radius, $diameter, $diameter)
            $graphics.FillEllipse($lightGreenBrush, (174 * $scale) - $radius, (183 * $scale) - $radius, $diameter, $diameter)
        }
        finally {
            $lightGreenBrush.Dispose()
            $lightBlueBrush.Dispose()
        }

        $sparkBrush = [System.Drawing.SolidBrush]::new($Spark)
        try {
            $sparkPoints = [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(199 * $scale, 50 * $scale),
                [System.Drawing.PointF]::new(204 * $scale, 61 * $scale),
                [System.Drawing.PointF]::new(216 * $scale, 66 * $scale),
                [System.Drawing.PointF]::new(204 * $scale, 71 * $scale),
                [System.Drawing.PointF]::new(199 * $scale, 83 * $scale),
                [System.Drawing.PointF]::new(194 * $scale, 71 * $scale),
                [System.Drawing.PointF]::new(182 * $scale, 66 * $scale),
                [System.Drawing.PointF]::new(194 * $scale, 61 * $scale)
            )
            $graphics.FillPolygon($sparkBrush, $sparkPoints)
        }
        finally { $sparkBrush.Dispose() }
    }
    finally {
        $graphics.Dispose()
    }

    return $bitmap
}

function Write-Ico {
    param(
        [Parameter(Mandatory = $true)][object[]]$Images,
        [Parameter(Mandatory = $true)][string]$Destination
    )

    $directorySize = 6 + (16 * $Images.Count)
    $payloadSize = ($Images | Measure-Object -Property { $_.Png.Length } -Sum).Sum
    $output = [byte[]]::new([int]($directorySize + $payloadSize))

    [BitConverter]::GetBytes([uint16]0).CopyTo($output, 0)
    [BitConverter]::GetBytes([uint16]1).CopyTo($output, 2)
    [BitConverter]::GetBytes([uint16]$Images.Count).CopyTo($output, 4)

    $offset = $directorySize
    for ($index = 0; $index -lt $Images.Count; $index++) {
        $image = $Images[$index]
        $entry = 6 + (16 * $index)
        $dimensionByte = if ($image.Size -eq 256) { 0 } else { [byte]$image.Size }
        $output[$entry] = $dimensionByte
        $output[$entry + 1] = $dimensionByte
        $output[$entry + 2] = 0
        $output[$entry + 3] = 0
        [BitConverter]::GetBytes([uint16]1).CopyTo($output, $entry + 4)
        [BitConverter]::GetBytes([uint16]32).CopyTo($output, $entry + 6)
        [BitConverter]::GetBytes([uint32]$image.Png.Length).CopyTo($output, $entry + 8)
        [BitConverter]::GetBytes([uint32]$offset).CopyTo($output, $entry + 12)
        [Array]::Copy($image.Png, 0, $output, $offset, $image.Png.Length)
        $offset += $image.Png.Length
    }

    $destinationDirectory = Split-Path -Parent $Destination
    if (-not (Test-Path -LiteralPath $destinationDirectory)) {
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    }

    [System.IO.File]::WriteAllBytes($Destination, $output)
}

if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
    throw "Master icon source was not found: $Source"
}

$svg = Get-Content -LiteralPath $Source -Raw
$grass = Get-Swatch -Svg $svg -Id 'grass-top' -Fallback '#43A047'
$grassHighlight = Get-Swatch -Svg $svg -Id 'grass-highlight' -Fallback '#75C84A'
$rackOutline = Get-Swatch -Svg $svg -Id 'server-rack' -Fallback '#90E768'
$line = Get-Swatch -Svg $svg -Id 'rack-lines' -Fallback '#D8F7C6'
$lightGreen = Get-Swatch -Svg $svg -Id 'status-lights' -Fallback '#B9F56B'
$lightBlue = [System.Drawing.ColorTranslator]::FromHtml('#5FD4FF')
$spark = Get-Swatch -Svg $svg -Id 'corner-spark' -Fallback '#F5FFD1'

$images = New-Object System.Collections.Generic.List[object]
try {
    foreach ($size in @(16, 20, 24, 32, 40, 48, 64, 128, 256)) {
        $bitmap = New-IconBitmap -Size $size -Grass $grass -GrassHighlight $grassHighlight -RackOutline $rackOutline -Line $line -LightGreen $lightGreen -LightBlue $lightBlue -Spark $spark
        try {
            $images.Add([pscustomobject]@{ Size = $size; Png = Save-PngBytes -Bitmap $bitmap })
        }
        finally { $bitmap.Dispose() }
    }

    Write-Ico -Images $images.ToArray() -Destination $Output
}
finally {
    $images.Clear()
}

$written = [System.IO.File]::ReadAllBytes($Output)
if ($written.Length -lt 6 -or $written[0] -ne 0 -or $written[1] -ne 0 -or $written[2] -ne 1 -or $written[3] -ne 0 -or $written[4] -ne 9 -or $written[5] -ne 0) {
    throw "Generated icon did not pass the ICO container-header check: $Output"
}

Write-Output "Generated multi-resolution icon: $Output (16, 20, 24, 32, 40, 48, 64, 128, 256 px)"

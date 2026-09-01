Add-Type -AssemblyName System.Drawing

function Generate-TrackerIcon {
    param(
        [int]$size,
        [string]$outputPath,
        [bool]$isMaskable = $false
    )

    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)

    # 1. Background
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF(0, 0)),
        (New-Object System.Drawing.PointF($size, $size)),
        [System.Drawing.Color]::FromArgb(255, 15, 23, 42),
        [System.Drawing.Color]::FromArgb(255, 10, 15, 29)
    )

    if ($isMaskable) {
        $g.FillRectangle($bgBrush, $rect)
    } else {
        # Rounded rectangle for regular icon
        $radius = [int]($size * 0.22)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddArc(0, 0, $radius*2, $radius*2, 180, 90)
        $path.AddArc($size - $radius*2, 0, $radius*2, $radius*2, 270, 90)
        $path.AddArc($size - $radius*2, $size - $radius*2, $radius*2, $radius*2, 0, 90)
        $path.AddArc(0, $size - $radius*2, $radius*2, $radius*2, 90, 90)
        $path.CloseFigure()
        $g.FillPath($bgBrush, $path)
    }

    $scale = $size / 512.0
    $cx = $size / 2.0
    $cy = $size * 0.46

    # 2. Radar Rings
    $penGrid = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(80, 56, 189, 248), [Math]::Max(1.5, 2 * $scale))
    $penGrid.DashStyle = [System.Drawing.Drawing2D.DashStyle]::Dash
    $r1 = 175 * $scale
    $g.DrawEllipse($penGrid, ($cx - $r1), ($cy - $r1), ($r1 * 2), ($r1 * 2))

    $penRing2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 99, 102, 241), [Math]::Max(2, 3 * $scale))
    $r2 = 125 * $scale
    $brushPulse = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(35, 56, 189, 248))
    $g.FillEllipse($brushPulse, ($cx - $r2), ($cy - $r2), ($r2 * 2), ($r2 * 2))
    $g.DrawEllipse($penRing2, ($cx - $r2), ($cy - $r2), ($r2 * 2), ($r2 * 2))

    # 3. Pin Body
    $pinPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $pinTopY = $cy - (110 * $scale)
    $pinTipY = $cy + (155 * $scale)
    $pinRadius = 95 * $scale

    # Arc for top part of pin
    $pinPath.AddArc(($cx - $pinRadius), $pinTopY, ($pinRadius * 2), ($pinRadius * 2), 180, 180)
    # Lines down to the tip
    $pinPath.AddLine(($cx + $pinRadius), ($pinTopY + $pinRadius), $cx, $pinTipY)
    $pinPath.AddLine($cx, $pinTipY, ($cx - $pinRadius), ($pinTopY + $pinRadius))
    $pinPath.CloseFigure()

    $pinBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF($cx, $pinTopY)),
        (New-Object System.Drawing.PointF($cx, $pinTipY)),
        [System.Drawing.Color]::FromArgb(255, 56, 189, 248),
        [System.Drawing.Color]::FromArgb(255, 37, 99, 235)
    )
    $g.FillPath($pinBrush, $pinPath)

    # 4. White Center Circle
    $whiteRadius = 46 * $scale
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $g.FillEllipse($whiteBrush, ($cx - $whiteRadius), ($cy - 15 * $scale - $whiteRadius), ($whiteRadius * 2), ($whiteRadius * 2))

    # 5. Live Green Center Dot
    $dotRadius = 26 * $scale
    $dotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
    $g.FillEllipse($dotBrush, ($cx - $dotRadius), ($cy - 15 * $scale - $dotRadius), ($dotRadius * 2), ($dotRadius * 2))

    $innerDotRadius = 12 * $scale
    $innerDotBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 209, 250, 229))
    $g.FillEllipse($innerDotBrush, ($cx - $innerDotRadius), ($cy - 15 * $scale - $innerDotRadius), ($innerDotRadius * 2), ($innerDotRadius * 2))

    # 6. E2EE Shield badge (bottom right)
    $badgeCx = $size * 0.72
    $badgeCy = $size * 0.72
    $badgeR = 40 * $scale

    $shieldBgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
    $shieldBorderPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 16, 185, 129), [Math]::Max(2, 4 * $scale))
    $g.FillEllipse($shieldBgBrush, ($badgeCx - $badgeR), ($badgeCy - $badgeR), ($badgeR * 2), ($badgeR * 2))
    $g.DrawEllipse($shieldBorderPen, ($badgeCx - $badgeR), ($badgeCy - $badgeR), ($badgeR * 2), ($badgeR * 2))

    $shieldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
    $innerShieldR = 22 * $scale
    $g.FillEllipse($shieldBrush, ($badgeCx - $innerShieldR), ($badgeCy - $innerShieldR), ($innerShieldR * 2), ($innerShieldR * 2))

    # Save
    $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $g.Dispose()
    $bitmap.Dispose()
    $bgBrush.Dispose()
    $penGrid.Dispose()
    $penRing2.Dispose()
    $brushPulse.Dispose()
    $pinBrush.Dispose()
    $whiteBrush.Dispose()
    $dotBrush.Dispose()
    $innerDotBrush.Dispose()
    $shieldBgBrush.Dispose()
    $shieldBorderPen.Dispose()
    $shieldBrush.Dispose()
}

$iconsDir = Join-Path $PSScriptRoot "icons"
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir | Out-Null
}

Generate-TrackerIcon -size 192 -outputPath (Join-Path $iconsDir "icon-192.png") -isMaskable $false
Generate-TrackerIcon -size 512 -outputPath (Join-Path $iconsDir "icon-512.png") -isMaskable $false
Generate-TrackerIcon -size 512 -outputPath (Join-Path $iconsDir "icon-maskable-512.png") -isMaskable $true
Generate-TrackerIcon -size 180 -outputPath (Join-Path $iconsDir "apple-touch-icon.png") -isMaskable $false

Write-Output "All icons generated successfully!"

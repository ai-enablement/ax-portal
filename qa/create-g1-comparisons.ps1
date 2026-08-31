Add-Type -AssemblyName System.Drawing

function New-ComparisonImage {
    param(
        [string]$ReferencePath,
        [string]$ImplementationPath,
        [string]$OutputPath,
        [int]$ImplementationCropHeight
    )

    $reference = [System.Drawing.Image]::FromFile($ReferencePath)
    $implementation = [System.Drawing.Bitmap]::FromFile($ImplementationPath)
    $cropRect = New-Object System.Drawing.Rectangle(660, 195, 1200, $ImplementationCropHeight)
    $implementationCrop = $implementation.Clone($cropRect, $implementation.PixelFormat)

    $canvasWidth = 1200
    $labelHeight = 42
    $referenceHeight = [int]($reference.Height * ($canvasWidth / $reference.Width))
    $implementationHeight = [int]($implementationCrop.Height * ($canvasWidth / $implementationCrop.Width))
    $canvasHeight = ($labelHeight * 2) + $referenceHeight + $implementationHeight
    $canvas = New-Object System.Drawing.Bitmap($canvasWidth, $canvasHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    $font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(37, 52, 73))
    $graphics.DrawString("REFERENCE", $font, $brush, 12, 8)
    $graphics.DrawImage($reference, 0, $labelHeight, $canvasWidth, $referenceHeight)
    $implementationLabelY = $labelHeight + $referenceHeight
    $graphics.DrawString("IMPLEMENTATION", $font, $brush, 12, $implementationLabelY + 8)
    $graphics.DrawImage($implementationCrop, 0, $implementationLabelY + $labelHeight, $canvasWidth, $implementationHeight)

    $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $brush.Dispose()
    $font.Dispose()
    $graphics.Dispose()
    $canvas.Dispose()
    $implementationCrop.Dispose()
    $implementation.Dispose()
    $reference.Dispose()
}

New-ComparisonImage `
    -ReferencePath "C:\Users\HYEBIN~1.PAR\AppData\Local\Temp\codex-clipboard-82994083-70ec-443b-9f5e-5ce1c44e19db.png" `
    -ImplementationPath "$PSScriptRoot\g1-before-full.jpg" `
    -OutputPath "$PSScriptRoot\g1-before-comparison.png" `
    -ImplementationCropHeight 810

New-ComparisonImage `
    -ReferencePath "C:\Users\HYEBIN~1.PAR\AppData\Local\Temp\codex-clipboard-ffe38f46-e8b2-4196-a2ec-f06dd5f63ce1.png" `
    -ImplementationPath "$PSScriptRoot\g1-after-full.jpg" `
    -OutputPath "$PSScriptRoot\g1-after-comparison.png" `
    -ImplementationCropHeight 980

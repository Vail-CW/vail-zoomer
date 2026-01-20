# Create a minimal 32x32 ICO file with amber color
$iconDir = "C:\Users\brett\Documents\Coding Projects\Vail Zoomer\src-tauri\icons"

# ICO header (6 bytes)
$header = [byte[]]@(0, 0, 1, 0, 1, 0)

# Icon directory entry (16 bytes)
$entry = [byte[]]@(
    32, 32, 0, 0, 1, 0, 32, 0,
    0x28, 0x10, 0, 0,
    0x16, 0, 0, 0
)

# BMP info header (40 bytes)
$bmpHeader = [byte[]]@(
    0x28, 0, 0, 0,
    32, 0, 0, 0,
    64, 0, 0, 0,
    1, 0, 32, 0,
    0, 0, 0, 0,
    0, 0x10, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0
)

# Pixel data: 32x32 amber color (BGRA)
$pixels = New-Object byte[] 4096
for ($i = 0; $i -lt 4096; $i += 4) {
    $pixels[$i] = 0x00
    $pixels[$i+1] = 0xBF
    $pixels[$i+2] = 0xFF
    $pixels[$i+3] = 0xFF
}

# AND mask
$andMask = New-Object byte[] 128

$allBytes = $header + $entry + $bmpHeader + $pixels + $andMask
[System.IO.File]::WriteAllBytes("$iconDir\icon.ico", $allBytes)
Write-Host "Created icon.ico"

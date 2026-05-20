#!/bin/bash
# Audio Diagnostics for Vail Zoomer (Linux, distro-agnostic)

echo "=== Audio System Diagnostics ==="
echo ""

echo "1. Audio System Detection:"
pactl info | grep "Server Name"
echo ""

echo "2. PipeWire Status:"
systemctl --user status pipewire | head -3
echo ""

echo "3. Available Output Devices (pactl):"
pactl list sinks short
echo ""

echo "4. Available Input Devices (pactl):"
pactl list sources short
echo ""

echo "5. ALSA Devices (what CPAL sees):"
aplay -L | grep -E "^(default|pipewire|pulse)" | head -20
echo ""

echo "6. Checking for VailZoomer virtual device:"
if pactl list sinks short | grep -i vailzoomer; then
    echo "✓ VailZoomer sink found"
else
    echo "✗ VailZoomer sink NOT found"
fi

if pactl list sources short | grep -i vailzoomer; then
    echo "✓ VailZoomerMic source found"
else
    echo "✗ VailZoomerMic source NOT found"
fi
echo ""

echo "7. PipeWire Config:"
if [ -f ~/.config/pipewire/pipewire.conf.d/vail-zoomer.conf ]; then
    echo "✓ Vail Zoomer PipeWire config exists"
else
    echo "✗ Vail Zoomer PipeWire config NOT found"
fi
echo ""

echo "8. Installed Audio Packages:"
if command -v dpkg >/dev/null 2>&1; then
    dpkg -l 2>/dev/null | grep -E "pipewire-alsa|pulseaudio-utils|libasound2" | awk '{print $2, $3}'
elif command -v pacman >/dev/null 2>&1; then
    pacman -Q 2>/dev/null | grep -E "^(pipewire-alsa|libpulse|alsa-plugins|alsa-lib) "
elif command -v rpm >/dev/null 2>&1; then
    rpm -qa 2>/dev/null | grep -E "^(pipewire-alsa|pulseaudio-utils|alsa-plugins)"
else
    echo "  (unknown package manager — checked: dpkg, pacman, rpm)"
fi
echo ""

echo "9. ALSA pulse plugin file (cross-distro check):"
for p in /usr/lib/alsa-lib/libasound_module_pcm_pulse.so \
         /usr/lib64/alsa-lib/libasound_module_pcm_pulse.so \
         /usr/lib/x86_64-linux-gnu/alsa-lib/libasound_module_pcm_pulse.so; do
    if [ -f "$p" ]; then echo "✓ $p"; fi
done
echo ""

echo "=== End Diagnostics ==="

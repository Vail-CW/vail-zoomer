#!/bin/bash
# Audio Diagnostics for Vail Zoomer on Ubuntu 25.10

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
dpkg -l | grep -E "pipewire-alsa|pulseaudio-utils|libasound2" | awk '{print $2, $3}'
echo ""

echo "=== End Diagnostics ==="

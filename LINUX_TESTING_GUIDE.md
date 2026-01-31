# Vail Zoomer - Linux Testing Guide

This guide helps new Linux testers verify that Vail Zoomer works correctly on their system.

## System Requirements

- **OS**: Ubuntu 25.10 or similar Linux distribution
- **Audio Server**: PipeWire 1.4+ (check with `pactl info | grep "Server Name"`)
- **Dependencies**: Will be installed automatically during setup

## Pre-Installation Check

Before testing, verify your audio system:

```bash
# Check PipeWire is running
systemctl --user status pipewire

# Verify pactl command is available
which pactl

# List current audio devices
pactl list sinks short
pactl list sources short
```

## Installation Steps

### Option 1: Install from .deb package (Recommended)

```bash
# Download the latest .deb package
# Install it
sudo dpkg -i vail-zoomer_*.deb

# If there are dependency errors, run:
sudo apt-get install -f
```

### Option 2: Build from source

```bash
# Install all dependencies
sudo apt-get install -y \
    libwebkit2gtk-4.1-dev build-essential wget \
    libssl-dev libgtk-3-dev libayatana-appindicator3-dev \
    librsvg2-dev nodejs npm pulseaudio-utils \
    pipewire-alsa libasound2-dev libasound2-plugins

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Clone and build
git clone https://github.com/Vail-CW/vail-zoomer.git
cd vail-zoomer
npm install
npm run tauri build

# Install
sudo dpkg -i src-tauri/target/release/bundle/deb/vail-zoomer_*.deb
```

## First Run - Setup Wizard

### Step 1: Vail Adapter
- Connect your Vail CW adapter
- Click "Next Step"

### Step 2: Virtual Audio Setup
1. Click **"Auto Setup"** button
2. When prompted, enter your password (for package installation)
3. Wait for "Setup Complete" message
4. Verify the success message mentions the "vailzoomer" device

**Expected outcome:**
- ✅ No error messages
- ✅ Success message appears
- ✅ Button shows "Setup Complete"

**If setup fails:**
- Note the error message
- Try installing dependencies manually:
  ```bash
  sudo apt-get install -y pulseaudio-utils pipewire-alsa libasound2-plugins
  ```
- Restart the app and try auto setup again

### Step 3: Audio Setup

1. **Your microphone**:
   - Leave as "System Default" OR
   - Select your physical microphone from the list
   - Speak into your mic - the level meter should react
   - Adjust volume slider if needed

2. **Output to Zoom**:
   - Select "Vail_Zoomer" or "VailZoomer"
   - This is where the app will send mixed audio

3. **Your speakers/headphones**:
   - Select your audio output device
   - Click "Test Tone" - you should hear a morse code tone

**Expected outcome:**
- ✅ Microphone level meter responds to your voice
- ✅ Test tone is audible
- ✅ No ALSA errors in terminal (if running from terminal)

### Step 4: Video App Configuration
- Follow the on-screen instructions for your video app (Zoom, etc.)

## Testing Audio Routing

### Test 1: Verify Virtual Devices

```bash
# Check VailZoomer sink exists
pactl list sinks short | grep VailZoomer
# Expected: Line showing "VailZoomer" sink

# Check VailZoomerMic source exists
pactl list sources short | grep VailZoomerMic
# Expected: Line showing "VailZoomerMic" source

# Check ALSA vailzoomer device
arecord -L | grep vailzoomer
# Expected: "vailzoomer" device with description
```

### Test 2: Record with Audacity

1. Install Audacity (if not already installed):
   ```bash
   sudo apt-get install audacity
   ```

2. Launch Audacity

3. In Audacity's audio device dropdown:
   - Select **"vailzoomer"** as the recording device
   - If you don't see it, try:
     - Restarting Audacity
     - Changing Audio Host to "ALSA" in preferences

4. Start recording in Audacity

5. In Vail Zoomer:
   - Speak into your microphone
   - Click "Test Dit" or "Test Dah"

6. Stop recording in Audacity

**Expected outcome:**
- ✅ You see waveforms for both voice and morse tones
- ✅ Both voice and tones are clear and audible on playback
- ✅ No dropouts or glitches

### Test 3: Zoom Integration

1. Start Zoom

2. Go to Settings → Audio

3. For Microphone, select:
   - **"vailzoomer"** (may appear as "vailzoomer" or "Vail Zoomer Microphone")

4. In the microphone test:
   - Speak into your mic
   - Click "Test Dit" in Vail Zoomer
   - Zoom's level meter should react to both

**Expected outcome:**
- ✅ Zoom shows the vailzoomer device
- ✅ Zoom's input level meter responds to voice
- ✅ Zoom's input level meter responds to morse tones
- ✅ Test recording plays back both voice and tones

## Common Issues and Solutions

### Issue: "vailzoomer" device not visible in Audacity/Zoom

**Solution:**
```bash
# Verify libasound2-plugins is installed
dpkg -l | grep libasound2-plugins

# If not installed:
sudo apt-get install libasound2-plugins

# Check ~/.asoundrc exists and contains vailzoomer config
cat ~/.asoundrc | grep vailzoomer

# Restart the application (Audacity/Zoom)
```

### Issue: Microphone level meter doesn't react

**Solutions:**
1. Check microphone is not muted in system settings
2. Verify hardware mic is selected as system default:
   ```bash
   pactl info | grep "Default Source"
   # Should show your hardware mic, not VailZoomerMic
   ```
3. In Vail Zoomer, select "System Default" for microphone
4. Restart Vail Zoomer

### Issue: No sound from Test Tone

**Solutions:**
1. Check speaker/headphone selection in Vail Zoomer
2. Verify system volume is not muted
3. Try different sidetone routing option (Both, Computer, Vail speaker)

### Issue: ALSA errors in terminal

**These are normal during device enumeration:**
```
ALSA lib pcm_dmix.c:1000:(snd_pcm_dmix_open) unable to open slave
```

These errors appear when CPAL scans hardware devices but don't affect functionality. As long as audio streams start successfully, ignore these warnings.

## Reporting Issues

If you encounter problems, please report them with:

1. **System Information**:
   ```bash
   # Run these commands and include output
   lsb_release -a
   pactl info
   pactl list sinks short
   pactl list sources short
   arecord -L | head -20
   ```

2. **Error Messages**:
   - Run vail-zoomer from terminal to capture error output
   - Include any error dialogs or messages from the app

3. **Steps to Reproduce**:
   - Exactly what you did leading up to the issue
   - What you expected to happen
   - What actually happened

4. **Testing Checklist Results**:
   - Which tests passed (✅)
   - Which tests failed (❌)

## Success Criteria

Your testing is successful if:

- ✅ Auto Setup completes without errors
- ✅ VailZoomer and VailZoomerMic devices are created
- ✅ vailzoomer ALSA device is visible (arecord -L)
- ✅ Microphone input works (level meter reacts)
- ✅ Test tone produces sound
- ✅ Audacity can record both voice and morse tones
- ✅ Zoom (or your video app) sees the vailzoomer device
- ✅ Zoom can capture both voice and morse tones

If all criteria are met, Vail Zoomer is working correctly on your system! 🎉

---

**Last Updated**: 2026-01-30
**Tested On**: Ubuntu 25.10 with PipeWire 1.4.7

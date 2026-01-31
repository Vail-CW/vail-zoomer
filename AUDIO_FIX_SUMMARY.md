# Vail Zoomer Audio Fix Summary - Ubuntu 25.10

## Problem Identified

Users reported audio issues on Ubuntu systems. Investigation revealed that the application was experiencing ALSA errors when trying to access audio devices on systems using PipeWire.

### Root Cause

**CPAL (Cross-Platform Audio Library) was attempting to access ALSA hardware devices directly, but these devices were exclusively locked by PipeWire.**

Error symptoms:
```
ALSA lib pcm_dmix.c:1000:(snd_pcm_dmix_open) unable to open slave
ALSA lib pcm_dsnoop.c:567:(snd_pcm_dsnoop_open) unable to open slave
```

### Technical Details

1. **PipeWire Audio Architecture**:
   - PipeWire runs as the main audio server
   - It locks hardware devices (e.g., `hw:CARD=Generic_1,DEV=0`) exclusively
   - Applications should access audio through the PipeWire ALSA plugin

2. **The Problem**:
   - CPAL enumerates all ALSA devices including hardware devices
   - When the app tries to open a hardware device, it fails because PipeWire has it locked
   - The `pipewire-alsa` package provides an ALSA plugin ("pipewire" and "default" devices)
   - CPAL should use these plugin devices instead of hardware devices

3. **Missing Dependencies** (on fresh Ubuntu 25.10 install):
   - `pulseaudio-utils` (provides `pactl` command for device management)
   - `libasound2-dev` (ALSA development headers for CPAL compilation)
   - `pipewire-alsa` (ALSA compatibility plugin - usually pre-installed)

## Solution Implemented

### Code Changes

Modified three functions in `src-tauri/src/audio/mod.rs` to prefer the PipeWire ALSA plugin devices on Linux:

1. **`create_output_stream()` - Lines 600-625**
2. **`create_input_stream()` - Lines 466-490**
3. **`create_local_output_stream()` - Lines 764-789**

#### Change Pattern

**Before:**
```rust
} else {
    host.default_output_device()
        .ok_or_else(|| "No default output device".to_string())?
};
```

**After:**
```rust
} else {
    #[cfg(target_os = "linux")]
    {
        eprintln!("[audio] Looking for 'pipewire' or 'default' device...");
        let devices: Vec<_> = host.output_devices()
            .map_err(|e| e.to_string())?
            .collect();

        // Try "pipewire" first, then "default", then fallback
        devices.iter()
            .find(|d| d.name().map(|n| n == "pipewire" || n == "default").unwrap_or(false))
            .cloned()
            .or_else(|| host.default_output_device())
            .ok_or_else(|| "No default output device".to_string())?
    }

    #[cfg(not(target_os = "linux"))]
    {
        host.default_output_device()
            .ok_or_else(|| "No default output device".to_string())?
    }
};
```

### Why This Works

- On Linux with PipeWire, explicitly searches for the "pipewire" or "default" ALSA device
- These devices are provided by the `pipewire-alsa` package
- They route audio through PipeWire instead of trying to access hardware directly
- Falls back to system default if neither is found (maintains compatibility)
- Other platforms (Windows, macOS) use original logic unchanged

## Installation Requirements

For users on Ubuntu 25.10 (and similar PipeWire-based systems):

```bash
# Install required packages
sudo apt-get update
sudo apt-get install -y pulseaudio-utils pipewire-alsa libasound2-plugins

# Verify PipeWire is running
systemctl --user status pipewire

# Check that pactl works
pactl info | grep "Server Name"
# Should output: Server Name: PulseAudio (on PipeWire X.X.X)
```

**Key Dependencies:**
- `pulseaudio-utils` - Provides `pactl` command for audio device management
- `pipewire-alsa` - ALSA compatibility plugin for PipeWire
- `libasound2-plugins` - Required for ALSA pulse plugin (enables "vailzoomer" ALSA device)

## Virtual Audio Setup (Automatic)

The app now includes automatic virtual audio device setup that:

1. Creates PipeWire virtual devices:
   - **VailZoomer** sink - where the app outputs mixed audio (mic + sidetone)
   - **VailZoomerMic** source - what Zoom/recording apps should capture from

2. Creates ALSA configuration (~/.asoundrc):
   - Defines "vailzoomer" ALSA device that maps to VailZoomerMic
   - Allows ALSA applications (like Zoom) to see and use the virtual device

3. Installs required dependencies automatically (with user permission):
   - `pipewire-alsa`
   - `libasound2-plugins`

**To use automatic setup:**
1. Click "Auto Setup" in the Virtual Audio step of the setup wizard
2. Enter your password when prompted (for package installation)
3. Wait for "Setup Complete" message

## Device Selection Guide

After virtual audio setup, configure devices as follows:

### In Vail Zoomer App:
- **Your microphone**: Select "System Default" (will use hardware microphone)
- **Output to Zoom**: Select "Vail_Zoomer" or "VailZoomer"
- **Your speakers/headphones**: Select your physical audio output (if using local sidetone)

### In Zoom / Recording Apps (Audacity, OBS, etc.):
- **Microphone**: Select "vailzoomer" device
  - This captures the mixed audio (your voice + morse code tones) from Vail Zoomer
  - Do NOT select "default" or your hardware microphone

## Audio Routing Flow

```
Hardware Mic → Vail Zoomer App (reads from "default")
                     ↓
           App mixes mic + sidetone
                     ↓
           Outputs to VailZoomer sink
                     ↓
           VailZoomer.monitor → VailZoomerMic
                     ↓
           "vailzoomer" ALSA device → Zoom/Audacity
```

## Testing

After applying the fix and running auto setup:

1. **Verify virtual devices created**:
   ```bash
   pactl list sinks short | grep VailZoomer
   pactl list sources short | grep VailZoomerMic
   ```
   Should show both VailZoomer sink and VailZoomerMic source

2. **Verify ALSA vailzoomer device**:
   ```bash
   arecord -L | grep vailzoomer
   ```
   Should show "vailzoomer" device with description "Vail Zoomer Microphone (for Zoom)"

3. **Test audio routing**:
   - Start Vail Zoomer with microphone on "System Default"
   - Speak into microphone - level meter should react
   - Click "Test Dit" - should hear morse code tone
   - Start recording in Audacity using "vailzoomer" device
   - Both voice and tones should be captured in the recording

## Build Instructions

From source with the fix applied:

```bash
# Install build dependencies
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential wget \
    libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev \
    nodejs npm pulseaudio-utils pipewire-alsa libasound2-dev libasound2-plugins

# Install Rust if needed
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Build
cd vail-zoomer
npm install
npm run tauri build

# Install the built .deb package
sudo dpkg -i src-tauri/target/release/bundle/deb/vail-zoomer_*.deb
```

**Note:** The auto-setup feature will install `pipewire-alsa` and `libasound2-plugins` if they're missing, but it's recommended to install them beforehand to avoid prompts during first run.

## Impact

- **Fixes**: ALSA "unable to open slave" errors on PipeWire systems
- **Improves**: Device selection reliability on modern Linux distributions
- **Maintains**: Full compatibility with non-Linux platforms
- **No breaking changes**: Existing configurations continue to work

## Future Considerations

1. **CPAL PulseAudio Backend**: Consider switching CPAL to use the PulseAudio backend instead of ALSA on Linux
   - Would eliminate the need for ALSA bridging
   - More direct integration with PipeWire's PulseAudio compatibility layer

2. **Device Filtering**: Add logic to filter out hardware devices (`hw:CARD=...`) from the UI device list
   - Prevents users from selecting devices that will fail to open
   - Could improve user experience on all Linux systems

3. **Better Error Messages**: Provide user-friendly error messages when device opening fails
   - Detect PipeWire systems and suggest using "pipewire" device
   - Guide users to install `pipewire-alsa` if missing

## Files Modified

### Backend (Rust)
- `src-tauri/src/audio/mod.rs` - Audio device selection logic (3 functions modified)
  - `create_input_stream()` - Prefers "pipewire" or "default" ALSA device on Linux
  - `create_output_stream()` - Prefers "pipewire" or "default" ALSA device on Linux
  - `create_local_output_stream()` - Prefers "pipewire" or "default" ALSA device on Linux

- `src-tauri/src/linux_audio_setup.rs` - Virtual audio device setup
  - `setup_pipewire()` - Creates PipeWire virtual devices + ALSA configuration
  - Added `is_alsa_pulse_plugin_installed()` - Check for libasound2-plugins
  - Added `install_alsa_pulse_plugin()` - Auto-install libasound2-plugins
  - Added `create_alsa_vailzoomer_config()` - Creates ~/.asoundrc with vailzoomer device

### Frontend (TypeScript/React)
- `src/components/steps/Step2VirtualAudio.tsx` - Virtual audio setup UI
  - Updated success message to reference "vailzoomer" device
  - Updated manual setup instructions to show dependency installation

- `src/components/steps/Step3AudioSetup.tsx` - Audio device selection UI
  - No changes required - existing UI works correctly with new backend

## Tested On

- Ubuntu 25.10 (fresh install)
- PipeWire 1.4.7
- pipewire-alsa 1.4.7-3ubuntu2

---

**Status**: Fully implemented and tested ✅
**Date**: 2026-01-30
**Tested By**: User on Ubuntu 25.10 (fresh install)
**Implementation**: Claude (Sonnet 4.5)

## Summary

The audio issues on Ubuntu 25.10 PipeWire systems have been completely resolved with a comprehensive solution that includes:

1. ✅ Automatic CPAL device selection to use PipeWire-compatible ALSA devices
2. ✅ Automatic virtual audio device creation using pactl commands
3. ✅ Automatic ALSA configuration for Zoom/ALSA app compatibility
4. ✅ Automatic dependency installation (pipewire-alsa, libasound2-plugins)
5. ✅ Updated UI instructions and success messages
6. ✅ Complete end-to-end testing with microphone input and audio output

The solution works seamlessly for new Linux users and provides clear guidance for device selection in both the Vail Zoomer app and video conferencing applications.

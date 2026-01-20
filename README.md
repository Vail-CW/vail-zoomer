# Vail Zoomer

A cross-platform desktop application that merges CW (Morse Code) sidetone with your microphone audio for video conferencing. Perfect for amateur radio operators who want to send Morse code during Zoom, Teams, Discord, or other video calls.

## What It Does

Vail Zoomer bridges three audio streams:
- **Your microphone** - so you can talk normally
- **CW sidetone** - the tones generated when you key Morse code
- **Virtual audio output** - sends the mixed audio to your video conferencing app

This allows you to simultaneously speak and send Morse code in video calls, with real-time character decoding displayed on screen.

## Requirements

- A MIDI-compatible CW keyer (like the [Vail Adapter](https://github.com/8cH9azbsFifZ/vail-adapter))
- A virtual audio cable/device (see installation instructions below)
- A microphone

---

## Installation

### Step 1: Download Vail Zoomer

Download the latest release for your operating system from the [Releases](https://github.com/Vail-CW/vail-zoomer/releases) page:

- **Windows**: `Vail.Zoomer_x.x.x_x64-setup.exe` or portable `.msi`
- **macOS (Apple Silicon)**: `Vail.Zoomer_x.x.x_aarch64.dmg`
- **macOS (Intel)**: `Vail.Zoomer_x.x.x_x64.dmg`
- **Linux**: `vail-zoomer_x.x.x_amd64.AppImage` or `.deb`

> **Security Note**: If you see a security warning when opening the app, see the [First Launch Security Warnings](#first-launch-security-warnings) section below.

### Step 2: Install a Virtual Audio Device

A virtual audio device creates a "loopback" that lets Vail Zoomer send mixed audio to your video conferencing app. **This is required** for the app to work.

---

## Virtual Audio Device Setup

### Windows: VB-Cable

**VB-Cable** is a free virtual audio driver for Windows.

#### Step 1: Download VB-Cable
1. Go to [vb-audio.com/Cable](https://vb-audio.com/Cable/)
2. Click the big **"Download"** button
3. Save the ZIP file to your Downloads folder

#### Step 2: Install the Driver
1. Open your Downloads folder and find the ZIP file (named something like `VBCABLE_Driver_Pack...`)
2. **Right-click** the ZIP file → select **"Extract All"** → click **"Extract"**
3. Open the extracted folder
4. **Right-click** on `VBCABLE_Setup_x64.exe` and select **"Run as administrator"**
   - (Use `VBCABLE_Setup.exe` if you have 32-bit Windows)
5. Click **"Install Driver"** when the window appears
6. Wait for the "Installation Complete" message, then click OK

#### Step 3: Restart Your Computer
⚠️ **This is required!** The virtual audio device will NOT appear until you restart. Save your work and restart now.

#### Step 4: Verify Installation
After your computer restarts:
1. Right-click the speaker icon in your taskbar (bottom right)
2. Click **"Sound settings"**
3. Scroll down and click **"More sound settings"**
4. In the **Playback** tab, look for **"CABLE Input (VB-Audio Virtual Cable)"**
5. In the **Recording** tab, look for **"CABLE Output (VB-Audio Virtual Cable)"**

If you see both devices, you're ready!

#### Troubleshooting Windows:
- **VB-Cable not appearing after restart?**
  - Make sure you ran the installer as Administrator
  - Check **Windows Security → Virus & threat protection → Protection history** - Windows may have blocked the driver
  - Try running the installer again as Administrator
- **Windows 11 users**: You may need to temporarily disable **Core Isolation / Memory Integrity** in Windows Security during installation, then re-enable it after

---

### macOS: BlackHole

**BlackHole** is a free, open-source virtual audio driver for macOS. Works on both Intel and Apple Silicon Macs.

#### Option A: Install with Homebrew (if you have it)
Open Terminal (press Cmd+Space, type "Terminal", press Enter) and run:
```bash
brew install blackhole-2ch
```

Don't have Homebrew? Use Option B below instead.

#### Option B: Manual Download
1. Go to [existential.audio/blackhole](https://existential.audio/blackhole/)
2. Click **"Download BlackHole 2ch"** (you may need to enter your email)
3. Open the downloaded `.pkg` file
4. Follow the installer prompts - click **Continue** → **Install**
5. Enter your Mac password when asked

#### Allow the System Extension (Important!)
macOS blocks audio drivers by default. You must allow it:

1. Open **System Settings** (click Apple menu → System Settings)
2. Click **"Privacy & Security"** in the sidebar
3. Scroll down - you should see a message about BlackHole being blocked
4. Click **"Allow"** next to the message
5. Enter your password if prompted
6. **Restart your Mac** for the changes to take effect

#### Verify Installation
After restarting:
1. Open **System Settings → Sound**
2. Click the **"Output"** tab
3. Look for **"BlackHole 2ch"** in the list

#### Optional: Multi-Output Device (hear sidetone while sending to Zoom)
By default, if you send to BlackHole, you won't hear the sidetone locally. To hear it AND send to Zoom:

1. Open **Audio MIDI Setup** (search in Spotlight or find in /Applications/Utilities/)
2. Click the **+** button in the bottom left
3. Select **"Create Multi-Output Device"**
4. Check both your headphones/speakers AND BlackHole 2ch
5. Optionally rename it to "Vail Zoomer Output"
6. In Vail Zoomer, select this new device as your output

#### Troubleshooting macOS:
- **"System Extension Blocked"**: Go to System Settings → Privacy & Security → scroll down and click "Allow"
- **Still not working?** You may need to restart after allowing the system extension
- **Apple Silicon (M1/M2/M3/M4)**: BlackHole works natively, no Rosetta needed

---

### Linux: PulseAudio/PipeWire Virtual Sink

Linux uses software-based virtual audio devices through PulseAudio or PipeWire.

#### Step 1: Check Which Audio System You Have
Open a terminal (press Ctrl+Alt+T) and run:
```bash
pactl info | grep "Server Name"
```

- If it says **"PipeWire"** → follow PipeWire instructions below
- If it says **"PulseAudio"** → follow PulseAudio instructions below

---

#### For PipeWire (Ubuntu 22.04+, Fedora 34+, most modern distros)

**Step 2a: Create the config folder**
```bash
mkdir -p ~/.config/pipewire/pipewire.conf.d
```

**Step 3a: Create the virtual device config file**
```bash
nano ~/.config/pipewire/pipewire.conf.d/vail-zoomer.conf
```

This opens a text editor. Paste this entire block:
```
context.modules = [
  { name = libpipewire-module-loopback
    args = {
      node.description = "Vail Zoomer"
      capture.props = {
        node.name = "VailZoomer"
        media.class = "Audio/Sink"
        audio.position = [ FL FR ]
      }
      playback.props = {
        node.name = "VailZoomerMic"
        media.class = "Audio/Source"
        audio.position = [ FL FR ]
      }
    }
  }
]
```

This creates two devices:
- **VailZoomer** - The output device you'll select in Vail Zoomer
- **VailZoomerMic** - The microphone input that Zoom will see

Press **Ctrl+O** then **Enter** to save, then **Ctrl+X** to exit.

**Step 4a: Restart PipeWire to apply changes**
```bash
systemctl --user restart pipewire pipewire-pulse
```

---

#### For PulseAudio (older systems)

**Step 2b: Create the config folder**
```bash
mkdir -p ~/.config/pulse
```

**Step 3b: Add the virtual devices to your config**
```bash
# Create null sink for Vail Zoomer output
echo 'load-module module-null-sink sink_name=VailZoomer sink_properties=device.description="Vail_Zoomer_Output"' >> ~/.config/pulse/default.pa

# Create virtual microphone from the sink's monitor (this is what Zoom sees)
echo 'load-module module-remap-source master=VailZoomer.monitor source_name=VailZoomerMic source_properties=device.description="Vail_Zoomer_Microphone"' >> ~/.config/pulse/default.pa
```

**Step 4b: Restart PulseAudio**
```bash
pulseaudio -k && pulseaudio --start
```

---

#### Step 5: Verify Installation
Run these commands to verify both devices were created:
```bash
# Check for the output device (sink)
pactl list sinks short | grep -i vail

# Check for the microphone input (source) - this is what Zoom uses
pactl list sources short | grep -i vail
```

If you see "VailZoomer" in the sinks and "VailZoomerMic" in the sources, you're all set! The devices will persist across reboots.

#### Troubleshooting Linux:
- **No virtual device**: Check if PulseAudio/PipeWire is running: `systemctl --user status pulseaudio` or `systemctl --user status pipewire`
- **Permission errors**: Add your user to the `audio` group: `sudo usermod -a -G audio $USER` (then log out and back in)
- **AppImage won't run**: Make it executable first: `chmod +x vail-zoomer*.AppImage`
- **MIDI not detected**: Install ALSA MIDI support: `sudo apt install libasound2-plugins`
- **Zoom doesn't show the virtual microphone**: Edit `~/.config/zoomus.conf` and set `system.audio.type=default` (instead of `alsa`), then restart Zoom

---

## Using Vail Zoomer

### Quick Start

1. **Connect your MIDI keyer** before launching the app
2. **Launch Vail Zoomer**
3. Configure audio devices (see below)
4. Configure your video app (see below)
5. Test with the Dit/Dah buttons

### Configuring Vail Zoomer

#### MIDI Section
- Your MIDI device should appear automatically - click on it to connect
- The status indicator will turn green when connected

#### Keyer Settings
- **Keyer Type**: Match your physical keyer (Straight Key, Iambic A/B, etc.)
- **WPM**: Set your preferred words-per-minute (5-50) - only for iambic keyers
- **Sidetone Frequency**: Adjust tone pitch (400-1000 Hz)
- Use **Test Dit/Dah** buttons to verify audio is working

#### Audio Routing
- **Microphone Input**: Select your microphone
- **Output to Zoom**: Select the **virtual audio device**:
  - Windows: "CABLE Input (VB-Audio Virtual Cable)"
  - macOS: "BlackHole 2ch"
  - Linux: "VailZoomer" or "Vail Zoomer Output"

#### Sidetone Routing Mode
- **Zoom Only**: Sidetone goes to Zoom only (you won't hear it locally) - use this if your Vail adapter has its own sidetone speaker
- **Local Only**: Sidetone goes to your speakers only (Zoom won't hear it)
- **Both**: Sidetone goes to both Zoom and your local speakers

---

### Configuring Your Video Conferencing App

#### Zoom
1. Open Zoom and click the **gear icon** (Settings) in the top right
2. Click **"Audio"** in the left sidebar
3. Under **"Microphone"**, select:
   - Windows: **"CABLE Output (VB-Audio Virtual Cable)"**
   - macOS: **"BlackHole 2ch"**
   - Linux: **"Vail Zoomer Microphone"** (or "VailZoomerMic")
4. **Uncheck** "Automatically adjust microphone volume"
5. Click **"Test Mic"** to verify it's working

#### Microsoft Teams
1. Click your **profile picture** in the top right
2. Click **"Settings"**
3. Click **"Devices"** in the left sidebar
4. Under **"Microphone"**, select the virtual audio device:
   - Windows: **"CABLE Output"**
   - macOS: **"BlackHole 2ch"**
   - Linux: **"Vail Zoomer Microphone"** (or "VailZoomerMic")
5. Click **"Make a test call"** to verify

#### Discord
1. Click the **gear icon** (User Settings) next to your username
2. Click **"Voice & Video"** in the left sidebar
3. Under **"Input Device"**, select the virtual audio device:
   - Windows: **"CABLE Output"**
   - macOS: **"BlackHole 2ch"**
   - Linux: **"Vail Zoomer Microphone"** (or "VailZoomerMic")
4. Turn **OFF** "Automatically determine input sensitivity"
5. Use the **"Let's Check"** button under Mic Test to verify

#### Google Meet
1. Join or start a meeting, then click the **three dots** (⋮) at the bottom
2. Click **"Settings"**
3. Click **"Audio"**
4. Under **"Microphone"**, select the virtual audio device:
   - Windows: **"CABLE Output"**
   - macOS: **"BlackHole 2ch"**
   - Linux: **"Vail Zoomer Microphone"** (or "VailZoomerMic")
5. Speak or use Test Dit/Dah to see the input level indicator move

### Tips for Best Results

- **Set appropriate volumes**: Keep sidetone at a comfortable level relative to your voice
- **Test before meetings**: Do a test call or use Zoom's audio test feature
- **Mind your WPM**: The decoder works best when you key consistently
- **Use local monitoring**: Helps you hear what you're sending without latency

---

## First Launch Security Warnings

Operating systems display security warnings for apps that aren't code-signed by registered developers. This is normal for open-source software and doesn't mean the app is unsafe.

### Windows: "Windows protected your PC"

When you see the blue SmartScreen warning:

1. Click **"More info"**
2. Click the **"Run anyway"** button that appears
3. The app will now open normally

You only need to do this once. Windows will remember your choice.

### macOS: "App can't be opened" / "Unidentified Developer"

**Method 1: System Settings (try this first)**
1. Try to open the app (it will be blocked)
2. Open **System Settings → Privacy & Security**
3. Scroll down - you'll see a message about Vail Zoomer being blocked
4. Click **"Open Anyway"**
5. Click **"Open"** in the confirmation dialog

**Method 2: Terminal (if Method 1 doesn't work)**
```bash
xattr -cr /Applications/Vail\ Zoomer.app
```
Then try opening the app again.

### Linux: AppImage Won't Run

Linux requires you to make the file executable first. Open a terminal in your Downloads folder and run:

```bash
chmod +x vail-zoomer*.AppImage
./vail-zoomer*.AppImage
```

---

## Troubleshooting

### No Sound in Zoom/Video App
1. Verify the virtual audio device is installed and appears in system audio settings
2. Check that Vail Zoomer's output is set to the virtual device
3. Verify the video app's microphone is set to the virtual device's **output/monitor**
4. Check volume levels in Vail Zoomer aren't at 0%
5. Use the Test Dit/Dah buttons to confirm audio is flowing

### MIDI Device Not Found
1. Ensure the keyer is connected **before** launching Vail Zoomer
2. Try unplugging and reconnecting the USB cable
3. Check if other apps are using the MIDI device (close them first)
4. On Windows, check Device Manager for the device
5. On macOS, check Audio MIDI Setup utility
6. On Linux, run `aconnect -l` to list MIDI devices

### Crackling or Distorted Audio
1. Lower the sidetone and microphone volumes
2. Close other audio-intensive applications
3. Use wired headphones instead of Bluetooth
4. Check CPU usage - audio processing needs consistent resources

### High Latency
1. Use wired headphones instead of Bluetooth
2. Reduce system audio buffer sizes
3. Close unnecessary applications
4. On Linux, consider using JACK for lower latency

---

## Building from Source

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/) 1.70+
- Platform-specific requirements:
  - **Windows**: Visual Studio Build Tools with C++ workload
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev libasound2-dev`

### Build Steps
```bash
# Clone the repository
git clone https://github.com/Vail-CW/vail-zoomer.git
cd vail-zoomer

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

Build outputs will be in `src-tauri/target/release/bundle/`.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please open an issue or pull request.

## Acknowledgments

- [Tauri](https://tauri.app/) - Cross-platform app framework
- [CPAL](https://github.com/RustAudio/cpal) - Cross-platform audio library
- [VB-Audio](https://vb-audio.com/) - VB-Cable for Windows
- [BlackHole](https://existential.audio/blackhole/) - Virtual audio for macOS

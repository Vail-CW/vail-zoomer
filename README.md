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

Download the latest release for your operating system from the [Releases](https://github.com/YOUR_USERNAME/vail-zoomer/releases) page:

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

#### Installation:
1. Download VB-Cable from [vb-audio.com/Cable](https://vb-audio.com/Cable/)
2. Extract the downloaded ZIP file
3. **Right-click** `VBCABLE_Setup_x64.exe` (or `VBCABLE_Setup.exe` for 32-bit)
4. Select **"Run as administrator"**
5. Click **Install Driver**
6. **Restart your computer** (required for the driver to work)

#### Verification:
After restart, open **Sound Settings** and verify you see:
- **CABLE Input (VB-Audio Virtual Cable)** - under playback devices
- **CABLE Output (VB-Audio Virtual Cable)** - under recording devices

#### Troubleshooting Windows:
- If you don't see VB-Cable after restart, try running the installer again as administrator
- Windows may block the driver - check Windows Security → Virus & threat protection → Protection history
- For Windows 11: You may need to disable Secure Boot temporarily or use a signed driver

---

### macOS: BlackHole

**BlackHole** is a free, open-source virtual audio driver for macOS.

#### Installation (Homebrew - Recommended):
```bash
brew install blackhole-2ch
```

#### Installation (Manual):
1. Download from [existential.audio/blackhole](https://existential.audio/blackhole/)
2. Open the `.pkg` installer
3. Follow the installation prompts
4. **Grant microphone permissions** when prompted
5. You may need to allow the system extension in **System Settings → Privacy & Security**

#### Creating a Multi-Output Device (for local monitoring):
If you want to hear the sidetone locally while also sending to Zoom:

1. Open **Audio MIDI Setup** (search in Spotlight or find in `/Applications/Utilities/`)
2. Click the **+** button in the bottom left
3. Select **Create Multi-Output Device**
4. Check both:
   - Your speakers/headphones
   - BlackHole 2ch
5. Optionally rename it to "Vail Zoomer Output"

#### Verification:
Open **System Settings → Sound** and verify you see:
- **BlackHole 2ch** under output devices

#### Troubleshooting macOS:
- **"System Extension Blocked"**: Go to System Settings → Privacy & Security → scroll down and click "Allow"
- **No audio**: Ensure BlackHole is selected as output in Vail Zoomer
- **Catalina/Big Sur+**: You may need to restart after allowing the system extension
- **Apple Silicon (M1/M2/M3)**: BlackHole works natively, no Rosetta needed

---

### Linux: PulseAudio/PipeWire Virtual Sink

Linux uses software-based virtual audio devices through PulseAudio or PipeWire.

#### For PulseAudio:

Create a virtual sink (loopback device):

```bash
# Create a null sink (virtual output device)
pactl load-module module-null-sink sink_name=VailZoomer sink_properties=device.description="Vail_Zoomer_Output"

# Create a loopback to capture from the virtual sink
pactl load-module module-loopback source=VailZoomer.monitor sink=@DEFAULT_SINK@ latency_msec=10
```

To make this permanent, add to `~/.config/pulse/default.pa` or `/etc/pulse/default.pa`:
```
load-module module-null-sink sink_name=VailZoomer sink_properties=device.description="Vail_Zoomer_Output"
```

#### For PipeWire (Ubuntu 22.04+, Fedora 34+):

```bash
# Create a virtual sink
pw-cli create-node adapter factory.name=support.null-audio-sink media.class=Audio/Sink object.linger=1 node.name=VailZoomer node.description="Vail Zoomer Output"
```

Or use **qpwgraph** (graphical PipeWire patchbay) to route audio.

To make persistent with PipeWire, create `~/.config/pipewire/pipewire.conf.d/vail-zoomer.conf`:
```
context.objects = [
    { factory = adapter
        args = {
            factory.name     = support.null-audio-sink
            node.name        = "VailZoomer"
            node.description = "Vail Zoomer Output"
            media.class      = Audio/Sink
            audio.position   = [ FL FR ]
        }
    }
]
```

Then restart PipeWire:
```bash
systemctl --user restart pipewire
```

#### Verification:
```bash
# PulseAudio
pactl list sinks short | grep -i vail

# PipeWire
pw-cli list-objects | grep -i vail
```

#### Troubleshooting Linux:
- **No virtual device**: Check if PulseAudio/PipeWire is running: `systemctl --user status pulseaudio` or `pipewire`
- **Permission errors**: Add your user to the `audio` group: `sudo usermod -a -G audio $USER`
- **AppImage won't run**: Make executable with `chmod +x vail-zoomer*.AppImage`
- **MIDI not detected**: Install ALSA MIDI support: `sudo apt install libasound2-plugins`

---

## Using Vail Zoomer

### Initial Setup

1. **Connect your MIDI keyer** before launching the app
2. **Launch Vail Zoomer**
3. Configure these settings:

#### MIDI Section
- Select your MIDI device from the dropdown
- Click **Connect** to establish connection
- The status indicator will turn green when connected

#### Keyer Settings
- **Keyer Type**: Match your physical keyer (Straight Key, Iambic A/B, etc.)
- **WPM**: Set your preferred words-per-minute (5-50)
- **Sidetone Frequency**: Adjust tone pitch (400-1000 Hz)
- Use **Test Dit/Dah** buttons to verify audio is working

#### Audio Routing
- **Microphone**: Select your microphone input
- **Output Device**: Select the **virtual audio device** (VB-Cable, BlackHole, or VailZoomer sink)
- **Local Monitoring** (optional): Select your speakers/headphones to hear sidetone locally

#### Sidetone Routing Mode
- **Output Only**: Sidetone goes to Zoom only (you won't hear it locally)
- **Local Only**: Sidetone goes to your speakers only (Zoom won't hear it)
- **Both**: Sidetone goes to both Zoom and your local speakers

### Configuring Your Video Conferencing App

#### Zoom
1. Open Zoom → **Settings** → **Audio**
2. Set **Microphone** to:
   - Windows: `CABLE Output (VB-Audio Virtual Cable)`
   - macOS: `BlackHole 2ch`
   - Linux: `Monitor of VailZoomer` or `Vail Zoomer Output`
3. Uncheck "Automatically adjust microphone volume"

#### Microsoft Teams
1. Click your profile → **Settings** → **Devices**
2. Set **Microphone** to the virtual audio device

#### Discord
1. Open **User Settings** → **Voice & Video**
2. Set **Input Device** to the virtual audio device

#### Google Meet
1. Click the three dots → **Settings** → **Audio**
2. Set **Microphone** to the virtual audio device

### Using the App

1. **Start Audio**: Click the audio start button once devices are configured
2. **Key CW**: Use your MIDI keyer - you'll see decoded characters appear in real-time
3. **Speak**: Talk normally into your microphone - both voice and CW are mixed
4. **Monitor levels**: Watch the input/output meters to ensure good levels

### Tips for Best Results

- **Set appropriate volumes**: Keep sidetone at a comfortable level relative to your voice
- **Test before meetings**: Do a test call or use Zoom's audio test feature
- **Mind your WPM**: The decoder works best when you key consistently
- **Use local monitoring**: Helps you hear what you're sending without latency

---

## First Launch Security Warnings

Operating systems display security warnings for apps that aren't code-signed by registered developers. This is normal for open-source software and doesn't mean the app is unsafe.

### Windows: SmartScreen Warning

If you see **"Windows protected your PC"**:

1. Click **"More info"**
2. Click **"Run anyway"**

This warning appears because the app isn't signed with an Extended Validation (EV) certificate. The app is safe to run.

### macOS: "App can't be opened" / "Unidentified Developer"

**Method 1: System Settings**
1. Try to open the app (it will be blocked)
2. Open **System Settings → Privacy & Security**
3. Scroll down and find the message about Vail Zoomer being blocked
4. Click **"Open Anyway"**
5. Click **"Open"** in the confirmation dialog

**Method 2: Terminal (if Method 1 doesn't work)**
```bash
xattr -cr /Applications/Vail\ Zoomer.app
```

### Linux: AppImage Won't Run

Make the AppImage executable:
```bash
chmod +x vail-zoomer*.AppImage
```

Then run it:
```bash
./vail-zoomer*.AppImage
```

---

## Troubleshooting

### No Sound in Zoom/Video App
1. Verify the virtual audio device is installed and appears in system audio settings
2. Check that Vail Zoomer's output is set to the virtual device
3. Verify the video app's microphone is set to the virtual device
4. Check volume levels in Vail Zoomer aren't muted

### MIDI Device Not Found
1. Ensure the keyer is connected before launching Vail Zoomer
2. Try unplugging and reconnecting the USB cable
3. Check Device Manager (Windows) or System Information (macOS) for the MIDI device
4. On Linux, ensure ALSA MIDI is installed

### Crackling or Distorted Audio
1. Lower the sidetone volume
2. Close other audio-intensive applications
3. Try increasing buffer size if option is available
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
git clone https://github.com/YOUR_USERNAME/vail-zoomer.git
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

[Add your license here]

## Contributing

Contributions are welcome! Please open an issue or pull request.

## Acknowledgments

- [Tauri](https://tauri.app/) - Cross-platform app framework
- [CPAL](https://github.com/RustAudio/cpal) - Cross-platform audio library
- [VB-Audio](https://vb-audio.com/) - VB-Cable for Windows
- [BlackHole](https://existential.audio/blackhole/) - Virtual audio for macOS

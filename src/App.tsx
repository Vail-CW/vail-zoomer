import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";

// Device info from backend (friendly name + internal name for selection)
interface DeviceInfo {
  display_name: string;
  internal_name: string;
}

// Settings type matching Rust backend
interface Settings {
  keyer_type: string;
  wpm: number;
  dit_dah_ratio: number;
  weighting: number;
  swap_paddles: boolean;
  sidetone_frequency: number;
  sidetone_volume: number;
  local_sidetone_volume: number;
  sidetone_route: string;
  mic_volume: number;
  mix_mode: string;
  local_output_device: string | null;
  midi_device: string | null;
  input_device: string | null;
  output_device: string | null;
  linux_audio_setup_completed: boolean;
}

// Linux virtual audio setup types
interface VirtualAudioStatus {
  exists: boolean;
  audio_system: "PipeWire" | "PulseAudio" | "Unknown";
  pactl_installed: boolean;
}

interface SetupResult {
  success: boolean;
  message: string;
}

const KEYER_TYPES = [
  { value: "Straight", label: "Straight Key" },
  { value: "Bug", label: "Bug" },
  { value: "ElBug", label: "Electric Bug" },
  { value: "SingleDot", label: "Single Dot" },
  { value: "Ultimatic", label: "Ultimatic" },
  { value: "PlainIambic", label: "Plain Iambic" },
  { value: "IambicA", label: "Iambic A" },
  { value: "IambicB", label: "Iambic B" },
  { value: "Keyahead", label: "Keyahead" },
];

const SIDETONE_ROUTES = [
  { value: "OutputOnly", label: "Zoom Only (silent locally)" },
  { value: "LocalOnly", label: "Local Speakers Only" },
  { value: "Both", label: "Both Zoom & Local" },
];

type HelpTab = "overview" | "virtual-audio" | "usage" | "troubleshooting";
type OSType = "windows" | "macos" | "linux";

function HelpModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<HelpTab>("overview");
  const [detectedOS, setDetectedOS] = useState<OSType>("windows");
  const [selectedOS, setSelectedOS] = useState<OSType>("windows");

  useEffect(() => {
    const detectOS = async () => {
      try {
        const os = await platform();
        if (os === "macos") {
          setDetectedOS("macos");
          setSelectedOS("macos");
        } else if (os === "linux") {
          setDetectedOS("linux");
          setSelectedOS("linux");
        } else {
          setDetectedOS("windows");
          setSelectedOS("windows");
        }
      } catch {
        // Default to windows if detection fails
      }
    };
    if (isOpen) detectOS();
  }, [isOpen]);

  if (!isOpen) return null;

  const tabs: { id: HelpTab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "virtual-audio", label: "Virtual Audio Setup" },
    { id: "usage", label: "How to Use" },
    { id: "troubleshooting", label: "Troubleshooting" },
  ];

  const osLabels: Record<OSType, string> = {
    windows: "Windows",
    macos: "macOS",
    linux: "Linux",
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-amber-400">Help & Setup Guide</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-amber-400 border-b-2 border-amber-400"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "overview" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">What is Vail Zoomer?</h3>
              <p className="text-gray-300">
                Vail Zoomer lets you send Morse code (CW) during video calls by mixing your
                microphone audio with computer-generated sidetone. Perfect for amateur radio
                operators who want to practice CW while on Zoom, Teams, Discord, or other video
                conferencing apps.
              </p>

              <h3 className="text-lg font-semibold text-white mt-6">What You Need</h3>
              <ul className="list-disc list-inside text-gray-300 space-y-2">
                <li>
                  <strong>A MIDI-compatible CW keyer</strong> - like the Vail Adapter or any MIDI
                  paddle/keyer
                </li>
                <li>
                  <strong>A virtual audio device</strong> - software that creates a "virtual cable"
                  to route audio (see Virtual Audio Setup tab)
                </li>
                <li>
                  <strong>A microphone</strong> - for your voice
                </li>
              </ul>

              <h3 className="text-lg font-semibold text-white mt-6">How It Works</h3>
              <div className="bg-gray-900 p-4 rounded-lg text-gray-300 font-mono text-sm">
                <div className="space-y-1">
                  <div>Your Mic ─────────┐</div>
                  <div>                  ├──▶ Vail Zoomer ──▶ Virtual Audio ──▶ Zoom</div>
                  <div>CW Sidetone ──────┘</div>
                </div>
              </div>
              <p className="text-gray-400 text-sm">
                Vail Zoomer mixes your microphone input with the CW sidetone and sends the combined
                audio to a virtual audio device. Your video conferencing app uses that virtual device
                as its microphone input.
              </p>
            </div>
          )}

          {activeTab === "virtual-audio" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">Virtual Audio Device Setup</h3>
                <div className="flex gap-1 bg-gray-900 rounded-lg p-1">
                  {(["windows", "macos", "linux"] as OSType[]).map((os) => (
                    <button
                      key={os}
                      onClick={() => setSelectedOS(os)}
                      className={`px-3 py-1 rounded text-sm transition-colors ${
                        selectedOS === os
                          ? "bg-amber-600 text-white"
                          : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {osLabels[os]}
                      {os === detectedOS && " ●"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3 text-sm">
                <strong className="text-blue-400">Why do I need this?</strong>
                <p className="text-gray-300 mt-1">
                  A virtual audio device creates a "loopback" - an audio output that can be used as
                  an input. This lets Vail Zoomer send mixed audio to Zoom as if it were a microphone.
                </p>
              </div>

              {selectedOS === "windows" && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-amber-400">VB-Cable (Free Virtual Audio Driver)</h4>

                  <div className="bg-gray-900 p-3 rounded-lg">
                    <p className="text-sm font-medium text-white mb-2">Step 1: Download VB-Cable</p>
                    <ol className="list-decimal list-inside text-sm text-gray-300 space-y-2">
                      <li>
                        Go to{" "}
                        <a
                          href="https://vb-audio.com/Cable/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 underline hover:text-amber-300"
                        >
                          vb-audio.com/Cable
                        </a>
                      </li>
                      <li>Click the big <strong>"Download"</strong> button</li>
                      <li>Save the ZIP file to your Downloads folder</li>
                    </ol>
                  </div>

                  <div className="bg-gray-900 p-3 rounded-lg">
                    <p className="text-sm font-medium text-white mb-2">Step 2: Install the Driver</p>
                    <ol className="list-decimal list-inside text-sm text-gray-300 space-y-2">
                      <li>Open your Downloads folder and find the ZIP file</li>
                      <li>Right-click the ZIP → <strong>"Extract All"</strong> → <strong>"Extract"</strong></li>
                      <li>Open the extracted folder</li>
                      <li>
                        <strong>Right-click</strong> on <code className="bg-gray-800 px-1 rounded">VBCABLE_Setup_x64.exe</code>
                        <br/><span className="text-gray-400 text-xs">(Use VBCABLE_Setup.exe if you have 32-bit Windows)</span>
                      </li>
                      <li>Select <strong>"Run as administrator"</strong></li>
                      <li>Click <strong>"Install Driver"</strong> when the window appears</li>
                      <li>Wait for "Installation Complete" message, then click OK</li>
                    </ol>
                  </div>

                  <div className="bg-red-900/30 border border-red-700 rounded-lg p-3">
                    <p className="text-sm font-medium text-red-400 mb-1">Step 3: Restart Your Computer</p>
                    <p className="text-gray-300 text-sm">
                      <strong>This is required!</strong> The virtual audio device will NOT appear until you restart.
                      Save your work and restart now.
                    </p>
                  </div>

                  <div className="bg-gray-900 p-3 rounded-lg">
                    <p className="text-sm font-medium text-white mb-2">Step 4: Verify Installation</p>
                    <p className="text-xs text-gray-400 mb-2">After your computer restarts:</p>
                    <ol className="list-decimal list-inside text-sm text-gray-300 space-y-1">
                      <li>Right-click the speaker icon in your taskbar (bottom right)</li>
                      <li>Click <strong>"Sound settings"</strong></li>
                      <li>Scroll down and click <strong>"More sound settings"</strong></li>
                      <li>In the <strong>Playback</strong> tab, look for <strong>"CABLE Input"</strong></li>
                      <li>In the <strong>Recording</strong> tab, look for <strong>"CABLE Output"</strong></li>
                    </ol>
                    <p className="text-xs text-gray-400 mt-2">
                      If you see both devices, you're ready to go!
                    </p>
                  </div>

                  <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 text-sm">
                    <strong className="text-yellow-400">VB-Cable not appearing after restart?</strong>
                    <ul className="text-gray-300 mt-2 space-y-1 list-disc list-inside">
                      <li>Make sure you ran the installer as Administrator</li>
                      <li>Check <strong>Windows Security → Protection history</strong> - Windows may have blocked the driver</li>
                      <li>Try running the installer again as Administrator</li>
                      <li>On Windows 11: You may need to temporarily disable <strong>Core Isolation / Memory Integrity</strong> in Windows Security during installation</li>
                    </ul>
                  </div>
                </div>
              )}

              {selectedOS === "macos" && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-amber-400">BlackHole (Free Virtual Audio Driver)</h4>

                  {/* Option A: Homebrew */}
                  <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-400 mb-2">Option A: Install with Homebrew (if you have it)</p>
                    <p className="text-xs text-gray-400 mb-2">
                      Open Terminal (press <kbd className="bg-gray-700 px-1 rounded">Cmd</kbd> + <kbd className="bg-gray-700 px-1 rounded">Space</kbd>, type "Terminal", press Enter) and run:
                    </p>
                    <code className="block bg-black p-2 rounded text-green-400 text-sm">
                      brew install blackhole-2ch
                    </code>
                    <p className="text-xs text-gray-400 mt-2">
                      Don't have Homebrew? Use Option B below instead.
                    </p>
                  </div>

                  {/* Option B: Manual Download */}
                  <div className="bg-gray-900 p-3 rounded-lg">
                    <p className="text-sm font-medium text-white mb-2">Option B: Manual Download (no Homebrew needed)</p>
                    <ol className="list-decimal list-inside text-sm text-gray-300 space-y-2">
                      <li>
                        Go to{" "}
                        <a
                          href="https://existential.audio/blackhole/"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-400 underline hover:text-amber-300"
                        >
                          existential.audio/blackhole
                        </a>
                      </li>
                      <li>Click <strong>"Download BlackHole 2ch"</strong> (you may need to enter your email)</li>
                      <li>Open the downloaded <code className="bg-gray-800 px-1 rounded">.pkg</code> file</li>
                      <li>Follow the installer prompts - click <strong>Continue</strong> → <strong>Install</strong></li>
                      <li>Enter your Mac password when asked</li>
                    </ol>
                  </div>

                  {/* Security Steps */}
                  <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3">
                    <p className="text-sm font-medium text-yellow-400 mb-2">Important: Allow the System Extension</p>
                    <p className="text-gray-300 text-sm mb-2">
                      macOS blocks audio drivers by default. You must allow it:
                    </p>
                    <ol className="list-decimal list-inside text-sm text-gray-300 space-y-1">
                      <li>Open <strong>System Settings</strong> (click Apple menu → System Settings)</li>
                      <li>Click <strong>"Privacy & Security"</strong> in the sidebar</li>
                      <li>Scroll down - you should see a message about BlackHole being blocked</li>
                      <li>Click <strong>"Allow"</strong> next to the message</li>
                      <li>Enter your password if prompted</li>
                      <li><strong>Restart your Mac</strong> for the changes to take effect</li>
                    </ol>
                  </div>

                  {/* Verification */}
                  <div className="bg-gray-900 p-3 rounded-lg">
                    <p className="text-sm font-medium text-white mb-2">Verify Installation</p>
                    <p className="text-xs text-gray-400 mb-2">After restarting:</p>
                    <ol className="list-decimal list-inside text-sm text-gray-300 space-y-1">
                      <li>Open <strong>System Settings → Sound</strong></li>
                      <li>Click the <strong>"Output"</strong> tab</li>
                      <li>Look for <strong>"BlackHole 2ch"</strong> in the list</li>
                    </ol>
                    <p className="text-xs text-gray-400 mt-2">
                      If you see it, you're ready! Works on both Intel and Apple Silicon Macs.
                    </p>
                  </div>

                  {/* Multi-output device (optional) */}
                  <details className="bg-gray-900 rounded-lg">
                    <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg text-sm font-medium">
                      Optional: Hear sidetone in your headphones while sending to Zoom
                    </summary>
                    <div className="p-3 pt-0 text-sm text-gray-300 space-y-2">
                      <p className="text-xs text-gray-400">
                        By default, if you send to BlackHole, you won't hear the sidetone locally.
                        To hear it AND send to Zoom, create a Multi-Output Device:
                      </p>
                      <ol className="list-decimal list-inside space-y-1 text-sm">
                        <li>Open <strong>Audio MIDI Setup</strong> (search in Spotlight or find in /Applications/Utilities/)</li>
                        <li>Click the <strong>+</strong> button in the bottom left</li>
                        <li>Select <strong>"Create Multi-Output Device"</strong></li>
                        <li>Check both your headphones/speakers AND BlackHole 2ch</li>
                        <li>Optionally rename it to "Vail Zoomer Output"</li>
                        <li>In Vail Zoomer, select this new device as your output</li>
                      </ol>
                    </div>
                  </details>
                </div>
              )}

              {selectedOS === "linux" && (
                <div className="space-y-4">
                  <h4 className="font-semibold text-amber-400">Virtual Audio Device Setup for Linux</h4>
                  <p className="text-gray-300 text-sm">
                    Linux uses software-based virtual audio. Follow the steps below carefully.
                  </p>

                  {/* Step 1: Check audio system */}
                  <div className="bg-gray-900 p-3 rounded-lg">
                    <p className="text-sm font-medium text-white mb-2">Step 1: Check which audio system you have</p>
                    <p className="text-xs text-gray-400 mb-2">
                      Open a terminal (press <kbd className="bg-gray-700 px-1 rounded">Ctrl</kbd> + <kbd className="bg-gray-700 px-1 rounded">Alt</kbd> + <kbd className="bg-gray-700 px-1 rounded">T</kbd>) and run:
                    </p>
                    <code className="block bg-black p-2 rounded text-green-400 text-sm overflow-x-auto">
                      pactl info | grep "Server Name"
                    </code>
                    <p className="text-xs text-gray-400 mt-2">
                      If it says <strong>"PipeWire"</strong> → follow PipeWire instructions below<br/>
                      If it says <strong>"PulseAudio"</strong> → follow PulseAudio instructions below
                    </p>
                  </div>

                  {/* PipeWire Instructions */}
                  <div className="bg-blue-900/30 border border-blue-700 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-400 mb-2">For PipeWire (Ubuntu 22.04+, Fedora 34+, most modern distros)</p>

                    <p className="text-xs text-gray-300 mb-2"><strong>Step 2a:</strong> Create the config folder (in terminal):</p>
                    <code className="block bg-black p-2 rounded text-green-400 text-sm overflow-x-auto mb-3">
                      mkdir -p ~/.config/pipewire/pipewire.conf.d
                    </code>

                    <p className="text-xs text-gray-300 mb-2"><strong>Step 3a:</strong> Create the virtual device config file:</p>
                    <code className="block bg-black p-2 rounded text-green-400 text-sm overflow-x-auto mb-2">
                      nano ~/.config/pipewire/pipewire.conf.d/vail-zoomer.conf
                    </code>
                    <p className="text-xs text-gray-400 mb-2">This opens a text editor. Paste this entire block:</p>
                    <pre className="bg-black p-2 rounded text-green-400 text-xs overflow-x-auto">
{`context.objects = [
  { factory = adapter
    args = {
      factory.name = support.null-audio-sink
      node.name = "VailZoomer"
      node.description = "Vail Zoomer Output"
      media.class = Audio/Sink
      audio.position = [ FL FR ]
    }
  }
]`}
                    </pre>
                    <p className="text-xs text-gray-400 mt-2">
                      Press <kbd className="bg-gray-700 px-1 rounded">Ctrl</kbd>+<kbd className="bg-gray-700 px-1 rounded">O</kbd> then <kbd className="bg-gray-700 px-1 rounded">Enter</kbd> to save, then <kbd className="bg-gray-700 px-1 rounded">Ctrl</kbd>+<kbd className="bg-gray-700 px-1 rounded">X</kbd> to exit.
                    </p>

                    <p className="text-xs text-gray-300 mt-3 mb-2"><strong>Step 4a:</strong> Restart PipeWire to apply changes:</p>
                    <code className="block bg-black p-2 rounded text-green-400 text-sm overflow-x-auto">
                      systemctl --user restart pipewire pipewire-pulse
                    </code>
                  </div>

                  {/* PulseAudio Instructions */}
                  <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-3">
                    <p className="text-sm font-medium text-purple-400 mb-2">For PulseAudio (older systems)</p>

                    <p className="text-xs text-gray-300 mb-2"><strong>Step 2b:</strong> Create the config folder (in terminal):</p>
                    <code className="block bg-black p-2 rounded text-green-400 text-sm overflow-x-auto mb-3">
                      mkdir -p ~/.config/pulse
                    </code>

                    <p className="text-xs text-gray-300 mb-2"><strong>Step 3b:</strong> Add the virtual device to your config:</p>
                    <code className="block bg-black p-2 rounded text-green-400 text-sm overflow-x-auto mb-2">
                      echo 'load-module module-null-sink sink_name=VailZoomer sink_properties=device.description="Vail_Zoomer_Output"' &gt;&gt; ~/.config/pulse/default.pa
                    </code>

                    <p className="text-xs text-gray-300 mt-3 mb-2"><strong>Step 4b:</strong> Restart PulseAudio:</p>
                    <code className="block bg-black p-2 rounded text-green-400 text-sm overflow-x-auto">
                      pulseaudio -k && pulseaudio --start
                    </code>
                  </div>

                  {/* Verification */}
                  <div className="bg-gray-900 p-3 rounded-lg">
                    <p className="text-sm font-medium text-white mb-2">Step 5: Verify it worked</p>
                    <p className="text-xs text-gray-400 mb-2">Run this command - you should see "VailZoomer" in the output:</p>
                    <code className="block bg-black p-2 rounded text-green-400 text-sm overflow-x-auto">
                      pactl list sinks short | grep -i vail
                    </code>
                    <p className="text-xs text-gray-400 mt-2">
                      If you see a line with "VailZoomer", you're all set! The device will persist across reboots.
                    </p>
                  </div>

                  {/* AppImage note */}
                  <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-3 text-sm">
                    <strong className="text-yellow-400">AppImage won't open?</strong>
                    <p className="text-gray-300 mt-1">
                      You need to make it executable first. In terminal, navigate to your Downloads folder and run:
                    </p>
                    <code className="block bg-black p-2 rounded text-green-400 text-sm mt-2 overflow-x-auto">
                      chmod +x vail-zoomer*.AppImage && ./vail-zoomer*.AppImage
                    </code>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === "usage" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Quick Start Guide</h3>

              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center font-bold">
                    1
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Connect Your MIDI Keyer</h4>
                    <p className="text-gray-400 text-sm">
                      Plug in your MIDI keyer before launching the app. It should appear in the MIDI
                      device list. Click on it to connect.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center font-bold">
                    2
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Configure Audio Devices</h4>
                    <ul className="text-gray-400 text-sm space-y-1 mt-1">
                      <li>
                        <strong>Microphone Input:</strong> Select your microphone
                      </li>
                      <li>
                        <strong>Output to Zoom:</strong> Select the virtual audio device
                        <ul className="ml-4 list-disc list-inside text-gray-500">
                          <li>Windows: "CABLE Input (VB-Audio...)"</li>
                          <li>macOS: "BlackHole 2ch"</li>
                          <li>Linux: "VailZoomer" or "Vail Zoomer"</li>
                        </ul>
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center font-bold">
                    3
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Configure Your Video App</h4>
                    <p className="text-gray-400 text-sm mb-2">
                      Set your video app's <strong>microphone</strong> to the virtual audio device.
                      Click below for your app:
                    </p>
                  </div>
                </div>
              </div>

              {/* Video App Setup Instructions */}
              <div className="space-y-2 ml-11">
                <details className="bg-gray-900 rounded-lg">
                  <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg text-sm font-medium">
                    Zoom Setup
                  </summary>
                  <div className="p-3 pt-0 text-sm text-gray-300">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Open Zoom and click the <strong>gear icon</strong> (Settings) in the top right</li>
                      <li>Click <strong>"Audio"</strong> in the left sidebar</li>
                      <li>Under <strong>"Microphone"</strong>, select:
                        <ul className="ml-4 list-disc list-inside text-gray-400 mt-1">
                          <li>Windows: <strong>"CABLE Output (VB-Audio Virtual Cable)"</strong></li>
                          <li>macOS: <strong>"BlackHole 2ch"</strong></li>
                          <li>Linux: <strong>"Monitor of VailZoomer"</strong></li>
                        </ul>
                      </li>
                      <li><strong>Uncheck</strong> "Automatically adjust microphone volume"</li>
                      <li>Click <strong>"Test Mic"</strong> to verify it's working</li>
                    </ol>
                  </div>
                </details>

                <details className="bg-gray-900 rounded-lg">
                  <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg text-sm font-medium">
                    Microsoft Teams Setup
                  </summary>
                  <div className="p-3 pt-0 text-sm text-gray-300">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Click your <strong>profile picture</strong> in the top right</li>
                      <li>Click <strong>"Settings"</strong></li>
                      <li>Click <strong>"Devices"</strong> in the left sidebar</li>
                      <li>Under <strong>"Microphone"</strong>, select the virtual audio device:
                        <ul className="ml-4 list-disc list-inside text-gray-400 mt-1">
                          <li>Windows: <strong>"CABLE Output"</strong></li>
                          <li>macOS: <strong>"BlackHole 2ch"</strong></li>
                          <li>Linux: <strong>"Monitor of VailZoomer"</strong></li>
                        </ul>
                      </li>
                      <li>Click <strong>"Make a test call"</strong> to verify</li>
                    </ol>
                  </div>
                </details>

                <details className="bg-gray-900 rounded-lg">
                  <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg text-sm font-medium">
                    Discord Setup
                  </summary>
                  <div className="p-3 pt-0 text-sm text-gray-300">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Click the <strong>gear icon</strong> (User Settings) next to your username</li>
                      <li>Click <strong>"Voice & Video"</strong> in the left sidebar</li>
                      <li>Under <strong>"Input Device"</strong>, select the virtual audio device:
                        <ul className="ml-4 list-disc list-inside text-gray-400 mt-1">
                          <li>Windows: <strong>"CABLE Output"</strong></li>
                          <li>macOS: <strong>"BlackHole 2ch"</strong></li>
                          <li>Linux: <strong>"Monitor of VailZoomer"</strong></li>
                        </ul>
                      </li>
                      <li>Turn <strong>OFF</strong> "Automatically determine input sensitivity"</li>
                      <li>Use the <strong>"Let's Check"</strong> button under Mic Test to verify</li>
                    </ol>
                  </div>
                </details>

                <details className="bg-gray-900 rounded-lg">
                  <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg text-sm font-medium">
                    Google Meet Setup
                  </summary>
                  <div className="p-3 pt-0 text-sm text-gray-300">
                    <ol className="list-decimal list-inside space-y-1">
                      <li>Join or start a meeting, then click the <strong>three dots</strong> (⋮) at the bottom</li>
                      <li>Click <strong>"Settings"</strong></li>
                      <li>Click <strong>"Audio"</strong></li>
                      <li>Under <strong>"Microphone"</strong>, select the virtual audio device:
                        <ul className="ml-4 list-disc list-inside text-gray-400 mt-1">
                          <li>Windows: <strong>"CABLE Output"</strong></li>
                          <li>macOS: <strong>"BlackHole 2ch"</strong></li>
                          <li>Linux: <strong>"Monitor of VailZoomer"</strong></li>
                        </ul>
                      </li>
                      <li>Speak or use Test Dit/Dah to see the input level indicator move</li>
                    </ol>
                  </div>
                </details>
              </div>

              <div className="space-y-4 mt-4">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center font-bold">
                    4
                  </div>
                  <div>
                    <h4 className="font-medium text-white">Test & Adjust</h4>
                    <p className="text-gray-400 text-sm">
                      Use the "Test Dit/Dah" buttons to verify sidetone is working. Adjust volumes
                      so your voice and CW are balanced. Watch the level meters for visual feedback.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-gray-900 p-4 rounded-lg mt-6">
                <h4 className="font-medium text-white mb-2">Sidetone Routing Options</h4>
                <ul className="text-sm text-gray-300 space-y-2">
                  <li>
                    <strong className="text-amber-400">Zoom Only:</strong> Sidetone goes to the video
                    call only. Use this if your Vail adapter has its own sidetone speaker.
                  </li>
                  <li>
                    <strong className="text-amber-400">Local Only:</strong> Sidetone plays through your
                    speakers/headphones only. Zoom won't hear the tones.
                  </li>
                  <li>
                    <strong className="text-amber-400">Both:</strong> Sidetone goes to both Zoom and
                    your local speakers. Good for monitoring what you're sending.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === "troubleshooting" && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">First Launch & Security</h3>

              <details className="bg-yellow-900/30 border border-yellow-700 rounded-lg" open>
                <summary className="p-3 cursor-pointer hover:bg-yellow-900/50 rounded-lg font-medium text-yellow-400">
                  Windows: "Windows protected your PC" warning
                </summary>
                <div className="p-3 pt-0 text-sm text-gray-300 space-y-2">
                  <p className="text-xs text-gray-400">
                    This appears because the app isn't signed with an expensive certificate. It's safe to run.
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>When you see the blue "Windows protected your PC" screen, click <strong>"More info"</strong></li>
                    <li>Click the <strong>"Run anyway"</strong> button that appears</li>
                    <li>The app will now open normally</li>
                  </ol>
                  <p className="text-xs text-gray-400 mt-2">
                    You only need to do this once. Windows will remember your choice.
                  </p>
                </div>
              </details>

              <details className="bg-yellow-900/30 border border-yellow-700 rounded-lg">
                <summary className="p-3 cursor-pointer hover:bg-yellow-900/50 rounded-lg font-medium text-yellow-400">
                  macOS: "App can't be opened" or "unidentified developer"
                </summary>
                <div className="p-3 pt-0 text-sm text-gray-300 space-y-2">
                  <p className="text-xs text-gray-400">
                    macOS blocks apps that aren't from the App Store by default.
                  </p>
                  <p className="font-medium text-white mt-2">Method 1: System Settings (try this first)</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Try to open the app (it will be blocked)</li>
                    <li>Open <strong>System Settings → Privacy & Security</strong></li>
                    <li>Scroll down - you'll see a message about Vail Zoomer being blocked</li>
                    <li>Click <strong>"Open Anyway"</strong></li>
                    <li>Click <strong>"Open"</strong> in the confirmation dialog</li>
                  </ol>
                  <p className="font-medium text-white mt-3">Method 2: Terminal (if Method 1 doesn't work)</p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open Terminal (Cmd+Space, type "Terminal", press Enter)</li>
                    <li>Run this command:</li>
                  </ol>
                  <code className="block bg-black p-2 rounded text-green-400 text-sm mt-1">
                    xattr -cr /Applications/Vail\ Zoomer.app
                  </code>
                  <p className="text-xs text-gray-400 mt-2">
                    Then try opening the app again. You only need to do this once.
                  </p>
                </div>
              </details>

              <details className="bg-yellow-900/30 border border-yellow-700 rounded-lg">
                <summary className="p-3 cursor-pointer hover:bg-yellow-900/50 rounded-lg font-medium text-yellow-400">
                  Linux: AppImage won't run
                </summary>
                <div className="p-3 pt-0 text-sm text-gray-300 space-y-2">
                  <p className="text-xs text-gray-400">
                    Linux requires you to make the file executable first.
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open a terminal in your Downloads folder</li>
                    <li>Run these commands:</li>
                  </ol>
                  <code className="block bg-black p-2 rounded text-green-400 text-sm mt-1">
                    chmod +x vail-zoomer*.AppImage
                  </code>
                  <code className="block bg-black p-2 rounded text-green-400 text-sm mt-1">
                    ./vail-zoomer*.AppImage
                  </code>
                </div>
              </details>

              <h3 className="text-lg font-semibold text-white mt-6">Common Issues</h3>

              <details className="bg-gray-900 rounded-lg">
                <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg font-medium">
                  No sound in Zoom / video app
                </summary>
                <div className="p-3 pt-0 text-sm text-gray-300 space-y-2">
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Verify the virtual audio device is installed (check system Sound settings)</li>
                    <li>In Vail Zoomer, ensure "Output to Zoom" is set to the virtual device</li>
                    <li>In your video app, ensure the microphone is set to the virtual device's output</li>
                    <li>Check that volume sliders aren't at 0%</li>
                    <li>Try the "Test Dit/Dah" buttons to confirm audio is flowing</li>
                  </ol>
                </div>
              </details>

              <details className="bg-gray-900 rounded-lg">
                <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg font-medium">
                  MIDI device not detected
                </summary>
                <div className="p-3 pt-0 text-sm text-gray-300 space-y-2">
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Connect the keyer before launching Vail Zoomer</li>
                    <li>Try unplugging and reconnecting the USB cable</li>
                    <li>Check if other apps are using the MIDI device (close them first)</li>
                    <li>On Windows, check Device Manager for the device</li>
                    <li>On macOS, check Audio MIDI Setup utility</li>
                    <li>On Linux, run <code className="bg-gray-800 px-1 rounded">aconnect -l</code> to list MIDI devices</li>
                  </ol>
                </div>
              </details>

              <details className="bg-gray-900 rounded-lg">
                <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg font-medium">
                  Audio crackling or distorted
                </summary>
                <div className="p-3 pt-0 text-sm text-gray-300 space-y-2">
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Lower the sidetone and microphone volumes</li>
                    <li>Close other audio-intensive applications</li>
                    <li>Use wired headphones instead of Bluetooth</li>
                    <li>Check CPU usage - audio processing needs consistent resources</li>
                  </ol>
                </div>
              </details>

              <details className="bg-gray-900 rounded-lg">
                <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg font-medium">
                  Virtual audio device not appearing (Windows)
                </summary>
                <div className="p-3 pt-0 text-sm text-gray-300 space-y-2">
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Ensure you ran the installer as Administrator</li>
                    <li>Restart your computer after installation</li>
                    <li>Check Windows Security → Protection history for blocked items</li>
                    <li>Try reinstalling VB-Cable</li>
                  </ol>
                </div>
              </details>

              <details className="bg-gray-900 rounded-lg">
                <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg font-medium">
                  BlackHole blocked on macOS
                </summary>
                <div className="p-3 pt-0 text-sm text-gray-300 space-y-2">
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open <strong>System Settings → Privacy & Security</strong></li>
                    <li>Scroll down to find a message about BlackHole being blocked</li>
                    <li>Click <strong>"Allow"</strong></li>
                    <li>You may need to restart your Mac</li>
                  </ol>
                </div>
              </details>

              <details className="bg-gray-900 rounded-lg">
                <summary className="p-3 cursor-pointer hover:bg-gray-800 rounded-lg font-medium">
                  CW decoder not working correctly
                </summary>
                <div className="p-3 pt-0 text-sm text-gray-300 space-y-2">
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Ensure your keyer type matches your physical keyer</li>
                    <li>Try keying more consistently - the decoder adapts to your speed</li>
                    <li>Check that the MIDI connection indicator is green</li>
                    <li>If using an iambic keyer, verify the paddle mapping is correct (try "Swap Paddles" if dit/dah are reversed)</li>
                  </ol>
                </div>
              </details>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-700 text-center text-sm text-gray-500">
          Press <kbd className="bg-gray-700 px-2 py-0.5 rounded">Esc</kbd> or click outside to close
        </div>
      </div>
    </div>
  );
}

// Linux Virtual Audio Setup Banner Component
function LinuxAudioSetupBanner({
  status,
  onSetup,
  onDismiss,
  isSettingUp,
  result,
}: {
  status: VirtualAudioStatus;
  onSetup: () => void;
  onDismiss: () => void;
  isSettingUp: boolean;
  result: SetupResult | null;
}) {
  if (result?.success) {
    return (
      <div className="p-3 bg-green-900/50 border border-green-700 rounded-lg mb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-300">{result.message}</span>
          </div>
          <button
            onClick={onDismiss}
            className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (result && !result.success) {
    return (
      <div className="p-3 bg-red-900/50 border border-red-700 rounded-lg mb-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span className="text-red-300">Setup failed</span>
            </div>
            <p className="text-sm text-gray-400 mt-1">{result.message}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSetup}
              className="px-3 py-1 text-sm bg-amber-600 hover:bg-amber-500 rounded"
            >
              Retry
            </button>
            <button
              onClick={onDismiss}
              className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 bg-blue-900/50 border border-blue-700 rounded-lg mb-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-blue-300">Virtual audio device not found</span>
          </div>
          <p className="text-sm text-gray-400 mt-1">
            Vail Zoomer needs a virtual audio device to send audio to Zoom.
            Detected: <span className="text-amber-400">{status.audio_system}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded"
          >
            Later
          </button>
          <button
            onClick={onSetup}
            disabled={isSettingUp}
            className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 rounded flex items-center gap-2"
          >
            {isSettingUp ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Setting up...
              </>
            ) : (
              "Setup Virtual Audio"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [cwText, setCwText] = useState("");
  const [estimatedWpm, setEstimatedWpm] = useState(0);
  const [isKeyDown, setIsKeyDown] = useState(false);
  const [midiConnected, setMidiConnected] = useState(false);
  const [midiDevices, setMidiDevices] = useState<string[]>([]);
  const [selectedMidiDevice, setSelectedMidiDevice] = useState<string | null>(null);
  const [audioStarted, setAudioStarted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [currentOS, setCurrentOS] = useState<OSType>("windows");

  // Audio device state
  const [inputDevices, setInputDevices] = useState<DeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<DeviceInfo[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string | null>(null);
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string | null>(null);
  const [selectedLocalDevice, setSelectedLocalDevice] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);

  // Linux virtual audio setup state
  const [showLinuxAudioBanner, setShowLinuxAudioBanner] = useState(false);
  const [linuxAudioStatus, setLinuxAudioStatus] = useState<VirtualAudioStatus | null>(null);
  const [linuxSetupInProgress, setLinuxSetupInProgress] = useState(false);
  const [linuxSetupResult, setLinuxSetupResult] = useState<SetupResult | null>(null);

  // Settings state
  const [settings, setSettings] = useState<Settings>({
    keyer_type: "Straight",
    wpm: 18,
    dit_dah_ratio: 3.0,
    weighting: 0,
    swap_paddles: false,
    sidetone_frequency: 600,
    sidetone_volume: 0.5,
    local_sidetone_volume: 0.3,
    sidetone_route: "OutputOnly",
    mic_volume: 1.0,
    mix_mode: "AlwaysMix",
    local_output_device: null,
    midi_device: null,
    input_device: null,
    output_device: null,
    linux_audio_setup_completed: false,
  });

  // OS-specific device name helpers
  const getVirtualDeviceNames = (os: OSType) => {
    switch (os) {
      case "macos":
        return { output: "BlackHole 2ch", input: "BlackHole 2ch" };
      case "linux":
        return { output: "VailZoomer Sink", input: "VailZoomer Sink Monitor" };
      default:
        return { output: "CABLE Input", input: "CABLE Output" };
    }
  };

  const virtualDeviceNames = getVirtualDeviceNames(currentOS);

  // Initialize on mount
  useEffect(() => {
    const initialize = async () => {
      // Detect OS for platform-specific UI hints
      let detectedOS: OSType = "windows";
      try {
        const os = await platform();
        if (os === "macos") {
          detectedOS = "macos";
        } else if (os === "linux") {
          detectedOS = "linux";
        }
        setCurrentOS(detectedOS);
      } catch {
        // Default to windows if detection fails
      }

      // Load settings from backend first
      const savedSettings = await invoke<Settings>("get_settings");
      setSettings(savedSettings);

      // Set saved device selections
      setSelectedInputDevice(savedSettings.input_device);
      setSelectedOutputDevice(savedSettings.output_device);
      setSelectedLocalDevice(savedSettings.local_output_device);

      // List MIDI devices and connect to saved or auto-detect
      const midiDeviceList = await invoke<string[]>("list_midi_devices");
      setMidiDevices(midiDeviceList);

      // Try to connect to saved MIDI device, or auto-detect Vail
      const midiToConnect = savedSettings.midi_device || midiDeviceList.find(d =>
        d.toLowerCase().includes("vail") ||
        d.toLowerCase().includes("xiao") ||
        d.toLowerCase().includes("seeed")
      );
      if (midiToConnect && midiDeviceList.includes(midiToConnect)) {
        connectMidi(midiToConnect);
      }

      // List audio devices
      const [inputDeviceList, outputDeviceList] = await Promise.all([
        invoke<DeviceInfo[]>("list_input_devices"),
        invoke<DeviceInfo[]>("list_audio_devices"),
      ]);
      setInputDevices(inputDeviceList);
      setOutputDevices(outputDeviceList);

      // Start audio engine with saved devices
      try {
        await invoke("start_audio_with_devices", {
          outputDevice: savedSettings.output_device,
          inputDevice: savedSettings.input_device,
        });
        setAudioStarted(true);
      } catch (err) {
        console.error("Failed to start audio:", err);
      }

      // Check for Linux virtual audio device (Linux only)
      // Always check status on Linux so settings panel can show current state
      console.log("[init] Detected OS:", detectedOS);
      if (detectedOS === "linux") {
        try {
          console.log("[init] Checking Linux virtual audio...");
          const status = await invoke<VirtualAudioStatus>("check_linux_virtual_audio");
          console.log("[init] Linux audio status:", status);
          setLinuxAudioStatus(status);
          // Only show banner if device doesn't exist AND setup hasn't been completed/dismissed
          if (!status.exists && !savedSettings.linux_audio_setup_completed) {
            setShowLinuxAudioBanner(true);
          }
        } catch (err) {
          console.error("Failed to check Linux virtual audio:", err);
        }
      }
    };

    initialize();

    // Listen for CW decoder events from Rust backend
    const unlistenCw = listen<{ character: string; wpm: number }>("cw:decoded", (event) => {
      setCwText((prev) => prev + event.payload.character);
      setEstimatedWpm(event.payload.wpm);
    });

    // Listen for key state changes
    const unlistenKey = listen<{ down: boolean }>("cw:key", (event) => {
      setIsKeyDown(event.payload.down);
    });

    // Listen for MIDI connection status
    const unlistenMidi = listen<{ connected: boolean }>("midi:status", (event) => {
      setMidiConnected(event.payload.connected);
    });

    return () => {
      unlistenCw.then((f) => f());
      unlistenKey.then((f) => f());
      unlistenMidi.then((f) => f());
    };
  }, []);

  // Poll audio levels at ~30fps
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [mic, output] = await Promise.all([
          invoke<number>("get_mic_level"),
          invoke<number>("get_output_level"),
        ]);
        setMicLevel(mic);
        setOutputLevel(output);
      } catch (err) {
        // Ignore errors during polling
      }
    }, 33);

    return () => clearInterval(interval);
  }, []);

  const connectMidi = async (deviceName: string) => {
    try {
      await invoke("connect_midi_device", { deviceName });
      setSelectedMidiDevice(deviceName);
      setMidiConnected(true);
      // Save the MIDI device selection
      updateSettings({ midi_device: deviceName });
    } catch (err) {
      console.error("Failed to connect MIDI:", err);
      setMidiConnected(false);
    }
  };

  const clearText = () => setCwText("");

  // Restart audio with selected devices and save to settings
  const restartAudio = async (outputDevice: string | null, inputDevice: string | null) => {
    try {
      await invoke("stop_audio");
      await invoke("start_audio_with_devices", { outputDevice, inputDevice });
      setSelectedOutputDevice(outputDevice);
      setSelectedInputDevice(inputDevice);
      setAudioStarted(true);
      // Save device selections to settings
      updateSettings({ output_device: outputDevice, input_device: inputDevice });
    } catch (err) {
      console.error("Failed to restart audio:", err);
      setAudioStarted(false);
    }
  };

  // Update settings and sync to backend
  const updateSettings = async (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    try {
      await invoke("update_settings", { settings: updated });
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  // Test function to manually trigger sidetone (for debugging)
  const testTone = async (isDit: boolean) => {
    await invoke("key_down", { isDit });
    setTimeout(async () => {
      await invoke("key_up");
    }, isDit ? 100 : 300);
  };

  // Linux virtual audio setup handlers
  const handleLinuxAudioSetup = async () => {
    setLinuxSetupInProgress(true);
    setLinuxSetupResult(null);

    try {
      const result = await invoke<SetupResult>("setup_linux_virtual_audio");
      setLinuxSetupResult(result);

      if (result.success) {
        // Mark setup as completed so we don't prompt again
        await invoke("mark_linux_audio_setup_complete");

        // Refresh audio device list
        const outputDeviceList = await invoke<DeviceInfo[]>("list_audio_devices");
        setOutputDevices(outputDeviceList);
      }
    } catch (err) {
      setLinuxSetupResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLinuxSetupInProgress(false);
    }
  };

  const handleLinuxAudioDismiss = () => {
    setShowLinuxAudioBanner(false);
    setLinuxSetupResult(null);
  };

  // Level meter component
  const LevelMeter = ({ level, label }: { level: number; label: string }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <div className="h-3 bg-gray-900 rounded overflow-hidden">
        <div
          className={`h-full transition-all duration-75 ${
            level > 0.8 ? "bg-red-500" : level > 0.5 ? "bg-yellow-500" : "bg-green-500"
          }`}
          style={{ width: `${Math.min(level * 100, 100)}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <HelpModal isOpen={showHelp} onClose={() => setShowHelp(false)} />

      <header className="mb-3 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-amber-400">Vail Zoomer</h1>
          <p className="text-gray-400 text-sm">CW + Mic Audio Merger for Video Calls</p>
        </div>
        <button
          onClick={() => setShowHelp(true)}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm flex items-center gap-1.5"
          title="Help & Setup Guide"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Help
        </button>
      </header>

      {/* Linux Virtual Audio Setup Banner */}
      {currentOS === "linux" && showLinuxAudioBanner && linuxAudioStatus && (
        <LinuxAudioSetupBanner
          status={linuxAudioStatus}
          onSetup={handleLinuxAudioSetup}
          onDismiss={handleLinuxAudioDismiss}
          isSettingUp={linuxSetupInProgress}
          result={linuxSetupResult}
        />
      )}

      <main className="space-y-3">
        {/* Status Bar */}
        <div className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg">
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                midiConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-sm">
              MIDI: {midiConnected ? (selectedMidiDevice || "Connected") : "Disconnected"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                audioStarted ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-sm">Audio</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-3 h-3 rounded-full ${
                isKeyDown ? "bg-amber-400" : "bg-gray-600"
              }`}
            />
            <span className="text-sm">Key</span>
          </div>
          <div className="ml-auto text-lg font-mono">
            {estimatedWpm > 0 ? `${estimatedWpm.toFixed(1)} WPM` : "-- WPM"}
          </div>
        </div>

        {/* MIDI Device Selection - Always show if devices available */}
        {midiDevices.length > 0 && (
          <div className="p-3 bg-gray-800 rounded-lg">
            <h2 className="text-md font-semibold mb-2">MIDI Device</h2>
            <select
              value={selectedMidiDevice || ""}
              onChange={(e) => e.target.value && connectMidi(e.target.value)}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm"
            >
              <option value="">Select a MIDI device...</option>
              {midiDevices.map((device) => (
                <option key={device} value={device}>
                  {device}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* CW Decoder Display */}
        <div className="p-3 bg-gray-800 rounded-lg">
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-md font-semibold">Decoded CW</h2>
            <button
              onClick={clearText}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded"
            >
              Clear
            </button>
          </div>
          <div className="p-2 bg-black rounded font-mono text-lg min-h-[60px] break-words">
            {cwText || <span className="text-gray-600">Waiting for CW...</span>}
          </div>
        </div>

        {/* Keyer Settings */}
        <div className="p-3 bg-gray-800 rounded-lg">
          <h2 className="text-md font-semibold mb-2">Keyer Settings</h2>
          <div className="grid grid-cols-2 gap-3">
            {/* Keyer Type */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Keyer Type</label>
              <select
                value={settings.keyer_type}
                onChange={(e) => updateSettings({ keyer_type: e.target.value })}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm"
              >
                {KEYER_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* WPM - hidden for straight key */}
            {settings.keyer_type !== "Straight" && (
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  WPM: {settings.wpm}
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={settings.wpm}
                  onChange={(e) => updateSettings({ wpm: parseInt(e.target.value) })}
                  className="w-full"
                />
              </div>
            )}

            {/* Sidetone Frequency */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">
                Sidetone Frequency: {settings.sidetone_frequency} Hz
              </label>
              <input
                type="range"
                min="400"
                max="1000"
                step="10"
                value={settings.sidetone_frequency}
                onChange={(e) => updateSettings({ sidetone_frequency: parseInt(e.target.value) })}
                className="w-full"
              />
            </div>

            {/* Test Buttons */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">Test Sidetone</label>
              <div className="flex gap-2">
                <button
                  onMouseDown={() => testTone(true)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded text-sm"
                >
                  Dit
                </button>
                <button
                  onMouseDown={() => testTone(false)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded text-sm"
                >
                  Dah
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Audio Routing */}
        <div className="p-3 bg-gray-800 rounded-lg">
          <h2 className="text-md font-semibold mb-2">Audio Routing</h2>

          {/* Sidetone Routing */}
          <div className="mb-3">
            <label className="block text-sm text-gray-400 mb-1">Sidetone Routing</label>
            <select
              value={settings.sidetone_route}
              onChange={(e) => updateSettings({ sidetone_route: e.target.value })}
              className="w-full bg-gray-700 text-white px-3 py-2 rounded text-sm"
            >
              {SIDETONE_ROUTES.map((route) => (
                <option key={route.value} value={route.value}>
                  {route.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Choose where the computer-generated sidetone is heard. Use "Zoom Only" if your Vail adapter has its own sidetone.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Left column: Input */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-300">Microphone Input</h3>
              <select
                value={selectedInputDevice || ""}
                onChange={(e) => restartAudio(selectedOutputDevice, e.target.value || null)}
                className="w-full bg-gray-700 text-white px-2 py-1.5 rounded text-sm"
              >
                <option value="">System Default</option>
                {inputDevices.map((device) => (
                  <option key={device.internal_name} value={device.internal_name}>
                    {device.display_name}
                  </option>
                ))}
              </select>
              <div>
                <label className="block text-xs text-gray-400">
                  Volume: {Math.round(settings.mic_volume * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="150"
                  value={settings.mic_volume * 100}
                  onChange={(e) => updateSettings({ mic_volume: parseInt(e.target.value) / 100 })}
                  className="w-full"
                />
              </div>
              <LevelMeter level={micLevel} label="Input Level" />
            </div>

            {/* Right column: Output to Zoom */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-300">Output to Zoom ({virtualDeviceNames.output})</h3>
              <select
                value={selectedOutputDevice || ""}
                onChange={(e) => restartAudio(e.target.value || null, selectedInputDevice)}
                className="w-full bg-gray-700 text-white px-2 py-1.5 rounded text-sm"
              >
                <option value="">System Default</option>
                {outputDevices.map((device) => (
                  <option key={device.internal_name} value={device.internal_name}>
                    {device.display_name}
                  </option>
                ))}
              </select>
              <div>
                <label className="block text-xs text-gray-400">
                  Sidetone to Zoom: {Math.round(settings.sidetone_volume * 100)}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.sidetone_volume * 100}
                  onChange={(e) => updateSettings({ sidetone_volume: parseInt(e.target.value) / 100 })}
                  className="w-full"
                  disabled={settings.sidetone_route === "LocalOnly"}
                />
              </div>
              <LevelMeter level={outputLevel} label="Output Level" />
            </div>
          </div>

          {/* Local Monitoring Section */}
          {(settings.sidetone_route === "LocalOnly" || settings.sidetone_route === "Both") && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <h3 className="text-sm font-medium text-gray-300 mb-2">Local Sidetone Monitoring</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Local Output Device</label>
                  <select
                    value={selectedLocalDevice || ""}
                    onChange={(e) => {
                      setSelectedLocalDevice(e.target.value || null);
                      updateSettings({ local_output_device: e.target.value || null });
                    }}
                    className="w-full bg-gray-700 text-white px-2 py-1.5 rounded text-sm"
                  >
                    <option value="">System Default (Speakers/Headphones)</option>
                    {outputDevices.map((device) => (
                      <option key={device.internal_name} value={device.internal_name}>
                        {device.display_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400">
                    Local Volume: {Math.round(settings.local_sidetone_volume * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.local_sidetone_volume * 100}
                    onChange={(e) => updateSettings({ local_sidetone_volume: parseInt(e.target.value) / 100 })}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500 mt-2 text-right">
            Select "{virtualDeviceNames.output}" as output here, then "{virtualDeviceNames.input}" as microphone in Zoom.
          </p>

          {/* Linux Virtual Audio Setup - Always available on Linux */}
          {currentOS === "linux" && (
            <div className="mt-3 pt-3 border-t border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-gray-300">Linux Virtual Audio Setup</h3>
                  <p className="text-xs text-gray-500">
                    {linuxAudioStatus?.exists
                      ? "Virtual audio device found"
                      : linuxAudioStatus?.pactl_installed === false
                        ? "Will install required packages and create virtual audio device"
                        : "Create a virtual audio device for Zoom"}
                    {linuxAudioStatus?.audio_system && linuxAudioStatus.audio_system !== "Unknown" && (
                      <span className="ml-1">({linuxAudioStatus.audio_system})</span>
                    )}
                    {linuxAudioStatus?.pactl_installed === false && linuxAudioStatus?.audio_system === "Unknown" && (
                      <span className="ml-1 text-yellow-500">(detecting...)</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={handleLinuxAudioSetup}
                  disabled={linuxSetupInProgress}
                  className="px-3 py-1.5 text-sm bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 rounded flex items-center gap-2"
                >
                  {linuxSetupInProgress ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Setting up...
                    </>
                  ) : linuxAudioStatus?.exists ? (
                    "Reinstall"
                  ) : (
                    "Setup Now"
                  )}
                </button>
              </div>
              {linuxAudioStatus?.pactl_installed === false && !linuxSetupResult && (
                <p className="text-xs text-yellow-500 mt-1">
                  Setup will install pulseaudio-utils package (requires admin password)
                </p>
              )}
              {linuxSetupResult && (
                <div className={`mt-2 p-2 rounded text-sm ${linuxSetupResult.success ? "bg-green-900/30 text-green-300" : "bg-red-900/30 text-red-300"}`}>
                  {linuxSetupResult.message}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;

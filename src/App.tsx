import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

import { Step1KeyerSetup } from "./components/steps/Step1KeyerSetup";
import { Step2VirtualAudio } from "./components/steps/Step2VirtualAudio";
import { Step3AudioSetup } from "./components/steps/Step3AudioSetup";
import { Step4VideoAppTips } from "./components/steps/Step4VideoAppTips";
import { OperationalView } from "./components/main/OperationalView";
import { InfoBox } from "./components/shared/InfoBox";
import { BigButton } from "./components/shared/BigButton";

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
  mic_ducking: boolean;
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

type OSType = "windows" | "macos" | "linux";
type WizardStep = 1 | 2 | 3 | 4;
type AppMode = "wizard" | "main" | "video-tips";

// Local storage key for wizard completion - version specific
const WIZARD_VERSION = "v2";
const WIZARD_COMPLETE_KEY = `vail-zoomer-wizard-complete-${WIZARD_VERSION}`;

function App() {
  // App mode state
  const [appMode, setAppMode] = useState<AppMode>("wizard");
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);

  // Core state
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

  // Linux virtual audio setup state (kept for future use)
  const [_showLinuxAudioBanner, setShowLinuxAudioBanner] = useState(false);
  const [_linuxAudioStatus, setLinuxAudioStatus] = useState<VirtualAudioStatus | null>(null);

  // Update state
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);

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
    sidetone_route: "Both",
    mic_volume: 1.0,
    mix_mode: "AlwaysMix",
    mic_ducking: false,
    local_output_device: null,
    midi_device: null,
    input_device: null,
    output_device: null,
    linux_audio_setup_completed: false,
  });

  // Ref to track current settings synchronously (React state is async)
  const settingsRef = useRef<Settings>(settings);

  // Ref to track test tone timeout (for cancellation)
  const testToneTimeoutRef = useRef<number | null>(null);

  // Ref to track the user's saved mic volume (for restoring after wizard mute)
  const savedMicVolumeRef = useRef<number>(1.0);

  // Check if wizard was completed for this version
  useEffect(() => {
    const completed = localStorage.getItem(WIZARD_COMPLETE_KEY) === "true";
    if (completed) {
      setAppMode("main");
    }
  }, []);

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
      settingsRef.current = savedSettings;  // Update ref immediately (sync)
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
        d.toLowerCase().includes("seeed") ||
        d.toLowerCase().includes("samd21") ||
        d.toLowerCase().includes("qt py") ||
        d.toLowerCase().includes("qtpy")
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

        // Mute mic during wizard to prevent feedback until user is ready
        const wizardCompleted = localStorage.getItem(WIZARD_COMPLETE_KEY) === "true";
        if (!wizardCompleted) {
          // Save the user's mic volume preference so we can restore it later
          savedMicVolumeRef.current = savedSettings.mic_volume;
          // Mute at backend only (don't persist to settings file)
          await invoke("set_mic_volume", { volume: 0.0 });
        }
      } catch (err) {
        console.error("Failed to start audio:", err);
      }

      // Check for Linux virtual audio device (Linux only)
      if (detectedOS === "linux") {
        try {
          const status = await invoke<VirtualAudioStatus>("check_linux_virtual_audio");
          setLinuxAudioStatus(status);
          if (!status.exists && !savedSettings.linux_audio_setup_completed) {
            setShowLinuxAudioBanner(true);
          }
        } catch (err) {
          console.error("Failed to check Linux virtual audio:", err);
        }
      }

      // Check for updates (all platforms)
      try {
        const update = await check();
        if (update) {
          console.log(`Update available: ${update.version}`);
          setUpdateAvailable(update);
        }
      } catch (err) {
        console.error("Failed to check for updates:", err);
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
      } catch {
        // Ignore errors during polling
      }
    }, 33);

    return () => clearInterval(interval);
  }, []);

  // Poll MIDI devices to detect plug/unplug
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const devices = await invoke<string[]>("list_midi_devices");
        setMidiDevices(devices);

        // If our selected device is no longer available, mark as disconnected
        if (selectedMidiDevice && !devices.includes(selectedMidiDevice)) {
          setMidiConnected(false);
          setSelectedMidiDevice(null);
        }

        // Auto-connect if not connected and a Vail device appears
        if (!midiConnected && devices.length > 0) {
          // First try the saved device from settings
          const savedDevice = settings.midi_device;
          if (savedDevice && devices.includes(savedDevice)) {
            connectMidi(savedDevice);
          } else {
            // Otherwise auto-detect Vail adapter
            const vailDevice = devices.find(d =>
              d.toLowerCase().includes("vail") ||
              d.toLowerCase().includes("xiao") ||
              d.toLowerCase().includes("seeed") ||
              d.toLowerCase().includes("samd21") ||
              d.toLowerCase().includes("qt py") ||
              d.toLowerCase().includes("qtpy")
            );
            if (vailDevice) {
              connectMidi(vailDevice);
            }
          }
        }
      } catch {
        // Ignore errors during polling
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [selectedMidiDevice, midiConnected, settings.midi_device]);

  const connectMidi = async (deviceName: string) => {
    try {
      await invoke("connect_midi_device", { deviceName });
      setSelectedMidiDevice(deviceName);
      setMidiConnected(true);
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
      updateSettings({ output_device: outputDevice, input_device: inputDevice });
    } catch (err) {
      console.error("Failed to restart audio:", err);
      setAudioStarted(false);
    }
  };

  // Update settings and sync to backend
  // Uses settingsRef to ensure we always have the latest values (React state is async)
  const updateSettings = async (newSettings: Partial<Settings>) => {
    const updated = { ...settingsRef.current, ...newSettings };
    settingsRef.current = updated;
    setSettings(updated);
    try {
      await invoke("update_settings", { settings: updated });
    } catch (err) {
      console.error("Failed to update settings:", err);
    }
  };

  // Test function to manually trigger sidetone
  // Temporarily switches to "Both" routing if needed so user can hear the tone
  const testTone = async (isDit: boolean) => {
    // Cancel any pending timeout from previous test tone
    if (testToneTimeoutRef.current !== null) {
      clearTimeout(testToneTimeoutRef.current);
      testToneTimeoutRef.current = null;
    }

    const originalRoute = settings.sidetone_route;
    const needsLocalAudio = originalRoute === "OutputOnly";

    // Temporarily enable local audio if only outputting to Zoom
    if (needsLocalAudio) {
      await invoke("update_settings", {
        settings: { ...settings, sidetone_route: "Both" }
      });
    }

    await invoke("key_down", { isDit });
    testToneTimeoutRef.current = window.setTimeout(async () => {
      testToneTimeoutRef.current = null;
      await invoke("key_up");
      // Restore original setting after tone finishes
      if (needsLocalAudio) {
        await invoke("update_settings", {
          settings: { ...settings, sidetone_route: originalRoute }
        });
      }
    }, isDit ? 100 : 300);
  };

  // Complete the wizard
  const completeWizard = () => {
    localStorage.setItem(WIZARD_COMPLETE_KEY, "true");
    setCwText(""); // Clear any decoded text from testing during wizard
    setAppMode("main");
  };

  // Update handlers
  const handleInstallUpdate = async () => {
    if (!updateAvailable) return;
    setIsInstallingUpdate(true);
    try {
      await updateAvailable.downloadAndInstall();
      await relaunch();
    } catch (err) {
      console.error("Failed to install update:", err);
      setIsInstallingUpdate(false);
    }
  };

  // Update banner component
  const UpdateBanner = () => {
    if (!updateAvailable) return null;
    return (
      <div className="fixed top-0 left-0 right-0 p-3 bg-green-900/90 border-b border-green-700 z-50">
        <div className="flex items-center justify-center gap-4">
          <span className="text-green-300 text-lg">
            Update Available: v{updateAvailable.version}
          </span>
          <BigButton
            variant="success"
            onClick={handleInstallUpdate}
            disabled={isInstallingUpdate}
            className="!min-h-0 !py-2 !px-4 !text-base"
          >
            {isInstallingUpdate ? "Installing..." : "Install & Restart"}
          </BigButton>
          <button
            onClick={() => setUpdateAvailable(null)}
            className="text-green-400 hover:text-white"
          >
            Later
          </button>
        </div>
      </div>
    );
  };

  // Setup Linux virtual audio
  const setupLinuxAudio = async () => {
    await invoke("setup_linux_virtual_audio");
    updateSettings({ linux_audio_setup_completed: true });
  };

  // Render based on app mode
  if (appMode === "wizard") {
    return (
      <>
        <UpdateBanner />
        {wizardStep === 1 && (
          <Step1KeyerSetup
            midiDevices={midiDevices}
            selectedMidiDevice={selectedMidiDevice}
            keyerType={settings.keyer_type}
            wpm={settings.wpm}
            sidetoneFrequency={settings.sidetone_frequency}
            midiConnected={midiConnected}
            isKeyDown={isKeyDown}
            onSelectMidiDevice={connectMidi}
            onKeyerTypeChange={(type) => updateSettings({ keyer_type: type })}
            onWpmChange={(wpm) => updateSettings({ wpm })}
            onSidetoneFrequencyChange={(freq) => updateSettings({ sidetone_frequency: freq })}
            onTestDit={() => testTone(true)}
            onTestDah={() => testTone(false)}
            onNext={() => setWizardStep(2)}
          />
        )}
        {wizardStep === 2 && (
          <Step2VirtualAudio
            currentOS={currentOS}
            onBack={() => setWizardStep(1)}
            onNext={() => setWizardStep(3)}
            onSetupLinuxAudio={currentOS === "linux" ? setupLinuxAudio : undefined}
          />
        )}
        {wizardStep === 3 && (
          <Step3AudioSetup
            inputDevices={inputDevices}
            outputDevices={outputDevices}
            selectedInputDevice={selectedInputDevice}
            selectedOutputDevice={selectedOutputDevice}
            selectedLocalDevice={selectedLocalDevice}
            sidetoneRoute={settings.sidetone_route}
            micLevel={micLevel}
            micVolume={settings.mic_volume}
            currentOS={currentOS}
            onInputDeviceChange={(device) => restartAudio(selectedOutputDevice, device)}
            onOutputDeviceChange={(device) => restartAudio(device, selectedInputDevice)}
            onLocalDeviceChange={(device) => {
              setSelectedLocalDevice(device);
              updateSettings({ local_output_device: device });
            }}
            onSidetoneRouteChange={(route) => updateSettings({ sidetone_route: route })}
            onMicVolumeChange={(vol) => updateSettings({ mic_volume: vol })}
            onTestTone={() => testTone(true)}
            onBack={() => setWizardStep(2)}
            onNext={() => setWizardStep(4)}
          />
        )}
        {wizardStep === 4 && (
          <Step4VideoAppTips
            onBack={() => setWizardStep(3)}
            onComplete={completeWizard}
            currentOS={currentOS}
          />
        )}
      </>
    );
  }

  if (appMode === "video-tips") {
    return (
      <>
        <UpdateBanner />
        <Step4VideoAppTips
          onBack={() => setAppMode("main")}
          onComplete={() => setAppMode("main")}
          currentOS={currentOS}
        />
      </>
    );
  }

  // Main operational view
  return (
    <>
      <UpdateBanner />
      <OperationalView
        midiConnected={midiConnected}
        audioStarted={audioStarted}
        isKeyDown={isKeyDown}
        estimatedWpm={estimatedWpm}
        cwText={cwText}
        onClearCwText={clearText}
        keyerType={settings.keyer_type}
        wpm={settings.wpm}
        sidetoneFrequency={settings.sidetone_frequency}
        sidetoneVolume={settings.sidetone_volume}
        micVolume={settings.mic_volume}
        micDucking={settings.mic_ducking}
        outputLevel={outputLevel}
        onKeyerTypeChange={(type) => updateSettings({ keyer_type: type })}
        onWpmChange={(wpm) => updateSettings({ wpm })}
        onSidetoneFrequencyChange={(freq) => updateSettings({ sidetone_frequency: freq })}
        onSidetoneVolumeChange={(vol) => updateSettings({ sidetone_volume: vol })}
        onMicVolumeChange={(vol) => updateSettings({ mic_volume: vol })}
        onMicDuckingChange={(enabled) => updateSettings({ mic_ducking: enabled })}
        onTestDit={() => testTone(true)}
        onTestDah={() => testTone(false)}
        onOpenVideoTips={() => setAppMode("video-tips")}
        onOpenSettings={() => {
          // Reset wizard completion to re-run setup
          localStorage.removeItem(WIZARD_COMPLETE_KEY);
          setWizardStep(1);
          setAppMode("wizard");
        }}
        onOpenHelp={() => setShowHelp(true)}
      />

      {/* Help Modal - reuse existing help content or create new */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-xl max-w-lg w-full p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-amber-400">Help</h2>
              <button
                onClick={() => setShowHelp(false)}
                className="text-gray-400 hover:text-white text-3xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="space-y-4 text-lg text-gray-300">
              <p>
                <strong className="text-white">Vail Zoomer</strong> lets you send Morse code
                during video calls by mixing your microphone with computer-generated sidetone.
              </p>
              <div className="space-y-2">
                <p className="font-medium text-white">Quick Tips:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Use <strong>Test Dit/Dah</strong> to verify audio is working</li>
                  <li>Adjust <strong>Speed</strong> and <strong>Tone</strong> to your preference</li>
                  <li>Click <strong>Video App Tips</strong> for Zoom/Teams setup help</li>
                </ul>
              </div>
              <InfoBox variant="info">
                <p>
                  Click the <strong>Settings</strong> button (gear icon) to run the setup wizard again.
                </p>
              </InfoBox>
            </div>
            <div className="mt-6 flex justify-end">
              <BigButton onClick={() => setShowHelp(false)} className="!min-h-0 !py-3">
                Got it!
              </BigButton>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;

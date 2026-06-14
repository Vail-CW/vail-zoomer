import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { platform } from "@tauri-apps/plugin-os";
import { check, Update } from "@tauri-apps/plugin-updater";

import { Step1KeyerSetup } from "./components/steps/Step1KeyerSetup";
import { Step2VirtualAudio } from "./components/steps/Step2VirtualAudio";
import { Step3AudioSetup } from "./components/steps/Step3AudioSetup";
import { Step4VideoAppTips } from "./components/steps/Step4VideoAppTips";
import { OperationalView } from "./components/main/OperationalView";
import { SettingsSheet } from "./components/main/SettingsSheet";
import { HelpModal } from "./components/main/HelpModal";
import { TroubleshootingModal } from "./components/main/TroubleshootingModal";
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
  ui_scale: number;
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
  log: string[];
  devices_created: string[];
}

type OSType = "windows" | "macos" | "linux";
type WizardStep = 1 | 2 | 3 | 4;
type AppMode = "wizard" | "main" | "video-tips";

// Local storage key for wizard completion - version specific.
// Bump this whenever the setup/wizard semantics change in a way that may have
// left earlier users with a mangled audio configuration (orphan PulseAudio
// modules, stale device picks, etc.). Anyone whose stored key is older will
// be sent through the wizard once on next launch so Step 2's setup script
// can sweep the slate clean.
const WIZARD_VERSION = "v3";
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
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
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
  const [linuxSetupLog, setLinuxSetupLog] = useState<string[]>([]);
  const [linuxSetupInProgress, setLinuxSetupInProgress] = useState(false);
  const [linuxSetupError, setLinuxSetupError] = useState<string | null>(null);
  const [linuxSetupComplete, setLinuxSetupComplete] = useState(false);
  const [linuxMissingPkgs, setLinuxMissingPkgs] = useState<string[]>([]);
  const [linuxInstallInProgress, setLinuxInstallInProgress] = useState(false);

  // Update state
  const [updateAvailable, setUpdateAvailable] = useState<Update | null>(null);

  // Test recording state
  type TestRecordingState = "idle" | "recording" | "playing";
  const [testRecordingState, setTestRecordingState] = useState<TestRecordingState>("idle");
  const [testRecordingCountdown, setTestRecordingCountdown] = useState(5);
  const [testPlaybackProgress, setTestPlaybackProgress] = useState(0);
  const testRecordingIntervalRef = useRef<number | null>(null);

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
    ui_scale: 1.0,
  });

  // Ref to track current settings synchronously (React state is async)
  const settingsRef = useRef<Settings>(settings);

  // Apply the user's UI scale by adjusting the root font size. Tailwind's text
  // and spacing are rem-based, so this enlarges the whole interface uniformly
  // without breaking the fixed-height layout. Clamped to a sane range.
  useEffect(() => {
    const scale = Math.min(1.5, Math.max(1, settings.ui_scale || 1));
    document.documentElement.style.fontSize = `${16 * scale}px`;
  }, [settings.ui_scale]);


  // Ref to track the user's saved mic volume (for restoring after wizard mute)
  const savedMicVolumeRef = useRef<number>(1.0);

  // Check if wizard was completed for this version
  // On Linux, the virtual audio modules are now re-loaded on every login by the
  // user systemd unit installed in Step 2, so the wizard only needs to run again
  // if those modules are missing (fresh install, autostart disabled, etc.).
  useEffect(() => {
    const checkWizardCompletion = async () => {
      const completed = localStorage.getItem(WIZARD_COMPLETE_KEY) === "true";
      if (!completed) return;

      try {
        const os = await platform();
        if (os === "linux") {
          // Skip the wizard only if the virtual audio sink is already loaded.
          // Otherwise we still need Step 2 to recreate it.
          try {
            const status = await invoke<VirtualAudioStatus>("check_linux_virtual_audio");
            if (status.exists) {
              setAppMode("main");
            }
          } catch {
            // Couldn't query — leave in wizard so Step 2 can sort it out.
          }
          return;
        }
        // Non-Linux: localStorage flag is sufficient.
        setAppMode("main");
      } catch {
        // On platform-detect error, default to skipping wizard if it was completed
        setAppMode("main");
      }
    };

    checkWizardCompletion();
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

      // Restore the user's saved mic if it's still present, but never auto-pick
      // one for them — the user chooses their microphone explicitly in Step 3.
      // Virtual devices (VailZoomer/BlackHole/VB-Cable) are routing endpoints,
      // not mics, so they can never be the saved input either.
      const realInputs = inputDeviceList.filter((d) => {
        const n = (d.internal_name + " " + d.display_name).toLowerCase();
        return !n.includes("vailzoomer") && !n.includes("vail zoomer")
          && !n.includes("blackhole")
          && !n.includes("cable") && !n.includes("vb-audio");
      });
      const savedInputStillValid = savedSettings.input_device
        && realInputs.some((d) => d.internal_name === savedSettings.input_device);
      if (!savedInputStillValid) {
        // Saved mic is gone this session (or none saved): leave nothing
        // selected so the picker shows "Choose a microphone…" instead of
        // silently grabbing a device the user didn't pick. We keep the saved
        // name on disk untouched so it auto-restores if the device returns.
        setSelectedInputDevice(null);
      }

      // On macOS, auto-detect BlackHole and set it as the output device
      // (similar to how Linux auto-detects VailZoomer)
      if (detectedOS === "macos") {
        const blackHoleDevice = outputDeviceList.find(d =>
          d.internal_name.toLowerCase().includes("blackhole") ||
          d.display_name.toLowerCase().includes("blackhole")
        );
        if (blackHoleDevice && savedSettings.output_device !== blackHoleDevice.internal_name) {
          console.log("[audio] Auto-selecting BlackHole as output device:", blackHoleDevice.display_name);
          savedSettings.output_device = blackHoleDevice.internal_name;
          setSelectedOutputDevice(blackHoleDevice.internal_name);
          updateSettings({ output_device: blackHoleDevice.internal_name });
        }
      }

      // On Windows, auto-detect VB-Audio Cable. Without this, a fresh install
      // has no UI path to select it during the wizard and the user ends up
      // routing morse to their speakers instead of to Zoom.
      if (detectedOS === "windows") {
        const cableDevice = outputDeviceList.find(d => {
          const i = d.internal_name.toLowerCase();
          const n = d.display_name.toLowerCase();
          return i.includes("cable input") || n.includes("cable input")
            || (i.includes("cable") && i.includes("vb-audio"))
            || (n.includes("cable") && n.includes("vb-audio"));
        });
        if (cableDevice && savedSettings.output_device !== cableDevice.internal_name) {
          console.log("[audio] Auto-selecting VB-Cable as output device:", cableDevice.display_name);
          savedSettings.output_device = cableDevice.internal_name;
          setSelectedOutputDevice(cableDevice.internal_name);
          updateSettings({ output_device: cableDevice.internal_name });
        }
      }

      // On Linux, check if VailZoomer exists - if not, mute mic to prevent echo
      // and clear stale settings. With the persistent systemd-user-unit setup
      // devices should normally be present every launch, but they can still be
      // absent on first run, after an explicit removal, or if the unit didn't
      // start (e.g. fresh login on a system that needs a reboot).
      if (detectedOS === "linux") {
        const vailZoomerExists = outputDeviceList.some(d =>
          d.internal_name === "VailZoomer" ||
          d.display_name.includes("VailZoomer") ||
          d.display_name.includes("Vail Zoomer")
        );

        if (!vailZoomerExists) {
          const outputWasVailZoomer = savedSettings.output_device?.toLowerCase().includes("vailzoomer");
          if (savedSettings.linux_audio_setup_completed || outputWasVailZoomer) {
            console.log("[audio] VailZoomer not found, resetting Linux audio settings");
            savedSettings.linux_audio_setup_completed = false;
            if (outputWasVailZoomer) {
              savedSettings.output_device = null;
            }
            updateSettings({
              linux_audio_setup_completed: false,
              output_device: outputWasVailZoomer ? null : savedSettings.output_device,
            });
          }

          if (savedSettings.mic_volume > 0) {
            // Mute mic until auto setup is done to prevent feedback echo
            console.log("[audio] VailZoomer not found, muting mic to prevent echo");
            await invoke("set_mic_volume", { volume: 0.0 });
            updateSettings({ mic_volume: 0.0 });
          }
        }
      }

      // On Linux, ensure the virtual devices exist BEFORE we try to open any
      // audio streams. Opening a stream against a non-existent sink (e.g. saved
      // output_device="VailZoomer" but devices not yet loaded) puts cpal /
      // pipewire-pulse in a confused state and the subsequent pactl
      // load-module call has been observed to fail until retry.
      if (detectedOS === "linux") {
        try {
          const status = await invoke<VirtualAudioStatus>("check_linux_virtual_audio");
          setLinuxAudioStatus(status);
          if (status.exists) {
            // Sink already loaded from a previous run — don't re-run setup_linux_virtual_audio
            // when the user lands on Step 2, since reloading the PulseAudio module
            // briefly redirects sidetone to default speakers and causes a feedback pop.
            setLinuxSetupComplete(true);
          } else {
            const missing = await invoke<string[]>("list_linux_missing_prerequisites").catch(() => [] as string[]);
            setLinuxMissingPkgs(missing);
            if (missing.length > 0) {
              setShowLinuxAudioBanner(true);
              try {
                await installLinuxAudioPrereqs();
              } catch (e) {
                console.error("Auto-install of audio prereqs failed:", e);
              }
            } else {
              try {
                await setupLinuxAudio();
              } catch (e) {
                console.error("Auto-setup of virtual audio failed:", e);
                setShowLinuxAudioBanner(true);
              }
            }
          }
        } catch (err) {
          console.error("Failed to check Linux virtual audio:", err);
        }
      }

      // Start audio engine with saved devices (including local sidetone device)
      try {
        await invoke("start_audio_with_all_devices", {
          outputDevice: savedSettings.output_device,
          inputDevice: savedSettings.input_device,
          localDevice: savedSettings.local_output_device,
        });
        setAudioStarted(true);

        // Mute mic during wizard to prevent feedback until user is ready
        const wizardCompleted = localStorage.getItem(WIZARD_COMPLETE_KEY) === "true";
        if (!wizardCompleted) {
          // Save the user's mic volume preference so we can restore it later
          savedMicVolumeRef.current = savedSettings.mic_volume;
          // Mute at backend and update UI so slider shows muted state
          await invoke("set_mic_volume", { volume: 0.0 });
          setSettings(prev => ({ ...prev, mic_volume: 0.0 }));
          settingsRef.current = { ...settingsRef.current, mic_volume: 0.0 };
        }
      } catch (err) {
        console.error("Failed to start audio:", err);
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

  // Poll audio levels at ~10fps (100ms) - lower frequency to reduce IPC pressure on macOS
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
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Poll audio devices to detect plug/unplug (e.g. Bluetooth headphones)
  // Also auto-restart audio when the device list changes so streams use the correct device/sample rate
  const prevInputDevicesRef = useRef<string>("");
  const prevOutputDevicesRef = useRef<string>("");
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const [newInputDevices, newOutputDevices] = await Promise.all([
          invoke<DeviceInfo[]>("list_input_devices"),
          invoke<DeviceInfo[]>("list_audio_devices"),
        ]);

        // Build a comparable string of device names
        const newInputKey = newInputDevices.map(d => d.internal_name).sort().join("|");
        const newOutputKey = newOutputDevices.map(d => d.internal_name).sort().join("|");

        const inputChanged = prevInputDevicesRef.current !== "" && prevInputDevicesRef.current !== newInputKey;
        const outputChanged = prevOutputDevicesRef.current !== "" && prevOutputDevicesRef.current !== newOutputKey;

        prevInputDevicesRef.current = newInputKey;
        prevOutputDevicesRef.current = newOutputKey;

        // Always update the device lists so the UI shows current devices
        setInputDevices(newInputDevices);
        setOutputDevices(newOutputDevices);

        // If devices changed and audio is running, restart audio to pick up new default device
        if ((inputChanged || outputChanged) && audioStarted) {
          console.log("[audio] Device list changed, restarting audio...");
          const savedMicVol = settingsRef.current.mic_volume;
          const savedSidetoneVol = settingsRef.current.sidetone_volume;
          try {
            await invoke("set_mic_volume", { volume: 0 }).catch(() => {});
            await invoke("set_sidetone_volume", { volume: 0 }).catch(() => {});
            await invoke("stop_audio");
            // Give CoreAudio time to fully release the device before re-opening
            await new Promise(resolve => setTimeout(resolve, 500));
            await invoke("start_audio_with_all_devices", {
              outputDevice: selectedOutputDevice,
              inputDevice: selectedInputDevice,
              localDevice: selectedLocalDevice,
            });
          } catch (err) {
            console.error("[audio] Failed to restart audio after device change:", err);
          } finally {
            await new Promise(resolve => setTimeout(resolve, 150));
            await invoke("set_mic_volume", { volume: savedMicVol }).catch(() => {});
            await invoke("set_sidetone_volume", { volume: savedSidetoneVol }).catch(() => {});
          }
        }
      } catch {
        // Ignore errors during polling
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [audioStarted, selectedOutputDevice, selectedInputDevice, selectedLocalDevice]);

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

  // Test recording handlers
  const startTestRecording = async () => {
    try {
      await invoke("start_test_recording");
      setTestRecordingState("recording");
      setTestRecordingCountdown(5);

      // Start countdown
      testRecordingIntervalRef.current = window.setInterval(async () => {
        setTestRecordingCountdown((prev) => {
          if (prev <= 1) {
            // Stop recording when countdown reaches 0
            stopTestRecording();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Failed to start test recording:", err);
    }
  };

  const stopTestRecording = async () => {
    // Clear the countdown interval
    if (testRecordingIntervalRef.current) {
      clearInterval(testRecordingIntervalRef.current);
      testRecordingIntervalRef.current = null;
    }

    try {
      await invoke("stop_test_recording");
      // Automatically start playback
      await playTestRecording();
    } catch (err) {
      console.error("Failed to stop test recording:", err);
      setTestRecordingState("idle");
    }
  };

  const playTestRecording = async () => {
    try {
      await invoke("play_test_recording", { localDevice: selectedLocalDevice });
      setTestRecordingState("playing");
      setTestPlaybackProgress(0);

      // Poll for playback progress.
      // IMPORTANT: capture the interval ID in a closure-local so the poll only
      // clears ITSELF, not whatever else might have been written to the shared
      // ref (e.g. a later record-cycle's countdown interval).
      let pollId: number = 0;
      pollId = window.setInterval(async () => {
        try {
          const state = await invoke<{
            is_recording: boolean;
            is_playing: boolean;
            samples_recorded: number;
            sample_rate: number;
            duration_seconds: number;
            playback_progress: number;
          }>("get_test_recording_state");

          setTestPlaybackProgress(state.playback_progress);

          if (!state.is_playing) {
            clearInterval(pollId);
            if (testRecordingIntervalRef.current === pollId) {
              testRecordingIntervalRef.current = null;
            }
            // Only fall back to idle if we're still showing playback —
            // never clobber a fresh "recording" state from a subsequent click.
            setTestRecordingState((prev) => (prev === "playing" ? "idle" : prev));
          }
        } catch (err) {
          console.error("Failed to get test recording state:", err);
        }
      }, 100);
      testRecordingIntervalRef.current = pollId;
    } catch (err) {
      console.error("Failed to play test recording:", err);
      setTestRecordingState("idle");
    }
  };

  const stopTestPlayback = async () => {
    if (testRecordingIntervalRef.current) {
      clearInterval(testRecordingIntervalRef.current);
      testRecordingIntervalRef.current = null;
    }

    try {
      await invoke("stop_test_playback");
    } catch (err) {
      console.error("Failed to stop test playback:", err);
    }
    setTestRecordingState("idle");
  };

  // Restart audio with selected devices and save to settings
  const restartAudio = async (
    outputDevice: string | null,
    inputDevice: string | null,
    localDevice?: string | null
  ) => {
    // Mute mic + sidetone across the swap so the brief window when the engine
    // is between devices can't produce an acoustic feedback loop (mic →
    // default speakers while the virtual cable is briefly absent).
    const savedMicVol = settingsRef.current.mic_volume;
    const savedSidetoneVol = settingsRef.current.sidetone_volume;
    try {
      await invoke("set_mic_volume", { volume: 0 }).catch(() => {});
      await invoke("set_sidetone_volume", { volume: 0 }).catch(() => {});
      await invoke("stop_audio");
      // Give CoreAudio time to fully release the device before re-opening
      await new Promise(resolve => setTimeout(resolve, 500));
      // Use localDevice if provided, otherwise fall back to current selectedLocalDevice
      const effectiveLocalDevice = localDevice !== undefined ? localDevice : selectedLocalDevice;
      await invoke("start_audio_with_all_devices", {
        outputDevice,
        inputDevice,
        localDevice: effectiveLocalDevice,
      });
      setSelectedOutputDevice(outputDevice);
      setSelectedInputDevice(inputDevice);
      setAudioStarted(true);
      updateSettings({ output_device: outputDevice, input_device: inputDevice });
    } catch (err) {
      console.error("Failed to restart audio:", err);
      setAudioStarted(false);
    } finally {
      // Settle for one render cycle, then restore the user's volumes.
      await new Promise(resolve => setTimeout(resolve, 150));
      await invoke("set_mic_volume", { volume: savedMicVol }).catch(() => {});
      await invoke("set_sidetone_volume", { volume: savedSidetoneVol }).catch(() => {});
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

  // Complete the wizard
  const completeWizard = async () => {
    localStorage.setItem(WIZARD_COMPLETE_KEY, "true");
    setCwText(""); // Clear any decoded text from testing during wizard

    // Restore mic volume if it was muted during wizard and user didn't adjust it
    const currentMicVol = settingsRef.current.mic_volume;
    if (currentMicVol === 0 && savedMicVolumeRef.current > 0) {
      await updateSettings({ mic_volume: savedMicVolumeRef.current });
    }

    setAppMode("main");
  };

  // In-app install is disabled while the updater pipeline is being fixed.
  // Direct users to the GitHub releases page to download manually.
  const RELEASES_URL = "https://github.com/Vail-CW/vail-zoomer/releases/latest";

  const handleOpenReleases = async () => {
    try {
      await invoke("plugin:shell|open", { path: RELEASES_URL });
    } catch (err) {
      console.error("Failed to open releases page:", err);
      window.open(RELEASES_URL, "_blank");
    }
  };

  // Update banner component
  const UpdateBanner = () => {
    if (!updateAvailable) return null;
    return (
      <div className="fixed top-0 left-0 right-0 p-3 bg-green-900/90 border-b border-green-700 z-50">
        <div className="flex items-center justify-center gap-4">
          <span className="text-green-300 text-lg">
            Update Available: v{updateAvailable.version} — download from GitHub
          </span>
          <BigButton
            variant="success"
            onClick={handleOpenReleases}
            className="!min-h-0 !py-2 !px-4 !text-base"
          >
            Open Releases Page
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

  // Re-query backend device lists. Used whenever a device picker opens and
  // on window focus, so freshly connected Bluetooth/USB hardware shows up
  // without forcing the user to restart the app.
  const refreshDeviceLists = async () => {
    try {
      const [inputDeviceList, outputDeviceList] = await Promise.all([
        invoke<DeviceInfo[]>("list_input_devices"),
        invoke<DeviceInfo[]>("list_audio_devices"),
      ]);
      setInputDevices(inputDeviceList);
      setOutputDevices(outputDeviceList);
    } catch (err) {
      console.error("Failed to refresh device lists:", err);
    }
  };

  // Refresh device lists when the user switches back to the app — handles the
  // "I just connected my BT headphones, alt-tabbed back" case.
  useEffect(() => {
    const onFocus = () => { void refreshDeviceLists(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Setup Linux virtual audio
  const setupLinuxAudio = async () => {
    setLinuxSetupInProgress(true);
    setLinuxSetupError(null);
    setLinuxSetupLog(["Starting virtual audio setup..."]);

    try {
      // Run the setup and get verbose result
      const result = await invoke<SetupResult>("setup_linux_virtual_audio");
      setLinuxSetupLog(result.log);

      if (!result.success) {
        setLinuxSetupError(result.message);
        return;
      }

      // Refresh device lists to include newly created VailZoomer devices
      setLinuxSetupLog(prev => [...prev, "Refreshing device lists..."]);
      const [inputDeviceList, outputDeviceList] = await Promise.all([
        invoke<DeviceInfo[]>("list_input_devices"),
        invoke<DeviceInfo[]>("list_audio_devices"),
      ]);
      setInputDevices(inputDeviceList);
      setOutputDevices(outputDeviceList);

      // Auto-select VailZoomer as output device
      const vailZoomerDevice = outputDeviceList.find(d =>
        d.internal_name === "VailZoomer" ||
        d.display_name.includes("VailZoomer") ||
        d.display_name.includes("Vail Zoomer")
      );

      if (vailZoomerDevice) {
        setLinuxSetupLog(prev => [...prev, `✓ Found VailZoomer device: ${vailZoomerDevice.display_name}`]);
        setSelectedOutputDevice(vailZoomerDevice.internal_name);

        // Unmute mic now that VailZoomer is set up (prevents feedback echo)
        const newMicVolume = settings.mic_volume === 0 ? 1.0 : settings.mic_volume;
        await invoke("set_mic_volume", { volume: newMicVolume });

        updateSettings({
          linux_audio_setup_completed: true,
          output_device: vailZoomerDevice.internal_name,
          mic_volume: newMicVolume
        });

        // Restart audio with the new VailZoomer device to ensure proper initialization
        setLinuxSetupLog(prev => [...prev, "Initializing audio routing..."]);
        const savedSidetoneVol = settingsRef.current.sidetone_volume;
        try {
          await invoke("set_mic_volume", { volume: 0 }).catch(() => {});
          await invoke("set_sidetone_volume", { volume: 0 }).catch(() => {});
          await invoke("stop_audio");
          await invoke("start_audio_with_all_devices", {
            outputDevice: vailZoomerDevice.internal_name,
            inputDevice: selectedInputDevice,
            localDevice: selectedLocalDevice,
          });
          setLinuxSetupLog(prev => [...prev, "✓ Audio routing active"]);
        } catch (err) {
          console.error("Failed to restart audio after setup:", err);
          setLinuxSetupLog(prev => [...prev, `Warning: Audio restart failed: ${err}`]);
        } finally {
          await new Promise(resolve => setTimeout(resolve, 150));
          // Restore using newMicVolume (the value we just set above), then sidetone
          await invoke("set_mic_volume", { volume: newMicVolume }).catch(() => {});
          await invoke("set_sidetone_volume", { volume: savedSidetoneVol }).catch(() => {});
        }
      } else {
        setLinuxSetupLog(prev => [...prev, "Warning: VailZoomer device not found in device list"]);
        updateSettings({ linux_audio_setup_completed: true });
      }

      setLinuxSetupComplete(true);
      setLinuxSetupLog(prev => [...prev, "", "Setup complete! Virtual audio is ready."]);
    } catch (err) {
      const errorMsg = String(err);
      setLinuxSetupError(errorMsg);
      setLinuxSetupLog(prev => [...prev, `✗ Error: ${errorMsg}`]);
    } finally {
      // After every setup attempt (success or failure), refresh the list of
      // missing prerequisites so the UI can offer a one-click "Install" path
      // if anything's still missing.
      try {
        const missing = await invoke<string[]>("list_linux_missing_prerequisites");
        setLinuxMissingPkgs(missing);
      } catch {
        setLinuxMissingPkgs([]);
      }
      setLinuxSetupInProgress(false);
    }
  };

  // Auto-install missing audio prerequisites via pkexec (one polkit dialog,
  // no terminal). Re-runs setupLinuxAudio automatically on success.
  type InstallResult = { success: boolean; message: string; log: string[]; used_graphical_auth: boolean };
  const installLinuxAudioPrereqs = async () => {
    setLinuxInstallInProgress(true);
    setLinuxSetupError(null);
    setLinuxSetupLog(prev => [...prev, "", "Installing missing audio packages..."]);
    try {
      const result = await invoke<InstallResult>("install_linux_audio_prerequisites");
      setLinuxSetupLog(prev => [...prev, ...result.log]);

      if (!result.success) {
        setLinuxSetupError(result.message);
        if (!result.used_graphical_auth) {
          setLinuxSetupLog(prev => [
            ...prev,
            "No graphical sudo available — run the manual command above in a terminal.",
          ]);
        }
        return;
      }

      // Recheck what's missing, then auto-retry setup.
      try {
        const missing = await invoke<string[]>("list_linux_missing_prerequisites");
        setLinuxMissingPkgs(missing);
      } catch {
        setLinuxMissingPkgs([]);
      }
      setLinuxSetupLog(prev => [...prev, "", "Retrying audio setup..."]);
      await setupLinuxAudio();
    } catch (err) {
      const msg = String(err);
      setLinuxSetupError(msg);
      setLinuxSetupLog(prev => [...prev, `✗ Install error: ${msg}`]);
    } finally {
      setLinuxInstallInProgress(false);
    }
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
            onNext={() => setWizardStep(2)}
          />
        )}
        {wizardStep === 2 && (
          <Step2VirtualAudio
            currentOS={currentOS}
            outputDevices={outputDevices}
            onBack={() => setWizardStep(1)}
            onNext={() => setWizardStep(3)}
            onSetupLinuxAudio={currentOS === "linux" ? setupLinuxAudio : undefined}
            onInstallLinuxAudioPrereqs={currentOS === "linux" ? installLinuxAudioPrereqs : undefined}
            linuxSetupInProgress={linuxSetupInProgress}
            linuxSetupComplete={linuxSetupComplete}
            linuxSetupError={linuxSetupError}
            linuxSetupLog={linuxSetupLog}
            linuxMissingPkgs={linuxMissingPkgs}
            linuxInstallInProgress={linuxInstallInProgress}
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
              restartAudio(selectedOutputDevice, selectedInputDevice, device);
            }}
            onSidetoneRouteChange={async (route) => {
              console.log("[Step3] Sidetone route changing to:", route);
              console.log("[Step3] Current selectedLocalDevice:", selectedLocalDevice);
              console.log("[Step3] Current selectedOutputDevice:", selectedOutputDevice);
              console.log("[Step3] Current selectedInputDevice:", selectedInputDevice);

              await updateSettings({ sidetone_route: route });

              // When switching to "Both", auto-select first non-VailZoomer output device as local
              let localDev = selectedLocalDevice;
              if (route === "Both" && !selectedLocalDevice) {
                console.log("[Step3] No local device selected, auto-selecting first non-VailZoomer device");
                console.log("[Step3] Available output devices:", outputDevices.map(d => d.internal_name));
                const firstLocalDevice = outputDevices.find(d =>
                  !d.internal_name.toLowerCase().includes("vailzoomer") &&
                  !d.display_name.toLowerCase().includes("vail zoomer") &&
                  !d.internal_name.toLowerCase().includes("blackhole") &&
                  !d.display_name.toLowerCase().includes("blackhole")
                );
                if (firstLocalDevice) {
                  localDev = firstLocalDevice.internal_name;
                  console.log("[Step3] Auto-selected local device:", localDev);
                  setSelectedLocalDevice(localDev);
                  await updateSettings({ local_output_device: localDev });
                } else {
                  console.log("[Step3] WARNING: No non-VailZoomer output device found!");
                }
              }

              console.log("[Step3] Restarting audio with localDev:", localDev);
              await restartAudio(selectedOutputDevice, selectedInputDevice, localDev);
              console.log("[Step3] Audio restart complete");
            }}
            onMicVolumeChange={(vol) => updateSettings({ mic_volume: vol })}
            onBack={() => setWizardStep(2)}
            onNext={() => setWizardStep(4)}
            onRefreshDevices={refreshDeviceLists}
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

  // Re-run the first-time wizard from the Settings sheet's "Re-run setup" link.
  const rerunWizard = () => {
    localStorage.removeItem(WIZARD_COMPLETE_KEY);
    setShowSettings(false);
    setWizardStep(1);
    setAppMode("wizard");
  };

  // Main operational view
  return (
    <>
      <UpdateBanner />
      <OperationalView
        midiConnected={midiConnected}
        audioStarted={audioStarted}
        isKeyDown={isKeyDown}
        estimatedWpm={estimatedWpm}
        selectedMidiDevice={selectedMidiDevice}
        selectedInputDevice={selectedInputDevice}
        inputDevices={inputDevices}
        cwText={cwText}
        onClearCwText={clearText}
        micLevel={micLevel}
        outputLevel={outputLevel}
        micDucking={settings.mic_ducking}
        onMicDuckingChange={(enabled) => updateSettings({ mic_ducking: enabled })}
        sidetoneRoute={settings.sidetone_route}
        selectedLocalDevice={selectedLocalDevice}
        outputDevices={outputDevices}
        keyerType={settings.keyer_type}
        wpm={settings.wpm}
        sidetoneFrequency={settings.sidetone_frequency}
        onKeyerTypeChange={(type) => updateSettings({ keyer_type: type })}
        onWpmChange={(wpm) => updateSettings({ wpm })}
        onSidetoneFrequencyChange={(freq) => updateSettings({ sidetone_frequency: freq })}
        onOpenVideoTips={() => setAppMode("video-tips")}
        onOpenSettings={() => setShowSettings(true)}
        onOpenHelp={() => setShowHelp(true)}
        onOpenTroubleshoot={() => setShowTroubleshoot(true)}
        testRecordingState={testRecordingState}
        testRecordingCountdown={testRecordingCountdown}
        testPlaybackProgress={testPlaybackProgress}
        onStartTestRecording={startTestRecording}
        onStopTestRecording={stopTestRecording}
        onStopTestPlayback={stopTestPlayback}
      />

      {showSettings && (
        <SettingsSheet
          midiDevices={midiDevices}
          selectedMidiDevice={selectedMidiDevice}
          midiConnected={midiConnected}
          inputDevices={inputDevices}
          outputDevices={outputDevices}
          selectedInputDevice={selectedInputDevice}
          selectedOutputDevice={selectedOutputDevice}
          selectedLocalDevice={selectedLocalDevice}
          micLevel={micLevel}
          currentOS={currentOS}
          keyerType={settings.keyer_type}
          wpm={settings.wpm}
          sidetoneFrequency={settings.sidetone_frequency}
          sidetoneVolume={settings.sidetone_volume}
          micVolume={settings.mic_volume}
          micDucking={settings.mic_ducking}
          sidetoneRoute={settings.sidetone_route}
          uiScale={settings.ui_scale}
          onUiScaleChange={(scale) => updateSettings({ ui_scale: scale })}
          onSelectMidiDevice={connectMidi}
          onInputDeviceChange={(device) => restartAudio(selectedOutputDevice, device)}
          onOutputDeviceChange={(device) => restartAudio(device, selectedInputDevice)}
          onLocalDeviceChange={(device) => {
            setSelectedLocalDevice(device);
            updateSettings({ local_output_device: device });
            restartAudio(selectedOutputDevice, selectedInputDevice, device);
          }}
          onSidetoneRouteChange={async (route) => {
            await updateSettings({ sidetone_route: route });
            let localDev = selectedLocalDevice;
            if (route === "Both" && !selectedLocalDevice) {
              const firstLocalDevice = outputDevices.find(d =>
                !d.internal_name.toLowerCase().includes("vailzoomer") &&
                !d.display_name.toLowerCase().includes("vail zoomer") &&
                !d.internal_name.toLowerCase().includes("blackhole") &&
                !d.display_name.toLowerCase().includes("blackhole") &&
                !d.internal_name.toLowerCase().includes("cable") &&
                !d.display_name.toLowerCase().includes("cable")
              );
              if (firstLocalDevice) {
                localDev = firstLocalDevice.internal_name;
                setSelectedLocalDevice(localDev);
                await updateSettings({ local_output_device: localDev });
              }
            }
            await restartAudio(selectedOutputDevice, selectedInputDevice, localDev);
          }}
          onKeyerTypeChange={(type) => updateSettings({ keyer_type: type })}
          onWpmChange={(wpm) => updateSettings({ wpm })}
          onSidetoneFrequencyChange={(freq) => updateSettings({ sidetone_frequency: freq })}
          onSidetoneVolumeChange={(vol) => updateSettings({ sidetone_volume: vol })}
          onMicVolumeChange={(vol) => updateSettings({ mic_volume: vol })}
          onMicDuckingChange={(enabled) => updateSettings({ mic_ducking: enabled })}
          onRefreshDevices={refreshDeviceLists}
          onRerunSetup={rerunWizard}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showTroubleshoot && (
        <TroubleshootingModal
          onClose={() => setShowTroubleshoot(false)}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}
    </>
  );
}

export default App;

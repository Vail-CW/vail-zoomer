import { useRef, useState } from "react";
import { BigSelect } from "../shared/BigSelect";
import { Card } from "../shared/Card";
import { useModalA11y } from "../../hooks/useModalA11y";
import {
  MicSection,
  SidetoneRouteButtons,
  LocalOutputPicker,
  VirtualOutputStatusLine,
  isRecommendedVirtualOutput,
  getVirtualOutputStatus,
  DeviceInfo,
  OSType,
} from "../audio";

const KEYER_TYPES = [
  { value: "Straight", label: "Straight Key", description: "One paddle, you control all timing" },
  { value: "Bug", label: "Bug (auto dits)", description: "Automatic dits, manual dahs" },
  { value: "ElBug", label: "Electric Bug", description: "Like a bug with electronic timing" },
  { value: "SingleDot", label: "Single Dot Paddle", description: "One dit per squeeze" },
  { value: "Ultimatic", label: "Ultimatic Paddle", description: "Last paddle pressed wins" },
  { value: "PlainIambic", label: "Plain Iambic", description: "Alternating dits and dahs" },
  { value: "IambicA", label: "Iambic A", description: "Stops after completing element" },
  { value: "IambicB", label: "Iambic B", description: "Adds opposite element on release" },
  { value: "Keyahead", label: "Keyahead", description: "Buffers next element while sending" },
];

import { isVailMidiDevice as matchesVail } from "../audio/audioHelpers";

// Friendly label: collapse Vail adapter hardware names ("Seeeduino XIAO", "QT Py")
// down to "Vail Adapter", numbering them if more than one is present.
function makeFriendlyLabeler(devices: string[]) {
  const vailMatches = devices.filter(matchesVail);
  const vailIdx = new Map<string, number>();
  vailMatches.forEach((d, i) => vailIdx.set(d, i + 1));
  return (device: string) => {
    if (!matchesVail(device)) return device;
    if (vailMatches.length <= 1) return "Vail Adapter";
    return `Vail Adapter ${vailIdx.get(device)}`;
  };
}

interface SettingsSheetProps {
  // Devices
  midiDevices: string[];
  selectedMidiDevice: string | null;
  midiConnected: boolean;
  inputDevices: DeviceInfo[];
  outputDevices: DeviceInfo[];
  selectedInputDevice: string | null;
  selectedOutputDevice: string | null;
  selectedLocalDevice: string | null;
  micLevel: number;
  currentOS: OSType;

  // Settings
  keyerType: string;
  wpm: number;
  sidetoneFrequency: number;
  sidetoneVolume: number;
  micVolume: number;
  micDucking: boolean;
  sidetoneRoute: string;

  // Handlers
  onSelectMidiDevice: (device: string) => void;
  onInputDeviceChange: (device: string | null) => void;
  onOutputDeviceChange: (device: string | null) => void;
  onLocalDeviceChange: (device: string | null) => void;
  onSidetoneRouteChange: (route: string) => void;
  onKeyerTypeChange: (type: string) => void;
  onWpmChange: (wpm: number) => void;
  onSidetoneFrequencyChange: (freq: number) => void;
  onSidetoneVolumeChange: (vol: number) => void;
  onMicVolumeChange: (vol: number) => void;
  onMicDuckingChange: (enabled: boolean) => void;
  onRefreshDevices: () => void;
  onRerunSetup: () => void;
  onClose: () => void;
}

export function SettingsSheet({
  midiDevices,
  selectedMidiDevice,
  midiConnected,
  inputDevices,
  outputDevices,
  selectedInputDevice,
  selectedOutputDevice,
  selectedLocalDevice,
  micLevel,
  currentOS,
  keyerType,
  wpm,
  sidetoneFrequency,
  sidetoneVolume,
  micVolume,
  micDucking,
  sidetoneRoute,
  onSelectMidiDevice,
  onInputDeviceChange,
  onOutputDeviceChange,
  onLocalDeviceChange,
  onSidetoneRouteChange,
  onKeyerTypeChange,
  onWpmChange,
  onSidetoneFrequencyChange,
  onSidetoneVolumeChange,
  onMicVolumeChange,
  onMicDuckingChange,
  onRefreshDevices,
  onRerunSetup,
  onClose,
}: SettingsSheetProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(panelRef, onClose);

  // Filter to Vail-family devices first, then everything else (excluding our
  // own virtual MIDI loopback that some OSes show).
  const isLoopbackMidi = (d: string) => {
    const n = d.toLowerCase();
    return n.includes("vail zoomer output") || n.includes("vailzoomer")
      || n.includes("midi through");
  };
  const vailMidiDevices = midiDevices.filter((d) => matchesVail(d) && !isLoopbackMidi(d));
  const otherMidiDevices = midiDevices.filter((d) => !matchesVail(d) && !isLoopbackMidi(d));
  const friendlyDeviceLabel = makeFriendlyLabeler(midiDevices);

  // For the output picker we keep virtual cables visible (that's what should
  // feed Zoom) and tag the recommended one so the user can spot it at a glance.
  const outputOptions = outputDevices.map((d) => ({
    value: d.internal_name,
    label: isRecommendedVirtualOutput(d, currentOS)
      ? `${d.display_name}  ✓ recommended for Zoom/Teams`
      : d.display_name,
  }));

  const virtualOutputStatus = getVirtualOutputStatus(outputDevices, selectedOutputDevice, currentOS);

  const renderMidiButton = (device: string) => (
    <button
      key={device}
      onClick={() => onSelectMidiDevice(device)}
      className={`w-full p-3 text-left rounded-xl border-2 transition-colors min-h-[52px] ${
        selectedMidiDevice === device
          ? "bg-amber-500/15 border-amber-400 text-white"
          : "bg-gray-800 border-gray-600 text-gray-200 hover:border-gray-500"
      }`}
      aria-pressed={selectedMidiDevice === device}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            selectedMidiDevice === device
              ? "border-amber-400 bg-amber-500"
              : "border-gray-500"
          }`}
        >
          {selectedMidiDevice === device && (
            <div className="w-2 h-2 rounded-full bg-gray-900" />
          )}
        </div>
        <span className="text-base">{friendlyDeviceLabel(device)}</span>
      </div>
    </button>
  );

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-stretch justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-sheet-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="bg-gray-900 w-full max-w-2xl h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-5 py-4 flex items-center justify-between z-10">
          <h2 id="settings-sheet-title" className="text-2xl font-bold text-amber-400">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="min-w-[48px] min-h-[48px] px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-lg font-medium"
            aria-label="Close settings"
          >
            Done
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Devices */}
          <Card>
            <h3 className="text-xl font-bold text-amber-400 mb-3">Devices</h3>

            {/* MIDI keyer */}
            <div className="space-y-2 mb-5">
              <div className="flex items-center justify-between">
                <label className="block text-lg text-gray-200 font-medium">
                  Vail Adapter (keyer)
                </label>
                <span
                  className={`text-sm font-medium ${
                    midiConnected ? "text-green-400" : "text-amber-300"
                  }`}
                >
                  {midiConnected ? "Connected" : "Not connected"}
                </span>
              </div>
              {midiDevices.length === 0 ? (
                <p className="text-base text-gray-300">
                  No MIDI devices found. Plug your Vail Adapter in over USB and it will
                  appear here automatically.
                </p>
              ) : (
                <div className="space-y-2">
                  {vailMidiDevices.map(renderMidiButton)}
                  {otherMidiDevices.length > 0 && (
                    <>
                      {vailMidiDevices.length > 0 && (
                        <p className="text-sm text-gray-400 pt-1">Other MIDI devices</p>
                      )}
                      {otherMidiDevices.map(renderMidiButton)}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Microphone */}
            <div className="mb-5">
              <MicSection
                label="Your microphone"
                inputDevices={inputDevices}
                selectedInputDevice={selectedInputDevice}
                micLevel={micLevel}
                micVolume={micVolume}
                onInputDeviceChange={onInputDeviceChange}
                onMicVolumeChange={onMicVolumeChange}
                onRefreshDevices={onRefreshDevices}
              />
            </div>

            {/* Output to video app */}
            <div className="space-y-2 mb-5">
              <label className="block text-lg text-gray-200 font-medium">
                Output to your video app
              </label>
              <BigSelect
                value={selectedOutputDevice || ""}
                onChange={(v) => onOutputDeviceChange(v || null)}
                onOpen={onRefreshDevices}
                options={outputOptions}
                placeholder="Choose an output…"
              />
              <VirtualOutputStatusLine status={virtualOutputStatus} />
              {currentOS === "linux" && (
                <p className="text-sm text-gray-300">
                  On Linux this is set up automatically. Pick <strong>VailZoomer</strong> if
                  you need to switch back to it.
                </p>
              )}
            </div>

            {/* Sidetone routing */}
            <div className="mb-5">
              <SidetoneRouteButtons
                route={sidetoneRoute}
                onChange={onSidetoneRouteChange}
              />
            </div>

            {/* Local speakers picker */}
            {sidetoneRoute === "Both" && (
              <LocalOutputPicker
                outputDevices={outputDevices}
                selectedLocalDevice={selectedLocalDevice}
                onLocalDeviceChange={onLocalDeviceChange}
                onRefreshDevices={onRefreshDevices}
                label="Computer speakers / headphones"
              />
            )}
          </Card>

          {/* Keyer settings */}
          <Card>
            <h3 className="text-xl font-bold text-amber-400 mb-3">Keyer</h3>

            <div className="space-y-2 mb-5">
              <label className="block text-lg text-gray-200 font-medium">Key type</label>
              <BigSelect
                value={keyerType}
                onChange={onKeyerTypeChange}
                options={KEYER_TYPES}
                placeholder="Select key type…"
              />
            </div>

            {keyerType !== "Straight" && (
              <div className="mb-5">
                <label className="flex justify-between items-center text-lg text-gray-200 font-medium mb-2">
                  <span>Speed</span>
                  <span className="text-amber-400 font-bold">{wpm} WPM</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={wpm}
                  onChange={(e) => onWpmChange(parseInt(e.target.value))}
                  className="w-full"
                  aria-label="Words per minute"
                />
              </div>
            )}

            <div className="mb-5">
              <label className="flex justify-between items-center text-lg text-gray-200 font-medium mb-2">
                <span>Tone pitch</span>
                <span className="text-amber-400 font-bold">{sidetoneFrequency} Hz</span>
              </label>
              <input
                type="range"
                min="400"
                max="1000"
                step="10"
                value={sidetoneFrequency}
                onChange={(e) => onSidetoneFrequencyChange(parseInt(e.target.value))}
                className="w-full"
                aria-label="Tone pitch"
              />
            </div>

            <div className="mb-5">
              <label className="flex justify-between items-center text-lg text-gray-200 font-medium mb-2">
                <span>Tone volume</span>
                <span className="text-amber-400 font-bold">
                  {Math.round(sidetoneVolume * 100)}%
                </span>
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={Math.round(sidetoneVolume * 100)}
                onChange={(e) => onSidetoneVolumeChange(parseInt(e.target.value) / 100)}
                className="w-full"
                aria-label="Tone volume"
              />
              <p className="text-sm text-gray-300 mt-1">
                Wear headphones — prevents your sidetone bouncing back through your mic.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1 pr-3">
                <span className="text-lg text-gray-200 font-medium">
                  Auto-mute mic while sending
                </span>
                <p className="text-sm text-gray-300">
                  Mutes your microphone the instant you key down and unmutes it the moment you stop — prevents your sidetone bouncing back as feedback.
                </p>
              </div>
              <button
                onClick={() => onMicDuckingChange(!micDucking)}
                className={`relative w-16 h-9 rounded-full transition-colors flex-shrink-0 ${
                  micDucking ? "bg-amber-500" : "bg-gray-600"
                }`}
                aria-label="Mute my voice while keying"
                aria-pressed={micDucking}
              >
                <span
                  className={`absolute top-1 w-7 h-7 bg-white rounded-full transition-transform ${
                    micDucking ? "left-8" : "left-1"
                  }`}
                />
              </button>
            </div>
          </Card>

          {/* Re-run setup */}
          <Card className="!bg-gray-800/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-lg text-gray-200 font-medium">Re-run first-time setup</p>
                <p className="text-sm text-gray-300">
                  Walks you through the four-step setup wizard again from scratch.
                </p>
              </div>
              {confirmReset ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setConfirmReset(false);
                      onRerunSetup();
                    }}
                    className="min-h-[44px] px-4 bg-amber-500 hover:bg-amber-400 text-gray-900 rounded-lg font-medium"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="min-h-[44px] px-4 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="min-h-[44px] px-4 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
                >
                  Re-run setup
                </button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

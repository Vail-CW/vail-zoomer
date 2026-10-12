import { useEffect, useRef, useState } from "react";
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
  uiScale: number;

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
  onUiScaleChange: (scale: number) => void;
  onRefreshDevices: () => void;
  onRefreshMidiDevices: () => void;
  onPreviewTone: (hz: number) => void;
  theme: "dark" | "light" | "system";
  sidetoneRiseMs: number;
  bufferSizeMode: "Auto" | "Low" | "Safe";
  onThemeChange: (theme: "dark" | "light" | "system") => void;
  onSidetoneRiseMsChange: (ms: number) => void;
  onBufferSizeModeChange: (mode: "Auto" | "Low" | "Safe") => void;
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
  uiScale,
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
  onUiScaleChange,
  onRefreshDevices,
  onRefreshMidiDevices,
  onPreviewTone,
  theme,
  sidetoneRiseMs,
  bufferSizeMode,
  onThemeChange,
  onSidetoneRiseMsChange,
  onBufferSizeModeChange,
  onRerunSetup,
  onClose,
}: SettingsSheetProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(panelRef, onClose);

  // Refresh the MIDI picker whenever the sheet opens.
  useEffect(() => {
    onRefreshMidiDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced audible preview while dragging speed / pitch sliders.
  const previewTimer = useRef<number | null>(null);
  const schedulePreview = (hz: number) => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    previewTimer.current = window.setTimeout(() => onPreviewTone(hz), 250);
  };
  useEffect(() => () => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
  }, []);

  const segmented = <T extends string>(
    options: { value: T; label: string }[],
    value: T,
    onChange: (v: T) => void,
    label: string
  ) => (
    <div className="flex gap-2" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={`flex-1 min-h-[48px] px-3 rounded-xl border-2 text-lg font-medium transition-colors ${
            value === o.value
              ? "bg-amber-500/15 border-amber-400 text-ink"
              : "bg-surface2 border-line text-ink hover:border-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

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
          ? "bg-amber-500/15 border-amber-400 text-ink"
          : "bg-surface2 border-line text-ink hover:border-muted"
      }`}
      aria-pressed={selectedMidiDevice === device}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
            selectedMidiDevice === device
              ? "border-amber-400 bg-amber-500"
              : "border-line"
          }`}
        >
          {selectedMidiDevice === device && (
            <div className="w-2 h-2 rounded-full bg-app" />
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
        className="bg-app w-full max-w-2xl h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 bg-app border-b border-line px-5 py-4 flex items-center justify-between z-10">
          <h2 id="settings-sheet-title" className="text-2xl font-bold text-accent-text">
            Settings
          </h2>
          <button
            onClick={onClose}
            className="min-w-[48px] min-h-[48px] px-3 rounded-lg bg-surface2 hover:bg-line text-ink text-lg font-medium"
            aria-label="Close settings"
          >
            Done
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Devices */}
          <Card>
            <h3 className="text-xl font-bold text-accent-text mb-3">Devices</h3>

            {/* MIDI keyer */}
            <div className="space-y-2 mb-5">
              <div className="flex items-center justify-between">
                <label className="block text-lg text-ink font-medium">
                  Vail Adapter (keyer)
                </label>
                <span
                  className={`text-sm font-medium ${
                    midiConnected ? "text-green-400" : "text-accent-text"
                  }`}
                >
                  {midiConnected ? "Connected" : "Not connected"}
                </span>
              </div>
              {midiDevices.length === 0 ? (
                <p className="text-base text-muted">
                  No MIDI devices found. Plug your Vail Adapter in over USB and it will
                  appear here automatically.
                </p>
              ) : (
                <div className="space-y-2">
                  {vailMidiDevices.map(renderMidiButton)}
                  {otherMidiDevices.length > 0 && (
                    <>
                      {vailMidiDevices.length > 0 && (
                        <p className="text-sm text-muted pt-1">Other MIDI devices</p>
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
              <label className="block text-lg text-ink font-medium">
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
                <p className="text-sm text-muted">
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
            <h3 className="text-xl font-bold text-accent-text mb-3">Keyer</h3>

            <div className="space-y-2 mb-5">
              <label className="block text-lg text-ink font-medium">Key type</label>
              <BigSelect
                value={keyerType}
                onChange={onKeyerTypeChange}
                options={KEYER_TYPES}
                placeholder="Select key type…"
              />
            </div>

            {keyerType !== "Straight" && (
              <div className="mb-5">
                <label className="flex justify-between items-center text-lg text-ink font-medium mb-2">
                  <span>Speed</span>
                  <span className="text-accent-text font-bold">{wpm} WPM</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={wpm}
                  onChange={(e) => {
                    onWpmChange(parseInt(e.target.value));
                    schedulePreview(sidetoneFrequency);
                  }}
                  className="w-full"
                  aria-label="Words per minute"
                />
              </div>
            )}

            <div className="mb-5">
              <label className="flex justify-between items-center text-lg text-ink font-medium mb-2">
                <span>Tone pitch</span>
                <span className="text-accent-text font-bold">{sidetoneFrequency} Hz</span>
              </label>
              <input
                type="range"
                min="400"
                max="1000"
                step="10"
                value={sidetoneFrequency}
                onChange={(e) => {
                  const hz = parseInt(e.target.value);
                  onSidetoneFrequencyChange(hz);
                  schedulePreview(hz);
                }}
                className="w-full"
                aria-label="Tone pitch"
              />
            </div>

            <div className="mb-5">
              <label className="flex justify-between items-center text-lg text-ink font-medium mb-2">
                <span>Tone edge softness</span>
                <span className="text-accent-text font-bold">{sidetoneRiseMs} ms</span>
              </label>
              <input
                type="range"
                min="1"
                max="20"
                value={sidetoneRiseMs}
                onChange={(e) => {
                  onSidetoneRiseMsChange(parseInt(e.target.value));
                  schedulePreview(sidetoneFrequency);
                }}
                className="w-full"
                aria-label="Tone edge softness in milliseconds"
              />
              <p className="text-sm text-muted mt-1">
                Higher = softer start and stop of each beep (fewer clicks). Lower = crisper.
              </p>
            </div>

            <div className="mb-5">
              <label className="flex justify-between items-center text-lg text-ink font-medium mb-2">
                <span>Tone volume</span>
                <span className="text-accent-text font-bold">
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
              <p className="text-sm text-muted mt-1">
                Wear headphones — prevents your sidetone bouncing back through your mic.
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex-1 pr-3">
                <span className="text-lg text-ink font-medium">
                  Auto-mute mic while sending
                </span>
                <p className="text-sm text-muted">
                  Mutes your microphone the instant you key down and unmutes it the moment you stop — prevents your sidetone bouncing back as feedback.
                </p>
              </div>
              <button
                onClick={() => onMicDuckingChange(!micDucking)}
                className={`relative w-16 h-9 rounded-full transition-colors flex-shrink-0 ${
                  micDucking ? "bg-amber-500" : "bg-line"
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

          {/* Appearance & audio engine */}
          <Card>
            <h3 className="text-xl font-bold text-accent-text mb-3">Appearance</h3>
            {segmented(
              [
                { value: "dark" as const, label: "Dark" },
                { value: "light" as const, label: "Light" },
                { value: "system" as const, label: "System" },
              ],
              theme,
              onThemeChange,
              "Theme"
            )}

            <h3 className="text-xl font-bold text-accent-text mt-6 mb-3">Audio latency</h3>
            {segmented(
              [
                { value: "Auto" as const, label: "Auto" },
                { value: "Low" as const, label: "Low" },
                { value: "Safe" as const, label: "Safe" },
              ],
              bufferSizeMode,
              onBufferSizeModeChange,
              "Audio latency"
            )}
            <p className="text-sm text-muted mt-2">
              Low = less delay, may crackle on slow machines; Safe = never crackles, more
              delay. Takes effect next time audio starts.
            </p>
          </Card>

          {/* Display */}
          <Card>
            <h3 className="text-xl font-bold text-accent-text mb-3">Display</h3>
            <div className="space-y-2">
              <label className="block text-lg text-ink font-medium">
                Text &amp; button size
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: "Normal", value: 1.0 },
                  { label: "Large", value: 1.15 },
                  { label: "Largest", value: 1.3 },
                ].map((opt) => {
                  const active = Math.abs(uiScale - opt.value) < 0.01;
                  return (
                    <button
                      key={opt.label}
                      onClick={() => onUiScaleChange(opt.value)}
                      className={`p-3 text-center rounded-xl border-2 transition-colors min-h-[64px] ${
                        active
                          ? "bg-amber-500/15 border-amber-400"
                          : "bg-surface2 border-line hover:border-muted"
                      }`}
                      aria-pressed={active}
                    >
                      <div className="text-base font-medium">{opt.label}</div>
                      <div className="text-sm text-muted mt-1">
                        {Math.round(opt.value * 100)}%
                      </div>
                    </button>
                  );
                })}
              </div>
              <p className="text-sm text-muted">
                Makes the app's text and controls bigger. Changes apply right away.
              </p>
            </div>
          </Card>

          {/* Re-run setup */}
          <Card className="!bg-surface2/50">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <p className="text-lg text-ink font-medium">Re-run first-time setup</p>
                <p className="text-sm text-muted">
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
                    className="min-h-[44px] px-4 bg-surface2 hover:bg-line text-ink rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="min-h-[44px] px-4 bg-surface2 hover:bg-line text-ink rounded-lg"
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

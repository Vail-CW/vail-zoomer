import { WizardLayout } from "../wizard/WizardLayout";
import { BigSelect } from "../shared/BigSelect";
import { InfoBox } from "../shared/InfoBox";
import { CollapsibleSection } from "../shared/CollapsibleSection";
import { isVailMidiDevice } from "../audio/audioHelpers";

// Disambiguate when multiple Vail Adapters are plugged in by appending an
// index, otherwise both entries would render as identical "Vail Adapter" rows.
function makeFriendlyLabeler(devices: string[]) {
  const vailMatches = devices.filter(isVailMidiDevice);
  const vailIdx = new Map<string, number>();
  vailMatches.forEach((d, i) => vailIdx.set(d, i + 1));
  return (device: string) => {
    if (!isVailMidiDevice(device)) return device;
    if (vailMatches.length <= 1) return "Vail Adapter";
    return `Vail Adapter ${vailIdx.get(device)}`;
  };
}

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

interface Step1KeyerSetupProps {
  midiDevices: string[];
  selectedMidiDevice: string | null;
  keyerType: string;
  wpm: number;
  sidetoneFrequency: number;
  midiConnected: boolean;
  isKeyDown: boolean;
  onSelectMidiDevice: (device: string) => void;
  onKeyerTypeChange: (type: string) => void;
  onWpmChange: (wpm: number) => void;
  onSidetoneFrequencyChange: (freq: number) => void;
  onNext: () => void;
}

export function Step1KeyerSetup({
  midiDevices,
  selectedMidiDevice,
  keyerType,
  wpm,
  sidetoneFrequency,
  midiConnected,
  isKeyDown,
  onSelectMidiDevice,
  onKeyerTypeChange,
  onWpmChange,
  onSidetoneFrequencyChange,
  onNext,
}: Step1KeyerSetupProps) {
  const friendlyDeviceLabel = makeFriendlyLabeler(midiDevices);
  // Filter to show Vail adapter or similar devices
  const vailDevices = midiDevices.filter(d =>
    (d.toLowerCase().includes("vail") ||
    d.toLowerCase().includes("xiao") ||
    d.toLowerCase().includes("seeed") ||
    d.toLowerCase().includes("samd21") ||
    d.toLowerCase().includes("qt py") ||
    d.toLowerCase().includes("qtpy")) &&
    // Exclude virtual/software MIDI devices
    !d.toLowerCase().includes("vail zoomer output") &&
    !d.toLowerCase().includes("vailzoomer")
  );

  // Filter out virtual/software MIDI devices from "other" list
  const otherDevices = midiDevices.filter(d =>
    !vailDevices.includes(d) &&
    !d.toLowerCase().includes("midi through") &&
    !d.toLowerCase().includes("vail zoomer output") &&
    !d.toLowerCase().includes("vailzoomer")
  );

  return (
    <WizardLayout
      currentStep={1}
      totalSteps={4}
      stepLabels={["Keyer", "Virtual audio", "Audio", "Video app"]}
      title="Connect your Vail Adapter"
      onNext={onNext}
      nextDisabled={!midiConnected}
      showBack={false}
    >
      <div className="max-w-xl mx-auto space-y-3">
        {/* Device picker — empty state doubles as the "plug it in" prompt */}
        {midiDevices.length === 0 ? (
          <InfoBox variant="warning" title="Looking for your Vail Adapter…">
            <p className="text-base">
              Plug it in over USB — it'll appear here as soon as the operating system sees it.
            </p>
          </InfoBox>
        ) : !midiConnected ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-300">
              Pick your adapter from the list. It connects automatically.
            </p>
            {vailDevices.map((device) => (
              <button
                key={device}
                onClick={() => onSelectMidiDevice(device)}
                className={`w-full px-4 py-3 text-left rounded-xl border-2 transition-colors ${
                  selectedMidiDevice === device
                    ? "bg-amber-500/15 border-amber-400 text-white"
                    : "bg-gray-800 border-gray-600 text-gray-200 hover:border-gray-500"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
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
            ))}
            {otherDevices.length > 0 && (
              <>
                {vailDevices.length > 0 && (
                  <p className="text-xs text-gray-400 pt-1">Other MIDI devices</p>
                )}
                {otherDevices.map((device) => (
                  <button
                    key={device}
                    onClick={() => onSelectMidiDevice(device)}
                    className={`w-full px-4 py-3 text-left rounded-xl border-2 transition-colors ${
                      selectedMidiDevice === device
                        ? "bg-amber-500/15 border-amber-400 text-white"
                        : "bg-gray-800 border-gray-600 text-gray-200 hover:border-gray-500"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
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
                ))}
              </>
            )}
          </div>
        ) : (
          /* Connected — collapse the long list into one compact confirmation
              row with the live key dot, freeing room for the key-type + speed
              controls below without scrolling. */
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-green-900/30 border border-green-700/60">
            <svg className="w-5 h-5 text-green-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-100 truncate">
                {selectedMidiDevice ? friendlyDeviceLabel(selectedMidiDevice) : "Vail Adapter"} connected
              </p>
              <p className="text-xs text-gray-300">Press your key — the dot lights up.</p>
            </div>
            <span
              className={`inline-block w-5 h-5 rounded-full border-2 transition-all duration-75 shrink-0 ${
                isKeyDown
                  ? "bg-amber-400 border-amber-300 shadow-[0_0_8px_2px_rgba(251,191,36,0.6)]"
                  : "bg-gray-700 border-gray-600"
              }`}
              aria-label={isKeyDown ? "Key down" : "Key up"}
            />
          </div>
        )}

        {/* Keyer type + speed share a tight two-column row so the Next button
            stays visible without scrolling on 1080p. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-sm text-gray-300 font-medium">Key type</label>
            <BigSelect
              value={keyerType}
              onChange={onKeyerTypeChange}
              options={KEYER_TYPES}
              placeholder="Select…"
            />
          </div>

          {keyerType !== "Straight" && (
            <div className="space-y-1">
              <label className="flex justify-between items-baseline text-sm text-gray-300 font-medium">
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
        </div>

        <CollapsibleSection title={`Adjust tone pitch (${sidetoneFrequency} Hz)`} defaultOpen={false}>
          <div className="space-y-1 pt-2">
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
            <p className="text-xs text-gray-400">
              You can change pitch, speed, and key type any time from the main screen.
            </p>
          </div>
        </CollapsibleSection>
      </div>
    </WizardLayout>
  );
}

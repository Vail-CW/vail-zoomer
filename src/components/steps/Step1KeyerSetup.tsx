import { WizardLayout } from "../wizard/WizardLayout";
import { BigSelect } from "../shared/BigSelect";
import { InfoBox } from "../shared/InfoBox";
import { CollapsibleSection } from "../shared/CollapsibleSection";
import { KeyIndicator } from "../shared/KeyIndicator";

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
      <div className="max-w-xl mx-auto space-y-4">
        {/* Instructions */}
        <p className="text-base text-gray-200 text-center">
          Plug your <strong className="text-amber-400">Vail Adapter</strong> into a USB port.
          The app will find it automatically.
        </p>

        {/* Device selection */}
        {midiDevices.length > 0 ? (
          <div className="space-y-2">
            {/* Show Vail devices first */}
            {vailDevices.map((device) => (
              <button
                key={device}
                onClick={() => onSelectMidiDevice(device)}
                className={`w-full p-4 text-left rounded-xl border-2 transition-colors min-h-[56px] ${
                  selectedMidiDevice === device
                    ? "bg-amber-500/15 border-amber-400 text-white"
                    : "bg-gray-800 border-gray-600 text-gray-200 hover:border-gray-500"
                }`}
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
                  <span className="text-base">{device}</span>
                </div>
              </button>
            ))}
            {/* Show other MIDI devices */}
            {otherDevices.length > 0 && (
              <>
                {vailDevices.length > 0 && (
                  <p className="text-sm text-gray-400 pt-2">Other MIDI devices</p>
                )}
                {otherDevices.map((device) => (
                  <button
                    key={device}
                    onClick={() => onSelectMidiDevice(device)}
                    className={`w-full p-4 text-left rounded-xl border-2 transition-colors min-h-[56px] ${
                      selectedMidiDevice === device
                        ? "bg-amber-500/15 border-amber-400 text-white"
                        : "bg-gray-800 border-gray-600 text-gray-200 hover:border-gray-500"
                    }`}
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
                      <span className="text-base">{device}</span>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        ) : (
          <InfoBox variant="warning" title="Looking for your Vail Adapter…">
            <p className="text-base">
              Plug it in over USB if you haven't yet — it'll show up here as soon as the
              operating system sees it.
            </p>
          </InfoBox>
        )}

        {/* Connection status */}
        {midiConnected && (
          <InfoBox variant="success" title="Connected">
            <p className="text-base">Your Vail Adapter is ready. Try pressing your key.</p>
          </InfoBox>
        )}

        {/* Keying indicator */}
        {midiConnected && (
          <KeyIndicator
            isKeyDown={isKeyDown}
            label={isKeyDown ? "Key pressed!" : "Press your key to test"}
          />
        )}

        {/* Keyer type selection */}
        <div className="space-y-2">
          <label className="block text-lg text-gray-200 font-medium">Key type</label>
          <BigSelect
            value={keyerType}
            onChange={onKeyerTypeChange}
            options={KEYER_TYPES}
            placeholder="Select your key type…"
          />
        </div>

        {/* Speed slider — visible by default for non-straight keyers */}
        {keyerType !== "Straight" && (
          <div className="space-y-1">
            <label className="flex justify-between items-center text-lg text-gray-200 font-medium">
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

        {/* Tone pitch is rarely changed — stays tucked away */}
        <CollapsibleSection title="Adjust tone pitch (optional)" defaultOpen={false}>
          <div className="space-y-1 pt-2">
            <label className="flex justify-between items-center text-base text-gray-200">
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
        </CollapsibleSection>
      </div>
    </WizardLayout>
  );
}

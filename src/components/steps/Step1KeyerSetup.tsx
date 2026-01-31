import { useState } from "react";
import { WizardLayout } from "../wizard/WizardLayout";
import { BigSelect } from "../shared/BigSelect";
import { BigButton } from "../shared/BigButton";
import { InfoBox } from "../shared/InfoBox";
import { CollapsibleSection } from "../shared/CollapsibleSection";

interface DeviceInfo {
  display_name: string;
  internal_name: string;
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
  outputDevices: DeviceInfo[];
  selectedLocalDevice: string | null;
  onSelectMidiDevice: (device: string) => void;
  onKeyerTypeChange: (type: string) => void;
  onWpmChange: (wpm: number) => void;
  onSidetoneFrequencyChange: (freq: number) => void;
  onLocalDeviceChange: (device: string | null) => void;
  onTestDit: () => void;
  onTestDah: () => void;
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
  outputDevices,
  selectedLocalDevice,
  onSelectMidiDevice,
  onKeyerTypeChange,
  onWpmChange,
  onSidetoneFrequencyChange,
  onLocalDeviceChange,
  onTestDit,
  onTestDah,
  onNext,
}: Step1KeyerSetupProps) {
  // Sidetone confirmation state - only ask once after first test
  const [showSidetoneConfirmation, setShowSidetoneConfirmation] = useState(false);
  const [hasConfirmedSidetone, setHasConfirmedSidetone] = useState(false);
  const [showDeviceSelector, setShowDeviceSelector] = useState(false);

  // Handle test button click - show confirmation on first test
  const handleTestTone = (isDit: boolean) => {
    if (isDit) {
      onTestDit();
    } else {
      onTestDah();
    }
    // Show confirmation prompt only if we haven't confirmed yet
    if (!hasConfirmedSidetone) {
      setShowSidetoneConfirmation(true);
    }
  };

  // User confirmed they heard the tone
  const handleHeardTone = () => {
    setShowSidetoneConfirmation(false);
    setHasConfirmedSidetone(true);
    setShowDeviceSelector(false);
  };

  // User didn't hear the tone - show device selector
  const handleDidntHearTone = () => {
    setShowDeviceSelector(true);
  };

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
      stepLabels={["Vail Adapter", "Virtual Audio", "Audio", "Video App"]}
      title="Connect Your Vail Adapter"
      onNext={onNext}
      nextDisabled={!midiConnected}
      showBack={false}
    >
      <div className="max-w-xl mx-auto space-y-4">
        {/* Instructions */}
        <p className="text-base text-gray-300 text-center">
          Plug your <strong className="text-amber-400">Vail Adapter</strong> into a USB port.
        </p>

        {/* Device selection */}
        {midiDevices.length > 0 ? (
          <div className="space-y-2">
            {/* Show Vail devices first */}
            {vailDevices.map((device) => (
              <button
                key={device}
                onClick={() => onSelectMidiDevice(device)}
                className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                  selectedMidiDevice === device
                    ? "bg-amber-500/20 border-amber-500 text-white"
                    : "bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-500"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      selectedMidiDevice === device
                        ? "border-amber-500 bg-amber-500"
                        : "border-gray-500"
                    }`}
                  >
                    {selectedMidiDevice === device && (
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-900" />
                    )}
                  </div>
                  <span>{device}</span>
                </div>
              </button>
            ))}
            {/* Show other MIDI devices */}
            {otherDevices.length > 0 && (
              <>
                {vailDevices.length > 0 && (
                  <p className="text-xs text-gray-500 pt-2">Other MIDI devices:</p>
                )}
                {otherDevices.map((device) => (
                  <button
                    key={device}
                    onClick={() => onSelectMidiDevice(device)}
                    className={`w-full p-3 text-left rounded-lg border-2 transition-colors ${
                      selectedMidiDevice === device
                        ? "bg-amber-500/20 border-amber-500 text-white"
                        : "bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-500"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                          selectedMidiDevice === device
                            ? "border-amber-500 bg-amber-500"
                            : "border-gray-500"
                        }`}
                      >
                        {selectedMidiDevice === device && (
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-900" />
                        )}
                      </div>
                      <span>{device}</span>
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        ) : (
          <InfoBox variant="warning" title="No MIDI devices found">
            <p className="text-sm">
              Please plug in your Vail Adapter. If you just plugged it in, wait a moment.
            </p>
          </InfoBox>
        )}

        {/* Connection status */}
        {midiConnected && (
          <InfoBox variant="success" title="Connected!">
            <p className="text-sm">Your Vail Adapter is ready. Try pressing your key!</p>
          </InfoBox>
        )}

        {/* Keying indicator */}
        {midiConnected && (
          <div className="flex flex-col items-center gap-2 py-3">
            <div
              className={`w-16 h-16 rounded-full border-4 transition-all duration-75 flex items-center justify-center ${
                isKeyDown
                  ? "bg-amber-500 border-amber-400 shadow-lg shadow-amber-500/50"
                  : "bg-gray-700 border-gray-600"
              }`}
            >
              <span className={`text-2xl font-bold ${isKeyDown ? "text-gray-900" : "text-gray-500"}`}>
                {isKeyDown ? "●" : "○"}
              </span>
            </div>
            <p className={`text-sm font-medium ${isKeyDown ? "text-amber-400" : "text-gray-400"}`}>
              {isKeyDown ? "Key pressed!" : "Press your key to test"}
            </p>
          </div>
        )}

        {/* Test buttons */}
        <div className="space-y-2">
          <div className="flex gap-3 justify-center">
            <BigButton variant="secondary" onClick={() => handleTestTone(true)} className="!min-h-[48px] !py-2 !px-6 !text-base">
              Test Dit
            </BigButton>
            <BigButton variant="secondary" onClick={() => handleTestTone(false)} className="!min-h-[48px] !py-2 !px-6 !text-base">
              Test Dah
            </BigButton>
          </div>
          <p className="text-center text-gray-500 text-sm">
            Click to hear a test tone
          </p>

          {/* Sidetone confirmation prompt */}
          {showSidetoneConfirmation && (
            <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
              {!showDeviceSelector ? (
                <>
                  <p className="text-center text-gray-200 mb-3">Did you hear the tone?</p>
                  <div className="flex gap-3 justify-center">
                    <BigButton variant="success" onClick={handleHeardTone} className="!min-h-[40px] !py-2 !px-4 !text-sm">
                      Yes, I heard it
                    </BigButton>
                    <BigButton variant="secondary" onClick={handleDidntHearTone} className="!min-h-[40px] !py-2 !px-4 !text-sm">
                      No, I didn't
                    </BigButton>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-center text-gray-200 mb-3">Select your headphones or speakers:</p>
                  <BigSelect
                    value={selectedLocalDevice || ""}
                    onChange={(v) => onLocalDeviceChange(v || null)}
                    options={outputDevices.map((d) => ({
                      value: d.internal_name,
                      label: d.display_name,
                    }))}
                    placeholder="System Default"
                  />
                  <div className="flex gap-3 justify-center mt-3">
                    <BigButton variant="secondary" onClick={() => handleTestTone(true)} className="!min-h-[40px] !py-2 !px-4 !text-sm">
                      Try Again
                    </BigButton>
                    <BigButton variant="success" onClick={handleHeardTone} className="!min-h-[40px] !py-2 !px-4 !text-sm">
                      I hear it now
                    </BigButton>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Keyer type selection */}
        <div className="space-y-2">
          <label className="block text-base text-gray-200 font-medium">Key type:</label>
          <BigSelect
            value={keyerType}
            onChange={onKeyerTypeChange}
            options={KEYER_TYPES}
            placeholder="Select your key type..."
          />
        </div>

        {/* Speed and tone settings */}
        <CollapsibleSection title="Adjust speed and tone" defaultOpen={false}>
          <div className="space-y-4 pt-2">
            {keyerType !== "Straight" && (
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  Speed: <span className="text-amber-400 font-bold">{wpm} WPM</span>
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={wpm}
                  onChange={(e) => onWpmChange(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-300 mb-1">
                Tone pitch: <span className="text-amber-400 font-bold">{sidetoneFrequency} Hz</span>
              </label>
              <input
                type="range"
                min="400"
                max="1000"
                step="10"
                value={sidetoneFrequency}
                onChange={(e) => onSidetoneFrequencyChange(parseInt(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        </CollapsibleSection>
      </div>
    </WizardLayout>
  );
}

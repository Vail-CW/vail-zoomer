import { WizardLayout } from "../wizard/WizardLayout";
import { Card } from "../shared/Card";
import { Row, RowGroup } from "../shared/Field";
import { Select } from "../shared/Select";
import { Slider } from "../shared/Slider";
import { Callout } from "../shared/Callout";
import { KeyLamp } from "../shared/KeyLamp";
import { StatusDot } from "../shared/StatusDot";
import { PlugIcon } from "../shared/icons";
import { isVailMidiDevice } from "../audio/audioHelpers";
import { KEYER_TYPES, makeFriendlyLabeler, splitMidiDevices } from "../audio/keyerTypes";

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
  const label = makeFriendlyLabeler(midiDevices, isVailMidiDevice);
  const { vail, other } = splitMidiDevices(midiDevices, isVailMidiDevice);
  const options = [...vail, ...other].map((d) => ({ value: d, label: label(d) }));

  return (
    <WizardLayout
      currentStep={1}
      totalSteps={4}
      stepLabels={["Keyer", "Virtual audio", "Audio", "Video app"]}
      title="Connect your Vail Adapter"
      subtitle="Plug it in over USB. It connects automatically."
      onNext={onNext}
      nextDisabled={!midiConnected}
      showBack={false}
    >
      {midiDevices.length === 0 ? (
        <Callout tone="warn" icon={<PlugIcon />} title="Looking for your adapter">
          It will appear here as soon as your computer sees it.
        </Callout>
      ) : midiConnected ? (
        <div className="flex h-9 items-center gap-2 rounded-md border border-success/30 bg-success/10 px-3 text-base">
          <StatusDot tone="success" />
          <span className="min-w-0 flex-1 truncate">
            {selectedMidiDevice ? label(selectedMidiDevice) : "Vail Adapter"} connected. Press your key to test.
          </span>
          <KeyLamp down={isKeyDown} />
        </div>
      ) : (
        <Card title="Adapter">
          <Select
            aria-label="Vail Adapter"
            value={selectedMidiDevice ?? ""}
            onChange={(v) => v && onSelectMidiDevice(v)}
            options={options}
            placeholder="Choose your adapter"
          />
        </Card>
      )}

      <Card title="Keyer" padded={false}>
        <RowGroup>
          <Row label="Key type" help={KEYER_TYPES.find((k) => k.value === keyerType)?.description} stack>
            <Select
              aria-label="Key type"
              value={keyerType}
              onChange={onKeyerTypeChange}
              options={KEYER_TYPES}
              hidePlaceholder
            />
          </Row>
          {keyerType !== "Straight" && (
            <Row label="Speed" stack>
              <Slider
                min={5}
                max={50}
                value={wpm}
                onChange={onWpmChange}
                aria-label="Words per minute"
                valueLabel={`${wpm} WPM`}
              />
            </Row>
          )}
          <Row label="Tone pitch" help="You can change these any time from the main screen." stack>
            <Slider
              min={400}
              max={1000}
              step={10}
              value={sidetoneFrequency}
              onChange={onSidetoneFrequencyChange}
              aria-label="Tone pitch"
              valueLabel={`${sidetoneFrequency} Hz`}
            />
          </Row>
        </RowGroup>
      </Card>
    </WizardLayout>
  );
}

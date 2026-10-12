import { useEffect, useRef, useState } from "react";
import { Sheet } from "../shared/Modal";
import { Card } from "../shared/Card";
import { Row, RowGroup } from "../shared/Field";
import { Select } from "../shared/Select";
import { Slider } from "../shared/Slider";
import { Switch } from "../shared/Switch";
import { SegmentedControl } from "../shared/SegmentedControl";
import { Button } from "../shared/Button";
import { IconButton } from "../shared/IconButton";
import { StatusChip } from "../shared/StatusDot";
import { RefreshIcon } from "../shared/icons";
import {
  MicSection,
  SidetoneRouteButtons,
  LocalOutputPicker,
  VirtualOutputRow,
  isVailMidiDevice,
  DeviceInfo,
  OSType,
} from "../audio";
import { KEYER_TYPES, makeFriendlyLabeler, splitMidiDevices } from "../audio/keyerTypes";

interface SettingsSheetProps {
  // Devices
  midiDevices: string[];
  selectedMidiDevice: string | null;
  midiConnected: boolean;
  inputDevices: DeviceInfo[];
  outputDevices: DeviceInfo[];
  selectedInputDevice: string | null;
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
  /** Opens the install flow for the virtual cable (wizard step 2). */
  onSetupOutput: () => void;
  onRerunSetup: () => void;
  onClose: () => void;
}

const UI_SCALES = [
  { value: 1.0, label: "Normal" },
  { value: 1.15, label: "Large" },
  { value: 1.3, label: "Largest" },
];

export function SettingsSheet({
  midiDevices,
  selectedMidiDevice,
  midiConnected,
  inputDevices,
  outputDevices,
  selectedInputDevice,
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
  onSetupOutput,
  onRerunSetup,
  onClose,
}: SettingsSheetProps) {
  const [confirmReset, setConfirmReset] = useState(false);

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
  useEffect(
    () => () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
    },
    [],
  );

  const midiLabel = makeFriendlyLabeler(midiDevices, isVailMidiDevice);
  const { vail, other } = splitMidiDevices(midiDevices, isVailMidiDevice);
  const midiOptions = [...vail, ...other].map((d) => ({ value: d, label: midiLabel(d) }));

  const scaleValue = UI_SCALES.reduce((best, s) =>
    Math.abs(s.value - uiScale) < Math.abs(best.value - uiScale) ? s : best,
  ).value;

  return (
    <Sheet title="Settings" onClose={onClose}>
      <div className="space-y-4">
        {/* Devices */}
        <Card title="Devices" padded={false}>
          <RowGroup>
            <Row
              label="Vail Adapter"
              stack
              htmlFor="midi-select"
              action={
                <span className="flex items-center gap-1">
                  <StatusChip tone={midiConnected ? "success" : "warn"} dot size="xs">
                    {midiConnected ? "Connected" : "Not connected"}
                  </StatusChip>
                  <IconButton aria-label="Rescan MIDI devices" onClick={onRefreshMidiDevices} className="-my-1">
                    <RefreshIcon />
                  </IconButton>
                </span>
              }
              help={midiDevices.length === 0 ? "No MIDI devices found. Plug in your adapter over USB." : undefined}
            >
              <Select
                id="midi-select"
                value={selectedMidiDevice ?? ""}
                onChange={(v) => v && onSelectMidiDevice(v)}
                options={midiOptions}
                placeholder="Choose your adapter"
              />
            </Row>

            <div className="py-2">
              <MicSection
                label="Microphone"
                inputDevices={inputDevices}
                selectedInputDevice={selectedInputDevice}
                micLevel={micLevel}
                micVolume={micVolume}
                onInputDeviceChange={onInputDeviceChange}
                onMicVolumeChange={onMicVolumeChange}
                onRefreshDevices={onRefreshDevices}
              />
            </div>

            <div className="py-2">
              <p className="mb-1.5 text-base text-ink">Output</p>
              <VirtualOutputRow outputDevices={outputDevices} currentOS={currentOS} onSetup={onSetupOutput} />
            </div>

            <div className="space-y-3 py-2">
              <SidetoneRouteButtons route={sidetoneRoute} onChange={onSidetoneRouteChange} />
              {sidetoneRoute === "Both" && (
                <LocalOutputPicker
                  outputDevices={outputDevices}
                  selectedLocalDevice={selectedLocalDevice}
                  onLocalDeviceChange={onLocalDeviceChange}
                  onRefreshDevices={onRefreshDevices}
                  label="Computer speakers or headphones"
                />
              )}
            </div>
          </RowGroup>
        </Card>

        {/* Keyer */}
        <Card title="Keyer" padded={false}>
          <RowGroup>
            <Row label="Key type" stack htmlFor="keyer-select" help={KEYER_TYPES.find((k) => k.value === keyerType)?.description}>
              <Select
                id="keyer-select"
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
                  onChange={(v) => {
                    onWpmChange(v);
                    schedulePreview(sidetoneFrequency);
                  }}
                  aria-label="Words per minute"
                  valueLabel={`${wpm} WPM`}
                />
              </Row>
            )}
          </RowGroup>
        </Card>

        {/* Sidetone */}
        <Card title="Sidetone" padded={false}>
          <RowGroup>
            <Row label="Pitch" stack>
              <Slider
                min={400}
                max={1000}
                step={10}
                value={sidetoneFrequency}
                onChange={(hz) => {
                  onSidetoneFrequencyChange(hz);
                  schedulePreview(hz);
                }}
                aria-label="Tone pitch"
                valueLabel={`${sidetoneFrequency} Hz`}
              />
            </Row>
            <Row label="Volume" stack>
              <Slider
                min={0}
                max={100}
                value={Math.round(sidetoneVolume * 100)}
                onChange={(v) => onSidetoneVolumeChange(v / 100)}
                aria-label="Tone volume"
                valueLabel={`${Math.round(sidetoneVolume * 100)}%`}
              />
            </Row>
            <Row label="Edge softness" stack help="Higher is softer with fewer clicks. Lower is crisper.">
              <Slider
                min={1}
                max={20}
                value={sidetoneRiseMs}
                onChange={(ms) => {
                  onSidetoneRiseMsChange(ms);
                  schedulePreview(sidetoneFrequency);
                }}
                aria-label="Tone edge softness in milliseconds"
                valueLabel={`${sidetoneRiseMs} ms`}
              />
            </Row>
          </RowGroup>
        </Card>

        {/* Audio */}
        <Card title="Audio" padded={false}>
          <RowGroup>
            <Row label="Auto-mute mic while sending" help="Silences your mic while you key, so the tone cannot loop back.">
              <Switch checked={micDucking} onChange={onMicDuckingChange} aria-label="Auto-mute mic while sending" />
            </Row>
            <Row
              label="Latency"
              stack
              help="Low has less delay but may crackle on slow machines. Safe never crackles. Applies next time audio starts."
            >
              <SegmentedControl
                aria-label="Audio latency"
                value={bufferSizeMode}
                onChange={onBufferSizeModeChange}
                options={[
                  { value: "Auto", label: "Auto" },
                  { value: "Low", label: "Low" },
                  { value: "Safe", label: "Safe" },
                ]}
              />
            </Row>
          </RowGroup>
        </Card>

        {/* Display */}
        <Card title="Display" padded={false}>
          <RowGroup>
            <Row label="Theme" stack>
              <SegmentedControl
                aria-label="Theme"
                value={theme}
                onChange={onThemeChange}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                  { value: "system", label: "System" },
                ]}
              />
            </Row>
            <Row label="Text and control size" stack help="Makes the whole interface larger. Applies right away.">
              <SegmentedControl
                aria-label="Text and control size"
                value={scaleValue}
                onChange={onUiScaleChange}
                options={UI_SCALES}
              />
            </Row>
          </RowGroup>
        </Card>

        {/* Setup */}
        <div className="flex items-center justify-between gap-3 px-1">
          <div className="min-w-0">
            <p className="text-base text-ink">First-time setup</p>
            <p className="text-sm text-muted">Run the four-step wizard again.</p>
          </div>
          {confirmReset ? (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmReset(false);
                  onRerunSetup();
                }}
              >
                Confirm
              </Button>
              <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
            </div>
          ) : (
            <Button className="shrink-0" onClick={() => setConfirmReset(true)}>
              Re-run setup
            </Button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

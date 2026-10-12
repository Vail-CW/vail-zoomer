import { Select } from "../shared/Select";
import { Slider } from "../shared/Slider";
import { Meter } from "../shared/Meter";
import { IconButton } from "../shared/IconButton";
import { RefreshIcon } from "../shared/icons";
import { DeviceInfo, isVirtualInput } from "./audioHelpers";

interface MicSectionProps {
  label: string;
  inputDevices: DeviceInfo[];
  selectedInputDevice: string | null;
  micLevel: number;
  micVolume: number;
  onInputDeviceChange: (device: string | null) => void;
  onMicVolumeChange: (volume: number) => void;
  onRefreshDevices?: () => void;
  /** Optional "Don't see your microphone?" diagnostics link. Only Step 3 uses it. */
  onOpenDiagnostics?: () => void;
}

export function MicSection({
  label,
  inputDevices,
  selectedInputDevice,
  micLevel,
  micVolume,
  onInputDeviceChange,
  onMicVolumeChange,
  onRefreshDevices,
  onOpenDiagnostics,
}: MicSectionProps) {
  const realInputs = inputDevices.filter((d) => !isVirtualInput(d));
  const selectedValue =
    selectedInputDevice && realInputs.some((d) => d.internal_name === selectedInputDevice)
      ? selectedInputDevice
      : "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="mic-select" className="text-base text-ink">
          {label}
        </label>
        {onRefreshDevices && (
          <IconButton aria-label="Rescan microphones" onClick={onRefreshDevices} className="-my-1">
            <RefreshIcon />
          </IconButton>
        )}
      </div>
      <Select
        id="mic-select"
        value={selectedValue}
        onChange={(v) => v && onInputDeviceChange(v)}
        onOpen={onRefreshDevices}
        options={realInputs.map((d) => ({ value: d.internal_name, label: d.display_name }))}
        placeholder={realInputs.length === 0 ? "No microphones detected" : "Choose a microphone"}
      />
      <Meter level={micLevel} label="Microphone" />
      <Slider
        min={0}
        max={150}
        value={Math.round(micVolume * 100)}
        onChange={(v) => onMicVolumeChange(v / 100)}
        aria-label="Microphone volume"
        valueLabel={micVolume === 0 ? "Muted" : `${Math.round(micVolume * 100)}%`}
      />
      {onOpenDiagnostics && (
        <button
          type="button"
          onClick={onOpenDiagnostics}
          className="rounded text-sm text-muted underline underline-offset-2 transition-colors hover:text-ink"
        >
          Don't see your microphone?
        </button>
      )}
    </div>
  );
}

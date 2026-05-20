import { BigSelect } from "../shared/BigSelect";
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
      <div className="flex items-center justify-between">
        <label className="block text-lg text-gray-200 font-medium">{label}</label>
        {onRefreshDevices && (
          <button
            onClick={onRefreshDevices}
            title="Re-scan connected microphones"
            className="min-h-[44px] text-base text-gray-300 hover:text-amber-300 flex items-center gap-1 px-3 py-1 rounded hover:bg-gray-800"
          >
            ↻ Refresh
          </button>
        )}
      </div>
      <BigSelect
        value={selectedValue}
        onChange={(v) => v && onInputDeviceChange(v)}
        onOpen={onRefreshDevices}
        options={realInputs.map((d) => ({
          value: d.internal_name,
          label: d.display_name,
        }))}
        placeholder={realInputs.length === 0 ? "No microphones detected" : "Choose a microphone…"}
      />
      {onOpenDiagnostics && (
        <button
          onClick={onOpenDiagnostics}
          className="min-h-[44px] text-base text-gray-300 hover:text-amber-300 underline"
        >
          Don't see your microphone?
        </button>
      )}

      {/* Level meter */}
      <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-75 ${
            micLevel > 0.8 ? "bg-red-500" : micLevel > 0.5 ? "bg-yellow-500" : "bg-green-500"
          }`}
          style={{ width: `${Math.min(micLevel * 100, 100)}%` }}
        />
      </div>

      {/* Mic volume slider with mute label */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-base text-gray-200 w-24">
          {micVolume === 0 ? (
            <span className="text-amber-400 font-medium">Muted</span>
          ) : (
            `${Math.round(micVolume * 100)}%`
          )}
        </span>
        <input
          type="range"
          min="0"
          max="150"
          value={Math.round(micVolume * 100)}
          onChange={(e) => onMicVolumeChange(parseInt(e.target.value) / 100)}
          className="flex-1"
          aria-label="Microphone volume"
        />
      </div>

      {micVolume === 0 && (
        <p className="text-base text-amber-300">
          Drag the slider to unmute and adjust your microphone volume.
        </p>
      )}
    </div>
  );
}

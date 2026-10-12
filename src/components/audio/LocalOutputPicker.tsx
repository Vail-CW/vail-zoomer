import { useEffect } from "react";
import { Select } from "../shared/Select";
import { DeviceInfo, isVirtualOutput } from "./audioHelpers";

interface LocalOutputPickerProps {
  outputDevices: DeviceInfo[];
  selectedLocalDevice: string | null;
  onLocalDeviceChange: (device: string | null) => void;
  onRefreshDevices?: () => void;
  label?: string;
}

export function LocalOutputPicker({
  outputDevices,
  selectedLocalDevice,
  onLocalDeviceChange,
  onRefreshDevices,
  label = "Speakers or headphones",
}: LocalOutputPickerProps) {
  const candidates = outputDevices.filter((d) => !isVirtualOutput(d));
  const selectedIsAvailable =
    !!selectedLocalDevice && candidates.some((d) => d.internal_name === selectedLocalDevice);

  // Force a real device pick, never the OS default (a common source of
  // confusion). If nothing is chosen yet or the saved device disappeared,
  // pick the first available real device.
  useEffect(() => {
    if (candidates.length === 0) return;
    if (!selectedLocalDevice || !selectedIsAvailable) {
      onLocalDeviceChange(candidates[0].internal_name);
    }
  }, [candidates, selectedLocalDevice, selectedIsAvailable, onLocalDeviceChange]);

  return (
    <div className="space-y-1.5">
      <label htmlFor="local-output-select" className="block text-base text-ink">
        {label}
      </label>
      <Select
        id="local-output-select"
        value={selectedIsAvailable ? selectedLocalDevice! : ""}
        onChange={(v) => onLocalDeviceChange(v || null)}
        onOpen={onRefreshDevices}
        options={candidates.map((d) => ({ value: d.internal_name, label: d.display_name }))}
        hidePlaceholder
      />
      {candidates.length === 0 && (
        <p className="text-sm text-warn-fg">No speakers or headphones detected. Plug something in.</p>
      )}
    </div>
  );
}

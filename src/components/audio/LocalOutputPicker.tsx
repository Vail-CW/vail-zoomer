import { useEffect } from "react";
import { BigSelect } from "../shared/BigSelect";
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
  label = "Your speakers / headphones",
}: LocalOutputPickerProps) {
  const candidates = outputDevices.filter((d) => !isVirtualOutput(d));
  const selectedIsAvailable =
    !!selectedLocalDevice && candidates.some((d) => d.internal_name === selectedLocalDevice);

  // Force a real device pick — never fall through to the OS default, which is
  // a common source of confusion when the user's OS default is wrong. If
  // nothing's chosen yet or the saved device disappeared, pick the first
  // available real device automatically.
  useEffect(() => {
    if (candidates.length === 0) return;
    if (!selectedLocalDevice || !selectedIsAvailable) {
      onLocalDeviceChange(candidates[0].internal_name);
    }
  }, [candidates, selectedLocalDevice, selectedIsAvailable, onLocalDeviceChange]);

  return (
    <div className="space-y-1">
      <label className="block text-lg text-gray-200 font-medium">{label}</label>
      <BigSelect
        value={selectedIsAvailable ? selectedLocalDevice! : ""}
        onChange={(v) => onLocalDeviceChange(v || null)}
        onOpen={onRefreshDevices}
        options={candidates.map((d) => ({
          value: d.internal_name,
          label: d.display_name,
        }))}
        hidePlaceholder
      />
      {candidates.length === 0 && (
        <p className="text-sm text-amber-300">
          No speakers or headphones detected — plug something in.
        </p>
      )}
    </div>
  );
}

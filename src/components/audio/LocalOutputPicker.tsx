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
  return (
    <div className="space-y-1">
      <label className="block text-lg text-gray-200 font-medium">{label}</label>
      <BigSelect
        value={selectedLocalDevice || ""}
        onChange={(v) => onLocalDeviceChange(v || null)}
        onOpen={onRefreshDevices}
        options={candidates.map((d) => ({
          value: d.internal_name,
          label: d.display_name,
        }))}
        placeholder="System default"
      />
    </div>
  );
}

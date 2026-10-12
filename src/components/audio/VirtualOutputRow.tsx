import { Button } from "../shared/Button";
import { StatusDot } from "../shared/StatusDot";
import { DeviceInfo, OSType, findVirtualOutput, virtualDriverName } from "./audioHelpers";

interface VirtualOutputRowProps {
  outputDevices: DeviceInfo[];
  currentOS: OSType;
  /** Opens the install flow. Shown only while the driver is missing. */
  onSetup: () => void;
  className?: string;
}

/**
 * Read-only status of the forced virtual output. The app always routes to the
 * platform's virtual cable; there is no picker.
 */
export function VirtualOutputRow({ outputDevices, currentOS, onSetup, className = "" }: VirtualOutputRowProps) {
  const driver = virtualDriverName(currentOS);
  const found = findVirtualOutput(outputDevices, currentOS) !== null;

  if (found) {
    return (
      <div
        className={`flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 text-base ${className}`}
        role="status"
      >
        <StatusDot tone="success" />
        <span className="min-w-0 flex-1 truncate">Sending to Zoom via {driver}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex h-9 items-center gap-2 rounded-md border border-warn/30 bg-warn/10 pl-3 pr-1 text-base ${className}`}
      role="status"
    >
      <StatusDot tone="warn" />
      <span className="min-w-0 flex-1 truncate text-warn-fg">{driver} not installed</span>
      <Button size="sm" variant="secondary" onClick={onSetup}>
        {currentOS === "linux" ? "Set up" : "Install"}
      </Button>
    </div>
  );
}

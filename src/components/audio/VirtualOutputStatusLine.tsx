import { VirtualOutputStatus } from "./audioHelpers";

interface VirtualOutputStatusLineProps {
  status: VirtualOutputStatus;
}

/**
 * Compact one-line status row showing whether the platform's virtual
 * audio cable is installed and selected. Renders nothing on Linux
 * (where the app manages its own virtual device) or when the status
 * object has kind "none".
 */
export function VirtualOutputStatusLine({ status }: VirtualOutputStatusLineProps) {
  if (status.kind === "none") return null;
  const tone =
    status.kind === "ok"
      ? { container: "bg-green-900/30 border-green-700", icon: "text-green-400", glyph: "✓" }
      : { container: "bg-yellow-900/30 border-yellow-700", icon: "text-yellow-400", glyph: "!" };

  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 ${tone.container}`}>
      <span className={`text-2xl leading-none ${tone.icon}`}>{tone.glyph}</span>
      <p className="text-base text-gray-100">{status.text}</p>
    </div>
  );
}

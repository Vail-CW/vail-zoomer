export interface DeviceInfo {
  display_name: string;
  internal_name: string;
}

export type OSType = "windows" | "macos" | "linux";

/** Hardware identifiers that Vail Adapters surface as MIDI device names. */
const VAIL_MIDI_PATTERNS = ["vail", "xiao", "seeed", "samd21", "qt py", "qtpy"];

export const isVailMidiDevice = (rawName: string): boolean => {
  const n = rawName.toLowerCase();
  return VAIL_MIDI_PATTERNS.some((p) => n.includes(p));
};

/**
 * Friendly label for a MIDI device. Vail Adapter hardware ships as a
 * Seeed XIAO / QT Py / SAMD21 board — non-technical users shouldn't ever
 * see those raw board names, so we collapse them all to "Vail Adapter".
 */
export const friendlyMidiName = (rawName: string): string =>
  isVailMidiDevice(rawName) ? "Vail Adapter" : rawName;

/**
 * The Vail-Zoomer-managed loopback output (BlackHole on macOS, VB-Cable on
 * Windows, VailZoomer on Linux) is what gets routed to the video app —
 * users should never pick it as their local speakers or microphone.
 */
export const isVirtualOutput = (d: DeviceInfo): boolean => {
  const i = d.internal_name.toLowerCase();
  const n = d.display_name.toLowerCase();
  return (
    i.includes("vailzoomer") ||
    n.includes("vail zoomer") ||
    i.includes("blackhole") ||
    n.includes("blackhole") ||
    i.includes("cable") ||
    n.includes("cable") ||
    i.includes("vb-audio") ||
    n.includes("vb-audio")
  );
};

/** Inputs that came from a virtual driver — same idea, narrower set. */
export const isVirtualInput = (d: DeviceInfo): boolean => {
  const i = d.internal_name.toLowerCase();
  const n = d.display_name.toLowerCase();
  return (
    i.includes("vailzoomer") ||
    n.includes("vail zoomer") ||
    i.includes("blackhole") ||
    n.includes("blackhole")
  );
};

/** True if this is the recommended virtual output for the current platform. */
export const isRecommendedVirtualOutput = (d: DeviceInfo, os: OSType): boolean => {
  const i = d.internal_name.toLowerCase();
  const n = d.display_name.toLowerCase();
  if (os === "linux") return i === "vailzoomer" || n.includes("vailzoomer");
  if (os === "macos") return i.includes("blackhole") || n.includes("blackhole");
  return (
    i.includes("cable") ||
    n.includes("cable") ||
    i.includes("vb-audio") ||
    n.includes("vb-audio")
  );
};

export type VirtualOutputStatusKind = "ok" | "warn" | "missing" | "none";

export interface VirtualOutputStatus {
  kind: VirtualOutputStatusKind;
  driverName: string;
  /** True if the OS reports the driver installed at all. */
  installed: boolean;
  /** True if the driver is currently selected as the output. */
  selected: boolean;
  text: string;
}

/**
 * Single source of truth for "is the platform virtual cable installed and
 * selected?". Used by both the wizard's audio step (renders a status row)
 * and the settings sheet (annotates the output picker).
 */
export const getVirtualOutputStatus = (
  outputDevices: DeviceInfo[],
  selectedOutput: string | null,
  os: OSType,
): VirtualOutputStatus => {
  if (os === "linux") {
    return { kind: "none", driverName: "", installed: false, selected: false, text: "" };
  }
  const driverName = os === "macos" ? "BlackHole" : "VB-Cable";
  const installed = outputDevices.some((d) => isRecommendedVirtualOutput(d, os));
  const selected = !!selectedOutput && outputDevices.some(
    (d) => d.internal_name === selectedOutput && isRecommendedVirtualOutput(d, os),
  );
  if (!installed) {
    return {
      kind: "missing",
      driverName,
      installed,
      selected,
      text: `${driverName} isn't installed — go back to Step 2.`,
    };
  }
  if (!selected) {
    return {
      kind: "warn",
      driverName,
      installed,
      selected,
      text: `${driverName} found but not selected — restart the app.`,
    };
  }
  return {
    kind: "ok",
    driverName,
    installed,
    selected,
    text: `${driverName} is routing morse to Zoom.`,
  };
};

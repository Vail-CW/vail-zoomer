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

/**
 * Inputs that came from a virtual driver. These should never be offered as a
 * microphone — they're routing endpoints, not capture devices. VB-Cable's
 * "CABLE Output" shows up as a recordable input on Windows, so it's included
 * here to keep it out of the mic picker.
 */
export const isVirtualInput = (d: DeviceInfo): boolean => {
  const text = `${d.internal_name} ${d.display_name}`.toLowerCase();
  return (
    text.includes("vailzoomer") ||
    text.includes("vail zoomer") ||
    text.includes("blackhole") ||
    // VB-Cable shows up as "CABLE Input/Output (VB-Audio Virtual Cable)". Match
    // those specific names rather than a bare "cable" so we do not accidentally
    // hide a real microphone that just happens to have "cable" in its name.
    text.includes("vb-audio") ||
    text.includes("vb-cable") ||
    text.includes("cable input") ||
    text.includes("cable output")
  );
};

/** True if this is the recommended virtual output for the current platform. */
export const isRecommendedVirtualOutput = (d: DeviceInfo, os: OSType): boolean => {
  const i = d.internal_name.toLowerCase();
  const n = d.display_name.toLowerCase();
  if (os === "linux") return i === "vailzoomer" || n.includes("vailzoomer") || n.includes("vail zoomer");
  if (os === "macos") return i.includes("blackhole") || n.includes("blackhole");
  return (
    i.includes("cable") ||
    n.includes("cable") ||
    i.includes("vb-audio") ||
    n.includes("vb-audio")
  );
};

/** Display name of the virtual cable driver for this platform. */
export const virtualDriverName = (os: OSType): string =>
  os === "macos" ? "BlackHole" : os === "linux" ? "VailZoomer" : "VB-Cable";

/** The platform's virtual output device, or null when the driver is missing. */
export const findVirtualOutput = (
  devices: DeviceInfo[],
  os: OSType,
): DeviceInfo | null => devices.find((d) => isRecommendedVirtualOutput(d, os)) ?? null;

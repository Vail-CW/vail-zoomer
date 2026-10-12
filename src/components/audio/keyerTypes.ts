/** Keyer modes understood by the backend, with one-line descriptions. */
export const KEYER_TYPES: { value: string; label: string; description: string }[] = [
  { value: "Straight", label: "Straight Key", description: "One paddle, you control all timing" },
  { value: "Bug", label: "Bug", description: "Automatic dits, manual dahs" },
  { value: "ElBug", label: "Electric Bug", description: "Bug with electronic timing" },
  { value: "SingleDot", label: "Single Dot", description: "One dit per squeeze" },
  { value: "Ultimatic", label: "Ultimatic", description: "Last paddle pressed wins" },
  { value: "PlainIambic", label: "Plain Iambic", description: "Alternating dits and dahs" },
  { value: "IambicA", label: "Iambic A", description: "Stops after the current element" },
  { value: "IambicB", label: "Iambic B", description: "Adds the opposite element on release" },
  { value: "Keyahead", label: "Keyahead", description: "Buffers the next element while sending" },
];

/** Group MIDI device names: Vail-family first, loopbacks hidden. */
export function splitMidiDevices(
  devices: string[],
  isVail: (name: string) => boolean,
): { vail: string[]; other: string[] } {
  const isLoopback = (d: string) => {
    const n = d.toLowerCase();
    return n.includes("vail zoomer output") || n.includes("vailzoomer") || n.includes("midi through");
  };
  const usable = devices.filter((d) => !isLoopback(d));
  return { vail: usable.filter(isVail), other: usable.filter((d) => !isVail(d)) };
}

/** "Vail Adapter" (numbered when several are plugged in); other names unchanged. */
export function makeFriendlyLabeler(devices: string[], isVail: (name: string) => boolean) {
  const vailMatches = devices.filter(isVail);
  return (device: string) => {
    if (!isVail(device)) return device;
    if (vailMatches.length <= 1) return "Vail Adapter";
    return `Vail Adapter ${vailMatches.indexOf(device) + 1}`;
  };
}

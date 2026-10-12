/** Key-down indicator. The amber glow is the one place accent is allowed to shout. */
export function KeyLamp({ down, size = 12 }: { down: boolean; size?: number }) {
  return (
    <span
      role="img"
      aria-label={down ? "Key down" : "Key up"}
      style={{ width: size, height: size }}
      className={`inline-block shrink-0 rounded-full border transition-colors duration-75 ${
        down ? "border-accent bg-accent shadow-glow" : "border-line-strong bg-surface3"
      }`}
    />
  );
}

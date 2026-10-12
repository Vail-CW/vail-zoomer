import type { CSSProperties } from "react";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  "aria-label": string;
  /** Text shown at the right of the track. Fixed width so nothing reflows. */
  valueLabel?: string;
  className?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  valueLabel,
  className = "",
  "aria-label": ariaLabel,
}: SliderProps) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--p": `${pct}%` } as CSSProperties}
        className="min-w-0 flex-1"
      />
      {valueLabel !== undefined && (
        <span className="w-16 shrink-0 text-right text-sm tabular-nums text-ink">{valueLabel}</span>
      )}
    </div>
  );
}

interface SegmentedControlProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  "aria-label": string;
  className?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  className = "",
  "aria-label": ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`flex h-8 gap-0.5 rounded border border-line bg-surface2 p-0.5 ${className}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`min-w-0 flex-1 truncate rounded-sm px-2.5 text-base transition-colors ${
              active
                ? "bg-accent font-semibold text-accent-fg"
                : "font-medium text-muted hover:bg-surface3 hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

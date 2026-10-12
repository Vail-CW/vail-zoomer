interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, disabled, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${
        checked ? "border-transparent bg-accent" : "border-line-strong bg-surface3"
      }`}
      {...aria}
    >
      <span
        className={`absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full shadow-sm transition-transform ${
          checked ? "translate-x-4 bg-accent-fg" : "translate-x-0 bg-ink"
        }`}
      />
    </button>
  );
}

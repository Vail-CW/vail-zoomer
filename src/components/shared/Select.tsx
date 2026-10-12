import { ChevronDownIcon } from "./icons";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  "aria-label"?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  /** Fires when the user is about to open the list. Used to re-query device
      lists so hot-plugged hardware shows up without restarting the app. */
  onOpen?: () => void;
  /** Omit the empty placeholder option (pickers that must hold a real value). */
  hidePlaceholder?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  onOpen,
  hidePlaceholder = false,
  disabled,
  id,
  "aria-label": ariaLabel,
}: SelectProps) {
  return (
    <div className={`relative ${className}`}>
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onMouseDown={onOpen}
        onFocus={onOpen}
        className="h-8 w-full cursor-pointer appearance-none truncate rounded border border-line-strong bg-surface2 pl-2.5 pr-8 text-base text-ink transition-colors hover:bg-surface3 disabled:opacity-50"
      >
        {!hidePlaceholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}

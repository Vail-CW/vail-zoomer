interface BigSelectOption {
  value: string;
  label: string;
  description?: string;
}

interface BigSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: BigSelectOption[];
  placeholder?: string;
  label?: string;
  className?: string;
}

export function BigSelect({
  value,
  onChange,
  options,
  placeholder = "Select an option...",
  label,
  className = "",
}: BigSelectProps) {
  return (
    <div className={className}>
      {label && (
        <label className="block text-lg text-gray-300 mb-2 font-medium">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-700 text-white text-lg px-4 py-3 rounded-xl border-2 border-gray-600 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

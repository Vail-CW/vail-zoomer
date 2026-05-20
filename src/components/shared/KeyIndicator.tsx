interface KeyIndicatorProps {
  isKeyDown: boolean;
  size?: "md" | "lg";
  label?: string;
  hint?: string;
}

export function KeyIndicator({
  isKeyDown,
  size = "lg",
  label,
  hint,
}: KeyIndicatorProps) {
  const dim = size === "lg" ? "w-20 h-20" : "w-14 h-14";
  const glyph = size === "lg" ? "text-3xl" : "text-2xl";
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div
        className={`${dim} rounded-full border-4 transition-all duration-75 flex items-center justify-center ${
          isKeyDown
            ? "bg-amber-500 border-amber-400 shadow-lg shadow-amber-500/50"
            : "bg-gray-700 border-gray-600"
        }`}
      >
        <span
          className={`${glyph} font-bold ${
            isKeyDown ? "text-gray-900" : "text-gray-500"
          }`}
        >
          {isKeyDown ? "●" : "○"}
        </span>
      </div>
      {label && (
        <p
          className={`text-base font-medium ${
            isKeyDown ? "text-amber-400" : "text-gray-300"
          }`}
        >
          {label}
        </p>
      )}
      {hint && !isKeyDown && (
        <p className="text-sm text-gray-400">{hint}</p>
      )}
    </div>
  );
}

interface KeyIndicatorProps {
  isKeyDown: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
  hint?: string;
  layout?: "stacked" | "inline";
}

export function KeyIndicator({
  isKeyDown,
  size = "md",
  label,
  hint,
  layout = "stacked",
}: KeyIndicatorProps) {
  const dim =
    size === "lg" ? "w-12 h-12" : size === "md" ? "w-8 h-8" : "w-6 h-6";
  const glyph =
    size === "lg" ? "text-2xl" : size === "md" ? "text-lg" : "text-sm";
  const border = size === "sm" ? "border-2" : "border-[3px]";

  const dot = (
    <div
      className={`${dim} ${border} rounded-full transition-all duration-75 flex items-center justify-center shrink-0 ${
        isKeyDown
          ? "bg-amber-500 border-amber-400 shadow-md shadow-amber-500/40"
          : "bg-surface2 border-line"
      }`}
    >
      <span
        className={`${glyph} font-bold leading-none ${
          isKeyDown ? "text-gray-900" : "text-muted"
        }`}
      >
        {isKeyDown ? "●" : "○"}
      </span>
    </div>
  );

  if (layout === "inline") {
    return (
      <div className="flex items-center gap-3">
        {dot}
        {(label || hint) && (
          <div className="flex flex-col leading-tight">
            {label && (
              <span
                className={`text-base font-medium ${
                  isKeyDown ? "text-accent-text" : "text-muted"
                }`}
              >
                {label}
              </span>
            )}
            {hint && (
              <span
                className={`text-sm transition-opacity ${
                  isKeyDown ? "opacity-0 text-muted" : "text-muted"
                }`}
                aria-hidden={isKeyDown ? "true" : undefined}
              >
                {hint}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      {dot}
      {label && (
        <p
          className={`text-base font-medium ${
            isKeyDown ? "text-accent-text" : "text-muted"
          }`}
        >
          {label}
        </p>
      )}
      {hint && !isKeyDown && <p className="text-sm text-muted">{hint}</p>}
    </div>
  );
}

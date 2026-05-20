interface SidetoneRouteButtonsProps {
  route: string;
  onChange: (route: string) => void;
  /** Show the helper line about muting the adapter's built-in speaker. */
  showAdapterMuteHint?: boolean;
  label?: string;
}

export function SidetoneRouteButtons({
  route,
  onChange,
  showAdapterMuteHint = false,
  label = "Where do you want to hear the morse tones?",
}: SidetoneRouteButtonsProps) {
  return (
    <div className="space-y-2">
      <label className="block text-lg text-gray-200 font-medium">{label}</label>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onChange("OutputOnly")}
          className={`p-4 text-center rounded-xl border-2 transition-colors min-h-[72px] ${
            route === "OutputOnly"
              ? "bg-amber-500/15 border-amber-400"
              : "bg-gray-800 border-gray-600 hover:border-gray-500"
          }`}
          aria-pressed={route === "OutputOnly"}
        >
          <div className="text-base font-medium">Adapter only</div>
          <div className="text-sm text-gray-300 mt-1">Built-in speaker</div>
        </button>
        <button
          onClick={() => onChange("Both")}
          className={`p-4 text-center rounded-xl border-2 transition-colors min-h-[72px] ${
            route === "Both"
              ? "bg-amber-500/15 border-amber-400"
              : "bg-gray-800 border-gray-600 hover:border-gray-500"
          }`}
          aria-pressed={route === "Both"}
        >
          <div className="text-base font-medium">Adapter + computer</div>
          <div className="text-sm text-gray-300 mt-1">Both speakers</div>
        </button>
      </div>
      {showAdapterMuteHint && route === "OutputOnly" && (
        <p className="text-sm text-gray-300 pt-1">
          To mute the Vail Adapter's built-in speaker, hold the dit paddle down for
          10 seconds. Power-cycle the adapter to restore it.
        </p>
      )}
    </div>
  );
}

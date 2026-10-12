import { SegmentedControl } from "../shared/SegmentedControl";

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
  label = "Hear your sidetone on",
}: SidetoneRouteButtonsProps) {
  return (
    <div className="space-y-1.5">
      <p id="sidetone-route-label" className="text-base text-ink">
        {label}
      </p>
      <SegmentedControl
        aria-label={label}
        value={route === "Both" ? "Both" : "OutputOnly"}
        onChange={onChange}
        options={[
          { value: "OutputOnly", label: "Adapter only" },
          { value: "Both", label: "Adapter + computer" },
        ]}
      />
      {showAdapterMuteHint && route === "OutputOnly" && (
        <p className="text-sm text-muted">
          To silence the adapter's speaker, hold the dit paddle for 10 seconds. Power-cycle to restore it.
        </p>
      )}
    </div>
  );
}

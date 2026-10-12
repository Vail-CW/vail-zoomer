import type { ReactNode } from "react";

interface RowProps {
  label: string;
  help?: ReactNode;
  children: ReactNode;
  /** Stack the control under the label (selects, sliders) instead of at the right. */
  stack?: boolean;
  labelId?: string;
  htmlFor?: string;
  /** Small control at the right of a stacked label (e.g. refresh). */
  action?: ReactNode;
  className?: string;
}

/** Settings row: label left, control right, small help text below. */
export function Row({ label, help, children, stack = false, labelId, htmlFor, action, className = "" }: RowProps) {
  return (
    <div className={`py-2 ${className}`}>
      <div className={stack ? "space-y-1.5" : "flex items-center justify-between gap-4"}>
        <div className={`flex min-w-0 items-center justify-between gap-2 ${stack ? "" : "flex-1"}`}>
          <label id={labelId} htmlFor={htmlFor} className="min-w-0 truncate text-base text-ink">
            {label}
          </label>
          {stack && action}
        </div>
        <div className={stack ? "" : "shrink-0"}>{children}</div>
      </div>
      {help && <p className="mt-1 text-sm text-muted">{help}</p>}
    </div>
  );
}

/** Divided list of Rows inside a Card (padded={false}). */
export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-line px-3 pb-1">{children}</div>;
}

import type { ReactNode } from "react";
import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, InfoIcon, XIcon } from "./icons";
import { IconButton } from "./IconButton";

export type CalloutTone = "info" | "success" | "warn" | "danger";

const TONE: Record<CalloutTone, { box: string; icon: string; Icon: typeof InfoIcon }> = {
  info: { box: "bg-info/10 border-info/30", icon: "text-info-fg", Icon: InfoIcon },
  success: { box: "bg-success/10 border-success/30", icon: "text-success-fg", Icon: CheckCircleIcon },
  warn: { box: "bg-warn/10 border-warn/30", icon: "text-warn-fg", Icon: AlertTriangleIcon },
  danger: { box: "bg-danger/10 border-danger/30", icon: "text-danger-fg", Icon: AlertCircleIcon },
};

interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

/** Inline banner. One line when it only has children. */
export function Callout({ tone = "info", title, children, action, icon, onDismiss, className = "" }: CalloutProps) {
  const t = TONE[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex ${title ? "items-start" : "items-center"} gap-2 rounded-md border px-3 py-2 ${t.box} ${className}`}
    >
      <span className={`${title ? "mt-0.5" : ""} ${t.icon}`}>{icon ?? <t.Icon />}</span>
      <div className="min-w-0 flex-1 text-base text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? "text-sm text-muted" : ""}>{children}</div>}
      </div>
      {action}
      {onDismiss && (
        <IconButton aria-label="Dismiss" onClick={onDismiss} className="-my-1 -mr-1.5 h-7 w-7">
          <XIcon />
        </IconButton>
      )}
    </div>
  );
}

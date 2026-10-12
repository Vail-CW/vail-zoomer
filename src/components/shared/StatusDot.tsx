import type { ReactNode } from "react";

export type Tone = "success" | "warn" | "danger" | "info" | "neutral";

const DOT: Record<Tone, string> = {
  success: "bg-success",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-faint",
};

const CHIP: Record<Tone, string> = {
  success: "bg-success/10 border-success/30 text-success-fg",
  warn: "bg-warn/10 border-warn/30 text-warn-fg",
  danger: "bg-danger/10 border-danger/30 text-danger-fg",
  info: "bg-info/10 border-info/30 text-info-fg",
  neutral: "bg-surface2 border-line text-muted",
};

export function StatusDot({ tone, className = "" }: { tone: Tone; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[tone]} ${className}`} />
  );
}

interface StatusChipProps {
  tone: Tone;
  children: ReactNode;
  /** Show a leading status dot. */
  dot?: boolean;
  icon?: ReactNode;
  size?: "xs" | "sm";
  className?: string;
}

export function StatusChip({ tone, children, dot = false, icon, size = "sm", className = "" }: StatusChipProps) {
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2 ${
        size === "sm" ? "h-6 text-sm" : "h-5 text-xs"
      } ${CHIP[tone]} ${className}`}
    >
      {dot && <StatusDot tone={tone} />}
      {icon}
      <span className="truncate">{children}</span>
    </span>
  );
}

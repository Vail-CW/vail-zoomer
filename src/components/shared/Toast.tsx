import { useEffect } from "react";
import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, InfoIcon, XIcon } from "./icons";
import { IconButton } from "./IconButton";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  /** Sticky toasts stay until dismissed or replaced (used for errors). */
  sticky?: boolean;
}

const KIND: Record<ToastKind, { Icon: typeof InfoIcon; color: string }> = {
  info: { Icon: InfoIcon, color: "text-info-fg" },
  success: { Icon: CheckCircleIcon, color: "text-success-fg" },
  warning: { Icon: AlertTriangleIcon, color: "text-warn-fg" },
  error: { Icon: AlertCircleIcon, color: "text-danger-fg" },
};

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.sticky) return;
    const t = window.setTimeout(() => onDismiss(toast.id), 4000);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.message, toast.sticky, onDismiss]);

  const { Icon, color } = KIND[toast.kind];
  return (
    <div
      role={toast.kind === "error" ? "alert" : "status"}
      className="vz-pop-in pointer-events-auto flex items-center gap-2 rounded-md border border-line-strong bg-surface py-1.5 pl-3 pr-1.5 text-base text-ink shadow-md"
    >
      <span className={color}>
        <Icon />
      </span>
      <span className="min-w-0 flex-1">{toast.message}</span>
      <IconButton aria-label="Dismiss notification" onClick={() => onDismiss(toast.id)}>
        <XIcon />
      </IconButton>
    </div>
  );
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

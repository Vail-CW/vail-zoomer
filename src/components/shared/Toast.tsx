import { useEffect } from "react";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  kind: ToastKind;
  message: string;
  /** Sticky toasts stay until dismissed or replaced (used for errors). */
  sticky?: boolean;
}

const KIND_STYLES: Record<ToastKind, string> = {
  info: "border-blue-600",
  success: "border-green-600",
  warning: "border-amber-500",
  error: "border-red-600",
};

const KIND_DOT: Record<ToastKind, string> = {
  info: "bg-blue-500",
  success: "bg-green-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
};

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.sticky) return;
    const t = window.setTimeout(() => onDismiss(toast.id), 4000);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.message, toast.sticky, onDismiss]);

  return (
    <div
      className={`pointer-events-auto flex items-center gap-3 min-h-[40px] pl-4 pr-2 py-2 rounded-xl border-2 bg-surface text-ink shadow-xl ${KIND_STYLES[toast.kind]}`}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      <span className={`w-3 h-3 rounded-full flex-shrink-0 ${KIND_DOT[toast.kind]}`} aria-hidden="true" />
      <span className="text-base flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="min-w-[40px] min-h-[40px] rounded-lg text-muted hover:text-ink hover:bg-surface2 text-xl leading-none"
        aria-label="Dismiss notification"
      >
        ×
      </button>
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
      className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 max-w-sm pointer-events-none"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

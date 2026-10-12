import { ReactNode, useId, useRef } from "react";
import { useModalA11y } from "../../hooks/useModalA11y";
import { IconButton } from "./IconButton";
import { XIcon } from "./icons";

interface ShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Pinned footer (buttons). */
  footer?: ReactNode;
}

function Header({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pl-4 pr-2">
      <h2 id={id} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      <IconButton aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>
        <XIcon />
      </IconButton>
    </div>
  );
}

const SIZES = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-2xl" } as const;

/** Centered dialog. Esc closes, focus is trapped (useModalA11y). */
export function Modal({
  title,
  onClose,
  children,
  footer,
  size = "md",
}: ShellProps & { size?: keyof typeof SIZES }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(panelRef, onClose);
  return (
    <div
      className="vz-fade-in fixed inset-0 z-50 flex items-center justify-center bg-[rgb(var(--scrim)/0.6)] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={`vz-pop-in flex max-h-full w-full flex-col overflow-hidden rounded-lg border border-line-strong bg-surface shadow-lg ${SIZES[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <Header id={titleId} title={title} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

/** Right-side sheet, 420px wide at the default scale. */
export function Sheet({ title, onClose, children, footer }: ShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useModalA11y(panelRef, onClose);
  return (
    <div
      className="vz-fade-in fixed inset-0 z-50 flex justify-end bg-[rgb(var(--scrim)/0.6)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="vz-slide-in flex h-full w-[30rem] max-w-full flex-col border-l border-line-strong bg-app shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <Header id={titleId} title={title} onClose={onClose} />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex shrink-0 items-center gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

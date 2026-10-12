import { useRef } from "react";
import { useModalA11y } from "../../hooks/useModalA11y";

interface AudioDiagnosticsModalProps {
  diagText: string;
  diagLoading: boolean;
  diagCopied: boolean;
  onCopy: () => void;
  onClose: () => void;
}

export function AudioDiagnosticsModal({
  diagText,
  diagLoading,
  diagCopied,
  onCopy,
  onClose,
}: AudioDiagnosticsModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useModalA11y(panelRef, onClose);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audio-diag-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="bg-app border border-line rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-line flex items-center justify-between">
          <div>
            <h2 id="audio-diag-title" className="text-xl font-semibold text-accent-text">
              Audio diagnostics
            </h2>
            <p className="text-base text-ink mt-0.5">
              Snapshot of every audio device on this system — including ones Vail Zoomer
              hides. If your mic is missing here, copy this and share with the developers.
            </p>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] text-muted hover:text-ink text-3xl leading-none"
            aria-label="Close diagnostics"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {diagLoading ? (
            <p className="text-base text-muted">Collecting…</p>
          ) : (
            <pre className="text-sm text-ink font-mono whitespace-pre-wrap">{diagText}</pre>
          )}
        </div>
        <div className="p-3 border-t border-line flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="min-h-[44px] px-4 text-base bg-surface2 hover:bg-line text-ink rounded-lg"
          >
            Close
          </button>
          <button
            onClick={onCopy}
            disabled={diagLoading || !diagText}
            className="min-h-[44px] px-4 text-base bg-amber-600 hover:bg-amber-500 text-white rounded-lg disabled:opacity-50"
          >
            {diagCopied ? "Copied" : "Copy for developer"}
          </button>
        </div>
      </div>
    </div>
  );
}

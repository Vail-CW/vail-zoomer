import { useEffect, useRef, useState } from "react";
import { Card } from "../shared/Card";

interface DecoderPanelProps {
  cwText: string;
  onClear: () => void;
  /** Dits/dahs of the character currently being keyed, e.g. "-.." */
  currentElements?: string;
  /** Single-line view of the last ~40 characters, no card chrome (mini mode) */
  singleLine?: boolean;
}

export function DecoderPanel({ cwText, onClear, currentElements, singleLine = false }: DecoderPanelProps) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [cwText, open]);

  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cwText);
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  if (singleLine) {
    const tail = cwText.replace(/\s+/g, " ").slice(-40);
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-surface rounded-xl font-mono text-lg min-h-[44px]">
        <span className="flex-1 min-w-0 truncate">
          {tail || <span className="text-muted">Waiting for morse…</span>}
        </span>
        {currentElements && <span className="text-accent-text tracking-widest">{currentElements}</span>}
      </div>
    );
  }

  return (
    <Card padded={false}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 min-h-[40px] text-base font-medium text-muted hover:text-ink rounded-lg"
        aria-expanded={open}
      >
        <span>Decoded morse</span>
        <svg
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div
            ref={boxRef}
            onScroll={onScroll}
            className="p-3 bg-app border border-line rounded-lg font-mono text-2xl min-h-[80px] max-h-[180px] overflow-y-auto whitespace-pre-wrap break-words leading-relaxed"
            role="log"
            aria-label="Decoded morse text"
          >
            {cwText || <span className="text-muted">Waiting for morse…</span>}
          </div>
          {currentElements ? (
            <div
              className="mt-1.5 font-mono text-2xl text-accent-text tracking-[0.3em]"
              aria-label="Current character being keyed"
            >
              {currentElements}
            </div>
          ) : null}
          {cwText && (
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={copy}
                className="min-h-[40px] px-4 text-sm bg-surface2 hover:bg-line rounded-lg"
                aria-label="Copy decoded text"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                onClick={onClear}
                className="min-h-[40px] px-4 text-sm bg-surface2 hover:bg-line rounded-lg"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

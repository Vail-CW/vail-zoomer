import { useEffect, useRef, useState } from "react";
import { Card } from "../shared/Card";
import { IconButton } from "../shared/IconButton";
import { CheckIcon, CopyIcon, TrashIcon } from "../shared/icons";

interface DecoderPanelProps {
  cwText: string;
  onClear: () => void;
  /** Dits/dahs of the character currently being keyed, e.g. "-.." */
  currentElements?: string;
  /** Estimated sending speed from the decoder (0 = unknown). */
  estimatedWpm?: number;
  /** Single-line view of the last ~40 characters, no card chrome (mini mode) */
  singleLine?: boolean;
}

export function DecoderPanel({
  cwText,
  onClear,
  currentElements,
  estimatedWpm = 0,
  singleLine = false,
}: DecoderPanelProps) {
  const [copied, setCopied] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const copyTimer = useRef<number | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [cwText]);

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
      <div className="flex h-9 items-center gap-2 rounded-md border border-line bg-surface px-3 font-mono text-lg">
        <span className="min-w-0 flex-1 truncate">
          {tail || <span className="font-sans text-base text-muted">Waiting for morse</span>}
        </span>
        <span className="w-16 shrink-0 text-right tracking-widest text-accent-text">{currentElements}</span>
      </div>
    );
  }

  return (
    <Card
      title="Decoded"
      action={
        <div className="flex items-center gap-1">
          <span
            className="w-16 text-right font-mono text-sm tracking-widest text-accent-text"
            aria-label="Current character being keyed"
          >
            {currentElements}
          </span>
          <span className="w-16 text-right text-sm tabular-nums text-muted" aria-live="polite">
            {estimatedWpm > 0 ? `${estimatedWpm.toFixed(0)} WPM` : "- WPM"}
          </span>
          <IconButton aria-label="Copy decoded text" onClick={copy} disabled={!cwText}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </IconButton>
          <IconButton aria-label="Clear decoded text" onClick={onClear} disabled={!cwText}>
            <TrashIcon />
          </IconButton>
        </div>
      }
    >
      <div
        ref={boxRef}
        onScroll={onScroll}
        className="h-24 overflow-y-auto whitespace-pre-wrap break-words rounded border border-line bg-app p-2.5 font-mono text-2xl"
        role="log"
        aria-label="Decoded morse text"
      >
        {cwText || <span className="font-sans text-base text-muted">Waiting for morse</span>}
      </div>
    </Card>
  );
}

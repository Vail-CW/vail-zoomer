import { useEffect, useRef, useState } from "react";

interface MeterProps {
  /** Linear peak level, 0..1 */
  level: number;
  label: string;
  /** Hide the dB readout (tight layouts). */
  hideReadout?: boolean;
}

const MIN_DB = -60;
const HOLD_MS = 1500;
const PEAK_DECAY_DB_PER_S = 24;
const ATTACK_TAU_MS = 15;
const RELEASE_TAU_MS = 300;

function toDb(linear: number): number {
  return linear <= 0 ? -Infinity : 20 * Math.log10(linear);
}
function dbToPos(db: number): number {
  if (!isFinite(db)) return 0;
  return Math.min(1, Math.max(0, (db - MIN_DB) / -MIN_DB));
}
function formatDb(db: number): string {
  return !isFinite(db) || db <= MIN_DB ? "-inf dB" : `${db.toFixed(0)} dB`;
}

/** Thin level meter: 6px bar, peak tick, clip dot, fixed-width dB readout. */
export function Meter({ level, label, hideReadout = false }: MeterProps) {
  const targetRef = useRef(0);
  const maskRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const [readout, setReadout] = useState("-inf dB");
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    targetRef.current = Math.max(0, Math.min(1, level));
    if (level >= 0.99) setClipped(true);
  }, [level]);

  // Smoothing runs in JS (fast attack, ~300 ms release) and the DOM is written
  // directly, so there is no CSS transition smearing the bar.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let disp = 0;
    let peakDb = -Infinity;
    let peakAt = 0;
    let lastReadout = "";
    let lastReadoutAt = 0;

    const frame = (now: number) => {
      const dt = Math.min(100, now - last);
      last = now;
      const target = targetRef.current;
      const tau = target > disp ? ATTACK_TAU_MS : RELEASE_TAU_MS;
      disp += (target - disp) * (1 - Math.exp(-dt / tau));
      if (disp < 1e-5) disp = 0;

      const db = toDb(disp);
      const tdb = toDb(target);
      if (tdb >= peakDb) {
        peakDb = tdb;
        peakAt = now;
      } else if (now - peakAt > HOLD_MS) {
        peakDb = Math.max(tdb, peakDb - (PEAK_DECAY_DB_PER_S * dt) / 1000);
      }

      if (maskRef.current) maskRef.current.style.width = `${(1 - dbToPos(db)) * 100}%`;
      if (peakRef.current) {
        peakRef.current.style.left = `${dbToPos(peakDb) * 100}%`;
        peakRef.current.style.opacity = isFinite(peakDb) && peakDb > MIN_DB ? "1" : "0";
      }
      if (now - lastReadoutAt > 100) {
        lastReadoutAt = now;
        const text = formatDb(db);
        if (text !== lastReadout) {
          lastReadout = text;
          setReadout(text);
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    if (!document.hidden) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // Zones on the -60..0 scale: green to -18, amber to -6, red above.
  const g = ((-18 - MIN_DB) / -MIN_DB) * 100;
  const a = ((-6 - MIN_DB) / -MIN_DB) * 100;

  return (
    <div className="flex w-full items-center gap-2" role="group" aria-label={`${label} level`}>
      <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-surface3">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(to right, rgb(var(--success)) 0%, rgb(var(--success)) ${g}%, rgb(var(--warn)) ${g}%, rgb(var(--warn)) ${a}%, rgb(var(--danger)) ${a}%, rgb(var(--danger)) 100%)`,
          }}
        />
        <div ref={maskRef} className="absolute right-0 top-0 h-full bg-surface3" style={{ width: "100%" }} />
        <div
          ref={peakRef}
          className="absolute top-0 -ml-px h-full w-0.5 bg-ink"
          style={{ left: "0%", opacity: 0 }}
        />
      </div>
      <button
        type="button"
        onClick={() => setClipped(false)}
        className={`h-2 w-2 shrink-0 rounded-full ${clipped ? "bg-danger" : "bg-surface3"}`}
        title={clipped ? "Clipped. Click to reset" : "No clipping"}
        aria-label={clipped ? "Clipping detected. Click to reset clip indicator" : "Clip indicator, no clipping"}
      />
      {!hideReadout && (
        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted">{readout}</span>
      )}
    </div>
  );
}

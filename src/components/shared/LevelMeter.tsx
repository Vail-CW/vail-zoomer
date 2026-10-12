import { useEffect, useRef, useState } from "react";

interface LevelMeterProps {
  /** Linear peak level, 0..1 */
  level: number;
  label?: string;
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
  return !isFinite(db) || db <= MIN_DB ? "-inf" : `${db.toFixed(1)} dB`;
}

export function LevelMeter({ level, label }: LevelMeterProps) {
  const targetRef = useRef(0);
  const maskRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const [readout, setReadout] = useState("-inf");
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    targetRef.current = Math.max(0, Math.min(1, level));
    if (level >= 0.99) setClipped(true);
  }, [level]);

  // Smoothing runs in JS (fast attack, ~300 ms release); DOM is updated
  // directly so there is no CSS transition smearing.
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
    <div className="w-full flex flex-col gap-1" role="group" aria-label={label ? `${label} level` : "Level"}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1 h-3 rounded-full overflow-hidden bg-surface2">
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to right, rgb(34 197 94) 0%, rgb(34 197 94) ${g}%, rgb(251 191 36) ${g}%, rgb(251 191 36) ${a}%, rgb(239 68 68) ${a}%, rgb(239 68 68) 100%)`,
            }}
          />
          <div ref={maskRef} className="absolute top-0 right-0 h-full bg-surface2" style={{ width: "100%" }} />
          <div
            ref={peakRef}
            className="absolute top-0 h-full w-[3px] -ml-[1.5px] bg-ink"
            style={{ left: "0%", opacity: 0 }}
          />
        </div>
        <button
          type="button"
          onClick={() => setClipped(false)}
          className={`shrink-0 w-4 h-4 rounded-sm border ${
            clipped ? "bg-red-500 border-red-400" : "bg-surface2 border-line"
          }`}
          title={clipped ? "Clipped. Click to reset" : "No clipping"}
          aria-label={clipped ? "Clipping detected. Click to reset clip indicator" : "Clip indicator, no clipping"}
        />
      </div>
      <span className="text-xs text-muted tabular-nums text-center">{readout}</span>
    </div>
  );
}

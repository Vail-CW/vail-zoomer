import { useEffect, useRef, useState } from "react";

interface KeyingTraceProps {
  isKeyDown: boolean;
}

const WINDOW_MS = 4000;
const IDLE_STOP_MS = 5000;
const HEIGHT = 56;

interface Segment {
  start: number;
  end: number | null;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export function KeyingTrace({ isKeyDown }: KeyingTraceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const segsRef = useRef<Segment[]>([]);
  const keyRef = useRef(false);
  const lastEventRef = useRef(0);
  const rafRef = useRef(0);
  const widthRef = useRef(0);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  const draw = (now: number) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = widthRef.current;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    ctx.fillStyle = `rgb(${cs.getPropertyValue("--surface-2").trim() || "55 65 81"})`;
    ctx.fillRect(0, 0, w, HEIGHT);
    ctx.fillStyle = `rgb(${cs.getPropertyValue("--accent").trim() || "245 158 11"})`;
    if (reducedRef.current) {
      if (keyRef.current) ctx.fillRect(0, 12, w, HEIGHT - 24);
      return;
    }
    const segs = segsRef.current;
    for (const s of segs) {
      const end = s.end ?? now;
      const x1 = w - ((now - end) / WINDOW_MS) * w;
      const x0 = w - ((now - s.start) / WINDOW_MS) * w;
      if (x1 < 0) continue;
      const left = Math.max(0, x0);
      ctx.fillRect(left, 12, Math.max(2, x1 - left), HEIGHT - 24);
    }
    while (segs.length && segs[0].end !== null && now - (segs[0].end as number) > WINDOW_MS) segs.shift();
  };

  const stop = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };
  const start = () => {
    if (rafRef.current || document.hidden || reducedRef.current) return;
    const frame = () => {
      const now = performance.now();
      draw(now);
      if (!keyRef.current && now - lastEventRef.current > IDLE_STOP_MS) {
        rafRef.current = 0;
        segsRef.current = [];
        draw(now); // static empty strip
        return;
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
  };

  useEffect(() => {
    const now = performance.now();
    const segs = segsRef.current;
    if (isKeyDown && !keyRef.current) {
      segs.push({ start: now, end: null });
    } else if (!isKeyDown && keyRef.current) {
      const last = segs[segs.length - 1];
      if (last && last.end === null) last.end = now;
    }
    keyRef.current = isKeyDown;
    lastEventRef.current = now;
    if (reduced) draw(now);
    else start();
  }, [isKeyDown, reduced]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const w = Math.max(1, Math.floor(wrap.clientWidth));
      const dpr = window.devicePixelRatio || 1;
      widthRef.current = w;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(HEIGHT * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${HEIGHT}px`;
      draw(performance.now());
    };
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();
    const onVis = () => {
      if (document.hidden) stop();
      else {
        draw(performance.now());
        start();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      stop();
    };
  }, []);

  return (
    <div ref={wrapRef} className="w-full rounded-lg overflow-hidden" style={{ height: HEIGHT }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={isKeyDown ? "Keying trace: key down" : "Keying trace: key up"}
        className="block"
      />
    </div>
  );
}

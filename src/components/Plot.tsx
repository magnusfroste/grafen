import { useEffect, useRef, useState } from "react";
import {
  defaultView,
  drawPlot,
  panView,
  worldAt,
  zoomView,
  type DrawFn,
  type DrawMarker,
  type View,
} from "../lib/plot";

interface Props {
  view: View | null;
  onView: (v: View) => void;
  fns: DrawFn[];
  markers: DrawMarker[];
  readout: { x: number; y: number } | null;
  onTap: (p: { x: number; y: number }) => void;
}

interface Ptr {
  x: number;
  y: number;
}

export default function Plot({ view, onView, fns, markers, readout, onTap }: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const viewProp = view;
  const effective: View = viewProp ?? defaultView(size.w || 640, size.h || 460);

  // Senaste vyn, så att snabba drag inte tappar bort sig mellan renderingar.
  const liveRef = useRef<View>(effective);
  liveRef.current = effective;

  const ptrs = useRef<Map<number, Ptr>>(new Map());
  const pinchRef = useRef<{ dist: number; mid: Ptr } | null>(null);
  const dragRef = useRef<{ start: Ptr; moved: number; t0: number } | null>(null);

  // Mät ytan
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = (width: number, height: number) => {
      const w = Math.round(width);
      const h = Math.round(height);
      if (w > 0 && h > 0) setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      apply(r.width, r.height);
    });
    ro.observe(el);
    apply(el.clientWidth, el.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Rita
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const pw = Math.round(size.w * dpr);
    const ph = Math.round(size.h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlot(ctx, {
      w: size.w,
      h: size.h,
      view: effective,
      fns,
      markers,
      readout,
      hover: null,
    });
  }, [size, effective, fns, markers, readout]);

  // Scrollhjul: zooma kring pekaren
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const k = Math.exp(Math.max(-600, Math.min(600, e.deltaY)) * 0.0015);
      const v = liveRef.current;
      const anchor = worldAt(v, px, py, rect.width, rect.height);
      const next = zoomView(v, anchor.x, anchor.y, k);
      liveRef.current = next;
      onView(next);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onView]);

  const commit = (next: View) => {
    liveRef.current = next;
    onView(next);
  };

  const doZoom = (k: number) => {
    const v = liveRef.current;
    const c = { x: (v.x0 + v.x1) / 2, y: (v.y0 + v.y1) / 2 };
    commit(zoomView(v, c.x, c.y, k));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignoreras */
    }
    const rect = canvas.getBoundingClientRect();
    ptrs.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });

    if (ptrs.current.size === 1) {
      dragRef.current = {
        start: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        moved: 0,
        t0: Date.now(),
      };
      pinchRef.current = null;
    } else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      };
      if (dragRef.current) dragRef.current.moved = 999;
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!ptrs.current.has(e.pointerId)) return;
    const rect = canvas.getBoundingClientRect();
    const p = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const prev = ptrs.current.get(e.pointerId)!;
    ptrs.current.set(e.pointerId, p);

    if (ptrs.current.size >= 2 && pinchRef.current) {
      const [a, b] = [...ptrs.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const prevPinch = pinchRef.current;
      if (dist > 4 && prevPinch.dist > 4) {
        let v = panView(liveRef.current, mid.x - prevPinch.mid.x, mid.y - prevPinch.mid.y, rect.width, rect.height);
        const k = prevPinch.dist / dist;
        const anchor = worldAt(v, mid.x, mid.y, rect.width, rect.height);
        v = zoomView(v, anchor.x, anchor.y, k);
        commit(v);
      }
      pinchRef.current = { dist, mid };
      return;
    }

    if (ptrs.current.size === 1) {
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      if (dragRef.current) dragRef.current.moved += Math.abs(dx) + Math.abs(dy);
      commit(panView(liveRef.current, dx, dy, rect.width, rect.height));
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const had = ptrs.current.has(e.pointerId);
    ptrs.current.delete(e.pointerId);
    if (ptrs.current.size < 2) pinchRef.current = null;

    if (had && canvas && ptrs.current.size === 0 && dragRef.current) {
      const d = dragRef.current;
      const dt = Date.now() - d.t0;
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const isTap = d.moved < 12 && dt < 700 && Math.hypot(px - d.start.x, py - d.start.y) < 12;
      if (isTap) {
        const w = worldAt(liveRef.current, px, py, rect.width, rect.height);
        onTap(w);
      }
      dragRef.current = null;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const v = liveRef.current;
    const stepPx = 40;
    const rect = canvasRef.current?.getBoundingClientRect();
    const w = rect?.width ?? size.w;
    const h = rect?.height ?? size.h;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        commit(panView(v, stepPx, 0, w, h));
        break;
      case "ArrowRight":
        e.preventDefault();
        commit(panView(v, -stepPx, 0, w, h));
        break;
      case "ArrowUp":
        e.preventDefault();
        commit(panView(v, 0, stepPx, w, h));
        break;
      case "ArrowDown":
        e.preventDefault();
        commit(panView(v, 0, -stepPx, w, h));
        break;
      case "+":
      case "=":
        e.preventDefault();
        doZoom(0.75);
        break;
      case "-":
      case "_":
        e.preventDefault();
        doZoom(1 / 0.75);
        break;
      case "0":
        e.preventDefault();
        onView(defaultView(w, h));
        break;
      default:
        break;
    }
  };

  return (
    <div className="plot">
      <div className="plot-frame" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="plot-canvas"
          style={{ width: size.w ? `${size.w}px` : "100%", height: size.h ? `${size.h}px` : "100%" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          role="img"
          aria-label="Graf med koordinatsystem. Dra för att flytta, nyp eller scrolla för att zooma, tryck för att läsa av en punkt."
        />
      </div>
      <div
        className="plot-keys"
        role="group"
        aria-label="Zoomknappar. Tangentbord: piltangenter flyttar, plus och minus zoomar, noll återställer vyn."
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <span className="plot-keys-hint">Dra för att flytta · nyp för att zooma · tryck för att läsa av</span>
        <div className="plot-zoom">
          <button type="button" className="zbtn" onClick={() => doZoom(0.75)} aria-label="Zooma in">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
              <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          <button type="button" className="zbtn" onClick={() => doZoom(1 / 0.75)} aria-label="Zooma ut">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="22" height="22">
              <path d="M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="zbtn zbtn-wide"
            onClick={() => {
              const rect = canvasRef.current?.getBoundingClientRect();
              onView(defaultView(rect?.width ?? size.w, rect?.height ?? size.h));
            }}
          >
            Anpassa
          </button>
        </div>
      </div>
    </div>
  );
}
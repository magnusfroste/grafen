/** Koordinatsystem och canvasritning för Grafen. */

export interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface DrawFn {
  color: string;
  eval: (x: number) => number;
}

export interface DrawMarker {
  x: number;
  y: number;
  color: string;
}

export interface DrawInput {
  w: number;
  h: number;
  view: View;
  fns: DrawFn[];
  markers: DrawMarker[];
  readout: { x: number; y: number } | null;
  hover: { x: number; y: number } | null;
}

export const COLORS = {
  paper: "#ffffff",
  ink: "#14181f",
  muted: "#5b6472",
  line: "#e7e2d9",
  gridMinor: "#f1ece4",
  accent: "#2563eb",
  curve: ["#2563eb", "#d6367f", "#0e9488"],
};

const MIN_SPAN = 1e-3;
const MAX_SPAN = 1e7;

export function defaultView(w = 640, h = 460): View {
  const xSpan = 12;
  const ySpan = (xSpan * h) / Math.max(1, w);
  return { x0: -xSpan / 2, x1: xSpan / 2, y0: -ySpan / 2, y1: ySpan / 2 };
}

export function clampView(v: View): View {
  let { x0, x1, y0, y1 } = v;
  const sx = x1 - x0;
  const sy = y1 - y0;
  const fix = (span: number, c: number) => {
    const s = Math.min(MAX_SPAN, Math.max(MIN_SPAN, span));
    return [c - s / 2, c + s / 2] as const;
  };
  [x0, x1] = fix(sx, (x0 + x1) / 2);
  [y0, y1] = fix(sy, (y0 + y1) / 2);
  return { x0, x1, y0, y1 };
}

export function panView(v: View, dpx: number, dpy: number, w: number, h: number): View {
  const dx = (dpx / Math.max(1, w)) * (v.x1 - v.x0);
  const dy = (dpy / Math.max(1, h)) * (v.y1 - v.y0);
  return clampView({ x0: v.x0 - dx, x1: v.x1 - dx, y0: v.y0 + dy, y1: v.y1 + dy });
}

/** k < 1 zoomar in, k > 1 zoomar ut. Punkten (wx, wy) står still. */
export function zoomView(v: View, wx: number, wy: number, k: number): View {
  return clampView({
    x0: wx + (v.x0 - wx) * k,
    x1: wx + (v.x1 - wx) * k,
    y0: wy + (v.y0 - wy) * k,
    y1: wy + (v.y1 - wy) * k,
  });
}

export function worldAt(v: View, px: number, py: number, w: number, h: number): { x: number; y: number } {
  return {
    x: v.x0 + (px / Math.max(1, w)) * (v.x1 - v.x0),
    y: v.y1 - (py / Math.max(1, h)) * (v.y1 - v.y0),
  };
}

/** Lagom rutnätssteg (1, 2, 5, 10 …) för ungefär `target` rutor. */
export function niceStep(span: number, target: number): number {
  if (!(span > 0) || !(target > 0)) return 1;
  const raw = span / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  const mult = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return mult * mag;
}

export function tickValues(min: number, max: number, step: number, limit = 400): number[] {
  if (!(step > 0) || !Number.isFinite(step)) return [];
  const first = Math.ceil(min / step - 1e-9) * step;
  const out: number[] = [];
  for (let k = 0; k <= limit; k++) {
    const v = first + k * step;
    if (v > max + step * 1e-6) break;
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  }
  return out;
}

function fmtAxis(v: number, step: number): string {
  const digits = Math.min(6, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  let s = v.toFixed(digits);
  if (/^-0(\.0*)?$/.test(s)) s = s.slice(1);
  return s.replace(".", ",");
}

const FONT = '500 12px Inter, system-ui, -apple-system, sans-serif';
const FONT_SMALL = '600 11px Inter, system-ui, -apple-system, sans-serif';

export function drawPlot(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const { w, h, view, fns, markers, readout } = input;
  if (w <= 0 || h <= 0) return;

  const spanX = view.x1 - view.x0;
  const spanY = view.y1 - view.y0;
  const sx = (x: number) => ((x - view.x0) / spanX) * w;
  const sy = (y: number) => h - ((y - view.y0) / spanY) * h;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = COLORS.paper;
  ctx.fillRect(0, 0, w, h);

  const stepX = niceStep(spanX, Math.max(3, Math.floor(w / 96)));
  const stepY = niceStep(spanY, Math.max(3, Math.floor(h / 72)));

  // --- Rutnät ---------------------------------------------------------
  const minorX = stepX / 5;
  const minorY = stepY / 5;
  ctx.lineWidth = 1;
  if ((minorX / spanX) * w >= 7) {
    ctx.strokeStyle = COLORS.gridMinor;
    ctx.beginPath();
    for (const v of tickValues(view.x0, view.x1, minorX, 600)) {
      const px = Math.round(sx(v)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, h);
    }
    for (const v of tickValues(view.y0, view.y1, minorY, 600)) {
      const py = Math.round(sy(v)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(w, py);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = COLORS.line;
  ctx.beginPath();
  for (const v of tickValues(view.x0, view.x1, stepX)) {
    const px = Math.round(sx(v)) + 0.5;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
  }
  for (const v of tickValues(view.y0, view.y1, stepY)) {
    const py = Math.round(sy(v)) + 0.5;
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
  }
  ctx.stroke();

  // --- Axlar ----------------------------------------------------------
  const axisYpx = sy(0);
  const axisXpx = sx(0);
  const showX = axisYpx >= 0 && axisYpx <= h;
  const showY = axisXpx >= 0 && axisXpx <= w;

  ctx.strokeStyle = COLORS.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  if (showX) {
    ctx.moveTo(0, Math.round(axisYpx) + 0.5);
    ctx.lineTo(w, Math.round(axisYpx) + 0.5);
  }
  if (showY) {
    ctx.moveTo(Math.round(axisXpx) + 0.5, 0);
    ctx.lineTo(Math.round(axisXpx) + 0.5, h);
  }
  ctx.stroke();

  // --- Axelvärden -----------------------------------------------------
  ctx.font = FONT;
  ctx.fillStyle = COLORS.muted;

  const labelBaseY = showX ? (axisYpx > h - 22 ? axisYpx - 9 : axisYpx + 17) : h - 9;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  for (const v of tickValues(view.x0, view.x1, stepX)) {
    if (v === 0 && showY) continue;
    const px = sx(v);
    if (px < 16 || px > w - 16) continue;
    ctx.fillText(fmtAxis(v, stepX), px, labelBaseY);
  }

  const labelLeftX = showY ? (axisXpx < 46 ? axisXpx + 6 : axisXpx - 8) : 8;
  const alignRight = showY ? axisXpx >= 46 : false;
  ctx.textAlign = alignRight ? "right" : "left";
  for (const v of tickValues(view.y0, view.y1, stepY)) {
    if (v === 0) continue;
    const py = sy(v);
    if (py < 12 || py > h - 12) continue;
    ctx.fillText(fmtAxis(v, stepY), labelLeftX, py + 4);
  }

  if (showX && showY && axisXpx > 20 && axisXpx < w - 20) {
    ctx.textAlign = "right";
    ctx.fillText("0", axisXpx - 8, axisYpx + 17);
  }

  // --- Kurvor ---------------------------------------------------------
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const fn of fns) {
    ctx.strokeStyle = fn.color;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    let started = false;
    let prevPy = NaN;
    const stepPx = w > 900 ? 1 : 1;
    for (let px = 0; px <= w; px += stepPx) {
      const x = view.x0 + (px / w) * spanX;
      const y = fn.eval(x);
      if (!Number.isFinite(y)) {
        started = false;
        prevPy = NaN;
        continue;
      }
      let py = sy(y);
      if (py < -1e5) py = -1e5;
      if (py > 1e5) py = 1e5;
      // Hopp över diskontinuiteter (poler) i stället för att dra ett lodrätt streck.
      if (started && Math.abs(py - prevPy) > h * 2.5) {
        started = false;
      }
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
      prevPy = py;
    }
    ctx.stroke();
  }

  // --- Markeringar (nollställen, skärningspunkter) --------------------
  for (const m of markers) {
    const px = sx(m.x);
    const py = sy(m.y);
    if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
    ctx.beginPath();
    ctx.arc(px, py, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = m.color;
    ctx.stroke();
  }

  // --- Avläsning ------------------------------------------------------
  if (readout) {
    const px = sx(readout.x);
    const py = sy(readout.y);
    ctx.save();
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = "rgba(37, 99, 235, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, h);
    ctx.moveTo(0, py);
    ctx.lineTo(w, py);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.accent;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    const label = `${fmtAxis(readout.x, 0.01)}, ${fmtAxis(readout.y, 0.01)}`;
    ctx.font = FONT_SMALL;
    const tw = ctx.measureText(label).width;
    const bw = tw + 20;
    const bh = 28;
    let bx = px + 14;
    let by = py - bh - 12;
    if (bx + bw > w - 6) bx = px - bw - 14;
    if (bx < 6) bx = 6;
    if (by < 6) by = py + 14;
    if (by + bh > h - 6) by = h - bh - 6;

    ctx.beginPath();
    const r = 9;
    ctx.moveTo(bx + r, by);
    ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
    ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
    ctx.arcTo(bx, by + bh, bx, by, r);
    ctx.arcTo(bx, by, bx + bw, by, r);
    ctx.closePath();
    ctx.fillStyle = COLORS.ink;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, bx + bw / 2, by + bh / 2 + 0.5);
  }

  ctx.restore();
}
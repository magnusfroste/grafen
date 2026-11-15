/**
 * Numeriska verktyg: nollställen och skärningspunkter.
 *
 * Metod: täta provpunkter över det synliga intervallet, teckenbyte ger en
 * startpunkt som förfinas med bisektion. Nollställen där kurvan bara tangerar
 * axeln (t.ex. x^2) hittas separat genom att minimera |f| kring lokala minimi.
 * Poler (1/x, tan x) sållas bort genom att kräva att |f| verkligen är nära 0.
 */

export interface Hit {
  x: number;
  y: number;
}

export interface HitResult {
  hits: Hit[];
  /** Antal hittade innan listan kapades. */
  total: number;
}

type Fn = (x: number) => number;

function sampleScale(values: number[]): number {
  let scale = 0;
  for (const v of values) {
    if (Number.isFinite(v)) scale = Math.max(scale, Math.abs(v));
  }
  return scale;
}

function bisect(f: Fn, a: number, b: number, fa: number, span: number): number | null {
  let lo = a;
  let hi = b;
  let flo = fa;
  for (let k = 0; k < 100; k++) {
    const mid = lo + (hi - lo) / 2;
    if (mid === lo || mid === hi) return mid;
    const fm = f(mid);
    if (!Number.isFinite(fm)) return null;
    if (fm === 0) return mid;
    if (Math.abs(hi - lo) < span * 1e-13) return mid;
    if (flo < 0 !== fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return lo + (hi - lo) / 2;
}

/** Minimerar |f| på [a,b] med gyllene snitt och returnerar punkten. */
function minimiseAbs(f: Fn, a: number, b: number): { x: number; v: number } | null {
  const g = (1 + Math.sqrt(5)) / 2;
  let lo = a;
  let hi = b;
  let c = hi - (hi - lo) / g;
  let d = lo + (hi - lo) / g;
  let fc = Math.abs(f(c));
  let fd = Math.abs(f(d));
  if (!Number.isFinite(fc) || !Number.isFinite(fd)) return null;
  for (let k = 0; k < 80; k++) {
    if (fc < fd) {
      hi = d;
      d = c;
      fd = fc;
      c = hi - (hi - lo) / g;
      fc = Math.abs(f(c));
    } else {
      lo = c;
      c = d;
      fc = fd;
      d = lo + (hi - lo) / g;
      fd = Math.abs(f(d));
    }
    if (!Number.isFinite(fc) || !Number.isFinite(fd)) return null;
    if (hi - lo < 1e-14) break;
  }
  const x = fc < fd ? c : d;
  return { x, v: Math.abs(f(x)) };
}

export function findZeros(f: Fn, x0: number, x1: number, max = 5): HitResult {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  const span = hi - lo;
  if (!(span > 0) || !Number.isFinite(span)) return { hits: [], total: 0 };

  const n = 1000;
  const dx = span / n;
  const xs: number[] = new Array(n + 1);
  const ys: number[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const x = i === n ? hi : lo + i * dx;
    xs[i] = x;
    ys[i] = f(x);
  }

  const scale = sampleScale(ys);
  // Ett nollställe ska ha |f| som är försumbart jämfört med funktionens storlek.
  const accept = Math.max(1e-7, scale * 1e-7);

  const found: number[] = [];
  const push = (x: number) => {
    if (!Number.isFinite(x)) return;
    const tol = Math.max(1e-9, span * 1e-7);
    if (found.some((r) => Math.abs(r - x) < tol)) return;
    found.push(x);
  };

  // 1. Teckenbyten
  for (let i = 0; i < n; i++) {
    const ya = ys[i];
    const yb = ys[i + 1];
    if (!Number.isFinite(ya) || !Number.isFinite(yb)) continue;
    if (ya === 0) {
      push(xs[i]);
      continue;
    }
    if (ya * yb < 0) {
      const r = bisect(f, xs[i], xs[i + 1], ya, span);
      if (r !== null && Math.abs(f(r)) <= accept) push(r);
    }
  }

  // 2. Kurvor som bara tangerar axeln, t.ex. x^2 eller (x-3)^2
  const small = Math.max(1e-6, scale * 1e-3);
  for (let i = 1; i < n; i++) {
    const ym = Math.abs(ys[i]);
    if (!Number.isFinite(ym) || ym > small) continue;
    const yl = Math.abs(ys[i - 1]);
    const yr = Math.abs(ys[i + 1]);
    if (!Number.isFinite(yl) || !Number.isFinite(yr)) continue;
    if (ym > yl || ym > yr) continue;
    const min = minimiseAbs(f, xs[i - 1], xs[i + 1]);
    if (min && min.v <= accept) push(min.x);
  }

  const hits = found
    .sort((a, b) => a - b)
    .map((x) => {
      const y = f(x);
      return { x, y: Number.isFinite(y) && Math.abs(y) < 1e-6 ? 0 : Number.isFinite(y) ? y : 0 };
    });

  return { hits: hits.slice(0, max), total: hits.length };
}

/** Skärningspunkter mellan två funktioner = nollställen för f1 - f2. */
export function findIntersections(f1: Fn, f2: Fn, x0: number, x1: number, max = 5): HitResult {
  const diff: Fn = (x) => {
    const a = f1(x);
    const b = f2(x);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    return a - b;
  };
  const res = findZeros(diff, x0, x1, max);
  const hits = res.hits.map((h) => {
    const a = f1(h.x);
    const b = f2(h.x);
    const y = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : b;
    return { x: h.x, y: Number.isFinite(y) ? y : 0 };
  });
  return { hits, total: res.total };
}
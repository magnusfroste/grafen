/** Svensk talformatering: decimalkomma, tabbar utan -0. */

export function fmt(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "–";
  let v = n;
  if (Math.abs(v) < Math.pow(10, -digits) / 2) v = 0; // undvik "-0,00"
  if (Math.abs(v) >= 1e7 || (v !== 0 && Math.abs(v) < 1e-6)) {
    return v.toExponential(Math.min(4, digits)).replace(".", ",");
  }
  let s = v.toFixed(digits);
  if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
  return s.replace(".", ",").replace("-0", "0").replace(/^0$/, "0");
}

/** Etikett på axlarna: så få decimaler som möjligt. */
export function fmtTick(n: number, step: number): string {
  if (!Number.isFinite(n)) return "";
  const digits = Math.min(6, Math.max(0, -Math.floor(Math.log10(step) + 1e-9)));
  let s = n.toFixed(digits);
  if (s === "-0" || /^-0\.0*$/.test(s)) s = s.slice(1);
  return s.replace(".", ",");
}

/** Läser in tal från fält. Tillåter både komma och punkt. */
export function readNum(text: string, fallback: number): number {
  const t = text.trim().replace(",", ".");
  if (!t) return fallback;
  const n = Number(t);
  return Number.isFinite(n) ? n : fallback;
}
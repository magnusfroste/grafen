import type { View } from "./plot";

export const MAX_FNS = 3;
export const STORAGE_KEY = "grafen-v1";

export interface FnRow {
  id: string;
  expr: string;
  on: boolean;
}

export interface Store {
  fns: FnRow[];
  view: View | null;
}

export function uid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    /* ignoreras */
  }
  return Math.random().toString(36).slice(2, 10);
}

export const DEFAULT_FNS: FnRow[] = [
  { id: "f-1", expr: "x^2 - 4", on: true },
  { id: "f-2", expr: "2x - 1", on: true },
];

function isView(v: unknown): v is View {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const nums = ["x0", "x1", "y0", "y1"].map((k) => o[k]);
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  return (o.x1 as number) > (o.x0 as number) && (o.y1 as number) > (o.y0 as number);
}

export function loadStore(): Store {
  const fallback: Store = { fns: DEFAULT_FNS.map((f) => ({ ...f })), view: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<Store>;
    const fns = Array.isArray(data.fns)
      ? data.fns
          .filter((f): f is FnRow => !!f && typeof f.expr === "string")
          .slice(0, MAX_FNS)
          .map((f) => ({
            id: typeof f.id === "string" && f.id ? f.id : uid(),
            expr: f.expr.slice(0, 120),
            on: f.on !== false,
          }))
      : [];
    return {
      fns: fns.length ? fns : fallback.fns,
      view: isView(data.view) ? data.view : null,
    };
  } catch {
    return fallback;
  }
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ fns: store.fns, view: store.view }));
  } catch {
    /* localStorage kan vara avstängt – appen fungerar ändå */
  }
}
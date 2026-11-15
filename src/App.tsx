import { useEffect, useMemo, useState } from "react";
import Plot from "./components/Plot";
import { COLORS, type DrawMarker, type View } from "./lib/plot";
import { tryParse } from "./lib/expr";
import { findIntersections, findZeros, type HitResult } from "./lib/numeric";
import { fmt, readNum } from "./lib/format";
import { MAX_FNS, loadStore, saveStore, uid, type FnRow } from "./lib/storage";

type Tool = "tabell" | "noll" | "skarning";

interface Row extends FnRow {
  idx: number;
  color: string;
  fn: ((x: number) => number) | null;
  error: string | null;
}

interface ZeroResult {
  id: string;
  range: [number, number];
  res: HitResult;
}

interface CrossResult {
  a: string;
  b: string;
  range: [number, number];
  res: HitResult;
}

const SUB = ["₁", "₂", "₃"];
const TABS: { id: Tool; label: string }[] = [
  { id: "tabell", label: "Tabell" },
  { id: "noll", label: "Nollställen" },
  { id: "skarning", label: "Skärning" },
];

const MAX_TABLE_ROWS = 200;

export default function App() {
  const [boot] = useState(loadStore);
  const [fns, setFns] = useState<FnRow[]>(boot.fns);
  const [view, setView] = useState<View | null>(boot.view);
  const [tool, setTool] = useState<Tool>("tabell");
  const [selId, setSelId] = useState(boot.fns[0]?.id ?? "");
  const [mixA, setMixA] = useState(boot.fns[0]?.id ?? "");
  const [mixB, setMixB] = useState(boot.fns[1]?.id ?? boot.fns[0]?.id ?? "");
  const [readout, setReadout] = useState<{ x: number; y: number } | null>(null);
  const [zeroRes, setZeroRes] = useState<ZeroResult | null>(null);
  const [crossRes, setCrossRes] = useState<CrossResult | null>(null);
  const [tFrom, setTFrom] = useState("-3");
  const [tTo, setTTo] = useState("3");
  const [tStep, setTStep] = useState("1");

  useEffect(() => {
    const t = setTimeout(() => saveStore({ fns, view }), 350);
    return () => clearTimeout(t);
  }, [fns, view]);

  const rows: Row[] = useMemo(
    () =>
      fns.map((f, i) => {
        const text = f.expr.trim();
        if (!text) return { ...f, idx: i, color: COLORS.curve[i], fn: null, error: null };
        const parsed = tryParse(text);
        return {
          ...f,
          idx: i,
          color: COLORS.curve[i],
          fn: parsed.ok ? parsed.expr.eval : null,
          error: parsed.ok ? null : parsed.error,
        };
      }),
    [fns]
  );

  const active = useMemo(() => rows.filter((r) => r.on && r.fn !== null), [rows]);
  const selRow = rows.find((r) => r.id === selId) ?? rows[0];

  const drawFns = useMemo(() => active.map((r) => ({ color: r.color, eval: r.fn! })), [active]);

  const markers: DrawMarker[] = useMemo(() => {
    const out: DrawMarker[] = [];
    if (zeroRes) {
      const row = rows.find((r) => r.id === zeroRes.id);
      for (const h of zeroRes.res.hits) out.push({ x: h.x, y: h.y, color: row?.color ?? COLORS.accent });
    }
    if (crossRes) {
      for (const h of crossRes.res.hits) out.push({ x: h.x, y: h.y, color: COLORS.ink });
    }
    return out;
  }, [zeroRes, crossRes, rows]);

  const rangeX = (): [number, number] => (view ? [view.x0, view.x1] : [-6, 6]);

  const changeFns = (next: (prev: FnRow[]) => FnRow[]) => {
    setFns(next);
    setZeroRes(null);
    setCrossRes(null);
  };

  const setExpr = (id: string, expr: string) =>
    changeFns((prev) => prev.map((f) => (f.id === id ? { ...f, expr } : f)));

  const toggleFn = (id: string) =>
    changeFns((prev) => prev.map((f) => (f.id === id ? { ...f, on: !f.on } : f)));

  const addFn = () => {
    if (fns.length >= MAX_FNS) return;
    const row: FnRow = { id: uid(), expr: "", on: true };
    changeFns((prev) => [...prev, row]);
    setSelId(row.id);
  };

  const removeFn = (id: string) => {
    if (fns.length <= 1) return;
    changeFns((prev) => prev.filter((f) => f.id !== id));
    if (selId === id) {
      const rest = fns.filter((f) => f.id !== id);
      setSelId(rest[0]?.id ?? "");
    }
  };

  // --- Verktyg -------------------------------------------------------

  const table = useMemo(() => {
    if (!selRow || !selRow.fn) return { rows: [] as { x: number; y: number }[], error: null as string | null, capped: false };
    const from = readNum(tFrom, -3);
    const to = readNum(tTo, 3);
    const step = readNum(tStep, 1);
    if (step <= 0) return { rows: [], error: "Steget måste vara större än 0.", capped: false };
    if (to === from) return { rows: [], error: "Från och till måste vara olika.", capped: false };
    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    if (hi - lo > 1e6) return { rows: [], error: "Intervallet är för stort.", capped: false };
    const count = Math.floor((hi - lo) / step + 1e-9) + 1;
    if (count > MAX_TABLE_ROWS) {
      return { rows: [], error: `Det blir ${count} rader. Välj ett mindre intervall eller ett större steg.`, capped: false };
    }
    const out: { x: number; y: number }[] = [];
    for (let i = 0; i < count; i++) {
      const x = lo + i * step;
      out.push({ x, y: selRow.fn(x) });
    }
    return { rows: out, error: null, capped: false };
  }, [selRow, tFrom, tTo, tStep]);

  const runZeros = () => {
    if (!selRow || !selRow.fn) return;
    const [x0, x1] = rangeX();
    setZeroRes({ id: selRow.id, range: [x0, x1], res: findZeros(selRow.fn, x0, x1, 5) });
  };

  const runCross = () => {
    if (!aRow?.fn || !bRow?.fn || aRow.id === bRow.id) return;
    const [x0, x1] = rangeX();
    setCrossRes({ a: aRow.id, b: bRow.id, range: [x0, x1], res: findIntersections(aRow.fn, bRow.fn, x0, x1, 5) });
  };

  const rangeLabel = (range: [number, number]) =>
    `x ∈ [${fmt(range[0], 2)}; ${fmt(range[1], 2)}]`;

  const validRows = rows.filter((r) => r.fn !== null);
  const aRow = validRows.find((r) => r.id === mixA) ?? validRows[0];
  const bRow =
    validRows.find((r) => r.id === mixB && r.id !== aRow?.id) ??
    validRows.find((r) => r.id !== aRow?.id) ??
    validRows[0];
  const canCross = !!aRow?.fn && !!bRow?.fn && aRow.id !== bRow.id;

  return (
    <div className="app">
      <header className="topbar">
        <div className="tile" aria-hidden="true">
          G
        </div>
        <div className="titles">
          <h1>Grafen</h1>
          <p>Plotta, zooma och läs av funktioner</p>
        </div>
      </header>

      <main className="layout">
        <section className="card stage" aria-label="Graf">
          <Plot
            view={view}
            onView={setView}
            fns={drawFns}
            markers={markers}
            readout={readout}
            onTap={setReadout}
          />
          <div className="readout" aria-live="polite">
            {readout ? (
              <>
                <div className="ro-main">
                  <span className="ro-val">
                    <span className="ro-key">x</span> {fmt(readout.x, 2)}
                  </span>
                  <span className="ro-val">
                    <span className="ro-key">y</span> {fmt(readout.y, 2)}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReadout(null)}>
                    Rensa
                  </button>
                </div>
                <div className="ro-fns">
                  {active.map((r) => (
                    <span key={r.id} className="ro-chip">
                      <span className="dot" style={{ background: r.color }} />
                      f{SUB[r.idx]}({fmt(readout.x, 2)}) = {fmt(r.fn!(readout.x), 2)}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <p className="ro-empty">Tryck i grafen för att läsa av en punkt.</p>
            )}
          </div>
        </section>

        <aside className="side">
          <section className="card" aria-label="Funktioner">
            <div className="card-head">
              <h2>Funktioner</h2>
              <span className="muted small">{fns.length} av {MAX_FNS}</span>
            </div>

            <ul className="fn-list">
              {rows.map((r) => (
                <li key={r.id} className={`fn${r.on ? "" : " fn-off"}`}>
                  <div className="fn-row">
                    <span className="dot" style={{ background: r.on ? r.color : COLORS.line }} />
                    <span className="fn-name">f{SUB[r.idx]}(x) =</span>
                    <button
                      type="button"
                      className="iconbtn"
                      aria-pressed={r.on}
                      aria-label={`${r.on ? "Dölj" : "Visa"} f${r.idx + 1}`}
                      onClick={() => toggleFn(r.id)}
                    >
                      {r.on ? (
                        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
                          <circle cx="12" cy="12" r="2.8" fill="currentColor" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                          <path d="M3 3l18 18M10.6 6.1A10.9 10.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3 3.6M6.4 7.3A17 17 0 0 0 2 12s3.6 6 10 6c1.5 0 2.8-.3 4-.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                        </svg>
                      )}
                    </button>
                    <button
                      type="button"
                      className="iconbtn"
                      aria-label={`Ta bort f${r.idx + 1}`}
                      onClick={() => removeFn(r.id)}
                      disabled={fns.length <= 1}
                    >
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                  <input
                    className={`fn-input${r.error ? " has-error" : ""}`}
                    value={r.expr}
                    onChange={(e) => setExpr(r.id, e.target.value)}
                    onFocus={() => setSelId(r.id)}
                    placeholder="t.ex. x^2 - 4"
                    inputMode="text"
                    autoCapitalize="off"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label={`Uttryck för f${r.idx + 1}`}
                  />
                  {r.error && <p className="fn-error">{r.error}</p>}
                </li>
              ))}
            </ul>

            <div className="fn-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={addFn}
                disabled={fns.length >= MAX_FNS}
              >
                Lägg till funktion
              </button>
            </div>

            <details className="help">
              <summary>Så skriver du</summary>
              <div className="help-body">
                <p>
                  <code>x^2 - 4</code>, <code>2x + 1</code>, <code>3(x+1)</code>, <code>sin(x)</code>,{" "}
                  <code>sqrt(x)</code>, <code>ln(x)</code>, <code>log(x)</code>
                </p>
                <p className="muted small">
                  Räknar med + − · / ^ och parenteser. e och pi finns som konstanter. Både 1,5 och 1.5
                  fungerar. log är tiologaritm, ln är naturlig logaritm.
                </p>
              </div>
            </details>
          </section>

          <section className="card" aria-label="Verktyg">
            <div className="card-head">
              <h2>Verktyg</h2>
            </div>

            <div className="tabs" role="tablist" aria-label="Välj verktyg">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tool === t.id}
                  className={`tab${tool === t.id ? " tab-on" : ""}`}
                  onClick={() => setTool(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tool === "tabell" && (
              <div className="panel">
                <p className="panel-lead">
                  Värdetabell för <strong>f{SUB[selRow?.idx ?? 0]}</strong>
                  {selRow?.expr ? <code className="mono"> {selRow.expr}</code> : null}
                </p>
                <div className="grid3">
                  <label className="field">
                    <span>Från x</span>
                    <input value={tFrom} onChange={(e) => setTFrom(e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="field">
                    <span>Till x</span>
                    <input value={tTo} onChange={(e) => setTTo(e.target.value)} inputMode="decimal" />
                  </label>
                  <label className="field">
                    <span>Steg</span>
                    <input value={tStep} onChange={(e) => setTStep(e.target.value)} inputMode="decimal" />
                  </label>
                </div>

                {!selRow?.fn ? (
                  <p className="empty">Välj en funktion som har ett giltigt uttryck.</p>
                ) : table.error ? (
                  <p className="empty">{table.error}</p>
                ) : (
                  <div className="tablewrap">
                    <table className="tbl">
                      <thead>
                        <tr>
                          <th scope="col">x</th>
                          <th scope="col">f{SUB[selRow.idx]}(x)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {table.rows.map((r) => (
                          <tr key={r.x}>
                            <td>{fmt(r.x, 4)}</td>
                            <td>{fmt(r.y, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {tool === "noll" && (
              <div className="panel">
                <p className="panel-lead">
                  Nollställen där grafen korsar x-axeln, för{" "}
                  <strong>f{SUB[selRow?.idx ?? 0]}</strong> i det synliga intervallet.
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-block"
                  onClick={runZeros}
                  disabled={!selRow?.fn}
                >
                  Hitta nollställen
                </button>

                {zeroRes && (
                  <div className="results" aria-live="polite">
                    <p className="muted small">
                      {rangeLabel(zeroRes.range)}
                      {zeroRes.res.total > zeroRes.res.hits.length
                        ? ` · visar ${zeroRes.res.hits.length} av ${zeroRes.res.total}`
                        : ""}
                    </p>
                    {zeroRes.res.hits.length === 0 ? (
                      <p className="empty">Inga nollställen i det synliga intervallet. Zooma ut och prova igen.</p>
                    ) : (
                      <ul className="hits">
                        {zeroRes.res.hits.map((h, i) => (
                          <li key={i}>
                            <button type="button" className="hit" onClick={() => setReadout({ x: h.x, y: h.y })}>
                              <span className="hit-main">x = {fmt(h.x, 3)}</span>
                              <span className="hit-sub">f(x) = {fmt(h.y, 3)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {tool === "skarning" && (
              <div className="panel">
                <p className="panel-lead">
                  Skärningspunkter mellan två funktioner i det synliga intervallet.
                </p>
                {!canCross ? (
                  <p className="empty">Du behöver två funktioner med giltiga uttryck.</p>
                ) : (
                  <>
                    <div className="grid2">
                      <label className="field">
                        <span>Funktion A</span>
                        <select value={aRow?.id ?? ""} onChange={(e) => setMixA(e.target.value)}>
                          {validRows.map((r) => (
                            <option key={r.id} value={r.id}>
                              f{r.idx + 1}: {r.expr}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Funktion B</span>
                        <select value={bRow?.id ?? ""} onChange={(e) => setMixB(e.target.value)}>
                          {validRows.map((r) => (
                            <option key={r.id} value={r.id}>
                              f{r.idx + 1}: {r.expr}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-block"
                      onClick={runCross}
                      disabled={!canCross}
                    >
                      Hitta skärningspunkter
                    </button>

                    {crossRes && (
                      <div className="results" aria-live="polite">
                        <p className="muted small">
                          {rangeLabel(crossRes.range)}
                          {crossRes.res.total > crossRes.res.hits.length
                            ? ` · visar ${crossRes.res.hits.length} av ${crossRes.res.total}`
                            : ""}
                        </p>
                        {crossRes.res.hits.length === 0 ? (
                          <p className="empty">Inga skärningspunkter i det synliga intervallet.</p>
                        ) : (
                          <ul className="hits">
                            {crossRes.res.hits.map((h, i) => (
                              <li key={i}>
                                <button type="button" className="hit" onClick={() => setReadout({ x: h.x, y: h.y })}>
                                  <span className="hit-main">
                                    ({fmt(h.x, 3)}; {fmt(h.y, 3)})
                                  </span>
                                  <span className="hit-sub">tryck för att markera</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
        </aside>
      </main>

      <footer className="foot">Gratis · ingen inloggning · fungerar på iPad</footer>
    </div>
  );
}
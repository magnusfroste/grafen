/**
 * Egen uttrycksparser för Grafen. Inga externa beroenden.
 *
 * Klarar:
 *   + - * / ^   parenteser
 *   implicit multiplikation: 2x, 3(x+1), (x+1)(x-2), 2x(x-1)
 *   variabeln x, konstanterna e och pi (även π)
 *   funktionerna sin cos tan sqrt abs ln log exp (log = log10, ln = naturlig)
 *   decimalkomma och decimalpunkt (1,5 och 1.5)
 *
 * Prioritet: ^ binder hårdast och är högerassociativ. -x^2 = -(x^2).
 */

export class ExprError extends Error {
  pos: number;
  constructor(message: string, pos = 0) {
    super(message);
    this.name = "ExprError";
    this.pos = pos;
  }
}

type TokType = "num" | "ident" | "op" | "lparen" | "rparen" | "end";

interface Tok {
  t: TokType;
  v: string;
  n: number;
  pos: number;
}

export type Node =
  | { t: "num"; v: number }
  | { t: "var" }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { t: "call"; name: string; a: Node };

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: (v) => Math.log10(v),
  exp: Math.exp,
};

const CONSTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

/** Snygga upp tecken som elever klistrar in eller skriver på iPad. */
function normalise(src: string): string {
  return src
    .replace(/[πΠ]/g, "pi")
    .replace(/[√]/g, "sqrt")
    .replace(/[·×∗∙]/g, "*")
    .replace(/[−–—]/g, "-")
    .replace(/[÷:]/g, "/")
    .replace(/[\[\{]/g, "(")
    .replace(/[\]\}]/g, ")");
}

function tokenize(src: string): Tok[] {
  const s = normalise(src);
  const out: Tok[] = [];
  let i = 0;

  while (i < s.length) {
    const c = s[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\u00a0") {
      i++;
      continue;
    }

    // Tal: 12, 12.5, 12,5, ,5  (decimalkomma och decimalpunkt)
    if (/[0-9]/.test(c) || ((c === "." || c === ",") && /[0-9]/.test(s[i + 1] ?? ""))) {
      const start = i;
      let seenSep = false;
      while (i < s.length) {
        const ch = s[i];
        if (/[0-9]/.test(ch)) {
          i++;
        } else if ((ch === "." || ch === ",") && !seenSep && /[0-9]/.test(s[i + 1] ?? "")) {
          seenSep = true;
          i++;
        } else {
          break;
        }
      }
      const raw = s.slice(start, i).replace(",", ".");
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new ExprError(`Talet "${s.slice(start, i)}" går inte att läsa.`, start);
      out.push({ t: "num", v: raw, n, pos: start });
      continue;
    }

    if (/[a-zA-Z]/.test(c)) {
      const start = i;
      while (i < s.length && /[a-zA-Z]/.test(s[i])) i++;
      out.push({ t: "ident", v: s.slice(start, i).toLowerCase(), n: 0, pos: start });
      continue;
    }

    if (c === "(") {
      out.push({ t: "lparen", v: c, n: 0, pos: i });
      i++;
      continue;
    }
    if (c === ")") {
      out.push({ t: "rparen", v: c, n: 0, pos: i });
      i++;
      continue;
    }
    if ("+-*/^".includes(c)) {
      out.push({ t: "op", v: c, n: 0, pos: i });
      i++;
      continue;
    }

    throw new ExprError(`Tecknet "${c}" kan jag inte läsa.`, i);
  }

  out.push({ t: "end", v: "", n: 0, pos: s.length });
  return out;
}

/** Lägger in "*" där multiplikation skrivs utan tecken: 2x, 3(x+1), (x+1)(x-2). */
function withImplicitMul(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  const isFuncName = (x: Tok) => x.t === "ident" && Object.prototype.hasOwnProperty.call(FUNCS, x.v);
  const startsValue = (x: Tok) => x.t === "num" || x.t === "ident" || x.t === "lparen";
  const endsValue = (x: Tok) => x.t === "num" || x.t === "ident" || x.t === "rparen";

  for (let k = 0; k < toks.length; k++) {
    const cur = toks[k];
    if (k > 0) {
      const prev = toks[k - 1];
      // "sin(" är funktionsanrop, inte sin * (
      const funcCall = isFuncName(prev) && cur.t === "lparen";
      if (!funcCall && endsValue(prev) && startsValue(cur)) {
        out.push({ t: "op", v: "*", n: 0, pos: cur.pos });
      }
    }
    out.push(cur);
  }
  return out;
}

class Parser {
  private toks: Tok[];
  private i = 0;

  constructor(toks: Tok[]) {
    this.toks = toks;
  }

  private peek(): Tok {
    return this.toks[this.i];
  }

  private next(): Tok {
    return this.toks[this.i++];
  }

  private eatOp(v: string): boolean {
    const t = this.peek();
    if (t.t === "op" && t.v === v) {
      this.i++;
      return true;
    }
    return false;
  }

  parse(): Node {
    const node = this.parseAdd();
    const rest = this.peek();
    if (rest.t !== "end") {
      throw new ExprError(
        rest.t === "rparen" ? "Det är en parentes för mycket." : `Jag förstår inte "${rest.v}" här.`,
        rest.pos
      );
    }
    return node;
  }

  private parseAdd(): Node {
    let left = this.parseMul();
    for (;;) {
      if (this.eatOp("+")) left = { t: "bin", op: "+", a: left, b: this.parseMul() };
      else if (this.eatOp("-")) left = { t: "bin", op: "-", a: left, b: this.parseMul() };
      else return left;
    }
  }

  private parseMul(): Node {
    let left = this.parseUnary();
    for (;;) {
      if (this.eatOp("*")) left = { t: "bin", op: "*", a: left, b: this.parseUnary() };
      else if (this.eatOp("/")) left = { t: "bin", op: "/", a: left, b: this.parseUnary() };
      else return left;
    }
  }

  private parseUnary(): Node {
    const t = this.peek();
    if (t.t === "op" && t.v === "-") {
      this.i++;
      return { t: "neg", a: this.parseUnary() };
    }
    if (t.t === "op" && t.v === "+") {
      this.i++;
      return this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): Node {
    const base = this.parseAtom();
    if (this.eatOp("^")) {
      // Högerassociativ, och exponenten får vara negativ: 2^-1, x^2^3
      return { t: "bin", op: "^", a: base, b: this.parseUnary() };
    }
    return base;
  }

  private parseAtom(): Node {
    const t = this.next();

    if (t.t === "num") return { t: "num", v: t.n };

    if (t.t === "ident") {
      if (t.v === "x") return { t: "var" };

      if (Object.prototype.hasOwnProperty.call(CONSTS, t.v)) return { t: "num", v: CONSTS[t.v] };

      if (Object.prototype.hasOwnProperty.call(FUNCS, t.v)) {
        const open = this.peek();
        if (open.t !== "lparen") {
          throw new ExprError(`Skriv ${t.v}(…) med parentes, till exempel ${t.v}(x).`, open.pos);
        }
        this.i++;
        const arg = this.parseAdd();
        const close = this.next();
        if (close.t !== "rparen") {
          throw new ExprError(`Det saknas en parentes efter ${t.v}(…)`, close.pos);
        }
        return { t: "call", name: t.v, a: arg };
      }

      if (t.v === "ln" || t.v === "log") {
        throw new ExprError(`Skriv ${t.v}(x) med parentes.`, t.pos);
      }
      throw new ExprError(`Jag känner inte igen "${t.v}". Använd x, e, pi eller en funktion som sin(x).`, t.pos);
    }

    if (t.t === "lparen") {
      const inner = this.parseAdd();
      const close = this.next();
      if (close.t !== "rparen") {
        throw new ExprError("Det saknas en avslutande parentes.", close.pos);
      }
      return inner;
    }

    if (t.t === "end") throw new ExprError("Uttrycket är tomt eller ofullständigt.", t.pos);
    if (t.t === "rparen") throw new ExprError("Det står en parentes på fel ställe.", t.pos);
    throw new ExprError(`Jag förstår inte "${t.v}" här.`, t.pos);
  }
}

export interface ParsedExpr {
  /** Källtexten som den skrevs. */
  source: string;
  ast: Node;
  /** Snabb utvärdering. Returnerar NaN utanför definitionsmängden. */
  eval: (x: number) => number;
}

function compile(node: Node): (x: number) => number {
  switch (node.t) {
    case "num": {
      const v = node.v;
      return () => v;
    }
    case "var":
      return (x) => x;
    case "neg": {
      const a = compile(node.a);
      return (x) => -a(x);
    }
    case "bin": {
      const a = compile(node.a);
      const b = compile(node.b);
      switch (node.op) {
        case "+":
          return (x) => a(x) + b(x);
        case "-":
          return (x) => a(x) - b(x);
        case "*":
          return (x) => a(x) * b(x);
        case "/":
          return (x) => a(x) / b(x);
        case "^":
          return (x) => Math.pow(a(x), b(x));
      }
      break;
    }
    case "call": {
      const f = FUNCS[node.name];
      const a = compile(node.a);
      return (x) => f(a(x));
    }
  }
  return () => NaN;
}

export function parseExpr(source: string): ParsedExpr {
  const text = source.trim();
  if (!text) throw new ExprError("Skriv ett uttryck, till exempel x^2 - 4.", 0);
  const toks = withImplicitMul(tokenize(text));
  const ast = new Parser(toks).parse();
  return { source: text, ast, eval: compile(ast) };
}

export type ParseResult =
  | { ok: true; expr: ParsedExpr }
  | { ok: false; error: string };

/** Bekväm variant som aldrig kastar – används av gränssnittet. */
export function tryParse(source: string): ParseResult {
  try {
    return { ok: true, expr: parseExpr(source) };
  } catch (err) {
    const msg = err instanceof ExprError ? err.message : "Uttrycket går inte att läsa.";
    return { ok: false, error: msg };
  }
}
/**
 * Självtest för Grafen. Körs med:  node scripts/selftest.mjs
 * Testar uttrycksparsern och de numeriska verktygen utan webbläsare.
 */
import { parseExpr, tryParse } from "../src/lib/expr.ts";
import { findZeros, findIntersections } from "../src/lib/numeric.ts";

let passed = 0;
const failures = [];

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${name}${detail ? "  (" + detail + ")" : ""}`);
  } else {
    failures.push(name + (detail ? " – " + detail : ""));
    console.log(`  FEL  ${name}${detail ? "  (" + detail + ")" : ""}`);
  }
}

function near(a, b, eps = 1e-9) {
  return Number.isFinite(a) && Math.abs(a - b) <= eps;
}

function evalAt(src, x) {
  return parseExpr(src).eval(x);
}

console.log("\n1. Parsern – aritmetik och prioritet");
ok("2+3*4 = 14", near(evalAt("2+3*4", 0), 14));
ok("(2+3)*4 = 20", near(evalAt("(2+3)*4", 0), 20));
ok("-x^2 med x=3 ger -9", near(evalAt("-x^2", 3), -9));
ok("(-x)^2 med x=3 ger 9", near(evalAt("(-x)^2", 3), 9));
ok("2^3^2 = 512 (högerassociativ)", near(evalAt("2^3^2", 0), 512));
ok("2^-2 = 0,25", near(evalAt("2^-2", 0), 0.25));
ok("10/4 = 2,5", near(evalAt("10/4", 0), 2.5));

console.log("\n2. Implicit multiplikation");
ok("2x med x=3 ger 6", near(evalAt("2x", 3), 6));
ok("3(x+1) med x=2 ger 9", near(evalAt("3(x+1)", 2), 9));
ok("(x+1)(x-2) med x=3 ger 4", near(evalAt("(x+1)(x-2)", 3), 4));
ok("2x(x-1) med x=3 ger 12", near(evalAt("2x(x-1)", 3), 12));
ok("2sin(x) med x=pi/2 ger 2", near(evalAt("2sin(x)", Math.PI / 2), 2));
ok("sin(x)cos(x) med x=pi/4 ger 0,5", near(evalAt("sin(x)cos(x)", Math.PI / 4), 0.5));
ok("2(x+1)^2 med x=1 ger 8", near(evalAt("2(x+1)^2", 1), 8));

console.log("\n3. Decimaler, konstanter och funktioner");
ok("1,5x med x=2 ger 3 (decimalkomma)", near(evalAt("1,5x", 2), 3));
ok("1.5x med x=2 ger 3 (decimalpunkt)", near(evalAt("1.5x", 2), 3));
ok(",5x med x=4 ger 2", near(evalAt(",5x", 4), 2));
ok("pi ≈ 3,14159", near(evalAt("pi", 0), Math.PI));
ok("π ≈ 3,14159", near(evalAt("π", 0), Math.PI));
ok("e ≈ 2,71828", near(evalAt("e", 0), Math.E));
ok("sin(0) = 0", near(evalAt("sin(0)", 0), 0));
ok("sin(pi/2) = 1", near(evalAt("sin(pi/2)", 0), 1));
ok("cos(0) = 1", near(evalAt("cos(0)", 0), 1));
ok("tan(0) = 0", near(evalAt("tan(0)", 0), 0));
ok("sqrt(9) = 3", near(evalAt("sqrt(9)", 0), 3));
ok("abs(-3) = 3", near(evalAt("abs(-3)", 0), 3));
ok("ln(e) = 1", near(evalAt("ln(e)", 0), 1));
ok("log(100) = 2 (tiologaritm)", near(evalAt("log(100)", 0), 2));
ok("exp(0) = 1", near(evalAt("exp(0)", 0), 1));
ok("sqrt(4)x med x=3 ger 6", near(evalAt("sqrt(4)x", 3), 6));
ok("2x^2-8 med x=3 ger 10", near(evalAt("2x^2-8", 3), 10));
ok("sqrt(-1) blir NaN", Number.isNaN(evalAt("sqrt(-1)", 0)));
ok("1/x med x=0 blir oändligt", !Number.isFinite(evalAt("1/x", 0)));

console.log("\n4. Felmeddelanden på svenska");
const bad = ["", "sin x", "x^", "2++", "x+*2", "foo(x)", "3(x+1", "2)"];
for (const src of bad) {
  const r = tryParse(src);
  ok(`"${src}" avvisas`, !r.ok, r.ok ? "gav ett värde" : r.error);
}

console.log("\n5. Nollställen");
const z1 = findZeros((x) => parseExpr("2x^2-8").eval(x), -10, 10, 5);
ok(
  "2x^2-8 har nollställen ±2",
  z1.hits.length === 2 && near(z1.hits[0].x, -2, 1e-6) && near(z1.hits[1].x, 2, 1e-6),
  z1.hits.map((h) => h.x.toFixed(6)).join(", ")
);

const z2 = findZeros((x) => x * x - 4, -6, 6, 5);
ok("x^2-4 har nollställen ±2", z2.hits.length === 2 && near(z2.hits[1].x, 2, 1e-6));

const z3 = findZeros((x) => x * x, -6, 6, 5);
ok("x^2 (tangent) har nollstället 0", z3.hits.length === 1 && near(z3.hits[0].x, 0, 1e-5), z3.hits.map((h) => h.x).join(","));

const z4 = findZeros((x) => 1 / x, -6, 6, 5);
ok("1/x ger inget falskt nollställe vid polen", z4.hits.length === 0, z4.hits.map((h) => h.x).join(","));

const z5 = findZeros(Math.tan, -2, 2, 5);
ok("tan(x) ger bara nollstället 0", z5.hits.length === 1 && near(z5.hits[0].x, 0, 1e-6), z5.hits.map((h) => h.x.toFixed(4)).join(","));

const z6 = findZeros(Math.sin, 0, 10, 5);
ok(
  "sin(x) på [0,10] ger 0, pi, 2pi, 3pi",
  z6.hits.length === 4 && near(z6.hits[3].x, 3 * Math.PI, 1e-6),
  z6.hits.map((h) => h.x.toFixed(4)).join(", ")
);

const z7 = findZeros((x) => x * x + 1, -6, 6, 5);
ok("x^2+1 saknar nollställen", z7.hits.length === 0);

const z8 = findZeros((x) => parseExpr("ln(x)").eval(x), 0.1, 6, 5);
ok("ln(x) har nollstället 1", z8.hits.length === 1 && near(z8.hits[0].x, 1, 1e-6));

const z9 = findZeros((x) => parseExpr("x^3-3x").eval(x), -5, 5, 5);
ok(
  "x^3-3x har nollställena -√3, 0, √3",
  z9.hits.length === 3 && near(z9.hits[0].x, -Math.sqrt(3), 1e-6) && near(z9.hits[2].x, Math.sqrt(3), 1e-6),
  z9.hits.map((h) => h.x.toFixed(5)).join(", ")
);

console.log("\n6. Skärningspunkter");
const f1 = (x) => parseExpr("x^2-4").eval(x);
const f2 = (x) => parseExpr("2x-1").eval(x);
const s1 = findIntersections(f1, f2, -6, 6, 5);
ok(
  "x^2-4 och 2x-1 skär varandra i x=-1 och x=3",
  s1.hits.length === 2 && near(s1.hits[0].x, -1, 1e-6) && near(s1.hits[1].x, 3, 1e-6),
  s1.hits.map((h) => `(${h.x.toFixed(4)}, ${h.y.toFixed(4)})`).join(" ")
);
ok("skärningspunkt (3, 5)", s1.hits.length === 2 && near(s1.hits[1].y, 5, 1e-6));

const s2 = findIntersections((x) => x * x, (x) => -x * x - 1, -5, 5, 5);
ok("x^2 och -x^2-1 skär varandra inte", s2.hits.length === 0);

console.log(`\n${passed} tester gick igenom, ${failures.length} misslyckades.`);
if (failures.length) {
  console.log("Misslyckade:");
  for (const f of failures) console.log("  - " + f);
  process.exit(1);
}
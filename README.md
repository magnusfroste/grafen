# Grafen

Ett snabbt graffönster för gymnasiet – ett lättviktigt alternativ till GeoGebra när du bara
behöver plotta, zooma och läsa av. Fungerar med fingrarna på iPad, med mus på datorn och i
mobilen. Ingen inloggning, inga kakor, inga nätverksanrop.

**Spela:** https://grafen.skolappar.com · En del av [Skolappar](https://www.skolappar.com) – pedagogiska appar av föräldrar · öppen källkod (MIT)

## Vad du kan göra

- **Plotta upp till tre funktioner** samtidigt, i blått, cerise och petrol.
- **Pan och zoom**: dra med ett finger, nyp med två, scrolla på datorn eller använd + / −.
- **Läsa av**: tryck i grafen och få punkten (x, y) med två decimaler, plus värdet på varje
  inritad funktion i den punkten.
- **Värdetabell** för valt x-intervall och steg.
- **Nollställen** för vald funktion i det synliga intervallet (upp till fem).
- **Skärningspunkter** mellan två valda funktioner.
- Allt sparas lokalt i webbläsaren (`grafen-v1`) – uttryck och vy finns kvar nästa gång.

## Kom igång

```bash
npm install
npm run dev      # utvecklingsserver
npm run build    # produktionsbygge till dist/
npm run preview  # förhandsgranska bygget
npm test         # självtest av parser och numerik (node scripts/selftest.mjs)
```

Kräver Node 22 eller senare.

## Så skriver du uttryck

| Du skriver | Betydelse |
|---|---|
| `x^2 - 4` | x i kvadrat minus fyra |
| `2x + 1` | implicit multiplikation |
| `3(x+1)` | tre gånger parentesen |
| `(x+1)(x-2)` | två parenteser multiplicerade |
| `sin(x)`, `cos(x)`, `tan(x)` | trigonometri i radianer |
| `sqrt(x)`, `abs(x)` | kvadratrot, absolutbelopp |
| `ln(x)`, `log(x)`, `exp(x)` | naturlig logaritm, tiologaritm, e^x |
| `e`, `pi` (eller `π`) | konstanterna |
| `1,5x` eller `1.5x` | decimalkomma och decimalpunkt går lika bra |

Prioritet: `^` binder hårdast och är högerassociativ, så `-x^2` betyder `-(x^2)` och
`2^3^2` betyder `2^(3^2)`. Funktioner kräver parentes: skriv `sin(x)`, inte `sin x`.

## Så hittas nollställen och skärningspunkter

Grafen provar funktionen i täta steg över det synliga x-intervallet och letar teckenbyten.
Varje teckenbyte förfinas med bisektion till ungefär 13 värdesiffror. Nollställen där kurvan
bara tangerar axeln (som `x^2`) hittas genom att minimera |f| kring lokala minima. Poler som
`1/x` och `tan(x)` sållas bort genom att kräva att funktionsvärdet verkligen är nära noll –
annars hade varje lodrät asymptot setts som ett nollställe.

Skärningspunkter räknas som nollställen till `f(x) - g(x)`.

## Integritet

- Ingen spårning, inga kakor, ingen analys, inget konto.
- Inga anrop till externa servrar. Typsnittet Fredoka ligger i appen (`public/fonts/`);
  `@fontsource/inter` följer också med i bygget. Inga typsnitt hämtas utifrån.
- Det enda som sparas är dina uttryck och din vy, i `localStorage` under nyckeln `grafen-v1`.
  Rensa webbläsardata så är det borta.

## Docker

```bash
docker build -t grafen .
docker run --rm -p 8080:8080 grafen
```

Bygget serveras av nginx på port 8080 med `deploy/nginx.conf`.

## Struktur

```
src/
  App.tsx              gränssnitt: funktionslista, verktygspanel, avläsning
  components/Plot.tsx  canvas, pan, zoom, knappar
  lib/expr.ts          egen uttrycksparser (tokenizer → AST → closures)
  lib/numeric.ts       nollställen och skärningspunkter (bisektion)
  lib/plot.ts          koordinatsystem, rutnät, ritning
  lib/format.ts        svensk talformatering
  lib/storage.ts       localStorage (grafen-v1)
scripts/selftest.mjs   självtest utan webbläsare
```

## Licens

MIT – se [LICENSE](LICENSE).

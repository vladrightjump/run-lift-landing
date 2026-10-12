# Arhitectura aplicației web

Referință pentru implementare și review în `src/` și `tests/`. Harta modulelor și regulile de
dependență vor fi completate în U3; documentul fixează deocamdată organizarea testelor.
Structura botului, a funcțiilor Edge și a SQL-ului rămâne neschimbată.

## Unde aparține un test

Testăm un comportament în stratul care îl deține. Logica pură se verifică fără browser;
comportamentul unei componente se verifică prin interfața ei. Playwright păstrează parcursurile
critice și verificările care cer aplicația construită: rutare, rewrites, CSP și carduri de share.
Regulile SQL/RPC se execută în PGlite, fără a le reconstitui în mock-uri de browser.

| Comportament | Strat care îl deține | Exemplu existent în repo |
| --- | --- | --- |
| Validare și transformări fără DOM | Vitest unit, `.test.ts` | [`tests/unit/validation.test.ts`](../tests/unit/validation.test.ts) |
| Focus, interacțiuni și stări ale componentelor | Vitest componentă, `.test.tsx`, Testing Library + jsdom | [`tests/unit/dialog.test.tsx`](../tests/unit/dialog.test.tsx) |
| Parcurs critic al utilizatorului, prin mai multe ecrane | Playwright, `tests/e2e/` | [`tests/e2e/inscriere.spec.ts`](../tests/e2e/inscriere.spec.ts) |
| Rutare directă și metadate livrate de build; rewrites și CSP | Playwright pe build, `npm run test:e2e:preview` | [`tests/e2e/navigare.spec.ts`](../tests/e2e/navigare.spec.ts) verifică accesul direct; [`tests/e2e/coming-soon.spec.ts`](../tests/e2e/coming-soon.spec.ts) verifică descrierea din meta. Guard-urile de configurare existente pentru rewrites/CSP rămân în [`tests/unit/rute.test.ts`](../tests/unit/rute.test.ts) și [`tests/unit/deploy-config.test.ts`](../tests/unit/deploy-config.test.ts). |
| Capacitate, deadline, promovare și alte reguli SQL/RPC | Vitest + PGlite, `tests/unit/sql/` | [`tests/unit/sql/business.test.ts`](../tests/unit/sql/business.test.ts) |

Tabelul definește stratul pentru teste noi. U2 păstrează toate testele și aserțiunile existente;
nu redistribuie încă acoperirea dintre straturi.

## Descoperire și suport comun

- Testele unitare și de componentă noi pot sta lângă codul pe care îl verifică, în `src/`, ca să
  fie mutate sau șterse împreună cu funcționalitatea. Vitest descoperă atât
  `src/**/*.test.ts(x)`, cât și testele existente din `tests/unit/`.
- `.test.ts` rulează în Node. Un test care are nevoie de DOM declară
  `// @vitest-environment jsdom`; `.test.tsx` rulează implicit în jsdom. Fișierele de test din
  `src/` sunt excluse din acoperirea codului de producție.
- Parcursurile Playwright sunt în `tests/e2e/*.spec.ts`. Rularea pe build cere un build proaspăt;
  `npm run verify` îl construiește înainte de `npm run test:e2e:preview`.
- `tests/support/` deține builder-ele și infrastructura comună de mock-uri MSW pentru Vitest și
  Playwright. Setup-ul Vitest și importurile testelor îl fac vizibil pentru analizarea codului
  nefolosit; fișierele colocate sunt și ele intrări Knip.
- Intrările pluginului Vitest din Knip sunt limitate la `.test.ts(x)`: implicit, pluginul
  acceptă și `.spec.ts`, inclusiv în afara folderului colectat de Playwright. Un spec de browser
  salvat în afara `tests/e2e/` este raportat ca fișier nefolosit și oprește verificarea.
- `tests/unit/helpers/` rămâne temporar pentru helper-ele existente (`adminHarness.ts`,
  `salaFixtures.ts`), inclusiv cele importate de Playwright. Infrastructura comună nouă aparține
  `tests/support/`; mutarea helper-elor vechi nu face parte din U2.
- TypeScript pentru teste și lint-ul includ deja `src/`, `tests/` și `scripts/`; mutarea
  parcursurilor și colocarea testelor nu cer excepții noi.

# Arhitectura aplicației web

Aplicația are o singură structură: `src/app`, `src/features` și `src/shared`.
O funcționalitate deține paginile, componentele, stilurile, accesul la date și testele
sale. Botul (`bot/`), funcțiile Edge și SQL-ul își păstrează structura și deploy-ul.

## Harta curentă

```text
src/
├── app/
│   ├── main.tsx                 # intrarea HTML: redirect, monitoring, analytics, montare
│   ├── router.tsx               # arborele TanStack Router declarat în cod
│   ├── routes.ts                # compunerea rutelor și lista canonică de căi
│   ├── providers.tsx            # QueryClient-ul aplicației
│   ├── admin-preview.tsx        # preview cu MSW, exclus din build-ul de producție
│   └── vite-env.d.ts            # tipurile ambientale Vite și __VERCEL_ENV__
├── features/
│   ├── antrenament/             # pagina și cardurile programului săptămânal
│   ├── confirmare/              # confirmarea din linkul de email
│   ├── despre-noi/              # prezentarea antrenamentelor din parc
│   ├── inscriere/               # formularul, validarea și transportul înscrierii
│   ├── landing/                 # homepage, Coming Soon și secțiunile ediției
│   ├── reels/                   # banda cu clipuri și citirea listei publice
│   ├── renunt/                  # renunțarea din linkul de email
│   ├── trial/                   # proba publică de antrenament
│   ├── unsubscribe/             # dezabonarea din linkul de email
│   └── admin/
│       ├── index.ts             # intrările lazy și rădăcina vizuală
│       ├── pages/               # sesiune, login și compunerea dashboardului
│       ├── components/          # cadrul, linia de timp, învelișul și stilurile comune
│       ├── data/                # auth, sesiune, resurse și mutații Query
│       ├── navigatie/           # registrul ecranelor și fragmentul #cheie
│       └── zones/
│           ├── acum/            # rezumatul stării curente
│           ├── site/            # Coming Soon, ordinea homepage-ului, clipuri
│           ├── evenimente/      # ediții, participanți, email, livrare, șabloane
│           └── antrenamente/    # program, prezențe, membri, analiză, bot, probe
└── shared/
    ├── ui/                      # componente comune și modulele CSS ale acestora
    ├── lib/                     # transport RPC, config backend, hook-uri și utilitare
    ├── content/                 # instantaneul ediției, tipuri și texte derivate
    └── styles/                  # tokens.css și base.css

tests/
├── support/                     # un singur set MSW, builder-e și adaptoare de test
├── e2e/                         # parcursuri Playwright pe aplicația construită
├── unit/                        # guard-uri între straturi, SQL și Edge
└── integration/                 # verificări opt-in pe backendul real
```

Fiecare funcționalitate expune un `index.ts` cu ceea ce consumă alte funcționalități
sau compunerea aplicației. Paginile cu rută au o declarație `route.ts`/`route.tsx`;
adminul își declară ruta în index. `pages`, `components`, `data`, `hooks`, `lib` și
`styles` se creează numai când au un proprietar și un consumator real. Testele
`.test.ts` și `.test.tsx` stau lângă codul verificat.

[`/antrenament`](../src/features/antrenament/index.ts) este exemplul de referință:
[ruta](../src/features/antrenament/route.tsx),
[pagina și testul ei](../src/features/antrenament/pages/AntrenamentPage.tsx),
[cardurile](../src/features/antrenament/components/CardSaptamana.tsx),
[query-ul](../src/features/antrenament/data/queries.ts) și modulele CSS aparțin
aceleiași funcționalități. Editorul adminului importă cardurile prin indexul ei.

## Rutare și date

[`app/main.tsx`](../src/app/main.tsx) montează routerul și provider-ul Query.
Landing-ul se încarcă imediat; celelalte pagini sunt lazy. Layout-ul de ediție
montează `EventConfigProvider` pentru paginile care afișează ediția. `/despre-noi`
și `/antrenament` rămân în afara lui și își citesc propriile RPC-uri.
Parametrul `?preview=` este validat în declarația rutei landing-ului.

Routerul deține `/admin`; [`useEcranCurent`](../src/features/admin/navigatie/useEcranCurent.ts)
și registrul adminului dețin `#cheie` și garda de ieșire. URL-urile ecranelor admin
rămân fragmente, fără rewrites suplimentare.

TanStack Query deține citirile și scrierile Supabase. Aplicația are un singur
`QueryClient`, cu retry și refetch implicit la focus/reconectare oprite. Resursele
admin păstrează contractul `date`, `eroare`, `reincarca`; datele deja încărcate rămân
vizibile când un refresh eșuează. Poll-ul la 15 secunde și la revenirea în tab
anulează cererea în zbor și pornește alta prin Query. `refetchInterval` nu păstrează
acest contract, fiindcă poate refolosi o cerere pending. Mutațiile invalidează
familiile pe care le schimbă; o sesiune invalidă este tratată o singură dată în cache.

Transportul generic este în [`shared/lib/rpc.ts`](../src/shared/lib/rpc.ts), iar
configul de mediu în [`shared/lib/backend.ts`](../src/shared/lib/backend.ts).
RPC-urile, headerele și payload-urile păstrează contractul backend existent.
Configul public pornește cu instantaneul sincron de build și se reconciliază cu DB;
ordinea homepage-ului se fixează după limita existentă de două secunde.

## Stiluri și granițe

Stilurile componentelor sunt CSS Modules. Global rămân jetoanele, resetul,
tipografia, focusul vizibil și regula de bază pentru mișcare redusă. Intrările din
`app/` importă `tokens.css`, apoi `base.css`. Animațiile sunt definite lângă modulele
care le cer, cu numele și valorile existente.

Modulele comune se importă înaintea modulului propriu, legat ca `styles`, pentru
ca suprascrierile cu specificitate egală să păstreze ordinea. Piesele comune ale
adminului sunt în `AdminStyles.module.css`; tema și baza controalelor sunt în
`RadacinaAdmin.module.css`. Culorile butonului terțiar vin după baza butoanelor.
Kitul comun de suprapunere are specificitate zero pentru cutie și prezentări,
permițând stilul componentei consumatoare. Selectorii dintre module și verificările
de browser folosesc atributele `data-css`, fără să depindă de clasele generate.
Garda [`claseCss`](../tests/unit/claseCss.test.ts) verifică referințele, purtătorii,
ordinea importurilor și keyframe-urile modulelor.

`npm run lint:arch` verifică tot `src/`, inclusiv modulele fără importatori.
[Configurația](../.dependency-cruiser.cjs) verifică și directorul de rădăcină cu
`node:fs`, pentru ca un fișier neimportat sau fără cod să nu ocolească structura.
Orice fișier trebuie să fie sub `app`, `features` sau `shared`.

- O funcționalitate își importă propriile fișiere interne.
- Altă funcționalitate se importă numai prin `features/<nume>/index.ts`, inclusiv
  când importul folosește o cale relativă sau aliasul `@/`.
- `shared/` nu importă nicio funcționalitate, nici prin API-ul public.
- `app/` poate importa orice modul necesar compunerii aplicației.
- Ciclurile de import sunt interzise.

Nu există foldere vechi sau re-exporturi de tranziție. `lint:arch` rulează local în
`verify` și în job-ul static din CI; o încălcare oprește verificările.

## Unde aparține un test

Fiecare comportament este verificat în stratul care îl deține. O aserțiune existentă
în stratul potrivit nu se repetă într-un alt strat.

| Comportament | Strat și loc | Exemplu |
| --- | --- | --- |
| Logică pură, validare și transformări | Vitest unit, `.test.ts` lângă cod | [`validation.test.ts`](../src/shared/lib/validation.test.ts) |
| Interacțiuni, focus și stări ale unei componente | Testing Library + jsdom, `.test.tsx` lângă componentă | [`Dialog.test.tsx`](../src/shared/ui/Dialog.test.tsx), [`AntrenamentPage.test.tsx`](../src/features/antrenament/pages/AntrenamentPage.test.tsx) |
| Parcursuri critice între pagini | Playwright, `tests/e2e/` | [`inscriere.spec.ts`](../tests/e2e/inscriere.spec.ts) |
| Rutare directă, rewrites, CSP, CSS și cardul de share livrate de build | Playwright pe build | [`rute.spec.ts`](../tests/e2e/rute.spec.ts), [`antrenament.spec.ts`](../tests/e2e/antrenament.spec.ts) |
| Reguli SQL și RPC | Vitest + PGlite, `tests/unit/sql/` | [`business.test.ts`](../tests/unit/sql/business.test.ts) |
| Contracte între straturi și infrastructura de verificare | Guard-uri în `tests/unit/` | [`backend-contract.test.ts`](../tests/unit/backend-contract.test.ts), [`rute.test.ts`](../tests/unit/rute.test.ts), [`deploy-config.test.ts`](../tests/unit/deploy-config.test.ts) |
| Funcții Edge și backend real, în afara refactorului web | `tests/unit/edge/`, respectiv `tests/integration/` | [`submitForm.test.ts`](../tests/unit/edge/submitForm.test.ts) |

Vitest descoperă `src/**/*.test.ts(x)` și `tests/unit/**/*.test.ts(x)`. `.test.ts`
rulează în Node; un test care cere DOM declară `// @vitest-environment jsdom`.
`.test.tsx` rulează în jsdom. Testele sunt excluse din acoperirea codului de producție
și sunt intrări Knip. Testele de paritate cu botul/Edge și guard-urile care citesc
configurația repo-ului își păstrează scopul între straturi; nu se mută într-un owner
web doar pentru a goli `tests/unit/`.

[`tests/support`](../tests/support) deține handler-ele MSW, builder-ele, setup-ul
Vitest, adaptorul Playwright și preview-ul browser. Niciun test sau fișier din `src/`
nu își definește un backend mock propriu. Excepțiile sunt testele funcțiilor Edge
și integrarea live. Captura argumentelor brute `fetch` pentru contractele de
headere, signal și `RequestInit` este tot în suportul comun; aserțiunile contractului
rămân cele existente. `tests/unit/helpers/` a fost eliminat.

## Adăugarea, schimbarea și eliminarea unei pagini

1. Alege funcționalitatea proprietară. Adaugă pagina, stilurile, datele și testul
   comportamentului acolo; exportă prin `index.ts` numai ce are consumatori externi.
2. Declară ruta în funcționalitate și colecteaz-o în `app/routes.ts`, în grupul cu
   config de ediție sau în cel independent, după datele pe care le afișează.
3. Adaugă rewrite-ul explicit în [`vercel.json`](../vercel.json), către shell-ul
   potrivit. Un card de share separat cere HTML-ul, metadatele și intrarea de build
   aferente. `/antrenament` folosește `antrenament.html`; nu există catch-all pe server.
4. Verifică comportamentul la stratul din tabel. Paritatea rutelor/rewrite-urilor
   este verificată în ambele direcții; accesul direct și meta se verifică pe build.
5. Rulează `npm run verify`: lint, arhitectură, cod nefolosit, tipuri pentru app și
   teste, teste cu acoperire, build și Playwright pe build.

Pentru o componentă sau un element, schimbă proprietarul și testul comportamentului
în același loc. Păstrează valorile vizuale, textele și contractele backend când
schimbarea este un refactor.

La eliminarea unei pagini, scoate ruta din funcționalitate și registru, rewrite-ul,
exporturile și fișierele care nu mai au consumatori, inclusiv stilurile și testele.
Șterge shell-ul și metadatele lui numai dacă nu mai sunt folosite. La eliminarea unei
componente, actualizează consumatorii și șterge implementarea, stilul și testul propriu.
Încheie tot cu `npm run verify`.

## Build și deploy

`npm run build` verifică CSP/config, tipurile, construiește cele două shell-uri HTML
și scrie `dist/version.json`. Adminul rămâne un chunk separat, absent din cererile
homepage-ului. `admin-preview.html` este doar pentru dev și folosește MSW comun.

Merge-ul în `main` trece prin verificările obligatorii din GitHub. Workflow-ul
[`ci-deploy.yml`](../.github/workflows/ci-deploy.yml) pornește deploy-ul Vercel prin
hook după poarta web și verifică versiunea/CSP-ul pe producție. Auto-deploy-ul git
Vercel este oprit. `.vercelignore` păstrează dependențele de texte comune din bot
necesare site-ului și testelor de paritate; botul se deployează separat pe Railway.
Pragurile de acoperire și resetarea unică de la finalul migrării sunt documentate în
[`CI-CD.md`](../CI-CD.md) și măsurate în comentariul datat din `vitest.config.ts`.

# Arhitectura aplicației web

Referință pentru implementare și review în `src/` și `tests/`. Fiecare funcționalitate deține
paginile, componentele, stilurile, accesul la date și testele sale.
Structura botului, a funcțiilor Edge și a SQL-ului rămâne neschimbată.

## Harta modulelor și tranziția

Structura țintă a aplicației web este:

```text
src/
├── app/                         # entry, router, providers: compun aplicația
├── features/
│   └── <nume-românesc>/          # de exemplu antrenament, inscriere, administrare
│       ├── index.ts             # API public: exportă numai ce folosesc consumatorii
│       ├── route.tsx            # declarația rutei funcționalității
│       ├── pages/               # ecranele accesibile prin rută
│       ├── components/          # componente și elemente folosite de funcționalitate
│       ├── styles/              # stilurile proprii
│       └── data/                # cereri, query-uri, mutații și transformări proprii
└── shared/
    ├── ui/                      # primitive și componente comune
    ├── lib/                     # utilitare, backend/config și infrastructură comună
    ├── content/                 # conținut/config de ediție și derivate comune
    └── styles/                  # tokens.css și base.css: valori și stiluri comune
```

Testele unitare și de componentă stau lângă fișierul verificat: de exemplu,
`pages/Antrenament.test.tsx` sau `data/program.test.ts`. Un element folosit numai într-o
funcționalitate rămâne în `components/` al ei; o primitivă folosită de mai multe funcționalități
aparține `shared/ui/`. Stilurile locale rămân cu proprietarul lor, iar valorile comune aparțin
`shared/styles/tokens.css`. Nu creăm subfoldere sau exporturi fără un consumator real.

În U3 există numai scheletul `app/`, `features/` și `shared/`, plus regulile de dependență și
aliasul `@/` către `src/`. Codul existent rămâne în `src/components/`, `src/admin/`,
`src/hooks/`, `src/lib/`, `src/content/` și fișierele din rădăcina `src/`. Migrarea se face în
unitățile planificate, câte o zonă; schimbarea unui fișier vechi nu îl mută automat.

În prezent, [`src/main.tsx`](../src/main.tsx) alege pagina prin comparații ale căii și montează
provider-ul de config. Routerul și provider-ele din `app/` sunt ținta U4, nu o implementare deja
livrată. [`/antrenament`](../src/components/Antrenament.tsx) va fi exemplul complet de
funcționalitate în U7; pagina actuală nu a fost încă mutată în `features/antrenament/`.

## Granițele de dependență

`npm run lint:arch` verifică importurile rezolvate de dependency-cruiser, inclusiv căile
relative, aliasul `@/` și importurile de tipuri. Regulile din
[`.dependency-cruiser.cjs`](../.dependency-cruiser.cjs) sunt generice: o funcționalitate nouă
intră sub aceleași reguli fără modificarea configurației.

- O funcționalitate își poate importa propriile fișiere interne.
- Între funcționalități, importul trece numai prin `index.ts` din rădăcina celei consumate:
  `@/features/antrenament` sau `@/features/antrenament/index`. Un import direct din
  `@/features/antrenament/data/program` este interzis din altă funcționalitate.
- `shared/` nu importă nimic din `features/`, inclusiv API-urile publice.
- `app/` poate importa orice modul necesar compunerii aplicației.

U3 aplică aceste reguli numai importurilor dintre modulele din `app/`, `features/` și
`shared/`. Importurile care implică folderele vechi nu intră încă sub gardă; aria se extinde
asupra întregului `src/` în U13, după migrare. `npm run verify` și job-ul static din CI execută
`lint:arch`; o încălcare oprește verificările.

## Adăugare, schimbare și eliminare

Pentru o pagină nouă, alegem funcționalitatea proprietară și ținem pagina, componentele,
stilurile, datele și testele acolo. API-ul public expune doar ce trebuie folosit din exterior.
În structura țintă, înregistrarea unei rute are exact două puncte de modificare:

1. Declarația rutei în funcționalitate (`features/<nume>/route.tsx`), exportată prin `index.ts`
   și colectată de routerul din `app/`.
2. Rewrite-ul explicit din [`vercel.json`](../vercel.json), către shell-ul HTML potrivit.

Până la U4, primul punct rămâne selecția din `src/main.tsx`; nu există încă declarații de rută
în funcționalități. Un shell separat pentru meta de share cere și intrarea HTML/configurația
de build aferentă, fără a deveni un al treilea registru de rute. Păstrăm rewrites explicite,
inclusiv `/antrenament` → `/antrenament.html`, și verificarea parității rutelor. Testul existent
[`rute.test.ts`](../tests/unit/rute.test.ts) citește acum `main.tsx`; adaptarea lui la router
aparține U4. Playwright pe build verifică în continuare accesul direct și metadatele.

La schimbarea unei componente sau a unui element, edităm codul și testul comportamentului
în funcționalitatea care le deține. Alegem stratul din tabelul de mai jos și evităm să repetăm
aceeași aserțiune în mai multe straturi. O cerere nouă păstrează contractul backend; refactorul
nu schimbă numele RPC-urilor, headerele sau forma payload-ului.

La eliminarea unei pagini, scoatem declarația rutei și rewrite-ul ei, apoi pagina, exporturile,
stilurile, datele și testele care nu mai au consumatori. La eliminarea unei componente sau a
unui element, ștergem implementarea, stilurile și testele proprii și actualizăm consumatorii.
Eliminăm un shell și meta aferentă numai când nu mai sunt folosite. Încheiem cu
`npm run verify`, care include verificările de arhitectură, cod nefolosit și paritate a rutelor.

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

Tabelul definește stratul pentru teste noi. U2 și U3 păstrează toate testele și aserțiunile
existente; nu redistribuie încă acoperirea dintre straturi.

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
  `tests/support/`; mutarea helper-elor vechi aparține unităților de migrare.
- TypeScript pentru teste și lint-ul includ deja `src/`, `tests/` și `scripts/`; mutarea
  parcursurilor și colocarea testelor nu cer excepții noi.

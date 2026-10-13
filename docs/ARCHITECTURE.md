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

U3 a adăugat scheletul `app/`, `features/` și `shared/`, regulile de dependență și
aliasul `@/` către `src/`. U4 compune entry-ul și routerul tipizat în `app/` și mută
transportul RPC în `shared/lib/rpc.ts`, pentru a separa API-ul admin de entry-ul public.
U5 montează un singur QueryClient în `app/providers.tsx`, cu retry și refetch la focus
oprite. `useAdminResource` păstrează contractul (`date`, `eroare`, `reincarca`) și folosește
Query pentru încărcare și anulare. Poll-ul rămâne cel vechi: la 15 secunde și la revenirea
în tab anulează cererea în zbor și pornește alta, prin API-ul Query (nu `refetchInterval`,
care ar refolosi cererea în zbor). Cache-ul apelează o singură dată callback-ul de
sesiune pentru fiecare query eșuat. Datele deja încărcate rămân vizibile după un refresh
picat. Testele izolate primesc provider-ul comun din setup-ul Vitest.
`AdminDashboard` încă folosește programarea veche; hook-urile publice și mutațiile se mută
la Query odată cu funcționalitățile lor. Transportul RPC și config-ul public nu se schimbă.

U6 mută jetoanele `--e3-*` în `shared/styles/tokens.css` și resetul, tipografia de bază
și focusul vizibil în `shared/styles/base.css`; `index.css` le importă primele, deci ordinea
regulilor nu se schimbă. Prima primitivă din `shared/ui/` e suprapunerea (`Suprapunere`,
`Dialog`, capcana de focus, pragul de telefon, iconițele). Stilul ei stă în
`Suprapunere.module.css`, cu fiecare regulă în `:where()`: specificitate zero, deci clasa
pe care o trece o funcționalitate (`clasa="admin-meniu"`) câștigă indiferent în ce ordine
se încarcă CSS-ul chunk-urilor. Conținutul unei suprapuneri se stilează din
funcționalitate prin `data-prezentare` (`popover`, `panou`, `dialog`, `foaie`), nu prin
clasele kitului. Garda `claseCss` verifică și modulele: fiecare `styles.x` există în
modulul importat și fiecare clasă de modul are un purtător. Toast-urile și piesele de
formular de pe landing rămân la funcționalitățile lor până la valurile U9 și U10: cele două
toast-uri au comportamente diferite, iar piesele de formular trec din stil inline în clase
odată cu stilul formularului, ca prioritatea lor față de `.e3-*` să fie verificată într-un
singur loc.

U7 mută `/antrenament` în `features/antrenament/`, exemplul de referință pentru restul
valurilor: `route.tsx` declară ruta cu pagina încărcată la cerere, `pages/` ține pagina,
`components/` cardul săptămânii și cardul „Până atunci", `styles/` modulele CSS,
`data/` cererea și query-ul. `index.ts` exportă ruta și cele două carduri; editorul
adminului și ecranul de așteptare le importă de acolo, iar regula `legacy-via-index` din
`.dependency-cruiser.cjs` respinge orice import mai adânc, și din codul încă nemutat.
Stările paginii și ale cardurilor sunt teste de componentă lângă cod, pe handler-ele MSW
comune; `tests/e2e/antrenament.spec.ts` păstrează doar drumul vizitatorului și ce se vede
numai cu CSS-ul și shell-urile din build. Un modul care folosește o animație globală o
numește `global(fade-up)`; altfel CSS Modules redenumește animația și ea dispare tăcut.

U8 mută paginile din linkurile de email (`confirmare`, `unsubscribe`, `renunt`) și pagina
`/inscriere` în funcționalitățile lor, după forma din U7. Ce aveau copiat între ele a
trecut în `shared/`: `ui/CadruScurt` (fundalul, antetul, subsolul și titlul paginilor
scurte, folosit și de `/antrenament`), `ui/RezultatLink` (iconița, titlul, textul și
drumul înapoi), `lib/token` (forma tokenului din link) și `lib/useLinkDinEmail` (cererea
o singură dată, la încărcare, cu `incarca`/`invalid`/`eroare`). Cele trei RPC-uri trec
prin `rpcStrict`, care păstrează diferența dintre „serverul a zis nu" și un răspuns
stricat. `/renunt` folosește o mutație: cererea pleacă doar la click. Clasele `.cs-*`
ale cadrului rămân globale până se mută ecranul de așteptare (U9). Formularul de pe
`/inscriere` și testele lui se mută cu landing-ul, în U9.
Codul existent rămâne în `src/components/`, `src/admin/`,
`src/hooks/`, `src/lib/`, `src/content/` și fișierele din rădăcina `src/`. Migrarea se face în
unitățile planificate, câte o zonă; schimbarea unui fișier vechi nu îl mută automat.

În prezent, [`src/app/main.tsx`](../src/app/main.tsx) montează routerul TanStack declarat în
cod în [`src/app/router.tsx`](../src/app/router.tsx). Registrul din `app/routes.ts` compune
paginile și lista canonică de căi. Landing-ul este eager, celelalte pagini sunt lazy; layout-ul
fără cale montează provider-ul de config numai pentru paginile dependente de ediție.
[`/antrenament`](../src/features/antrenament/pages/AntrenamentPage.tsx) este exemplul complet de
funcționalitate din U7.

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

Până la migrarea funcționalităților, primul punct este registrul din `src/app/routes.ts`;
declarațiile nu sunt încă în funcționalități. Un shell separat pentru meta de share cere și intrarea
HTML/configurația de build aferentă, fără a deveni un al treilea registru de rute. Păstrăm rewrites explicite,
inclusiv `/antrenament` → `/antrenament.html`, și verificarea parității rutelor. Testul
[`rute.test.ts`](../tests/unit/rute.test.ts) citește lista canonică a routerului și păzește
paritatea în ambele direcții. Playwright pe build verifică în continuare accesul
direct și metadatele.

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
| Validare și transformări fără DOM | Vitest unit, `.test.ts` | [`shared/lib/validation.test.ts`](../src/shared/lib/validation.test.ts) |
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

Pagini publice: `features/landing`, `features/inscriere`, `features/despre-noi`, `features/reels` și `features/trial` dețin compoziția, componentele și testele lor. Contextul ediției, conținutul comun și efectele refolosite sunt în `shared/`; paginile consumă alte funcționalități numai prin `index.ts`.

U9 mută accesul public la date în Query, prin transportul funcționalității proprietare.
`shared/lib/usePublicQuery` dă fiecărei montări o cheie proprie, fără reutilizarea datelor
între pagini. Poll-ul configului și al participanților anulează cererea în zbor la 15
secunde și la revenirea în tab. Configul păstrează instantaneul sincron, iar ordinea
homepage-ului se fixează după limita de două secunde; un loc primit mai târziu se poate
afișa în continuare. Mutațiile formularelor pornesc și când browserul raportează offline,
folosind `networkMode: always`, cu anularea și timeout-ul transportului anterior.

Stilurile landing-ului, Coming Soon, înscrierii, paginii Despre noi, clipurilor și probei
sunt CSS Modules lângă componente. `CadruScurt` deține acum și cadrul comun `.cs-*`;
Marquee, Toast și grupurile de mișcare/controale refolosite au modulele lor în `shared/ui`.
Atributele `data-css` țin selectorii de mișcare și măsurătorile browserului stabili, fără
să depindă de clasele generate. Valorile CSS și diferențele dintre cele două suprafețe
de înscriere rămân cele existente.

Validarea înscrierii și stările formularelor sunt acoperite lângă proprietarii lor,
pe handler-ele MSW comune. Playwright păstrează înscrierea completă, plicul trimis,
rutarea, CSS-ul calculat, CSP-ul și metadatele din build; scenariile de validare și
stare deja acoperite de componente au fost eliminate din parcursurile duplicate.

U10 mută în `features/admin/` cadrul adminului și zonele Acum și Site: `pages/` login-ul,
`components/` cadrul cu navigarea, linia de timp și învelișul de editare (folosit de mai
multe zone), `navigatie/` registrul și `useEcranCurent` (care rămâne proprietarul
fragmentului `#cheie`, cu garda de ieșire), `data/` sesiunea, `useAdminResource`,
poll-ul și, temporar până la U12, datele grupului și ale probelor, citite și de Acum,
și de Antrenamente.
`zones/acum/` și `zones/site/` țin ecranele lor; Site are `api.ts` cu RPC-urile proprii,
iar login-ul are `data/api.ts`. `GrupRadio`, folosit de Site și de Evenimente, trece în
`shared/ui/`.

U11 mută `AdminApp` și `AdminDashboard` în `features/admin/pages/`, iar Evenimente în
`zones/evenimente/`: ediții, participanți, așteptare, email, livrare, șabloane și
publicare. Zona își deține transportul în `api.ts`, componentele grupurilor editorului,
modulele CSS și testele colocate. `useDashboardData` deține citirile ediției selectate
și semnalele ediției curente, prin resurse Query separate; schimbarea ediției păstrează
distincția dintre datele arhivei și semnalele de pe Acum. Scrierile trec prin mutații
Query, iar publicarea și salvarea invalidează resursele afectate. Ruta adminului și
încărcarea preview-ului trec prin API-ul public `features/admin/index.ts`; pagina și
dashboardul rămân încărcate la cerere. Stocarea tokenului este comună, în
`shared/lib/adminToken`, astfel încât preview-ul ciornei să nu importe adminul.

Stilurile acestor componente au plecat din `index.css` în CSS Modules lângă ele, cu
valorile neschimbate. Piesele folosite de mai multe componente ale adminului (logo-ul,
numărul de atenție, titlul învelișului) stau în `components/AdminStyles.module.css`,
importat înaintea modulului propriu. Clasele pe care le poartă și ecranele încă nemutate
(`admin-btn-*`, `admin-config-*`, `admin-table-*`, `admin-stat*`, `admin-banner`,
`admin-control`, `admin-confirm-*` și celelalte) rămân globale în `index.css` până la
curățarea comună din U13, iar componentele mutate le folosesc ca șiruri simple,
lângă clasele de modul.

U12 mută programul săptămânal, prezențele, membrii, analiza, botul, ghidul și probele
în `zones/antrenamente/`, împreună cu testele lor. `api.ts` deține transporturile
fostelor `salaApi`, `trialApi` și `workoutApi`; mesajele de refuz rămân lângă
RPC-urile care le produc. `useSala` și `useTrials` aparțin zonei; cadrul adminului
și Acum consumă datele, transformările și semnalul `trialNeedsAttention` prin
`zones/antrenamente/index.ts`. Acest API nu exportă ecranele, ca să păstreze
dependențele fără cicluri.

Citirile Query au familii separate pentru `sala`, `trials` și `weekly`.
Scrierile folosesc mutații Query și invalidează familia afectată: marcarea unei
prezențe reîmprospătează citirile grupului, fără probe, ediții sau config.
Botul și membrii citesc același răspuns `admin_sala_date`, deci rămân în familia
grupului. Starea ocupată a grupului durează până la refresh; probele păstrează
ciorna dacă refresh-ul de după scriere eșuează. Poll-ul păstrează anularea și
înlocuirea cererii la 15 secunde și la revenirea în tab.

Stilurile proprii au module lângă componente; `SalaStyles.module.css` și
`ProbeStyles.module.css` țin piesele folosite de mai multe ecrane ale zonei.
Modulul propriu se importă după cele comune. Selectorii care traversează un modul
folosesc `data-css`, iar modificatorii globali sunt ancorați în clasele locale.
Valorile și specificitatea rămân cele existente. Excepția temporară
`legacy-admin-public-api` a fost eliminată; fișierele rămase în `src/admin/`
urmează aceeași regulă de API public. Facade-ul `src/lib/adminApi.ts` a fost
eliminat: testul de contract importă API-ul zonei, iar indexul adminului expune
doar intrările încărcate la cerere și rădăcina vizuală. Re-exportarea API-ului
autentificat prin acel index ar încărca zona și în bundle-ul public.

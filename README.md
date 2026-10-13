# Run + Lift — Landing page

Pagină de înscriere pentru evenimentul **Run + Lift**. React 19 + Vite + TypeScript, cu
**Supabase** ca backend (Postgres + RPC public de statistici + funcție edge pentru emailuri).
Fără server propriu. Deploy pe **Vercel**.

> **Ediția curentă** se configurează din `/admin`, în baza de date.
> `src/shared/content/edition.ts` este instantaneul de build pentru primul cadru și
> metadatele de share. Vezi „Ediție nouă” mai jos.

## Structura proiectului

Harta aplicației, regulile de import, straturile de testare și pașii de
adăugare/eliminare sunt în **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.
Tot codul web este sub `src/app/`, `src/features/` și `src/shared/`; `npm run lint:arch`
verifică atât granițele de import, cât și fișierele din afara acestei structuri.

```text
run-lift-landing/
├── index.html                  # shell-ul ediției; meta din shared/content/meta.ts
├── antrenament.html            # shell și card de share proprii pentru /antrenament
├── admin-preview.html          # demo de dev cu handler-ele MSW comune
├── vercel.json                 # rewrites explicite, CSP și deploy git oprit
├── public/                     # favicon, og.png, apple-touch-icon
├── scripts/                    # garda de deploy și version.json
├── src/
│   ├── app/                    # entry, router, QueryClient, preview și tipuri Vite
│   ├── features/               # pagini, componente, date, CSS Modules și teste
│   │   ├── antrenament/        # exemplul de referință pentru o funcționalitate
│   │   ├── landing/            # homepage și Coming Soon
│   │   ├── inscriere/          # formular, validare și transport înscriere
│   │   ├── admin/              # Acum, Site, Evenimente și Antrenamente
│   │   └── ...                 # linkuri de email, Despre noi, reels și trial
│   └── shared/
│       ├── content/            # instantaneul ediției, forma configului și derivate
│       ├── lib/                # RPC, backend/config, hook-uri și utilitare comune
│       ├── ui/                 # primitive, componente și stiluri comune
│       └── styles/             # tokens.css și base.css
├── tests/
│   ├── support/                # MSW și builder-e comune pentru Vitest/Playwright
│   ├── e2e/                    # parcursuri și verificări pe build
│   ├── unit/                   # contracte între straturi, guard-uri, SQL și Edge
│   └── integration/            # backend real, opt-in
├── bot/                        # serviciul Telegram, deploy pe Railway
└── supabase/                   # funcții Edge și SQL, în afara structurii web
```

Testele unitare și de componentă stau lângă codul lor. Fiecare funcționalitate
expune un `index.ts`; alte funcționalități folosesc doar acel API public.

## Rulare locală

Node 24 (LTS-ul curent), din `.nvmrc` — același în CI, pe Vercel și pe Railway (`engines`).
Cu `fnm` sau `nvm`, `fnm use` / `nvm use` la rădăcina repo-ului.

```bash
npm install
npm run dev        # dev server pe http://localhost:5173
npm run build      # build de producție în dist/
npm run preview    # servește build-ul local
```

## Backend (Supabase)

Proiect **`ironworks-gym`** (`whyndrjcezmtajbykeil`, eu-central-1), **partajat** cu gym-app +
botul de Telegram. Run + Lift trăiește în schema **`runlift`** (rutată prin headerele
`Accept-Profile` / `Content-Profile`). Detalii + granițe: **`MIGRATIONS.md`**.

- **`registrations`** — înscrieri (nume, telefon, email, dată naștere, ediție). Email unic pe
  (email, ediție). Citirea datelor personale — doar din backoffice.
- **Scrierea publică trece prin funcția edge `submit-form`**, care verifică un token
  **Cloudflare Turnstile** înainte de a insera. Cheia publică **nu mai poate insera direct**:
  altfel un bot ar putea ocoli captcha cu un simplu `curl`. Vezi **`ANTI-BOT.md`**.
- **RPC `public_stats`** — GET public, doar date ne-personale (`count`, prenume mascat, `waitlist`).
  Alimentează bara „Locuri rămase".
- **Emailuri (Resend)** — funcția edge `send-email`. Conținutul (confirmare, reminder, anunț,
  badge) NU e hardcodat: vine din `email_templates` și e **editabil din `/admin`**.
- **Config client** — `src/shared/lib/backend.ts` (`SUPABASE`). Cheia e publică prin design; protecția
  vine din RLS + verificarea Turnstile din `submit-form`.

## Ediție nouă (pe scurt)

Din **`/admin` → tabul „Eveniment"**. Fără editări în cod, fără deploy.

1. „+ Ciornă pentru ediția N+1" → completezi datele, locul, locurile, secțiunile.
2. „Previzualizează" (`/?config=draft`) → vezi pagina reală, randată din ciornă.
3. „Publică" → site-ul public trece pe configul nou imediat.
4. Textul emailurilor (dacă vrei să-l schimbi) → `/admin` → „Șabloane de email".

Singurul lucru care mai cere deploy e **share preview-ul** (meta se injectează la build, pentru că
scraper-ele nu rulează JS). Tabul „Eveniment" îți spune când a rămas în urmă.

Runbook complet: **`GHID-EDITIE-NOUA.md`**. Decizii de arhitectură: secțiunea de mai jos.

## Ziua evenimentului

Homepage-ul trece singur prin trei faze, pe ceas, fără redeploy: landing normal → landing fără
înscriere cu „cine vine" sub hero (de la `start` − `leaderboardLeadHours`) → countdown spre
`nextEditionAt` (de la finalul cursei). Logica: `src/shared/lib/usePagePhase.ts`. Le vezi înainte de
ora lor cu `?preview=leaderboard` și `?preview=next`. Detalii + pașii de după cursă:
**`GHID-EDITIE-NOUA.md`**.

## Deploy (Vercel)

Merge prin PR în `main` (GitHub `vladrightjump/run-lift-landing`) → CI rulează verificările
și declanșează hook-ul Vercel după poarta web. Vercel rulează `npm run build`, iar CI
verifică versiunea și CSP-ul live. Auto-deploy-ul git Vercel este oprit; detalii în
[CI-CD.md](CI-CD.md). Domeniu: **parktraining.fit**. CSP-ul (`vercel.json`) trebuie să
permită originul Supabase curent **și `challenges.cloudflare.com`** (Turnstile) — există teste
care păzesc ambele. `VITE_TURNSTILE_SITE_KEY` e obligatorie la build-ul de producție.

## Botul de Telegram (`bot/`)

Botul grupului din parc (sondajul „vii mâine?", voturile, rezumatul, comenzile din admin)
trăiește în `bot/` și rulează pe **Railway**, nu pe Vercel. Merge-ul în `main` îl deployează
doar dacă trece job-ul `bot` din CI (Railway are „Wait for CI"). Serviciul Railway e descris
în `.railway/railway.ts` și se schimbă cu `railway config plan` / `apply`. Detalii, variabile și
întoarcere: **`bot/README.md`**. Se configurează din `/admin` → „Botul de Telegram".

## Teste

```bash
npm run test          # unitare (vitest) — logică + contract cereri + config/CSP + meta
npm run test:e2e      # Playwright pe dev server, cu MSW comun
npm run test:e2e:preview # Playwright pe build; rulează întâi npm run build
npm run test:integration   # OPT-IN, backend real (necesită RUNLIFT_LIVE=1 + credențiale)
npm run verify        # lint + arhitectură + cod mort + tipuri + coverage + build + e2e
```

## Backoffice (/admin)

Backoffice pe zonele **Acum**, **Site**, **Evenimente** și **Antrenamente**.
Navigarea păstrează ecranul în fragmentul URL-ului (`/admin#cheie`). Cadrul comun
arată filele pe desktop și bara de zone pe telefon. Linia de timp a ediției și
editorul programului săptămânal aparțin zonelor lor; programul nu ține de o ediție.

Restul: statistici live, listă înscrieri, căutare, adăugare manuală, ștergere
cu undo, export CSV, trimitere emailuri în masă, editare șabloane. Auth: cont unic în
`admin_users` (bcrypt) + token de sesiune în `admin_sessions`; operațiile trec prin RPC-uri
`SECURITY DEFINER`. Cod: `src/features/admin/` (API-uri lângă fiecare zonă).

Tabul **„Coming Soon"** e singurul cu efect **imediat** pe site: comută ecranul de dinainte de
lansare și mută țintele numărătorilor fără să treacă prin ciornă → publică. Scurtătura e de pași,
nu de verificări — serverul revalidează documentul peticit prin aceeași poartă ca publicarea și
scrie un rând nou, deci orice apăsare se poate întoarce din „Versiuni anterioare".

## Antrenamentul săptămânii (`/antrenament`)

Pagină publică la un URL care nu se schimbă, ca să ai ce link trimite în story sau în grupul de
Telegram. În prim-plan e antrenamentul săptămânii curente — linkul trimis acum o lună duce tot la
el. Sub card, un selector cu **programul întreg**: Săptămâna 1, 2, 3 … N, din care poate porni de
la început cine abia se apucă de alergat. Alegerea scrie fragmentul (`/antrenament#s1`), deci
„începe de la Săptămâna 1" e un link trimisibil.

> Până pe 20 septembrie 2026 pagina arăta **un singur** antrenament, deliberat („nu e arhivă").
> Decizia s-a schimbat: fără un început, programul nu folosea nimănui care nu alerga deja. Vezi
> `docs/plans/2026-09-20-0838-feat-programul-antrenamentelor-pe-saptamani-plan.md`.

Pe ecranul „Ne vedem curând" (între ediții), sub countdown apare cardul **„Până atunci"** cu
săptămâna curentă — numărul, titlul și primele rânduri, tăiate cu fade. Arată conținut, nu o
etichetă: un buton scris „Antrenamentul săptămânii" ar fi cerut încredere înainte de clic.
Tace complet dacă programul e gol sau cererea pică — e decor pe un ecran al cărui rost e
formularul de notificare. Cod: `src/features/antrenament/components/CardAntrenament.tsx`.

Se scrie din `/admin`, din blocul „în fiecare săptămână" de sub linia de timp. Ecranul e lista
programului plus editorul săptămânii deschise; numărul îl pune serverul, iar butonul de adăugare
îl arată dinainte („+ Săptămâna 10"). Săptămânile se mută cu ↑ ↓, se ascund una câte una și se
pot șterge. Nu trece prin ciornă → publică, fiindcă nu ține de ediție.

Vizibilitatea e per săptămână și independentă de text, deci antrenamentul de săptămâna viitoare
poate fi scris din timp și ținut ascuns; **vizibil peste un text gol** e refuzat de server. Fără
nicio săptămână vizibilă, URL-ul răspunde și spune că nu e nimic publicat — nu dă 404, ca
linkurile deja trimise să nu se rupă.

E singura pagină cu **shell propriu de build** (`antrenament.html`). Meta de share se injectează la
build, deci un card per pagină cere un fișier per pagină — altfel linkul ar arăta cardul ediției, cu
o dată posibil trecută. Cardul e fix: spune „Antrenamentul săptămânii", nu conținutul săptămânii.

## Banda cu clipuri de antrenament

Secțiune configurabilă ca oricare alta (ordonabilă și ascunsă din tabul „Eveniment"), dar clipurile
nu țin de ediție: stau în `training_reels` și se administrează din tabul „Clipuri". Aceeași listă
hrănește landing-ul și `/despre-noi`.

Clipurile sunt găzduite pe YouTube, nelistate. Se adaugă lipind linkul în `/admin` — orice formă
dă „Distribuie" — și nu mai există niciun pas pe laptop. Asta e schimbarea: banda a stat goală o
lună sub un panou care cerea un link, și încă o zi sub o conductă care cerea `ffmpeg` și un commit.

Banda e un **carusel**: redă un singur card, cel din centrul șinei, mut și în buclă. Cardurile care
nu redau n-au niciun `iframe` în DOM — demontate, nu ascunse. Patru playere pornite simultan
coboară pagina la ~37 fps, iar un player ascuns costă la fel de mult ca unul vizibil. Nimic nu
pleacă spre gazdă până când șina nu se apropie de ecran.

Fără niciun clip, secțiunea nu se randează **și** nu consumă un număr de secțiune.

Linkul de sub fiecare card duce spre postarea de pe **Instagram**, nu spre YouTube: gazda ține
fișierul, dar publicul e pe Instagram.

Antetele de care depinde: `frame-src` și delegările de `autoplay` și `fullscreen` din
`Permissions-Policy`, toate spre `https://www.youtube-nocookie.com`. `script-src` rămâne `'self'` —
playerul e un iframe, nu API-ul de player al gazdei. Există teste care păzesc fiecare dintre ele.

## Decizii de arhitectură

De ce arată lucrurile așa, ca să nu se redeschidă degeaba:

- **Ediția trăiește în baza de date, nu în cod.** Sursa de adevăr e rândul `published` din
  `runlift.event_config`, editabil din `/admin`. `src/shared/content/edition.ts` a rămas doar
  instantaneul de build: randează primul cadru și hrănește meta de share, pentru că
  scraperele de WhatsApp/Facebook nu rulează JS. Are voie să rămână în urmă față de ediția
  publicată — tabul „Eveniment" îți spune când s-a întâmplat.
- **Emailuri din DB, fără generator cod→DB.** Textele se editează din `/admin` → „Șabloane";
  un generator din cod ar crea două stăpâne și ar suprascrie editările. Constantele
  `*_FALLBACK` din funcția Edge sunt generice, fără dată, și se folosesc doar dacă DB-ul tace.
- **Fără `copy.ts` de i18n.** Aplicația e mono-lingvă. Derivăm din config DOAR string-urile
  dependente de ediție (`src/shared/content/format.ts`); proza statică rămâne în componente.
- **Meta de share injectată la build**, prin plugin Vite, nu din React — scraperele citesc
  HTML static.
- **Numărul săptămânii e poziția în program, nu un identificator etern.** Mutarea și ștergerea
  renumerotează, ca programul să rămână 1…N fără goluri: un program căruia îi lipsește Săptămâna 2
  e un program stricat, nu unul cu o gaură. Prețul — un `#s5` trimis luna trecută poate ajunge la
  alt antrenament — e acceptabil fiindcă nu există rute per săptămână, doar un selector.
  Ascunderea, în schimb, **nu** renumerotează: altfel numărul săptămânii curente s-ar fi mutat la
  fiecare pornire-oprire.
- **Renumerotarea trece printr-un interval-tampon.** Indexul de unicitate pe `numar` e *parțial*,
  iar Postgres nu poate amâna verificarea unui index — numai constrângerile sunt `deferrable`, și
  o constrângere unică parțială nu există. Măsurat: un schimb dintr-un singur `update … case` pică
  cu „duplicate key". De asta ambele operații mută întâi rândurile în negativ.
- **Analiticele sunt tăcute peste tot în afară de producție.** `pornesteAnalitice` (în
  `src/shared/lib/analytics.ts`) pornește Vercel Web Analytics doar când `__VERCEL_ENV__` e
  `'production'`. Nu `import.meta.env.PROD`: acela e adevărat și sub `vite preview`, unde rulează
  testele e2e și unde `/_vercel/insights/*` nu există — scriptul ar da 404 la fiecare rulare,
  fix motivul pentru care blocurile de `<script>` au fost scoase din shell-uri în august. Mediul
  se primește ca parametru, ca la `redirectCanonic`, fiindcă `__VERCEL_ENV__` e un `define` din
  `vite.config.ts` și `vitest.config.ts` n-are `define`.
- **URL-urile se curăță înainte să plece spre Vercel, printr-o listă albă.** `/confirmare`,
  `/unsubscribe` și `/renunt` primesc tokenuri de unică folosință prin query string, iar Vercel
  stochează URL-ul și parametrii ca atare — s-ar vedea în panoul de URL-uri al dashboard-ului.
  Trec doar `utm_*` și `ref`; `/admin` se aruncă întreg. Listă albă, nu neagră, ca următorul
  parametru secret adăugat să nu treacă din neatenție.
- **`Referrer-Policy: strict-origin` e a doua jumătate a redactării.** `beforeSend` rescrie
  `event.url`, dar Vercel stochează și un câmp *Referrer*, pe care API-ul pachetului nu-l expune.
  Sub `strict-origin-when-cross-origin` (politica de dinainte), o navigare **same-origin** trimite
  URL-ul complet — iar cele trei pagini cu token au un logo `<a href="/">` în antet, deci un
  singur click scotea tokenul pe ușa din dos. `strict-origin` schimbă exact acel caz: pe
  cross-origin se trimitea deja doar originea, deci datele despre sursa traficului rămân
  neatinse. Harta și playerul își poartă propria politică pe element, care bate antetul.
- **Repo-ul nu deține ciclul de viață al bazei.** Proiectul Supabase e partajat cu gym-app și
  botul de Telegram, iar noi ținem strict schema `runlift`. Migrările se documentează în
  `MIGRATIONS.md` și se aplică manual; fișierele lor stau în `supabase/sql/`.

## Live URLs

- Producție: https://parktraining.fit
- Vercel: https://vercel.com/muvs-projects-4dea1994/run-lift-landing
- GitHub: https://github.com/vladrightjump/run-lift-landing
- Supabase (`ironworks-gym`): https://supabase.com/dashboard/project/whyndrjcezmtajbykeil

## Documente

- **`docs/FLUXURI.md`** — toate fluxurile de utilizator (public + `/admin`, inclusiv grupul din parc), cu diagrame.
- **`GHID-EDITIE-NOUA.md`** — runbook pas cu pas pentru o ediție nouă.
- **`GHID-GRUPUL-DIN-PARC.md`** — grupul din parc din `/admin`: prezențe, membri, analiză, botul.
- **`bot/README.md`** — botul de Telegram ca serviciu: deploy pe Railway, mutarea, întoarcerea.
- **`MIGRATIONS.md`** — migrările DB + granița față de `public` (tabelele grupului din parc).
- **`ANTI-BOT.md`** — Turnstile + lockdown RLS: cum funcționează, configurare, runbook de deploy.
- **`ERROR-HANDLING.md`** — tratarea erorilor, monitoring și garda CSP↔config la build.
- **`CI-CD.md`** — pipeline-ul de testare + deploy Vercel verificat pe live.
- **`BACKLOG.md`** — lucruri deschise (GDPR, FAQ, rezultate, Turnstile, creștere…).

# Run + Lift — Landing page

Pagină de înscriere pentru evenimentul **Run + Lift**. React 19 + Vite + TypeScript, cu
**Supabase** ca backend (Postgres + RPC public de statistici + funcție edge pentru emailuri).
Fără server propriu. Deploy pe **Vercel**.

> **Ediția curentă** și toate datele evenimentului (dată, locație, branding, sloturi) sunt
> configurate într-un singur loc: **`src/content/edition.ts`**. Vezi „Ediție nouă" mai jos.

## Structura proiectului

```
run-lift-landing/
├── index.html            # meta injectată la build din content/meta.ts (plugin Vite)
├── vercel.json           # headere de securitate (CSP: connect-src → Supabase)
├── public/               # favicon, og.png, apple-touch-icon
├── scripts/
│   └── write-version.ts  # ștampilează dist/version.json (commit + amprenta meta)
├── src/
│   ├── content/          # instantaneul de build (sursa de adevăr e în DB)
│   │   ├── edition.ts    #   instantaneu: primul cadru + meta de share. NU-l edita per ediție
│   │   ├── eventConfig.ts#   forma documentului de config + parsarea lui
│   │   ├── format.ts     #   derivate: ordinal, dată RO, EVENT_META, HERO_KICKER…
│   │   └── meta.ts       #   title/description/OG derivate din EDITION
│   ├── components/       # Edition3Landing, ComingSoon, Confirmare, DespreNoi, Toast
│   │                     #   landing/ReelsSection — banda Instagram (façade + iframe la click)
│   ├── admin/            # backoffice /admin (login, dashboard, email, șabloane)
│   ├── hooks/            # useCountdown, usePagePhase, useScrollReveal, useToast, useNow, useStats
│   └── lib/
│       ├── config.ts     # derivă din content/edition.ts (NU edita valori aici)
│       ├── backend.ts    # config Supabase (url/key/schema) — mediu, nu ediție
│       ├── validation.ts
│       └── supabase.ts   # submit înscriere + fetch statistici + emailuri
└── supabase/functions/send-email/  # funcția edge (Resend); conținut din DB (email_templates)
```

## Rulare locală

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
- **Config client** — `src/lib/backend.ts` (`SUPABASE`). Cheia e publică prin design; protecția
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
`nextEditionAt` (de la finalul cursei). Logica: `src/hooks/usePagePhase.ts`. Le vezi înainte de
ora lor cu `?preview=leaderboard` și `?preview=next`. Detalii + pașii de după cursă:
**`GHID-EDITIE-NOUA.md`**.

## Deploy (Vercel)

Git-connected: push pe `main` (GitHub `vladrightjump/run-lift-landing`) → Vercel rulează
`npm run build` și publică. Domeniu: **parktraining.fit**. CSP-ul (`vercel.json`) trebuie să
permită originul Supabase curent **și `challenges.cloudflare.com`** (Turnstile) — există teste
care păzesc ambele. `VITE_TURNSTILE_SITE_KEY` e obligatorie la build-ul de producție.

## Teste

```bash
npm run test          # unitare (vitest) — logică + contract cereri + config/CSP + meta
npm run test:e2e      # e2e (Playwright) — fluxuri, butoane, stări (mock Supabase)
npm run test:integration   # OPT-IN, backend real (necesită RUNLIFT_LIVE=1 + credențiale)
npm run verify        # typecheck + typecheck:tests + test + build + e2e
```

## Backoffice (/admin)

Dashboard de organizator. Primul lucru pe ecran e **linia de timp a ediției** — anunț, înscrieri,
remindere, start, după cursă, ediția următoare — fiecare nod cu starea lui în cuvinte și cu acțiunea
care-i aparține; calea scurtă de creare a ediției următoare stă pe ultimul nod. Sub ea, blocul
**„în fiecare săptămână"** (antrenamentul, în afara structurii pe ediții, fiindcă nu ține de nicio
ediție). Abia apoi navigația pe trei grupuri, ca al doilea nivel.

Restul: statistici live, listă înscrieri, căutare, adăugare manuală, ștergere
cu undo, export CSV, trimitere emailuri în masă, editare șabloane. Auth: cont unic în
`admin_users` (bcrypt) + token de sesiune în `admin_sessions`; operațiile trec prin RPC-uri
`SECURITY DEFINER`. Cod: `src/admin/` + `src/lib/adminApi.ts`.

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
formularul de notificare. Cod: `src/components/CardAntrenament.tsx`.

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

## Banda „Instagram"

Secțiune configurabilă ca oricare alta (ordonabilă și ascunsă din tabul „Eveniment"). Clipurile se
adaugă lipind linkul din Instagram — codul se extrage singur.

Cardurile sunt **façade**: până când vizitatorul nu apasă pe unul, pagina nu cere nimic de la
`instagram.com` (nici script, nici imagine, nici cookie — util și pentru punctul GDPR din
`BACKLOG.md`). Clicul montează iframe-ul oficial în locul cardului, unul singur odată. Sub fiecare
card rămâne linkul canonic, ca un iframe blocat să nu însemne conținut inaccesibil.

Fără niciun clip, secțiunea nu se randează **și** nu consumă un număr de secțiune. Posterele sunt
assets locale (`public/reels/`), deci un poster nou cere deploy; un clip nou, nu.

CSP-ul trebuie să păstreze `https://www.instagram.com` în `frame-src`, iar `Permissions-Policy`
delegarea de fullscreen. Există teste care păzesc ambele.

## Decizii de arhitectură

De ce arată lucrurile așa, ca să nu se redeschidă degeaba:

- **Ediția trăiește în baza de date, nu în cod.** Sursa de adevăr e rândul `published` din
  `runlift.event_config`, editabil din `/admin`. `src/content/edition.ts` a rămas doar
  instantaneul de build: randează primul cadru și hrănește meta de share, pentru că
  scraperele de WhatsApp/Facebook nu rulează JS. Are voie să rămână în urmă față de ediția
  publicată — tabul „Eveniment" îți spune când s-a întâmplat.
- **Emailuri din DB, fără generator cod→DB.** Textele se editează din `/admin` → „Șabloane";
  un generator din cod ar crea două stăpâne și ar suprascrie editările. Constantele
  `*_FALLBACK` din funcția Edge sunt generice, fără dată, și se folosesc doar dacă DB-ul tace.
- **Fără `copy.ts` de i18n.** Aplicația e mono-lingvă. Derivăm din config DOAR string-urile
  dependente de ediție (`src/content/format.ts`); proza statică rămâne în componente.
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
- **Repo-ul nu deține ciclul de viață al bazei.** Proiectul Supabase e partajat cu gym-app și
  botul de Telegram, iar noi ținem strict schema `runlift`. Migrările se documentează în
  `MIGRATIONS.md` și se aplică manual; fișierele lor stau în `supabase/sql/`.

## Live URLs

- Producție: https://parktraining.fit
- Vercel: https://vercel.com/muvs-projects-4dea1994/run-lift-landing
- GitHub: https://github.com/vladrightjump/run-lift-landing
- Supabase (`ironworks-gym`): https://supabase.com/dashboard/project/whyndrjcezmtajbykeil

## Documente

- **`docs/FLUXURI.md`** — toate fluxurile de utilizator (public + `/admin`), cu diagrame.
- **`GHID-EDITIE-NOUA.md`** — runbook pas cu pas pentru o ediție nouă.
- **`MIGRATIONS.md`** — migrările DB + granița față de gym-app/bot.
- **`ANTI-BOT.md`** — Turnstile + lockdown RLS: cum funcționează, configurare, runbook de deploy.
- **`ERROR-HANDLING.md`** — tratarea erorilor, monitoring și garda CSP↔config la build.
- **`CI-CD.md`** — pipeline-ul de testare + deploy Vercel verificat pe live.
- **`BACKLOG.md`** — lucruri deschise (GDPR, FAQ, rezultate, Turnstile, creștere…).

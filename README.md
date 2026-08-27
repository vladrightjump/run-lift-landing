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
│   ├── hooks/            # useCountdown, usePagePhase, useScrollReveal, useToast, useOnlineStatus, useNow, useStats
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
  (email, ediție). RLS: cheia publică poate doar **INSERT** (cu `acord = true`); citirea datelor
  personale — doar din backoffice.
- **RPC `public_stats`** — GET public, doar date ne-personale (`count`, prenume mascat, `waitlist`).
  Alimentează bara „Locuri rămase".
- **Emailuri (Resend)** — funcția edge `send-email`. Conținutul (confirmare, reminder, anunț,
  badge) NU e hardcodat: vine din `email_templates` și e **editabil din `/admin`**.
- **Config client** — `src/lib/backend.ts` (`SUPABASE`). Cheia e publică prin design; protecția
  vine din RLS.

## Ediție nouă (pe scurt)

Din **`/admin` → tabul „Eveniment"**. Fără editări în cod, fără deploy.

1. „+ Ciornă pentru ediția N+1" → completezi datele, locul, locurile, secțiunile.
2. „Previzualizează" (`/?config=draft`) → vezi pagina reală, randată din ciornă.
3. „Publică" → site-ul public trece pe configul nou imediat.
4. Textul emailurilor (dacă vrei să-l schimbi) → `/admin` → „Șabloane de email".

Singurul lucru care mai cere deploy e **share preview-ul** (meta se injectează la build, pentru că
scraper-ele nu rulează JS). Tabul „Eveniment" îți spune când a rămas în urmă.

Runbook complet: **`GHID-EDITIE-NOUA.md`**. Decizii de arhitectură: **`TASK-FOR-CLAUDE.md`**.

## Ziua evenimentului

Homepage-ul trece singur prin trei faze, pe ceas, fără redeploy: landing normal → landing fără
înscriere cu „cine vine" sub hero (de la `start` − `leaderboardLeadHours`) → countdown spre
`nextEditionAt` (de la finalul cursei). Logica: `src/hooks/usePagePhase.ts`. Le vezi înainte de
ora lor cu `?preview=leaderboard` și `?preview=next`. Detalii + pașii de după cursă:
**`GHID-EDITIE-NOUA.md`**.

## Deploy (Vercel)

Git-connected: push pe `main` (GitHub `vladrightjump/run-lift-landing`) → Vercel rulează
`npm run build` și publică. Domeniu: **parktraining.fit**. CSP-ul (`vercel.json`) trebuie să
permită originul Supabase curent — există test care păzește asta.

## Teste

```bash
npm run test          # unitare (vitest) — logică + contract cereri + config/CSP + meta
npm run test:e2e      # e2e (Playwright) — fluxuri, butoane, stări (mock Supabase)
npm run test:integration   # OPT-IN, backend real (necesită RUNLIFT_LIVE=1 + credențiale)
npm run verify        # typecheck + typecheck:tests + test + build + e2e
```

## Backoffice (/admin)

Dashboard de organizator: statistici live, listă înscrieri, căutare, adăugare manuală, ștergere
cu undo, export CSV, trimitere emailuri în masă, editare șabloane. Auth: cont unic în
`admin_users` (bcrypt) + token de sesiune în `admin_sessions`; operațiile trec prin RPC-uri
`SECURITY DEFINER`. Cod: `src/admin/` + `src/lib/adminApi.ts`.

Tabul **„Coming Soon"** e singurul cu efect **imediat** pe site: comută ecranul de dinainte de
lansare și mută țintele numărătorilor fără să treacă prin ciornă → publică. Scurtătura e de pași,
nu de verificări — serverul revalidează documentul peticit prin aceeași poartă ca publicarea și
scrie un rând nou, deci orice apăsare se poate întoarce din „Versiuni anterioare".

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

## Documente

- **`TASK-FOR-CLAUDE.md`** — context/handoff (arhitectură + decizii + capcane + Live URLs).
- **`GHID-EDITIE-NOUA.md`** — runbook pas cu pas pentru o ediție nouă.
- **`MIGRATIONS.md`** — migrările DB + granița față de gym-app/bot.
- **`ERROR-HANDLING.md`** — tratarea erorilor, monitoring și garda CSP↔config la build.
- **`CI-CD.md`** — pipeline-ul de testare + deploy Vercel verificat pe live.
- **`BACKLOG.md`** — lucruri deschise (GDPR, FAQ, rezultate, Turnstile, creștere…).

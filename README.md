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
│   └── sync-edition.ts   # emite SQL pt. app_config din EDITION (npm run sync-edition)
├── src/
│   ├── content/          # ⭐ SSOT
│   │   ├── edition.ts    #   datele ediției (dată, locație, branding, sloturi) — AICI editezi
│   │   ├── format.ts     #   derivate: ordinal, dată RO, EVENT_META, HERO_KICKER…
│   │   └── meta.ts       #   title/description/OG derivate din EDITION
│   ├── components/       # Edition3Landing, ComingSoon, Confirmare, DespreNoi, Toast
│   ├── admin/            # backoffice /admin (login, dashboard, email, șabloane)
│   ├── hooks/            # useCountdown, useScrollReveal, useToast, useOnlineStatus, useNow, useStats
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

1. Editezi **`src/content/edition.ts`** (număr, date, locație, branding, sloturi).
2. `npm run sync-edition` → SQL pt. `app_config`; îl revezi și-l rulezi în Supabase.
3. Textul emailurilor (dacă vrei să-l schimbi) → din `/admin` → „Șabloane de email".
4. `npm run verify` → `git push` (Vercel publică automat).

Runbook complet: **`GHID-EDITIE-NOUA.md`**. Decizii de arhitectură: **`TASK-FOR-CLAUDE.md`**.

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

## Documente

- **`TASK-FOR-CLAUDE.md`** — context/handoff (arhitectură + decizii + capcane + Live URLs).
- **`GHID-EDITIE-NOUA.md`** — runbook pas cu pas pentru o ediție nouă.
- **`MIGRATIONS.md`** — migrările DB + granița față de gym-app/bot.
- **`ERROR-HANDLING.md`** — tratarea erorilor, monitoring și garda CSP↔config la build.
- **`CI-CD.md`** — pipeline-ul de testare + deploy Vercel verificat pe live.
- **`BACKLOG.md`** — lucruri deschise (GDPR, FAQ, rezultate, Turnstile, creștere…).

# Run + Lift — Session Progress

Snapshot of the current state of the project. Not user-facing documentation — this is a "where were we" note.

Last update: 2026-07-07 (Supabase migration + participants section + domain)

## Current state — LIVE ARCHITECTURE

- **Backend: Supabase** (project `run-lift`, ref `iattqvakxcgepjiecgpf`, eu-central-1, free tier)
  - Table `public.registrations` (nume/telefon/email/echipa/acord), unique lower(email),
    RLS: anon poate DOAR insert (cu acord=true). Citire date personale: doar din dashboard.
  - RPC `public_stats()` (security definer, execute pt anon) → `{count, participants:[{nume mascat "Vlad F.", echipa}]}`
  - Endpoint: `GET https://iattqvakxcgepjiecgpf.supabase.co/rest/v1/rpc/public_stats`
- **Google Form: ABANDONAT.** Form "Run + Lift — Înscriere" există încă în contul Google
  (formId `1FAIpQLSeVFEih-...`, edit `1KaNe21PSfwfFNE2KeZ0owEC4t8SPvMHGG9GQlSJ4yJI`) + un
  proiect Apps Script "Untitled project" — ambele nefolosite, pot fi șterse.
- **Fără email de confirmare** (decizie explicită) — tot copy-ul a fost rescris fără promisiunea de email.
- **Capacitate: 30 locuri** (`TOTAL_SLOTS` în config.ts; copy interpolat, sloturi pe 2 rânduri de 15).
- **Live stats**: `useStats` în App (un singur poller): refresh 15s + după submit + la visibilitychange.
- **Secțiunea "04 · Cine vine"** (`ParticipantsSection.tsx`) — design din
  `~/Downloads/Run Lift - Pagina finala v3.html`: listă numerotată, badge "Nou" pentru
  înscrierile de pe dispozitivul curent (localStorage `runlift_registrari`, nume mascat),
  empty state cu CTA. Adăugare față de design: echipa afișată muted după nume.
- **Domeniu: parktraining.fit** (cumpărat prin Vercel azi, nameservere Vercel) — atașat
  proiectului împreună cu www. Meta og:url/canonical actualizate.

## Fișiere cheie

- `src/lib/config.ts` — EVENT_DATE, TOTAL_SLOTS=30, OCCUPIED_SLOTS (doar fallback), SUPABASE {url, publishableKey}
- `src/lib/supabase.ts` — submitRegistration (409→duplicate), fetchStats, timeout 15s
- `src/lib/mySignups.ts` — maskName (oglinda SQL) + localStorage pt badge "Nou"
- `src/hooks/useStats.ts` — poller partajat
- `src/components/ParticipantsSection.tsx` — secțiunea 04
- Șterse: `src/lib/googleForm.ts`, `apps-script/`

## Verificat (Playwright, /private/tmp/...scratchpad/test_*.mjs)

- Insert real → 201, duplicat → 409 + ecran "Ești deja înscris(ă)", RLS nu scurge date,
  masked names în stats, slots live 30, secțiunea participanți (12 checks), badge doar pe
  dispozitivul care s-a înscris.

## Live URLs

- **Domeniu**: https://parktraining.fit (+ www)
- **Vercel**: https://run-lift-landing.vercel.app · dashboard: https://vercel.com/muvs-projects-4dea1994/run-lift-landing
- **GitHub**: https://github.com/vladrightjump/run-lift-landing
- **Supabase dashboard**: https://supabase.com/dashboard/project/iattqvakxcgepjiecgpf

## Known issues / TODO

- GitHub→Vercel auto-deploy tot nelegat (deploy manual: `vercel deploy --yes --prod`)
- Vercel Analytics returna 404 — de activat din dashboard dacă se vrea
- Free tier Supabase: proiectul face pauză după ~1 săpt. fără trafic (irelevant până pe 11 iulie)
- Formularul Google + proiectul Apps Script "Untitled project" pot fi șterse din contul Google

## Backoffice /admin (8 iul 2026)

- Login (user unic `vlad`, hash bcrypt în `admin_users`) + dashboard după designurile
  "Run Lift - Login/Admin backoffice.html" (Claude design, decodate din format bundler).
- Tabele noi: `admin_users`, `admin_sessions` (RLS fără politici) + 6 RPC-uri
  SECURITY DEFINER cu token de sesiune (migrarea `admin_backoffice`); seed-ul userului
  s-a făcut prin execute_sql ca parola să nu apară în istoricul migrărilor.
- Frontend: `src/admin/*`, `src/lib/adminApi.ts`, switch pe pathname în `main.tsx`,
  rewrite `/admin` în `vercel.json`, stiluri `admin-*` în `index.css`.
- Dashboard: stats + bară 30 sloturi, căutare, adăugare inline, ștergere cu undo
  (re-insert), export CSV, polling 15s, logout; token invalid → înapoi la login.

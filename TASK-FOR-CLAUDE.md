# TASK for Claude — context & handoff (run-lift-landing)

Notă de context pentru sesiuni viitoare cu Claude. Rezumă starea curentă, arhitectura
și lucrurile care s-au tot dovedit surse de bug. Pentru pașii de lansare a unei ediții
noi, sursa de adevăr rămâne `GHID-EDITIE-NOUA.md`.

Ultima actualizare: 4 august 2026.

---

## Starea curentă (Ediția 4)

- **Eveniment:** Run + Lift — Hyrox Trial, **sâmbătă 8 august 2026, start 06:30**, Parcul
  Râșcani, Chișinău. Check-in de la 06:00.
- **Fază:** B (înscrieri deschise). `SHOW_COMING_SOON = false` → „/" arată landing-ul.
- **Ediție:** `EDITION.number = 4` și `EDITION.launchNumber = 4` (`src/content/edition.ts`),
  sincronizate cu `app_config` din Supabase (`current_event_edition = 4`,
  `current_launch_edition = 4`). `src/lib/config.ts` doar DERIVĂ din `EDITION`.

---

## Arhitectură de conținut (SSOT) — de la 4 aug 2026

TOT ce se schimbă de la o ediție la alta trăiește într-un singur loc. **Nu mai căuta
string-uri prin componente.**

- **`src/content/edition.ts`** — ⭐ SSOT: datele ediției (număr, date, locație, branding,
  sloturi, URL-uri, `ogImageVersion`). **Aici editezi la ediție nouă.**
- **`src/content/format.ts`** — derivate: `ordinal(n)`, formator RO de dată, `EVENT_META`,
  `HERO_KICKER`, `EVENT_WHEN/WHERE/START_TIME`, `SUCCESS_SEE_YOU`, `EVENT_BADGE`, MAP URLs.
- **`src/content/meta.ts`** — title/description/OG, injectate în `index.html` la build prin
  plugin Vite `transformIndexHtml` (vezi `vite.config.ts`). OG rămâne static pt. scrapere.
- **`src/lib/backend.ts`** — configul Supabase (url/key/schema). E MEDIU, nu ediție.
- **`src/lib/config.ts`** — doar re-exportă derivatele (compat). NU edita valori aici.
- **`scripts/sync-edition.ts`** (`npm run sync-edition`) — emite SQL pt. `app_config` din
  `EDITION` (nu-l aplică; îl revezi și-l rulezi tu).
- Componentele ediției 2 (Hero/TopBar/RegistrationSection/Footer/Format/Venue/Participants) au
  fost **șterse** (nu mai erau randate).

Testele importă `EDITION`/derivatele (nu re-scriu literali), deci nu mai pot drifta.

---

## Backend Supabase (IMPORTANT — s-a schimbat)

- **Proiect:** `whyndrjcezmtajbykeil` (nume: **ironworks-gym**), regiune eu-central-1.
  (Proiectul vechi `iattqvakxcgepjiecgpf` / „run-lift" nu se mai folosește.)
- **Schemă:** toate tabelele/funcțiile Run + Lift stau în schema **`runlift`**, nu `public`.
  PostgREST rutează spre ea prin headerele `Accept-Profile: runlift` (GET) și
  `Content-Profile: runlift` (scriere). Vezi `SUPABASE.schema` în `src/lib/config.ts`.
- **Schema trebuie expusă** în Supabase → Project Settings → API → *Exposed schemas*
  (`public, graphql_public, runlift`). Dacă lipsește `runlift`, TOATE cererile pică
  (stats + înscrieri) — a fost cauza pică-lă din 4 august. Există test care păzește
  headerele, dar expunerea schemei e o setare de dashboard, nu de cod.
- **Cheie client:** doar `sb_publishable_...` (publishable). Niciodată service_role în bundle.

### Regula de aur (desincronizare = bug)
Ediția se ține în sincron în DOUĂ locuri: `src/lib/config.ts` ȘI `app_config` (Supabase).
Dacă diferă, stats/înscrieri/admin arată ediții diferite.

---

## Emailuri — NU mai sunt hardcodate (de la 4 aug 2026)

Funcția edge `supabase/functions/send-email/index.ts` citește TOT conținutul din DB
(tabelul `runlift.email_templates`), prin RPC-ul `template_lookup(p_cheie)`:

| Mod / email | Cheie șablon în DB |
|---|---|
| `confirm` (automat la fiecare înscriere) | `bulk_participant_confirmare` |
| `broadcast` reminder (participanți) | `bulk_participant_reminder` |
| `broadcast` anunț (listă de așteptare) | `bulk_waitlist_anunt` |
| badge-ul lime din capul fiecărui email | `event_badge` |
| double opt-in „Anunță-mă" | `confirmare` (folosește `{{...}}`) |

- Șabloanele bulk + `event_badge` folosesc variabile cu **o singură acoladă**
  (`{prenume}`, `{nume}`, `{email}`, `{telefon}`). Șablonul `confirmare` folosește `{{...}}`.
- Toate sunt **editabile din `/admin` → „Șabloane de email"**. La ediție nouă NU se mai
  atinge codul funcției — schimbi textele + badge-ul din admin (sau din DB).
- Constantele `*_FALLBACK` din funcție sunt generice, fără dată — se folosesc doar dacă
  DB-ul nu răspunde, ca să nu pice trimiterea.
- **Redeploy funcție** (doar dacă schimbi codul, nu textele): MCP Supabase
  `deploy_edge_function` cu `verify_jwt: false`, sau `supabase functions deploy send-email`.
  `verify_jwt` TREBUIE să rămână `false` (funcția are auth propriu: token admin / secret broadcast).

Seed-ul șabloanelor: `supabase-migration-bulk-templates.sql` (schema `runlift`).

---

## Deploy

- Git-connected pe Vercel (GitHub `vladrightjump/run-lift-landing`, branch `main`).
  Push pe `main` → Vercel rulează `tsc -b && vite build` și publică în producție.
- **CSP:** `vercel.json` are `connect-src` care TREBUIE să conțină URL-ul Supabase curent
  (`https://whyndrjcezmtajbykeil.supabase.co`). Dacă rămâne pe proiectul vechi, browserul
  blochează toate cererile în producție (înscrierile „nu se trimit"). Există test care
  păzește asta (`tests/unit/deploy-config.test.ts`).
- Domeniu producție: `parktraining.fit`. Preview: `?preview=landing` / `?preview=soon`.

---

## Teste

- `npm run test` — unitare (vitest, jsdom). Mock la `fetch`; NU ating DB-ul real.
- `npm run test:e2e` — Playwright pe dev server; mock la endpointurile Supabase (fără DB real).
- `npm run test:integration` — **opt-in**, lovește backendul real. Rulează doar cu
  `RUNLIFT_LIVE=1` + credențiale în env; folosește o **ediție de test** (nu atinge ediția 4)
  și curăță după el. Vezi antetul din `tests/integration/backend.live.test.ts`.
- `npm run verify` — typecheck + teste + build + e2e (tot lanțul).

Zone acoperite: fluxurile de butoane (înscriere, listă de așteptare, „Anunță-mă"),
validările, stările succes/eroare/duplicat/timeout/offline, statistici publice,
confirmarea din email, contractul cererilor către Supabase (URL + headere `runlift` +
`editie`), consistența CSP ↔ URL Supabase, și (opt-in) inserarea/citirea/ștergerea reală în DB.

---

## Capcane recurente (verifică-le întâi)

1. `runlift` neexpusă în API → toate cererile pică. (Dashboard → API → Exposed schemas.)
2. CSP `connect-src` rămas pe proiectul Supabase vechi → înscrieri blocate în producție.
3. `config.ts` desincronizat de `app_config` → ediții diferite în UI vs. backend.
4. Modificări necommise în working tree → un deploy din git le poate „reverta".
5. Emailuri: textul e în DB, nu în cod — pentru ediție nouă editează din `/admin`.

---

## Decizii de arhitectură (de ce, nu doar ce)

Ratațional pe scurt pentru refactor-ul SSOT (4 aug 2026), ca să nu se re-deschidă degeaba:

- **SSOT = doar datele de ediție.** `EDITION` (`content/edition.ts`) ține evenimentul. Config-ul
  de backend (`supabase.url/key/schema`) e configurare de MEDIU, nu de ediție → `lib/backend.ts`.
- **Fără `copy.ts` de i18n.** App-ul e mono-lingv; nu hoistăm tot textul UI. Derivăm din
  `EDITION` DOAR string-urile dependente de ediție/dată (`content/format.ts`); proza statică
  rămâne în componente.
- **Emailuri DB-only, fără generator cod→DB.** Le-am de-hardcodat ca să fie editabile din
  `/admin`; un generator din cod ar crea „două stăpâne" și ar suprascrie editările. `sync-edition`
  atinge DOAR `app_config` (numerele de ediție).
- **Meta injectată la build** (plugin Vite `transformIndexHtml`), nu din React — scraper-ele de
  share citesc HTML static.
- **Fără reorganizare de migrări.** Repo-ul nu deține ciclul DB-ului partajat; doar documentăm
  (`MIGRATIONS.md`), cu granița `public` (gym-app/bot) marcată clar.

## Documente

- **`README.md`** — overview + rulare/deploy/teste.
- **`GHID-EDITIE-NOUA.md`** — runbook „ediție nouă" (edit `edition.ts` → sync → verify → push).
- **`MIGRATIONS.md`** — migrările DB + granița față de gym-app/bot.
- **`BACKLOG.md`** — lucruri deschise (GDPR, FAQ, rezultate, Turnstile, creștere…).
- **`TASK-FOR-CLAUDE.md`** (acesta) — context + arhitectură + capcane.

## Live URLs

- Domeniu: https://parktraining.fit
- Vercel: https://vercel.com/muvs-projects-4dea1994/run-lift-landing
- GitHub: https://github.com/vladrightjump/run-lift-landing
- Supabase: https://supabase.com/dashboard/project/whyndrjcezmtajbykeil

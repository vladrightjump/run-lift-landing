# Anti-bot — Turnstile + lockdown RLS

Cum sunt protejate formularele publice și, mai ales, **de ce arată așa**.

## Problema

Până acum browserul făcea `INSERT` direct în PostgREST, cu cheia publishable:

```
POST /rest/v1/registrations        apikey: sb_publishable_…
POST /rest/v1/event_waitlist       apikey: sb_publishable_…
POST /rest/v1/launch_notifications apikey: sb_publishable_…
```

Cheia aia e vizibilă în bundle-ul JS, iar RLS îi permitea INSERT. Un bot nu deschide
site-ul — dă `curl` pe endpoint. **Un captcha pus doar în React n-ar fi oprit nimic**,
fiindcă botul nu trece niciodată prin pagină.

De aceea protecția nu e „adaugă un widget", ci trei schimbări care depind una de alta.

## Soluția

```
browser ──[mode, token, hp, elapsed, data]──▶ Edge: submit-form
                                                │
                                                ├─ honeypot completat?  → 400 bot
                                                ├─ elapsed < 3s?        → 400 too_fast
                                                ├─ Cloudflare siteverify → 403 captcha_failed
                                                ├─ validare (ex-WITH CHECK din RLS)
                                                └─ INSERT cu service_role → PostgREST
                                                     └─ send-email (best-effort)
```

1. **`supabase/functions/submit-form/index.ts`** — singura poartă de scriere. Verifică
   token-ul Turnstile la Cloudflare, apoi scrie cu cheia de service.
2. **`supabase-migration-turnstile-lockdown.sql`** — scoate politicile și grant-urile de
   INSERT pentru rolul `anon`. Fără pasul ăsta, restul e decorativ.
3. **`src/lib/turnstile.ts` + `src/lib/antiBot.ts`** — generarea token-ului și colectarea
   dovezilor, în client.

### Straturile, în ordinea costului

| Strat | Cost | Ce oprește | Falsificabil? |
|---|---|---|---|
| Honeypot (câmp ascuns `website`) | 0 | scripturi care completează orice câmp | da, dar puțini se obosesc |
| Timp minim pe formular (3s) | 0 | submit instantaneu | **da** — vine din client |
| Turnstile | ~1 apel/submit | tot ce nu e om cu browser real | nu |

Primele două sunt gratis și opresc gunoiul de bază. **Doar Turnstile nu poate fi ocolit
de un `curl`.** Toate trei sunt verificate pe server; clientul doar le colectează.

## Decizii care par ciudate (și de ce sunt așa)

**Token cerut la submit, nu la montarea formularului.** Token-urile Turnstile sunt de
unică folosință și expiră în ~5 minute. Unul luat la montare ar fi mort pentru cineva care
completează pe îndelete.

**`appearance: 'interaction-only'`.** Widgetul e invizibil dacă Cloudflare nu cere
interacțiune — adică aproape întotdeauna. Nu e „captcha cu poze".

**Containerul widgetului nu e `display: none`.** Turnstile refuză să randeze într-un
element ascuns; îl scoatem din flux (`position: fixed`, 0×0, `aria-hidden`).

**Fail-open DOAR când Cloudflare nu răspunde.**

- token lipsă/invalid → **respingem**. Altfel un bot doar omite token-ul.
- `siteverify` inaccesibil (timeout 5s) → **acceptăm**, cu log. E o pană între noi și
  Cloudflare, pe care un atacator nu o poate provoca. Pentru un eveniment de 40 de locuri,
  o înscriere pierdută doare mai mult decât câțiva boți într-o fereastră de câteva minute.

**`editie` nu se mai trimite din client.** `service_role` ocolește RLS, deci vechea
politică („`editie` trebuie să fie ediția curentă") nu se mai aplică. Coloanele au
`DEFAULT current_event_edition()` / `current_launch_edition()`, deci pur și simplu nu
trimitem câmpul: ediția o decide serverul, din `app_config`.

**Validarea s-a mutat, nu a dispărut.** Regulile care stăteau în `WITH CHECK`-urile
politicilor `anon` (`acord = true`, lungimi, format email, `sursa` din listă) sunt acum în
`validate*` din funcția Edge. **Dacă adaugi un mod nou, adaugă-i și validarea** — altfel
lockdown-ul ar slăbi validarea în loc s-o întărească.

**Statusurile de eroare trec neschimbate.** Funcția propagă statusul + textul de la
PostgREST ca atare, deci `isDuplicateError` (409) și `isEventFullError` / `isWaitlistFullError`
/ `isRegistrationClosedError` (textul trigger-ului) funcționează exact ca înainte. Fluxul
din UI — inclusiv comutarea automată pe lista de așteptare la `event_full` — n-a trebuit
rescris.

## Ce NU s-a schimbat

- **Backoffice-ul `/admin`** — merge prin RPC-uri `SECURITY DEFINER` cu `p_token`
  (`admin_add_registration` &co.), nu prin insert direct. Neatins de lockdown.
- **Trigger-ele guard** — `registrations_guard_trg` (`event_full`, `registration_closed`)
  și `event_waitlist_cap_trg` (`waitlist_full`) sunt trigger-e, nu politici RLS, deci se
  aplică și scrierilor cu cheia de service.
- **`public_stats`, `confirm_signup`, `unsubscribe`** — rămân apelabile din `anon`.

## Configurare

| Unde | Variabilă | Valoare |
|---|---|---|
| Vercel → Environment Variables (**doar Production**) | `VITE_TURNSTILE_SITE_KEY` | cheia publică (site key) |
| Supabase → Edge Function secrets | `TURNSTILE_SECRET_KEY` | cheia secretă |
| Supabase → Edge Function secrets | `RUNLIFT_SERVICE_KEY` | cheia de service (`sb_secret_…`) |

Primele două se iau din Cloudflare Dashboard → Turnstile → Add site (gratuit, nelimitat).

Chei de test Cloudflare, pentru dev local și CI. Funcționează pe orice domeniu, inclusiv
`localhost`, și produc token-uri dummy (`XXXX.DUMMY.TOKEN.XXXX`). Cheile de producție resping
token-urile dummy, și invers — deci setul se folosește întreg, nu amestecat:

| Site key | Secret key | Efect |
|---|---|---|
| `1x00000000000000000000BB` | `1x0000000000000000000000000000000AA` | trece mereu, widget **invizibil** (ăsta ne trebuie: rulăm `appearance: interaction-only`) |
| `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` | trece mereu, widget vizibil |
| `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` | blochează mereu |
| `3x00000000000000000000FF` | — | forțează challenge interactiv |

**Lipsa cheilor dezactivează protecția**, deliberat, ca dev-ul local să meargă fără cont
Cloudflare. Ca să nu se întâmple asta tăcut în producție:

- `scripts/check-deploy-config.ts` **oprește build-ul** dacă `VITE_TURNSTILE_SITE_KEY`
  lipsește la un build Vercel de producție (local doar avertizează);
- `checkTurnstileCsp` (`src/lib/deployConfig.ts`) verifică cele trei directive CSP de care
  are nevoie Turnstile — `script-src`, `frame-src`, `connect-src`. Dacă lipsește una,
  captcha pică tăcut și nimeni nu se mai poate înscrie: exact tiparul regresiei din 4 august.

## Runbook de deploy

**Merge-ul ESTE deploy-ul frontendului.** `.github/workflows/ci-deploy.yml` rulează la
fiecare push în `main` și, dacă `verify` trece, apasă `VERCEL_DEPLOY_HOOK_URL`, apoi
`scripts/check-live-deploy.mjs` confirmă pe live noul SHA. Auto-deploy-ul git al Vercel e
dezactivat (`vercel.json`: `git.deploymentEnabled.main: false`), iar workflow-ul își spune
singur „acest pipeline e singura cale spre producție". Deci **nu** `vercel --prod`: ar pune
pe producție un build al cărui commit nu e `main`, sărind peste `check-live-deploy`.

Două constrângeri de ordine, nu una: cheia publică trebuie să fie în Vercel **înainte de
merge** (altfel garda din `check-deploy-config.ts` face `exit 1` la build-ul de producție și
frontendul nu ajunge sus), iar migrarea e **ULTIMA**.

```bash
# 1. Secretele, în Supabase. AMBELE — `submit-form` refuză să scrie fără cheia de
#    service, tocmai ca să nu cadă tăcut pe cheia anon și să moară la lockdown.
supabase secrets set TURNSTILE_SECRET_KEY=0x4AAA... RUNLIFT_SERVICE_KEY=sb_secret_... \
  --project-ref whyndrjcezmtajbykeil
supabase secrets list --project-ref whyndrjcezmtajbykeil   # ambele trebuie să apară

# 2. Funcția Edge. `--no-verify-jwt` fiindcă e apelată din browser doar cu `apikey`,
#    fără sesiune de utilizator (la fel ca `send-email`).
supabase functions deploy submit-form --no-verify-jwt --project-ref whyndrjcezmtajbykeil

# 3. Cheia publică, în Vercel — DOAR Production (vezi nota despre preview mai jos).
vercel env add VITE_TURNSTILE_SITE_KEY production

# 4. Merge PR #1 → CI rulează verify și publică. Aștepți `check-live-deploy.mjs`.

# 5. DUPĂ ce producția merge pe calea nouă: lockdown-ul, prin MCP `apply_migration`,
#    nume `runlift_turnstile_lockdown` (conținutul migrării). Apoi `get_advisors`.
```

Între pașii 4 și 5 ambele căi funcționează. E intenționat — dar motivul e „noul frontend
trebuie confirmat live înainte ca `submit-form` să rămână singura cale de scriere", nu
protecția tab-urilor vechi: un tab deschis de o oră tot va pica după pasul 5, cu mesajul
generic („Înscrierea nu a putut fi trimisă"), fiindcă un 401 de la PostgREST nu e
`TypeError` și nu declanșează îndemnul de reîncărcare. De aceea pasul 5 se face într-o
fereastră în care o înscriere pierdută e acceptabilă.

**Preview-urile nu pot trimite formulare.** `redirectCanonic` mută vizitatorul pe domeniu
DOAR de pe producție (`src/lib/canonicalHost.ts`), deci un preview rămâne pe `*.vercel.app`
și primește refuz de CORS de la `submit-form`. Formularele se testează local
(`http://localhost:5173`, care e în `ORIGINI`) sau pe producție.

### După pasul 2: dovada că Turnstile chiar verifică

`verifyTurnstile` începe cu `if (!TURNSTILE_SECRET) return { ok: true }` — un secret care nu
a ajuns la funcție face captcha să accepte orice, tăcut, iar `curl`-ul de lockdown de mai jos
trece identic în ambele cazuri. Cu token gol și `elapsed` peste prag, **trebuie să dea 403**:

```bash
curl -s -w '\n%{http_code}\n' \
  -X POST 'https://whyndrjcezmtajbykeil.supabase.co/functions/v1/submit-form' \
  -H 'apikey: sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"launch","token":"","hp":"","elapsed":30000,
       "data":{"nume":"Test","prenume":"Test","email":"probe@test.md","telefon":"069000000"}}'
```

Un 200 înseamnă că secretul lipsește și captcha e oprit.

### Verificarea care contează

După pasul 5 — trebuie să dea **401** sau **403**:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST 'https://whyndrjcezmtajbykeil.supabase.co/rest/v1/registrations' \
  -H 'apikey: sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh' \
  -H 'Content-Type: application/json' -H 'Content-Profile: runlift' \
  -d '{"nume":"Bot Test","telefon":"069000000","email":"bot@test.md","acord":true}'
```

Dacă dă 201, lockdown-ul nu s-a aplicat și captcha e decorativ. (Și dacă dă 201, șterge
rândul `bot@test.md` — altfel ocupă un loc din cele 40.)

Apoi o înscriere reală de pe site, cap-coadă, plus verificarea că emailul de confirmare a
plecat (`/admin` → „Livrare").

### Rollback — doi pași, în ordine

SQL-ul singur **nu repară nimic**: bundle-ul livrat scrie doar prin `submit-form`, deci
re-acordarea insert-ului către `anon` redeschide gaura fără să repună vreun formular în
funcțiune.

1. Promovează în Vercel deployment-ul de producție dinaintea merge-ului. Auto-deploy-ul git
   e dezactivat, deci e o promovare manuală din dashboard, nu un push.
2. Abia apoi blocul comentat de la finalul `supabase-migration-turnstile-lockdown.sql`, care
   repune politicile în forma lor de AZI — inclusiv `editie = current_event_edition()`.
   (Versiunea veche a blocului o pierdea, adică „revenirea" ar fi fost o regresie.)

## Teste

| Fișier | Ce acoperă |
|---|---|
| `tests/unit/turnstile.test.ts` | token proaspăt per submit, refolosirea widgetului, erori de challenge |
| `tests/unit/antiBot.test.ts` | colectarea dovezilor, honeypot, repornirea cronometrului |
| `tests/unit/supabase.test.ts` | plicul spre `submit-form`, absența ediției, propagarea erorilor |
| `tests/unit/deploy-config.test.ts` | cele trei directive CSP pentru Turnstile |
| `tests/unit/antiBotSurfaces.test.tsx` | **fiecare formular public are capcana** — garda împotriva unui formular nou fără honeypot |
| `tests/*.spec.ts` (e2e) | fluxurile reale prin `submit-form` |
| `tests/integration/backend.live.test.ts` | **lockdown-ul pe backendul real** + honeypot/too_fast |

`antiBotSurfaces.test.tsx` există fiindcă exact asta s-a rupt o dată deja:
`RegistrationForm.tsx` a apărut pe `main` după ce PR-ul fusese scris, merge-ul l-a lăsat în
pace, testele erau verzi, iar `/inscriere` și overlay-ul trimiteau fără capcană. Dacă adaugi
un formular public nou, adaugă-l și acolo.

Testul de integrare `lockdown: cheia publishable NU mai poate insera direct` e cel care
prinde o regresie reală. Rulează-l după orice migrare care atinge RLS:

```bash
RUNLIFT_LIVE=1 SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
  npm run test:integration
```

Două teste din suita live au **porți de mediu**, fiindcă altfel suita nu poate fi verde nici
înainte, nici după deploy — cele care lovesc `submit-form` dau 404 până la pasul 2, iar cel
de lockdown TREBUIE să pice până la pasul 5, altfel nu măsoară nimic:

```bash
RUNLIFT_SUBMIT_FORM_DEPLOYED=1   # după pasul 2
RUNLIFT_LOCKDOWN_APPLIED=1       # după pasul 5
```

## Rămas deschis

- **`send-email` mod `info`/`confirm`** e încă apelabil cu cheia publishable. Impactul e
  mărginit (trimite doar către adrese deja din DB, cu cooldown de 10 minute per adresă),
  dar merită mutat în spatele unui token de admin.
- **Rate limit per IP** în `submit-form` — de făcut doar dacă apare abuz țintit; Turnstile
  acoperă cazul normal.

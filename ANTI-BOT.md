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
| Vercel → Environment Variables | `VITE_TURNSTILE_SITE_KEY` | cheia publică (site key) |
| Supabase → Edge Function secrets | `TURNSTILE_SECRET_KEY` | cheia secretă |

Ambele se iau din Cloudflare Dashboard → Turnstile → Add site (gratuit, nelimitat).

Chei de test Cloudflare, utile în preview/CI:

| Site key | Secret key | Efect |
|---|---|---|
| `1x00000000000000000000AA` | `1x0000000000000000000000000000000AA` | trece mereu |
| `2x00000000000000000000AB` | `2x0000000000000000000000000000000AA` | blochează mereu |

**Lipsa cheilor dezactivează protecția**, deliberat, ca dev-ul local să meargă fără cont
Cloudflare. Ca să nu se întâmple asta tăcut în producție:

- `scripts/check-deploy-config.ts` **oprește build-ul** dacă `VITE_TURNSTILE_SITE_KEY`
  lipsește la un build Vercel de producție (local doar avertizează);
- `checkTurnstileCsp` (`src/lib/deployConfig.ts`) verifică cele trei directive CSP de care
  are nevoie Turnstile — `script-src`, `frame-src`, `connect-src`. Dacă lipsește una,
  captcha pică tăcut și nimeni nu se mai poate înscrie: exact tiparul regresiei din 4 august.

## Runbook de deploy

**Ordinea contează.** Migrarea se rulează ULTIMA — altfel formularele pică între pași.

```bash
# 1. Secretul, în Supabase
supabase secrets set TURNSTILE_SECRET_KEY=0x4AAA... --project-ref whyndrjcezmtajbykeil

# 2. Funcția Edge. `--no-verify-jwt` fiindcă e apelată din browser doar cu `apikey`,
#    fără sesiune de utilizator (la fel ca `send-email`).
supabase functions deploy submit-form --no-verify-jwt --project-ref whyndrjcezmtajbykeil

# 3. Cheia publică, în Vercel (Production + Preview), apoi frontendul
vercel env add VITE_TURNSTILE_SITE_KEY production
npm run verify && vercel --prod

# 4. DUPĂ ce producția merge pe calea nouă: lockdown-ul
#    (Supabase → SQL Editor, conținutul supabase-migration-turnstile-lockdown.sql)
```

Între pașii 3 și 4 ambele căi funcționează. E intenționat: cine are pagina veche deschisă
într-un tab nu pică.

### Verificarea care contează

După pasul 4 — trebuie să dea **401** sau **403**:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST 'https://whyndrjcezmtajbykeil.supabase.co/rest/v1/registrations' \
  -H 'apikey: sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh' \
  -H 'Content-Type: application/json' -H 'Content-Profile: runlift' \
  -d '{"nume":"Bot Test","telefon":"069000000","email":"bot@test.md","acord":true}'
```

Dacă dă 201, lockdown-ul nu s-a aplicat și captcha e decorativ.

Apoi o înscriere reală de pe site, cap-coadă, plus verificarea că emailul de confirmare a
plecat (`/admin` → „Livrare").

### Rollback

`supabase-migration-turnstile-lockdown.sql` are secțiunea de rollback comentată la final
(repune politicile și grant-urile exact cum erau).

## Teste

| Fișier | Ce acoperă |
|---|---|
| `tests/unit/turnstile.test.ts` | token proaspăt per submit, refolosirea widgetului, erori de challenge |
| `tests/unit/antiBot.test.ts` | colectarea dovezilor, honeypot, repornirea cronometrului |
| `tests/unit/supabase.test.ts` | plicul spre `submit-form`, absența ediției, propagarea erorilor |
| `tests/unit/deploy-config.test.ts` | cele trei directive CSP pentru Turnstile |
| `tests/*.spec.ts` (e2e) | fluxurile reale prin `submit-form` |
| `tests/integration/backend.live.test.ts` | **lockdown-ul pe backendul real** + honeypot/too_fast |

Testul de integrare `lockdown: cheia publishable NU mai poate insera direct` e cel care
prinde o regresie reală. Rulează-l după orice migrare care atinge RLS:

```bash
RUNLIFT_LIVE=1 SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
  npm run test:integration
```

## Rămas deschis

- **`send-email` mod `info`/`confirm`** e încă apelabil cu cheia publishable. Impactul e
  mărginit (trimite doar către adrese deja din DB, cu cooldown de 10 minute per adresă),
  dar merită mutat în spatele unui token de admin.
- **Rate limit per IP** în `submit-form` — de făcut doar dacă apare abuz țintit; Turnstile
  acoperă cazul normal.

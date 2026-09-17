---
title: Reanimarea PR #1 - Turnstile + lockdown RLS pe formularele publice - Plan
type: feat
date: 2026-08-28
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: pr-1-existent
execution: code
origin: https://github.com/vladrightjump/run-lift-landing/pull/1
branch: feat/turnstile-anti-bot
---

# Reanimarea PR #1 - Turnstile + lockdown RLS pe formularele publice - Plan

## Goal Capsule

**Objective:** PR #1 (`feat/turnstile-anti-bot`, deschis 21 august, `CONFLICTING`)
închide singura gaură reală de scriere publică: browserul inserează direct în
PostgREST cu cheia publishable, vizibilă în bundle. Între timp `main` a mers mai
departe cu 125 de fișiere și ~18.900 de linii — configul de ediție la runtime,
pagina `/inscriere`, overlay-ul de înscriere, banda Instagram, panoul Coming Soon.
PR-ul trebuie adus la zi, extins peste suprafețele care au apărut după el, și dus
până la capăt: lockdown aplicat în producție, cu dovada că `anon` nu mai poate
insera.

**Means:** Se păstrează PR #1 (numărul, corpul, discuția). `main` se **merge** în
branch, nu invers: cele 6 conflicte se rezolvă ca reuniune, nu ca alegere. Apoi
se acoperă ce merge-ul nu semnalează — `RegistrationForm.tsx` și
`tests/inscriere-directa.spec.ts` sunt fișiere pe care PR-ul nu le-a văzut
niciodată, deci se auto-merge-uiesc curat și se rup tăcut. Migrarea de lockdown se
re-verifică împotriva schemei de azi și se aplică ULTIMA, prin `apply_migration`,
conform runbook-ului din `MIGRATIONS.md`.

**Authority hierarchy:** Cerințele (R-IDs) bat pe comportament. KTD-urile bat pe
mecanism. Unitățile nu bat nimic. Ordinea deploy-ului din U7 bate orice grabă.

**Stop conditions:**
- Oprește-te dacă `npm run verify` pică din alt motiv decât cele numite aici.
- Oprește-te înainte de U7 pasul 4 (migrarea) dacă pasul 3 nu s-a confirmat:
  o înscriere reală, cap-coadă, pe producție, pe calea nouă. Migrarea rulată
  prea devreme lasă formularele moarte.
- Oprește-te dacă o migrare ar atinge schema `public` (gym-app / bot Telegram).
- Oprește-te dacă lipsește cheia Turnstile de producție: `checkTurnstileCsp` și
  garda de build sunt exact acolo ca să nu treci mai departe fără ea.
- Oprește-te dacă ediția 5 e în fereastra activă de înscriere și nu ai o fereastră
  de ~15 minute în care o înscriere pierdută e acceptabilă. U7 e o operație
  publică, cu efect imediat.

**Execution profile:** U1-U2 sunt reanimarea propriu-zisă și trebuie făcute în
ordine. U3-U4 (funcția Edge, migrarea) se pot face în paralel cu U2. U5 (cheile
Cloudflare) nu depinde de cod și se poate face oricând înainte de U6 — de fapt
merită făcut PRIMUL, fiindcă e singurul pas care depinde de un serviciu extern.
U6 e poarta de merge. U7 e deploy-ul, secvențial și ireversibil-ish.

---

## Starea de fapt (verificată, nu presupusă)

| Ce | Valoare |
|---|---|
| PR | #1, `feat/turnstile-anti-bot` → `main`, deschis, `mergeable: CONFLICTING` |
| Diff PR | 28 fișiere, +1791 / -334, un singur commit (`3e2fd47b`) |
| Merge-base | `86859c0` |
| `main` de atunci | 58 de commituri, 125 fișiere, +18.904 / -915 |
| Conflicte reale | 6 fișiere |

**Cele 6 conflicte:** `src/lib/supabase.ts`, `src/components/ComingSoon.tsx`,
`src/components/landing/RegistrationSection.tsx`, `tests/inscriere.spec.ts`,
`tests/unit/supabase.test.ts`, `vercel.json`.

**Cele care NU sunt conflicte și tocmai de asta sunt periculoase:**
`src/components/landing/RegistrationForm.tsx` și
`tests/inscriere-directa.spec.ts` nu existau la data PR-ului. Git le va lăsa în
pace. Prima e un al doilea formular de înscriere fără capcană anti-bot; a doua
mock-uiește de 8 ori `**/rest/v1/registrations`, un endpoint pe care aplicația nu-l
mai apelează după merge. Niciuna nu apare în lista de conflicte.

---

## Cerințe

### R1 — PR #1 devine mergeable fără să piardă nimic din `main`
Merge-ul rezolvă cele 6 conflicte ca **reuniune**. Nimic din ce a adus `main`
(configul la runtime, `fetchPublicConfig`, `BirthDateField`, secțiunea Instagram,
rewrite-ul `/inscriere`, `frame-src` pentru Instagram) nu dispare. Nimic din ce
aduce PR-ul (plicul spre `submit-form`, dovezile anti-bot, garda CSP) nu se
diluează.

### R2 — Toate suprafețele publice de scriere trec prin `submit-form`
După merge există **cinci** formulare publice, nu trei:

| Suprafață | Fișier | Hook | Ce scrie |
|---|---|---|---|
| Landing, secțiunea 03 | `src/components/landing/RegistrationSection.tsx` | `useRegistration` | `registrations` / `event_waitlist` |
| Overlay pe landing | `src/components/landing/RegistrationOverlay.tsx` → `RegistrationForm` | `useRegistration` | idem |
| Pagina `/inscriere` | `src/components/Inscriere.tsx` → `RegistrationForm` | `useRegistration` | idem |
| Coming Soon | `src/components/ComingSoon.tsx` | `useLaunchForm` | `launch_notifications` |
| Despre noi | `src/components/DespreNoi.tsx` | `useLaunchForm` | `launch_notifications` |

Fiecare `<form>` public are input-ul honeypot. Zero `fetch` direct spre
`/rest/v1/registrations`, `/rest/v1/event_waitlist`, `/rest/v1/launch_notifications`
din `src/`.

### R3 — Validarea de pe server acoperă regulile de azi, nu pe cele de acum o săptămână
`service_role` ocolește RLS, deci ce era în `WITH CHECK` trebuie să existe în
`validate*` din funcția Edge. `main` a mutat între timp validarea de vârstă în
`validate(data, startLocal)`, iar `server-assigned-edition` a strâns politicile
`anon` cu `editie = current_event_edition()`. Funcția Edge trebuie să fie
consistentă cu starea de AZI a bazei, nu cu cea din 21 august.

### R4 — Migrarea de lockdown e corectă pe schema de azi, inclusiv rollback-ul
Blocul de ROLLBACK din migrare recreează politicile `anon` în forma
**pre-`server-assigned-edition`** — fără `editie = current_event_edition()`. Un
rollback executat ca atare ar reintroduce tăcut bug-ul „un tab vechi scrie în
ediția greșită". Se corectează.

### R5 — Testele exercită calea anti-bot, nu o ocolesc
Cu cheile de test Cloudflare (`1x00000000000000000000BB` +
`1x0000000000000000000000000000000AA`) calea Turnstile e parcursă real în loc să
fie dezactivată prin lipsa cheii. Testul de integrare `lockdown` rulează pe
backendul real, înainte și după migrare, cu rezultate opuse.

### R6 — Deploy-ul se face în ordinea din runbook, cu dovadă
Secret → funcție → frontend+env → **migrare, ultima**. Dovada nu e „am rulat
migrarea", ci `curl`-ul care întoarce 401/403 pe `POST /rest/v1/registrations` cu
cheia publishable.

### R7 — Regresia nu se poate repeta tăcut
O gardă automată prinde formularul public următor care apare fără honeypot. Fără
ea, R2 e adevărat azi și fals peste două săptămâni — exact tiparul care a produs
`RegistrationForm.tsx`.

---

## Deciziile tehnice (KTD)

### KTD1 — Merge, nu rebase
`main` s-a mișcat masiv; PR-ul e un singur commit mare. Un rebase ar replaya acel
commit peste 58 de commituri și ar cere rezolvarea conflictelor în modul detașat,
fără plasă. Un `git merge main` în branch dă un singur commit de merge, cu
`ours`/`theirs` clare și cu posibilitatea de a itera până trece `verify`. PR #1 își
păstrează numărul și corpul.

**Ce respinge:** rebase (fragil aici), branch nou (pierde discuția PR-ului),
`git merge -X theirs` (ar arunca tăcut munca din `main`).

### KTD2 — Conflictele se rezolvă ca reuniune, nu ca alegere
Pentru fiecare din cele 6: `main` deține **forma** (config la runtime, componente
rescrise, CSP-ul cu Instagram), PR-ul deține **calea de scriere** (plicul
`submit-form`, `hpProps`, originul Cloudflare). Nu există niciun conflict în care
una din părți să fie pur și simplu greșită.

Concret, pe `src/lib/supabase.ts`: se păstrează `fetchPublicConfig` și
`parseEventConfig` din `main`; se ia `postForm`, `AntiBot`, `SubmitMode`,
`isBotRejectedError` din PR; se **șterge** `sendInfoEmail`, fiindcă emailul de bun
venit pleacă acum din funcția Edge — dar numai după ce s-a verificat prin `grep` că
nu mai are alt apelant.

### KTD3 — Honeypot-ul stă în `<form>`, nu în hook
`useRegistration` e instanțiat separat în `Landing.tsx` și în `Inscriere.tsx`, dar
în `Landing.tsx` un singur `reg` alimentează DOUĂ formulare randate
(`RegistrationSection` + `RegistrationOverlay`). `hpProps` fiind derivat din
starea hook-ului, ambele input-uri ascunse partajează aceeași valoare — corect,
fiindcă un om nu completează niciunul. Ce contează e că **fiecare `<form>` are
input-ul**, altfel un bot care completează formularul din overlay nu declanșează
capcana.

**Ce respinge:** mutarea honeypot-ului într-un wrapper de formular partajat.
`RegistrationSection` și `RegistrationForm` nu au un strămoș comun de markup, iar
crearea unuia acum e un refactor care nu are legătură cu anti-bot.

### KTD4 — Paritatea validării se ține la nivelul de dinainte, nu mai sus
`main` a făcut `validate()` să depindă de `config.start` pentru pragul de 14 ani.
Funcția Edge nu are configul, iar politica RLS de dinainte de lockdown **nu**
verifica vârsta — verifica doar `acord = true`. Deci serverul verifică formatul
ISO al datei și lasă pragul de vârstă în client, exact ca înainte: lockdown-ul nu
are voie să slăbească validarea, dar nici nu trebuie să inventeze reguli noi în
aceeași mișcare.

**Ce respinge:** un al doilea apel din `submit-form` spre `public_config` doar ca
să valideze vârsta. Ar adăuga o dependență de rețea pe calea critică a fiecărei
înscrieri, pentru o regulă pe care serverul nu o impunea nici înainte. Dacă se
dorește, e o unitate separată, după merge.

### KTD5 — Ediția rămâne treaba serverului, pe două straturi
După `server-assigned-edition`, `runlift.forteaza_editia_curenta()` e un
**trigger**, nu o politică — deci se aplică și scrierilor cu `service_role`, iar
`submit-form` nu setează `runlift.guard_bypass`. Rezultat: chiar dacă cineva ar
trimite `editie` prin plic, trigger-ul o suprascrie cu ediția curentă. Funcția Edge
pur și simplu nu trimite câmpul, iar coloana are `DEFAULT current_event_edition()`.
Două straturi independente, niciunul în client.

**De verificat în U3, nu de presupus:** că trigger-ul chiar se aplică inserărilor
`service_role` care nu setează `guard_bypass` — la fel ca `registrations_guard_trg`
și `event_waitlist_cap_trg`, verificate deja în PR.

### KTD6 — Cheile de test Cloudflare în loc de „Turnstile dezactivat"
`turnstile.ts` se auto-dezactivează când `VITE_TURNSTILE_SITE_KEY` lipsește. Comod,
dar înseamnă că fiecare test rulează pe o cale pe care producția nu o parcurge
niciodată. Cheile dummy documentate de Cloudflare (`1x00000000000000000000BB` —
invizibil, trece mereu; secret `1x0000000000000000000000000000000AA`) funcționează
pe orice domeniu, inclusiv `localhost`, și produc token-uri `XXXX.DUMMY.TOKEN.XXXX`.
Cu ele, calea reală e exercitată în e2e și în integrare.

**Ce respinge:** cheia de producție în `.env` local. Cheile de producție resping
token-urile dummy și ar cere domeniul real.

### KTD7 — Fail-open pe `siteverify` indisponibil rămâne
Token lipsă sau invalid → respins. `siteverify` inaccesibil (timeout 5s) →
acceptat, cu log. E o decizie deja luată în PR și rămâne luată: pentru 40 de
locuri, o înscriere pierdută doare mai mult decât câțiva boți într-o fereastră de
câteva minute, iar pana de rețea spre Cloudflare nu e ceva ce un atacator poate
provoca. Se documentează ca decizie, nu se re-deschide.

---

## Unitățile de implementare

### U1 — Merge `main` în branch, rezolvă cele 6 conflicte

**Fișiere:** `src/lib/supabase.ts`, `src/components/ComingSoon.tsx`,
`src/components/landing/RegistrationSection.tsx`, `tests/inscriere.spec.ts`,
`tests/unit/supabase.test.ts`, `vercel.json`

```bash
git checkout feat/turnstile-anti-bot   # sau: git worktree add, dacă preferi izolarea
git merge main
```

**`vercel.json`** — reuniune strictă. Se pornește de la varianta din `main` și se
adaugă `https://challenges.cloudflare.com` în trei directive:
- `script-src 'self' https://challenges.cloudflare.com`
- `frame-src https://maps.google.com https://www.google.com https://www.instagram.com https://challenges.cloudflare.com`
- `connect-src 'self' https://whyndrjcezmtajbykeil.supabase.co https://challenges.cloudflare.com`

Se **păstrează** din `main`: rewrite-ul `/inscriere` (PR-ul e de dinaintea paginii)
și `fullscreen=(self "https://www.instagram.com")` din `Permissions-Policy`.
Varianta din PR le-ar șterge pe ambele.

**`src/lib/supabase.ts`** — bază: PR-ul (are `postForm`, tipul `AntiBot`,
`isBotRejectedError`, semnăturile cu `antiBot`). Se re-adaugă din `main`:
importul `parseEventConfig` / `EventConfig` și funcția `fetchPublicConfig`.
Se șterge `sendInfoEmail` — dar întâi:
`grep -rn "sendInfoEmail" src/ tests/` trebuie să dea zero rezultate în afara
`useLaunchForm.ts` (care îl scoate în U1) și a testelor (actualizate în U6).

**`ComingSoon.tsx` / `RegistrationSection.tsx`** — bază: `main` (rescrise complet
pentru configul la runtime, `BirthDateField`, varianta `next-session`). Din PR se ia
strict o linie de destructurare (`hpProps`) și input-ul honeypot din interiorul
`<form>`.

**`tests/inscriere.spec.ts` / `tests/unit/supabase.test.ts`** — bază: `main`
(asertează deja „nu se trimite `editie`", adaptat la config la runtime). Din PR se
ia mecanismul: helperii `mockSubmit` / `ok` / tipul `Plic`, ruta `SUBMIT_ROUTE`,
și testele pe plicul cu dovezi anti-bot. `main` și PR-ul spun același lucru despre
ediție — se păstrează formularea din `main`.

**Gata când:** `git status` curat, `npm run typecheck && npm run typecheck:tests`
trec. Testele pot încă să pice — U2 le repară.

---

### U2 — Suprafețele pe care merge-ul nu le semnalează

**Fișiere:** `src/components/landing/RegistrationForm.tsx`,
`tests/inscriere-directa.spec.ts`, `tests/integration/backend.live.test.ts`,
`tests/unit/antiBotSurfaces.test.tsx` (nou)

**`RegistrationForm.tsx`** — al doilea formular de înscriere, apărut pe `main`
după PR, folosit de `/inscriere` și de overlay-ul de pe landing. Primește
`hpProps` din `reg` și input-ul honeypot imediat sub `<form>` (linia ~149), exact
ca în `RegistrationSection`.

**`tests/inscriere-directa.spec.ts`** — 252 de linii noi pe `main`, cu 8 rute
`**/rest/v1/registrations`. Se auto-merge-uiește curat și pică la rulare, fiindcă
aplicația nu mai lovește acel endpoint. Se repointează pe `**/functions/v1/submit-form`
cu aceiași helperi introduși în `tests/inscriere.spec.ts` (extrași într-un
`tests/helpers/submitForm.ts` dacă duplicarea deranjează).

**`tests/integration/backend.live.test.ts`** — al treilea fișier care se
auto-merge-uiește curat și se rupe tăcut, și tocmai el e poarta din U6/U7. Ambele
părți l-au editat. Două lucruri de reparat: (a) cele două teste noi din PR
(`honeypot`, `too_fast`) lovesc `/functions/v1/submit-form`, care nu e deployat
până la U7 pasul 2 — deci la U6 dau 404, nu doar `lockdown` pică; se pun în spatele
aceleiași variabile condiționale ca `lockdown`. (b) Testul de pe `main` `un insert
public cu ediție stale e corectat, nu respins` face INSERT anon în
`runlift.registrations` și acceptă `[400, 403]`; după lockdown PostgREST răspunde
401 (pică) sau 403 (trece, dar nu mai asertează nimic). Se repointează pe
`submit-form`, mod `registration`, `elapsed` peste 3000, ca să continue să
dovedească exact ce dovedea: că trigger-ul de ediție corectează o valoare stale.

**Garda din R7** — un test care enumeră suprafețele publice și cade dacă una n-are
capcană. Cea mai ieftină formă care chiar prinde ceva: randează cele **patru**
componente care dețin un `<form>` — `RegistrationSection`, `RegistrationForm`,
`ComingSoon`, `DespreNoi` — și asertează prezența unui `input[name="website"]` în
interiorul lui. `RegistrationOverlay` și `Inscriere` sunt acoperite tranzitiv:
ambele randează `RegistrationForm`, deci randarea lor ar retesta același markup
târând după ea `useEventConfig`, `useStats`, `useCountdown` și `window.history`.
Alternativa statică (grep peste `src/components` după `<form` fără `hpProps` în
apropiere) e mai fragilă și dă fals-pozitive pe formularele din `/admin` — de evitat.

**Verificare transversală:**
```bash
grep -rn "rest/v1/registrations\|rest/v1/event_waitlist\|rest/v1/launch_notifications" src/
```
trebuie să dea **zero** rezultate. Mai există patru fișiere e2e care mock-uiesc
aceste rute (`despre-noi.spec.ts`, `coming-soon.spec.ts`, `confirmare.spec.ts`,
plus `inscriere.spec.ts`) — primele trei sunt deja în diff-ul PR-ului, dar
`confirmare.spec.ts` are două rute pe `launch_notifications` care trebuie
re-verificate după merge.

**Gata când:** `npm run test` și `npm run test:e2e` trec integral.

---

### U3 — Funcția Edge, aliniată la schema de azi

**Fișier:** `supabase/functions/submit-form/index.ts`

Trei lucruri de verificat împotriva stării curente a bazei (prin MCP Supabase, nu
din memorie):

1. **Coloanele `editie` au încă `DEFAULT current_event_edition()` /
   `current_launch_edition()`** după `event_config` și `server-assigned-edition`.
   Dacă publicarea configului a schimbat mecanismul, plicul care omite `editie` ar
   insera `NULL`.
2. **`forteaza_editia_curenta()` se aplică inserărilor `service_role`** care nu
   setează `guard_bypass` (KTD5). Un `insert` de probă cu cheia de service, fără
   `editie`, trebuie să producă ediția curentă.
3. **CORS.** `ORIGINI` conține `https://parktraining.fit` și `http://localhost:5173`.
   `redirectCanonic` din `src/lib/canonicalHost.ts` începe cu
   `if (env !== 'production') return null` — deci preview-urile **NU** redirecționează,
   rămân pe `*.vercel.app` și lovesc zidul CORS din `submit-form`. **De decis
   explicit:** dacă vrei ca preview-urile să poată testa formularele, adaugă un
   pattern `*.vercel.app` în `ORIGINI` **și** cheia Turnstile în scope-ul Preview
   din Vercel — altfel notează în `ANTI-BOT.md` că formularele se testează doar
   local (`http://localhost:5173`) sau pe producție. Recomandarea e a doua: mai
   puțină suprafață. Consecința se scrie negru pe alb, fiindcă preview-ul e locul
   unde ai fi verificat PR-ul înainte de merge.

Validarea (`validateEventRow`, `validateLaunchRow`) rămâne cum e, conform KTD4 —
dar se adaugă un comentariu care spune de ce vârsta NU se verifică aici, altfel
următorul cititor o va „repara".

`send-email` a primit pe `main` un `once_key` pentru zăvorul difuzărilor manuale.
`fireEmail` din `submit-form` trimite `{mode:"confirm", id}` / `{mode:"info", email}`
— moduri neatinse de zăvor. Nimic de schimbat, dar merită confirmat cu o citire a
`supabase/functions/send-email/index.ts`.

**Gata când:** cele trei verificări sunt bifate cu dovadă (query sau insert de
probă), iar decizia CORS e scrisă în `ANTI-BOT.md`.

---

### U4 — Migrarea de lockdown, adusă la zi

**Fișiere:** `supabase-migration-turnstile-lockdown.sql`, `MIGRATIONS.md`

**Corectarea rollback-ului (R4).** Blocul comentat de la finalul migrării recreează:
```sql
create policy "anon can register" on runlift.registrations
  for insert to anon with check (acord);
```
Dar politica de azi, după `supabase-migration-server-assigned-edition.sql`, e:
```sql
with check (acord and editie = runlift.current_event_edition())
```
Idem pentru `event_waitlist`: `acord = true and editie = runlift.current_event_edition()`.
Rollback-ul trebuie să repună forma curentă, altfel „revenirea la starea de
dinainte" e de fapt o regresie.

**Re-verificarea suprafeței.** `event_config` și `reels-si-coming-soon` au adăugat
doar `grant execute` pe RPC-uri (protecția e în funcție, prin `p_token`), nu
politici de INSERT pentru `anon` — verificat. Dar migrarea trebuie să conțină
interogarea care demonstrează asta după commit, generalizată la „orice tabel", nu
doar la cele trei:
```sql
select tablename, policyname from pg_policies
 where schemaname = 'runlift' and cmd = 'INSERT' and roles::text like '%anon%';

select table_name, privilege_type from information_schema.role_table_grants
 where table_schema = 'runlift' and grantee = 'anon' and privilege_type = 'INSERT';
```
Ambele: zero rânduri.

**Convenția de aplicare.** `MIGRATIONS.md` (scris după PR) cere aplicarea prin MCP
`apply_migration`, cu nume prefixat `runlift_`, plus un rând nou în tabelul de
migrări. Runbook-ul din `ANTI-BOT.md` spune „SQL Editor" — se aliniază la
`MIGRATIONS.md`: nume `runlift_turnstile_lockdown`. Se adaugă rândul în tabel și
se rulează `get_advisors` (security) după DDL, ca la orice migrare care atinge
RLS.

**Gata când:** migrarea are rollback-ul corect, interogările de verificare
generalizate, iar `MIGRATIONS.md` are rândul. **Migrarea NU se aplică aici** —
se aplică în U7, pasul 4.

---

### U5 — Cheile Cloudflare (poate rula primul)

**Fișiere:** `ANTI-BOT.md`, `.env.local` (negitat), setări Vercel + Supabase

1. Cloudflare Dashboard → Turnstile → Add widget. Domenii: `parktraining.fit`
   (+ `www` dacă e configurat). Mod: **Managed**. Rezultă `site key` (public) și
   `secret key`.
2. Local, pentru dezvoltare: cheile dummy din KTD6, în `.env.local`:
   `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000BB`.
3. `ANTI-BOT.md` documentează ambele seturi, cu avertismentul că cheile de
   producție resping token-urile dummy și invers.

**De confirmat la implementare** (documentația de client-side rendering nu
listează explicit `retry` și `timeout-callback`, deși `appearance: interaction-only`
și `execution: execute` sunt confirmate, ca și regula token 300s / o singură
folosire): dacă vreo opțiune din `turnstile.render()` a fost redenumită, se
corectează în `src/lib/turnstile.ts` — e izolat într-un singur apel.

**Gata când:** ambele chei există și sunt notate; `.env.local` are cheia dummy.

---

### U6 — `verify` complet și actualizarea PR-ului

```bash
npm run verify          # typecheck ×2 + unit + build + e2e
RUNLIFT_LIVE=1 SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
  npm run test:integration
```

Testul de integrare `lockdown: cheia publishable NU mai poate insera direct`
**trebuie să PICE aici** — migrarea nu e aplicată încă. E semnalul că testul chiar
măsoară ceva. Se marchează explicit (skip condiționat pe o variabilă, sau se
rulează abia după U7) ca să nu blocheze merge-ul dintr-un motiv corect.

Garda de build se verifică în ambele sensuri:
```bash
VERCEL_ENV=production npm run check:deploy-config   # fără cheie → exit 1
VITE_TURNSTILE_SITE_KEY=1x00000000000000000000BB VERCEL_ENV=production npm run check:deploy-config   # → ok
```

Apoi corpul PR-ului #1 se actualizează: suprafețele sunt cinci nu trei, ordinea
de aplicare a migrării e prin `apply_migration`, iar numerele de teste se refac.
`git push --force-with-lease`. PR-ul trebuie să treacă pe `mergeable: MERGEABLE`.

**Gata când:** `verify` verde, PR mergeable, corpul actualizat.

---

### U7 — Deploy, în ordine, cu dovadă

Nimic din PR nu e deployat și migrarea nu e aplicată.

**Merge-ul ESTE deploy-ul frontendului.** `.github/workflows/ci-deploy.yml` rulează
la fiecare push în `main` și, dacă `verify` trece, apasă `VERCEL_DEPLOY_HOOK_URL`,
apoi `scripts/check-live-deploy.mjs` confirmă pe live că noul SHA e sus.
`vercel.json` are `git.deploymentEnabled.main: false`, iar workflow-ul își spune
singur „acest pipeline e singura cale spre producție". Deci merge-ul PR-ului nu e
un pas administrativ de dinaintea deploy-ului — e pasul 4 din cinci, și **nu**
`vercel --prod`, care ar pune pe producție un build al cărui commit nu e `main`.

Ordinea are două constrângeri, nu una: cheia publică trebuie să fie în Vercel
ÎNAINTE de merge (altfel garda din `check-deploy-config.ts` face `exit 1` la
build-ul de producție și frontendul nu ajunge sus), iar migrarea e ULTIMA (între
pașii 4 și 5 ambele căi funcționează — intenționat, ca noul frontend să fie
confirmat live înainte ca `submit-form` să rămână singura cale de scriere).

```bash
# 1. Secretele, în Supabase. AMBELE: `submit-form` rezolvă cheia de scriere ca
#    RUNLIFT_SERVICE_KEY ?? SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY —
#    iar căderea pe ultima merge până fix în clipa migrării, apoi omoară tot.
supabase secrets set TURNSTILE_SECRET_KEY=<secret> RUNLIFT_SERVICE_KEY=<sb_secret_…> \
  --project-ref whyndrjcezmtajbykeil
supabase secrets list --project-ref whyndrjcezmtajbykeil   # ambele trebuie să apară

# 2. Funcția Edge. `--no-verify-jwt`: e apelată din browser doar cu `apikey`,
#    fără sesiune — la fel ca `send-email`.
supabase functions deploy submit-form --no-verify-jwt --project-ref whyndrjcezmtajbykeil
```

**Dovada că Turnstile chiar verifică — imediat după pasul 2.** `verifyTurnstile`
începe cu `if (!TURNSTILE_SECRET) return { ok: true }`, deci un secret negăsit face
funcția să accepte orice, tăcut. `curl`-ul de mai jos, cu token gol și `elapsed`
peste prag, **trebuie să dea 403 `captcha_failed`**; un 200 înseamnă că secretul
n-a ajuns la funcție și captcha e oprit:

```bash
curl -s -w '\n%{http_code}\n' \
  -X POST 'https://whyndrjcezmtajbykeil.supabase.co/functions/v1/submit-form' \
  -H 'apikey: sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"launch","token":"","hp":"","elapsed":30000,
       "data":{"nume":"Test","prenume":"Test","email":"probe@test.md","telefon":"069000000"}}'
```

```bash
# 3. Cheia publică în Vercel — DOAR Production. Preview-urile rămân fără cheie
#    (vezi U3: `ORIGINI` nu le acceptă oricum), deci formularele nu se testează
#    pe preview, ci local sau pe producție.
vercel env add VITE_TURNSTILE_SITE_KEY production

# 4. Merge-ul PR #1 → CI rulează `verify` și declanșează deploy-ul Vercel.
#    Se așteaptă până `check-live-deploy.mjs` confirmă noul SHA pe parktraining.fit.
```

**Poarta dintre 4 și 5.** O înscriere reală pe producție, cap-coadă, plus
confirmarea că emailul a plecat (`/admin` → „Livrare"). Dacă asta nu merge, NU
treci mai departe: fără migrare, calea veche încă salvează lumea.

```
# 5. Lockdown-ul: apply_migration, nume `runlift_turnstile_lockdown`
#    (conținutul din supabase-migration-turnstile-lockdown.sql)
```

**Dovada lockdown-ului — trebuie să dea 401 sau 403:**
```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST 'https://whyndrjcezmtajbykeil.supabase.co/rest/v1/registrations' \
  -H 'apikey: sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh' \
  -H 'Content-Type: application/json' -H 'Content-Profile: runlift' \
  -d '{"nume":"Bot Test","telefon":"069000000","email":"bot@test.md","acord":true}'
```
201 înseamnă că lockdown-ul nu s-a aplicat și captcha e decorativ. (Dacă totuși dă
201, șterge rândul `bot@test.md` — altfel ocupă un loc din cele 40.)

**După:** încă o înscriere reală (calea nouă e acum singura), `get_advisors`
(security), și `npm run test:integration` — de data asta testul `lockdown` trebuie
să TREACĂ. Apoi rândul în `MIGRATIONS.md` se marchează ca aplicat.

**Rollback — doi pași, în ordine.** Rularea blocului SQL singur redeschide INSERT
pentru `anon` fără să repare nimic: frontendul livrat scrie doar prin `submit-form`,
deci calea reactivată n-o folosește nimeni. Întâi promovează în Vercel
deployment-ul de producție dinaintea merge-ului (auto-deploy-ul git e dezactivat,
deci e o promovare manuală, nu un push), **apoi** rulează blocul corectat din
finalul migrării (U4), care repune politicile și grant-urile în forma de azi,
inclusiv `editie = current_event_edition()`.

**Gata când:** proba de la pasul 2 dă 403 `captcha_failed`, `curl`-ul de lockdown dă
401/403, o înscriere reală trece pe calea nouă, testul de integrare `lockdown` e
verde.

---

## Riscuri

| Risc | Semn | Tratament |
|---|---|---|
| `RegistrationForm.tsx` rămâne fără honeypot | Merge curat, teste verzi, bot-ul intră prin `/inscriere` | U2 + garda din R7. E riscul principal al întregii reanimări. |
| `inscriere-directa.spec.ts` mock-uiește un endpoint mort | e2e pică cu „timeout waiting for /te-ai înregistrat/" | U2, repointare pe `submit-form` |
| Rollback-ul migrării reintroduce bug-ul de ediție | Invizibil până la ediția următoare | U4 |
| Preview-urile Vercel pică pe CORS | Formular mort doar pe preview | U3, decizie explicită + notă în `ANTI-BOT.md` |
| `--no-verify-jwt` sau `secrets set` s-au schimbat în CLI | Pasul 1-2 din U7 eșuează | Se verifică cu `supabase functions list` înainte; `send-email` e precedentul care merge |
| Fereastră între pașii 3 și 4 în care ambele căi merg | Boți încă pot insera direct | Acceptat deliberat; fereastra e de minute, nu de zile |
| `siteverify` indisponibil → fail-open | Log `turnstile siteverify indisponibil` | Acceptat (KTD7) |

---

## Ce NU e în plan

- **Rate limit per IP** în `submit-form`. Turnstile acoperă cazul normal; se face
  doar dacă apare abuz țintit. Rămâne în „Rămas deschis" din `ANTI-BOT.md`.
- **`send-email` în spatele unui token de admin.** Modurile `info`/`confirm` sunt
  încă apelabile cu cheia publishable. Impact mărginit (doar adrese deja din DB,
  cooldown 10 minute per adresă), dar e o gaură reală — merită plan propriu, nu
  o extindere de scope aici.
- **Verificarea vârstei pe server** (KTD4).
- **Refactor de markup** ca să existe un singur wrapper de formular (KTD3).

---

## Verificare finală

```bash
npm run verify
RUNLIFT_LIVE=1 … npm run test:integration      # lockdown: verde DUPĂ U7
grep -rn "rest/v1/registrations\|rest/v1/event_waitlist\|rest/v1/launch_notifications" src/   # zero
curl … /rest/v1/registrations                   # 401 sau 403
```

Plus o înscriere reală de pe telefon, pe producție, cu emailul de confirmare
verificat în `/admin` → „Livrare".

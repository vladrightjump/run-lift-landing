# Ghid: cum lansezi o ediție nouă

Tot ce trebuie schimbat de la o ediție la alta, pas cu pas. Ține-l la îndemână.

Sunt **două faze** (pot fi făcute separat, la câteva săptămâni distanță, sau împreună):

- **Faza A — Anunț (Coming Soon):** strângi „Anunță-mă la lansare" pentru ediția care urmează.
- **Faza B — Înscrieri deschise (landing):** evenimentul e anunțat, oamenii se înscriu efectiv.

> **Regula de aur:** ediția e controlată în **DOUĂ locuri care trebuie ținute în sincron**:
> 1. `src/lib/config.ts` (frontend)
> 2. Supabase → tabelul `app_config` (backend)
>
> Dacă le desincronizezi, statisticile/înscrierile/adminul arată ediții diferite. Restul (public_stats, defaults pe `editie`, adminul) se aliniază automat din `app_config`, prin funcțiile `current_event_edition()` și `current_launch_edition()`.

---

## Concepte (ca să înțelegi de ce)

| Noțiune | Ce e | Sursă de adevăr |
|---|---|---|
| **ediția de eveniment** | ediția pentru care se strâng înscrieri la cursă | `CURRENT_EDITION` (config) ⇄ `app_config.current_event_edition` |
| **ediția de lansare** | ediția pentru care se strâng notificări „Anunță-mă" | `CURRENT_LAUNCH_EDITION` (config) ⇄ `app_config.current_launch_edition` |

Funcțiile SQL citesc `app_config` **la fiecare cerere**, deci în backend e suficient să schimbi valoarea în `app_config` — nu trebuie să rescrii funcțiile. Ele alimentează automat:
- default-ul coloanei `editie` la `registrations` și `event_waitlist`
- filtrarea din `public_stats()` (numărul + lista publică)
- adminul: `admin_list_registrations`, `admin_list_waitlist`, `admin_add_registration`
- default-ul coloanei `editie` la `launch_notifications`

Unicitatea e **per ediție** (`(lower(email), editie)`), deci cine s-a înscris la o ediție trecută se poate înscrie din nou. **Datele edițiilor vechi NU se șterg** — rămân în tabele, doar nu mai apar în vederea curentă.

---

## FAZA A — Anunți ediția următoare (Coming Soon)

### 1. Backend (Supabase → SQL Editor sau MCP)
```sql
update app_config set value = '<N>' where key = 'current_launch_edition';
-- exemplu pentru ediția 4:
-- update app_config set value = '4' where key = 'current_launch_edition';
```

### 2. Frontend — `src/lib/config.ts`
- `CURRENT_LAUNCH_EDITION` → `<N>` (același număr ca în `app_config`)
- `LAUNCH_DATE` → data+ora anunțului (fus **Chișinău**, ex: `new Date('2026-08-20T18:00:00+03:00')`)
- `SHOW_COMING_SOON = true`

### 3. Textul „ediția a N-a" (scris cu litere — nu se derivă automat)
Caută și înlocuiește peste tot numele ediției (ex. „a treia" → „a patra"):
- `src/components/ComingSoon.tsx` — badge + `cs-brand-meta`
- `src/components/Confirmare.tsx` — `cs-brand-meta`
- `src/admin/AdminDashboard.tsx` — `topbar-info`

> Comandă utilă ca să le găsești pe toate:
> ```
> grep -rn "a treia\|Ediția\|ediția" src/ index.html
> ```

### 4. Verifică + deploy
```
npm run typecheck && npm run test && npm run build
git add -A && git commit -m "Anunț ediția <N> (Coming Soon)"
git push && vercel --prod --yes
```
Preview înainte de ora lansării: `parktraining.fit/?preview=soon`.

La expirarea `LAUNCH_DATE`, ecranul comută **singur** de la Coming Soon la landing (nu trebuie redeploy).

---

## FAZA B — Deschizi înscrierile la eveniment (landing)

### 1. Backend (Supabase → SQL)
```sql
update app_config set value = '<N>' where key = 'current_event_edition';
```
Gata — `public_stats`, defaults-urile și adminul arată acum ediția `<N>` (goală la început). Ediția veche rămâne în tabel.

### 2. Frontend — `src/lib/config.ts`
- `CURRENT_EDITION` → `<N>` (același ca `app_config.current_event_edition`)
- `EVENT_DATE` → data+ora cursei (fus Chișinău, ex: `new Date('2026-09-05T07:00:00+03:00')`)
  - `EVENT_END_DATE` se calculează singur (start + 6h) — de ajustat doar dacă durează altfel
- `REGISTRATION_DEADLINE` → până când se poate înscrie (ex. miezul nopții din ziua evenimentului)
- `TOTAL_SLOTS` / `WAITLIST_SLOTS` → doar dacă schimbi numărul de locuri
- (validarea vârstei minime folosește automat `EVENT_DATE` — nu atingi nimic)

### 3. Textul + datele din landing — `src/components/Edition3Landing.tsx`
Actualizează constantele din capul fișierului și câteva texte:
- `EVENT_META` (ex. `'5 septembrie 2026 · Parcul Râșcani'`)
- `HERO_KICKER` (ex. `'Sâmbătă, 5 septembrie 2026 · Parcul Râșcani, Chișinău · Ediția a patra'`)
- `SUMMARY_ITEMS[0]` (linia cu data)
- `BIRTH_YEARS` → anul de sus = **anul evenimentului − 14** (ex. eveniment 2026 ⇒ `2012`)
- rândul „Când" din secțiunea Locație (`{ k: 'Când', v: 'Sâmbătă, ... 2026' }`)
- mesajul de succes („Ne vedem pe … la start, ora 07:00")
- textul din hero („Ediția a treia Run + Lift") + titlul mare (`Up` / `Down.`) dacă schimbi conceptul
- dacă se schimbă **locația**: `MAP_QUERY` (căutarea din Google Maps) + textele cu adresa

### 4. Emailuri — `supabase/functions/send-email/index.ts`
Textele sunt **hardcodate în funcția edge** (nu în șabloanele din /admin). Actualizează data în:
- `CONFIRM_SUBJECT` + `CONFIRM_TEXT` (emailul care pleacă la fiecare înscriere)
- `REMINDER_SUBJECT` + `REMINDER_TEXT` (reminder „mâine e ziua")
- `ANNOUNCE_SUBJECT` + `ANNOUNCE_TEXT` (broadcast la deschiderea înscrierilor)
- badge-ul HTML „HYROX Style Race · <data>" (în `renderHtml`)

Apoi **redeployează funcția**:
```
supabase functions deploy send-email
```
(sau prin MCP Supabase → `deploy_edge_function`, cu `verify_jwt: false`)

> Șabloanele editabile din `/admin` (`confirmare` / `info`) sunt pentru fluxul „Anunță-mă la lansare" (double opt-in) și sunt **generice, fără dată** — de regulă NU trebuie atinse.

### 5. Cover-ul de share — `public/og.png` + `index.html`
- Regenerează `public/og.png` (1200×630) cu noua ediție + dată. (Design: fundal `#121410`, accent lime `#C9F24B`, font Anton.)
- În `index.html` actualizează: `<title>`, `meta description`, `og:title`, `og:description`, `og:image:alt`, `twitter:title`, `twitter:description`.
- **Bump cache:** schimbă `og.png?v=3` → `?v=4` (altfel Facebook/WhatsApp servesc coverul vechi din cache).

### 6. Teste (așteptările legate de ediție/dată)
Actualizează valorile din:
- `tests/unit/config.test.ts` — verifică `CURRENT_EDITION`, `LAUNCH_DATE` etc.
- `tests/unit/supabase.test.ts` — aserția `editie === 3` (pune `<N>`)
- specurile e2e care fixează data (`fixClock` / `addInitScript` cu `Date.now`) — pune o dată dinainte de noul eveniment

Rulează tot: `npm run typecheck && npm run test && npm run test:e2e`

### 7. Deploy
```
git add -A && git commit -m "Ediția <N>: înscrieri deschise (25 <lună> 2026)"
git push && vercel --prod --yes
```
Preview: `parktraining.fit/?preview=landing`.

---

## Checklist rapid (printabil)

**Anunț (Faza A)**
- [ ] `app_config.current_launch_edition` = N
- [ ] `config.ts`: `CURRENT_LAUNCH_EDITION`, `LAUNCH_DATE`, `SHOW_COMING_SOON=true`
- [ ] text „ediția a N-a" în ComingSoon / Confirmare / AdminDashboard
- [ ] test + build + deploy

**Înscrieri (Faza B)**
- [ ] `app_config.current_event_edition` = N
- [ ] `config.ts`: `CURRENT_EDITION`, `EVENT_DATE`, `REGISTRATION_DEADLINE` (+ SLOTS dacă e cazul)
- [ ] `Edition3Landing.tsx`: `EVENT_META`, `HERO_KICKER`, `SUMMARY_ITEMS`, `BIRTH_YEARS`, rând „Când", mesaj succes, text hero, (locație dacă se schimbă)
- [ ] `send-email/index.ts`: CONFIRM / REMINDER / ANNOUNCE + badge → **redeploy funcția**
- [ ] `public/og.png` regenerat + `index.html` meta + `?v=` bump
- [ ] teste actualizate (config/supabase/e2e)
- [ ] build + deploy

---

## Ce NU trebuie să faci
- **Nu șterge** înscrierile ediției vechi — rămân separate prin `editie`, nu deranjează.
- **Nu rescrie** funcțiile SQL de ediție — citesc singure din `app_config`.
- **Nu pune** `editie` manual în insert-ul de `launch_notifications` din client — o pune serverul (RLS respinge valoarea din client).

## Fișiere vechi (ediția 2 — nefolosite acum)
Landing-ul vechi trăiește în `src/components/Hero.tsx`, `RegistrationSection.tsx`, `VenueSection.tsx`, `FormatSection.tsx`, `ParticipantsSection.tsx`. **Nu mai sunt randate** (App folosește `Edition3Landing`). Le poți ignora sau șterge; le-am lăsat ca referință.

---
title: Anunțul de ediție nouă către toți participanții de până acum - Plan
type: feat
date: 2026-09-17
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Anunțul de ediție nouă către toți participanții de până acum

## Goal Capsule

- **Objective:** din `/admin` → „Emailuri", operatorul trimite anunțul unei ediții noi tuturor celor care s-au înscris vreodată la o ediție — o dată pe persoană, cu link de dezabonare funcțional, fără cei deja înscriși la ediția anunțată și fără cei care s-au dezabonat.
- **Means:** o audiență nouă, rezolvată pe SERVER (nu în client), trimisă printr-un mod nou al funcției `send-email`, plus dezabonarea mutată de pe rând pe persoană.
- **Authority:** acest plan. Decizia de audiență e luată de operator în sesiune (vezi Key Decisions).
- **Execution profile:** migrare SQL (manuală), funcție Edge (deploy manual), interfață React (deploy prin merge în `main`).
- **Stop conditions:** oprește-te și întreabă dacă (a) redeploy-ul `send-email` din U0 schimbă comportamentul altui mod decât cele numite aici; (b) planul Resend al contului limitează trimiterile sub numărul de destinatari; (c) o migrare ar atinge schema `public`.
- **Tail ownership:** implementare + verificare locală. Aplicarea migrării, deploy-ul funcției și primul anunț real rămân ale operatorului.

---

## Product Contract

### Summary

Operatorul vrea ca, la deschiderea unei ediții noi, să poată scrie tuturor celor care au mai alergat. Azi nu poate: tabul „Emailuri" are patru audiențe, iar „Participanți" înseamnă doar ediția deschisă în backoffice. Planul adaugă a cincea audiență — **„Toți participanții de până acum"** — și repară două lucruri fără de care un astfel de email n-ar trebui să plece: lipsa linkului de dezabonare pe trimiterile manuale și dezabonarea care se aplică unui singur rând, nu persoanei.

### Problem Frame

Verificat pe 17 septembrie 2026, în proiectul `whyndrjcezmtajbykeil`:

- **151 de înscrieri, 69 de oameni.** Pe ediții: 1→30, 2→20, 3→20, 4→20, 5→31, 6→30. **35 de adrese apar la mai mult de o ediție.** Fără deduplicare, jumătate din public ar primi anunțul de două până la șase ori.
- **Modul `admin` al `send-email` trimite fără dezabonare.** Mesajul e `{to, subject, text}`, iar `sendOne(m, badge)` e chemat fără `unsubPageUrl` și fără `unsubApiUrl` — deci nici link vizibil, nici header `List-Unsubscribe`. Doar modul `broadcast` le pune. Pentru un email de marketing către oameni care n-au cerut explicit anunțuri, lipsa lor e o problemă legală (consimțământul pentru un eveniment nu acoperă tacit mesaje viitoare fără cale de refuz) și una de livrabilitate (Gmail și Yahoo cer dezabonare one-click de la expeditorii în masă).
- **`runlift.unsubscribe(p_token)` marchează un singur rând.** Face `update registrations set dezabonat_la = now() where token_unsub = p_token`. Un om cu trei înscrieri care apasă „Dezabonează-te" rămâne abonat pe celelalte două — iar un anunț către „toți de până acum" l-ar găsi exact pe acolo.
- **Clientul n-are datele.** `AdminEmailTab` primește `rows` doar pentru ediția selectată, fără `token_unsub`. Construirea listei istorice în browser ar cere un RPC nou care să expună tokenurile de dezabonare ale tuturor edițiilor spre client — adică exact datele care trebuie să rămână pe server.
- **`send-email` din producție e în urma codului.** Versiunea deployată e din 4 septembrie; `main` conține de atunci modurile `preview`, `replay`, `alert` (valul 5) și scrierea `sablon` în jurnal. Un mod nou deployat înseamnă deployarea TUTUROR acestora deodată (vezi U0).

### Key Decisions

- **Audiența: toți cei înscriși vreodată, o dată pe persoană, fără cei deja înscriși la ediția anunțată și fără dezabonați.** Cine s-a înscris deja la ediția nouă nu are nevoie de „s-au deschis înscrierile". *Governs R1, R2, R3.* (session-settled: user-approved — chosen over includerea listei de lansare și peste „literalmente toți": cei deja înscriși ar primi un anunț inutil, iar lista de lansare are deja audiența ei.)

### Requirements

- **R1.** Audiența se rezolvă pe server, din `runlift.registrations`, deduplicată după `lower(btrim(email))`.
- **R2.** Sunt excluși cei care au o înscriere activă la ediția curentă (`current_event_edition()`).
- **R3.** Sunt excluși cei cu `dezabonat_la` setat pe ORICARE rând al adresei, în `registrations` sau `launch_notifications`.
- **R4.** Rândurile șterse de admin nu contribuie; rândurile eliberate de participant (`renuntat_la is not null`) contribuie — cine și-a eliberat locul rămâne un om care a vrut să vină.
- **R5.** Fiecare email poartă link vizibil de dezabonare și headerele `List-Unsubscribe` + `List-Unsubscribe-Post`.
- **R6.** O dezabonare se aplică tuturor rândurilor aceleiași adrese, în ambele tabele.
- **R7.** Înainte de trimitere, operatorul vede numărul exact și lista (nume, email, ultima ediție) și poate scoate persoane individual.
- **R8.** Aceeași difuzare nu pleacă de două ori din greșeală (zăvorul existent `broadcast_once`).
- **R9.** Fiecare trimitere lasă un rând în `email_log`, iar un eșec individual se poate rejuca din tabul „Livrare" doar pentru persoana respectivă.
- **R10.** Operatorul își poate trimite întâi un email de test, randat identic.

### Success Criteria

- Un anunț către „Toți de până acum", pe datele de azi (ediția curentă 7, un înscris), pleacă la 68 de adrese, câte o dată fiecare: 69 de oameni minus cel deja înscris la ediția 7.
- Un destinatar care apasă „Dezabonează-te" nu mai apare în lista următorului anunț, indiferent la câte ediții a fost înscris.
- Headerele `List-Unsubscribe` apar în sursa emailului primit (verificat în Gmail → „Show original").

### Scope Boundaries

**În scop:** audiența nouă, modul `anunt` al `send-email`, dezabonarea pe persoană, șablonul implicit, rejucarea unui eșec.

**În afara scopului:**
- Includerea listei de lansare sau a listei de așteptare în aceeași audiență (decis în sesiune).
- Programarea anunțului pe o oră viitoare. Se trimite la click.
- Segmentare (ex. „doar cei cu 2+ ediții"). Vederea `persoane` din valul 2 o face posibilă mai târziu; nu e cerută acum.
- Trimitere prin endpoint-ul batch al Resend. Justificat abia peste ~150 de destinatari (vezi Risks).

### Open Questions

- **Nu e gata pentru ediția 7.** Ediția 7 e publicată cu startul pe 19 septembrie 2026 — la două zile de la scrierea planului. Cele cinci unități, cu două deploy-uri manuale și o migrare, sunt pentru edițiile următoare; ediția 7 se anunță cu uneltele de azi.
- **Deferred — de verificat înainte de primul anunț real.** Planul Resend al contului. Pe planul gratuit plafonul e 100 de emailuri/zi; 69 de anunțuri plus confirmările zilei pot să-l atingă. U2 raportează eșecurile `429`, dar nu poate crea cotă.

---

## Planning Contract

### Key Technical Decisions

- **KTD1. Audiența se rezolvă pe server, printr-o funcție SQL nechemabilă din client.** Clientul primește doar ce trebuie arătat (nume, email, ultima ediție); tokenurile de dezabonare nu părăsesc serverul. Funcția `anunt_recipients(p_exclude text[])` e `security definer`, cu `revoke execute ... from public, anon, authenticated` — o cheamă doar `send-email`, cu cheia de service. Tiparul e cel al `edition2_recipients`. *Owns R1–R4.*
- **KTD2. Mod nou `anunt` în `send-email`, nu audiență nouă în modul `admin`.** Modul `admin` primește mesaje gata compuse din client; exact asta nu trebuie să se întâmple aici (KTD1), iar modul nu știe să pună dezabonarea. Modul `broadcast` are deja bucla corectă (destinatari de pe server, `fillVars`, linkuri de dezabonare), dar e autentificat cu secretul de cron, nu cu sesiunea de admin. `anunt` = autentificarea lui `admin` + bucla lui `broadcast`. *Owns R5, R8.*
- **KTD3. Două faze pe același mod: `dry_run: true` întoarce lista, `dry_run: false` trimite.** Aceeași funcție SQL, același `p_exclude`, deci ce vede operatorul e exact ce pleacă — o previzualizare calculată separat ar putea diverge. *Owns R7.*
- **KTD4. Excluderile clientului doar îngustează.** Clientul trimite adrese de SCOS, niciodată adrese de adăugat. Serverul recalculează audiența la trimitere și scade excluderile. Un client compromis sau un tab vechi nu poate trimite cuiva din afara audienței. *Susține R7.*
- **KTD5. Dezabonarea devine pe persoană în două straturi.** `unsubscribe()` propagă `dezabonat_la` la toate rândurile cu aceeași adresă normalizată, în ambele tabele (R6). Iar `anunt_recipients` exclude o adresă dacă ORICE rând al ei e dezabonat (R3) — plasă pentru dezabonările vechi, făcute înainte de propagare. *Owns R3, R6.*
- **KTD6. Tokenul de dezabonare al destinatarului e cel de pe rândul cel mai recent.** Orice token al persoanei duce, după KTD5, la aceeași dezabonare completă; cel mai recent e și cel cu cele mai mici șanse să aparțină unui rând șters.
- **KTD7. Ritm fix și reîncercare pe `429`.** Bucla actuală din `broadcast` nu are pauză. La 69 de trimiteri consecutive, limita implicită a Resend (ordinul a câteva cereri pe secundă) produce `429`-uri. Pauză de ~250 ms între trimiteri și o singură reîncercare după 1 s pe `429`. 69 × (~0.3 s + 0.25 s) ≈ 40 s — sub plafonul de timp al unei invocări Edge. *Susține R9.*
- **KTD8. Jurnal: `mod = 'anunt'`, `audienta = 'istoric'`, `sablon` = cheia șablonului, `editie` = ediția curentă.** `email_log.audienta` n-are constrângere CHECK (verificat), deci valoarea nouă nu cere migrare pe coloană — dar tipul din client (`'participanti' | 'asteptare' | ''`) se lărgește. *Susține R9.*

### High-Level Technical Design

```
AdminEmailTab ─ audiență „Toți de până acum"
   │
   ├─ încărcare / schimbare excluderi ──► send-email { mode:"anunt", token, dry_run:true, exclude[] }
   │                                         │
   │                                         ├─ admin_check_token
   │                                         └─ anunt_recipients(exclude) ──► [{email, nume, ultima_editie}]   (fără tokenuri)
   │
   ├─ „Trimite-mi un test" ──────────────► send-email { mode:"anunt", token, test_to, subject, text }
   │                                         └─ randare identică, un singur destinatar, jurnal mod 'anunt_test'
   │
   └─ confirmare „Trimiți la N oameni" ──► send-email { mode:"anunt", token, subject, text, exclude[], once_key }
                                             ├─ admin_check_token
                                             ├─ broadcast_once(once_key)              ← zăvor
                                             ├─ anunt_recipients(exclude)             ← recalculat, nu luat din client
                                             ├─ loadConfig → fillEventVars(subject, text)
                                             └─ per destinatar: fillVars → sendOne(… unsubPage, unsubApi)
                                                                  ↳ 250 ms pauză · 1 reîncercare pe 429
                                             └─ log_emails([… mod:'anunt', audienta:'istoric', sablon, editie])
```

```sql
-- anunt_recipients(p_exclude text[]) — schiță de direcție, nu cod final
with randuri as (
  select lower(btrim(email)) as cheie, email, nume, token_unsub, editie, created_at
    from runlift.registrations
   where deleted_at is null or renuntat_la is not null           -- R4
), dezabonati as (
  select lower(btrim(email)) from runlift.registrations        where dezabonat_la is not null
  union
  select lower(btrim(email)) from runlift.launch_notifications where dezabonat_la is not null
), deja_inscrisi as (
  select lower(btrim(email)) from runlift.registrations
   where editie = runlift.current_event_edition() and deleted_at is null
)
select distinct on (cheie) email, nume, token_unsub, max(editie) over (partition by cheie) as ultima_editie
  from randuri
 where cheie not in (select * from dezabonati)                  -- R3
   and cheie not in (select * from deja_inscrisi)               -- R2
   and cheie <> all (coalesce(p_exclude, '{}'))                 -- KTD4, deja normalizate de server
 order by cheie, created_at desc;                               -- KTD6
```

### Sequencing

```
U0 (redeploy send-email din main, verificat) ──► U1 (migrare: dezabonare + audiență + șablon)
                                                   │
                                                   ├──► U2 (modul `anunt`)  ──► U3 (interfața)
                                                   └──► U4 (Livrare + rejucare)
```

U0 e primul pentru că U2 se deployează peste el: redeploy-ul aduce deodată tot valul 5, iar acela trebuie verificat singur, înainte să se amestece cu un mod nou.

### System-Wide Impact

- **Dezabonarea se lărgește retroactiv doar prin excludere, nu prin scriere.** KTD5 propagă doar dezabonările viitoare. Cele existente (azi: zero, verificat) sunt tratate de filtrul din `anunt_recipients`. Nicio migrare nu rescrie `dezabonat_la` pe rânduri vechi.
- **Dezabonarea afectează și emailurile de ediție.** `edition2_recipients` filtrează `dezabonat_la`; după propagare, cine se dezabonează de la un anunț nu mai primește nici remindere pe rândurile vechi. E corect — „nu-mi mai scrieți" — și nu atinge un rând creat după dezabonare, deci o reînscriere viitoare primește confirmarea și reminderele ediției la care s-a reînscris.
- **Redeploy-ul `send-email` din U0 activează valul 5 în producție.** Butonul de previzualizare, rejucarea și escaladarea încep să funcționeze abia atunci. Tot atunci modul `broadcast` începe să scrie `sablon` în jurnal — de care depinde potrivirea stării reminderelor din valul 1 după armarea `pg_cron`.
- **Shared project.** Toate funcțiile noi stau în `runlift`. `unsubscribe()` se rescrie cu `create or replace`, aceeași semnătură.
- **CSP neatins.** Nicio origine nouă.

### Risks & Dependencies

- **Limita zilnică Resend.** Pe planul gratuit, 100/zi. Anunțul plus confirmările pot trece de ea; emailurile peste limită eșuează cu `429` sau `403` și apar ca eșecuri în „Livrare". Verifică planul înainte de primul anunț real.
- **Redeploy U0 fără verificare.** Codul din `main` n-a rulat niciodată în producție pentru modurile `preview`/`replay`/`alert`. Dacă unul are o eroare de runtime, confirmările de înscriere — care trec prin aceeași funcție — pot fi afectate. U0 cere verificarea modului `confirm` imediat după deploy.
- **Timpul unei invocări.** ~40 s la 69 de destinatari. Plafonul Edge e de ordinul minutelor; peste ~150 de destinatari, anunțul trebuie fragmentat sau mutat pe endpoint-ul batch.
- **Închiderea tabului în timpul trimiterii.** Trimiterea continuă pe server, dar clientul nu mai vede rezultatul. Jurnalul din „Livrare" rămâne sursa de adevăr.
- **`{prenume}` pe înscrieri vechi.** `fillVars` ia primul cuvânt din `nume`. Formularele vechi cereau „Nume complet" cu exemplul „Ana Popescu", iar cel nou compune `prenume nume` — în ambele cazuri primul cuvânt e prenumele. Excepțiile (cineva care a scris „Popescu Ana") primesc „Salut, Popescu!".

### Sources & Research

- `runlift.registrations` agregat pe 17 septembrie 2026: 151 rânduri, 69 adrese distincte, 35 în mai multe ediții, 0 dezabonați; `launch_notifications`: 0 dezabonați. `current_event_edition()` = 7, cu un înscris; `event_start` = `2026-09-19T07:00:00+03:00`.
- `pg_get_functiondef(runlift.unsubscribe)` — marchează rândul cu `token_unsub = p_token`, întâi în `registrations`, apoi în `launch_notifications`.
- `pg_get_functiondef(runlift.edition2_recipients)` — tiparul funcției de audiență.
- `pg_get_functiondef(runlift.admin_replay_lookup)` — respinge cu `mod_exclus` orice mod din afara `confirm`/`promoted`/`broadcast`.
- `pg_constraint` pe `runlift.email_log` — nicio constrângere CHECK.
- `get_edge_function(send-email)` — versiunea deployată, actualizată pe 4 septembrie 2026; conține doar modurile `admin`, `confirm`, `promoted`, `info`, `broadcast`.
- `supabase/functions/send-email/index.ts` — `sendOne(m, badge, unsubPageUrl?, unsubApiUrl?)`; modul `admin` îl cheamă fără ultimele două; `fillVars`; `loadConfig` + `fillEventVars`.
- `src/admin/emailAudience.ts` — `Audience = 'participanti' | 'eveniment' | 'lansare' | 'toti'`, `dedupeByEmail`, `audientaLog`.
- `src/admin/AdminEmailTab.tsx` — butoanele de audiență, `TEMPLATE_LABELS`, `cheieDifuzare` pentru zăvor.
- `src/admin/deliveryLog.ts` — `emailuriRetrimisibile` filtrează pe `mod === 'admin'`; matricea `recunoaste`.

---

## Implementation Units

| U-ID | Titlu | Fișiere principale | Depinde de |
|---|---|---|---|
| U0 | Redeploy verificat al `send-email` | `supabase/functions/send-email/*` (deploy), `MIGRATIONS.md` | — |
| U1 | Migrarea: dezabonare pe persoană, audiența, șablonul | `supabase-migration-anunt-istoric.sql` | U0 |
| U2 | Modul `anunt` | `supabase/functions/send-email/index.ts` | U1 |
| U3 | Audiența „Toți de până acum" în admin | `src/admin/AdminEmailTab.tsx`, `src/lib/adminApi.ts`, `src/admin/AdminTemplatesTab.tsx` | U2 |
| U4 | Livrare și rejucare pentru `anunt` | `src/admin/deliveryLog.ts`, `src/lib/adminApi.ts`, `supabase-migration-anunt-rejucare.sql` | U1, U2 |

---

### U0. Redeploy verificat al `send-email`

- **Goal:** producția rulează `send-email` din `main`, verificat, înainte ca un mod nou să se adauge peste el.
- **Requirements:** precondiție pentru R5, R9.
- **Files:** niciun fișier de cod; `MIGRATIONS.md` (sau `ANTI-BOT.md`, unde e documentat deploy-ul funcțiilor) primește data și versiunea.
- **Approach:** deploy din `main` (`supabase functions deploy send-email --no-verify-jwt`), directorul întreg — `eventVars.ts` e dependență relativă. Imediat după: (1) o previzualizare dintr-un șablon în tabul „Șabloane", care trebuie să randeze; (2) verificarea în `email_log` a următoarei confirmări reale, cu `status = 'trimis'`. Dacă (2) pică, redeploy versiunea anterioară (`get_edge_function` o întoarce).
- **Test Scenarios:** niciunul automat — funcția nu e acoperită de suita vitest. Verificarea e manuală, pe producție, numită mai sus.
- **Verification:** `list_edge_functions` arată o versiune nouă; previzualizarea randează; prima confirmare după deploy e `trimis`.
- **Execution note:** e un deploy de producție pe o funcție de care depinde fiecare confirmare de înscriere. Nu-l face în fereastra unei înscrieri deschise fără să poți verifica imediat.

### U1. Migrarea: dezabonare pe persoană, audiența, șablonul

- **Goal:** baza de date știe cine primește anunțul și respectă dezabonarea pe persoană.
- **Requirements:** R1–R4, R6.
- **Files:** `supabase-migration-anunt-istoric.sql` (nou), `MIGRATIONS.md`.
- **Approach:** trei piese, într-o tranzacție.
  1. `create or replace function runlift.unsubscribe(p_token uuid)` cu aceeași semnătură și aceleași valori întoarse (`dezabonat` / `deja_dezabonat` / `invalid`). Găsește adresa tokenului în oricare tabel, apoi marchează `dezabonat_la = now()` pe TOATE rândurile cu `lower(btrim(email))` egal, în ambele tabele, doar unde e încă `null`. (KTD5)
  2. `runlift.anunt_recipients(p_exclude text[] default '{}')` după schița din High-Level Technical Design, `security definer`, `set search_path = ''`, cu `revoke execute ... from public, anon, authenticated` și `grant execute ... to service_role`. `p_exclude` se normalizează în funcție (`lower(btrim(x))`), nu se presupune normalizat. (KTD1, KTD4, KTD6)
  3. Șablonul `bulk_participant_anunt` în `email_templates`, `on conflict (cheie) do nothing`. Textul spune DE CE primește omul emailul („pentru că ai alergat cu noi la o ediție anterioară"), conține `{numele_cursei}`, `{data_cursei}`, `{locul}` și linkul `https://parktraining.fit/inscriere` scris literal.
- **Test Scenarios** (verificări SQL în capul fișierului, rulate după aplicare — funcțiile nu sunt acoperite de vitest):
  - Un om cu trei înscrieri pe trei ediții apare o singură dată, cu `ultima_editie` cea mai mare.
  - Adresa scrisă diferit (`Ana@X.ro` vs ` ana@x.ro`) e o singură persoană.
  - Un om înscris la ediția curentă nu apare.
  - Un om cu un singur rând dezabonat din trei nu apare.
  - Un om dezabonat doar din `launch_notifications` nu apare.
  - Un rând șters de admin nu aduce persoana în listă; unul eliberat prin `decline_spot` o aduce.
  - `p_exclude` cu majuscule scoate adresa.
  - `unsubscribe(token)` pe un rând al unui om cu trei înscrieri setează `dezabonat_la` pe toate trei și întoarce `dezabonat`; a doua oară întoarce `deja_dezabonat`.
  - `anunt_recipients` apelată ca `anon` eșuează cu `permission denied`.
- **Verification:** `select count(*) from runlift.anunt_recipients()` se compară cu interogarea de control fără funcție (distinct pe adresă, fără înscrișii ediției curente). Pe 17 septembrie 2026, cu ediția curentă 7 și un înscris, controlul dă **68**. Numărul se recalculează la aplicare și se notează în `MIGRATIONS.md` — crește cu fiecare ediție și scade cu fiecare înscriere la cea curentă.
- **Execution note:** migrarea rescrie `unsubscribe()`, folosită de linkul din fiecare reminder deja trimis. Rulează scenariul dezabonării pe un rând de test înainte de a considera migrarea aplicată.

### U2. Modul `anunt`

- **Goal:** `send-email` poate previzualiza și trimite anunțul, cu dezabonare, zăvor și jurnal.
- **Requirements:** R5, R7–R10.
- **Files:** `supabase/functions/send-email/index.ts`.
- **Approach:** un bloc `if (mode === "anunt")`, lângă `admin`.
  - Autentificare: `admin_check_token(payload.token)`, ca `admin`.
  - `exclude`: listă de stringuri, plafonată (ex. 500), altfel `400`.
  - **`dry_run: true`** → `anunt_recipients(exclude)` → întoarce `{ total, destinatari: [{email, nume, ultima_editie}] }`. Fără `token_unsub`. Nu scrie nimic.
  - **`test_to`** (email valid) → randare cu primul destinatar real ca model pentru variabile (sau `nume` = „Test" dacă lista e goală), trimis DOAR la `test_to`, fără zăvor, jurnal `mod: 'anunt_test'`. Subiectul primește prefixul `[TEST] `.
  - **trimitere** → cere `once_key`; `broadcast_once(once_key)` ca în `admin`; `anunt_recipients(exclude)`; `loadConfig()` o singură dată și `fillEventVars` pe subiect și text o singură dată (nu per destinatar, spre deosebire de `loadTemplate`); apoi per destinatar `fillVars` + `sendOne(..., unsubPage, unsubApi)` cu URL-urile construite ca în `broadcast`; pauză 250 ms; pe `429` o reîncercare după 1 s. (KTD2, KTD7)
  - Jurnal: `mod: 'anunt'`, `audienta: 'istoric'`, `sablon` din `payload.sablon` dacă e în listă închisă (`['bulk_participant_anunt']`), altfel `null`; `editie` = `current_event_edition` citită o dată. (KTD8)
  - Răspuns: `{ sent, failed, errors }`, ca `admin`.
- **Test Scenarios:** funcția nu e în suita vitest. Verificare manuală după deploy, în ordine:
  - `dry_run` fără token → `401`.
  - `dry_run` cu token → `total` egal cu `count(*)` din U1.
  - `test_to` la adresa operatorului → un email cu `[TEST]`, link de dezabonare vizibil, headerul `List-Unsubscribe` în „Show original".
  - trimitere cu același `once_key` de două ori → a doua întoarce `skipped: true`.
- **Verification:** deploy din `main` după merge; scenariile de mai sus; rândurile din `email_log` au `mod = 'anunt'` și `sablon` completat.
- **Execution note:** nu refactoriza bucla `broadcast` într-un helper comun în aceeași schimbare, deși e tentant — `broadcast` e calea reminderelor automate, încă neverificată în producție. Duplicarea se consolidează după ce amândouă au rulat.

### U3. Audiența „Toți de până acum" în admin

- **Goal:** operatorul pregătește, verifică și trimite anunțul din tabul „Emailuri".
- **Requirements:** R7, R8, R10.
- **Files:** `src/admin/AdminEmailTab.tsx`, `src/admin/emailAudience.ts`, `src/admin/sendLock.ts`, `src/lib/adminApi.ts`, `src/admin/AdminTemplatesTab.tsx`, `tests/unit/adminEmailTab.test.tsx`.
- **Approach:**
  - `adminApi.ts`: `previewAnunt(token, exclude)`, `trimiteTestAnunt(token, to, subject, text)`, `trimiteAnunt(token, subject, text, exclude, onceKey)` — toate spre `send-email` cu `mode: 'anunt'`.
  - `Audience` primește `'istoric'`. `recipientsFor` nu o tratează — audiența nu vine din sursele clientului; componenta ramifică înainte.
  - La selectarea audienței: cerere `previewAnunt`, apoi lista cu bife (toate bifate implicit). Debifarea adaugă în `exclude` și reîmprospătează numărul local; la „Trimite" `exclude` pleacă spre server, care recalculează. (KTD3, KTD4)
  - Șablonul implicit: `bulk_participant_anunt`, editabil în câmpurile existente de subiect și text.
  - „Trimite-mi un test": câmp de email pre-completat gol; buton activ doar pe email valid.
  - Butonul principal deschide confirmarea existentă, cu textul „Trimiți la **N** oameni care au alergat cu noi. Emailul pleacă acum și nu se poate retrage." N e numărul de după excluderi.
  - Zăvorul: `cheieDifuzare(editie, 'istoric', subiect)` — aceeași mecanică ca celelalte audiențe, inclusiv deblocarea „Trimite oricum".
  - `AdminTemplatesTab`: etichetă și descriere pentru `bulk_participant_anunt`, cu nota că `{link_renunt}` nu are sens aici (nimeni din audiență n-are loc la ediția nouă).
  - Stările: încărcare, eroare de previzualizare (mesaj + reîncercare), listă goală („Nimeni de anunțat — toți sunt deja înscriși sau dezabonați"), trimitere în curs (butoane blocate), rezultat (`sent`/`failed`, cu legătură spre „Livrare" la eșecuri).
- **Test Scenarios:**
  - Selectarea audienței cheamă `previewAnunt` o dată și afișează numărul întors.
  - Debifarea unei persoane scade numărul afișat cu 1 și o pune în `exclude` la trimitere.
  - Trimiterea cheamă `trimiteAnunt` cu `exclude` și cu cheia derivată din `'istoric'` + subiect.
  - O difuzare deja plecată pe aceeași cheie blochează butonul și cere deblocare explicită (paritate cu testele existente de zăvor).
  - Eroare la previzualizare → mesaj, fără buton de trimitere activ.
  - Listă goală → mesajul dedicat, buton inactiv.
  - „Trimite-mi un test" e inactiv pe email invalid și cheamă `trimiteTestAnunt` pe email valid.
  - Celelalte patru audiențe se comportă neschimbat (testele existente rămân verzi).
- **Verification:** `npm run test`, `typecheck`, `typecheck:tests`, `lint` (plafonul e la limită — zero avertismente noi), `deadcode`, `test:coverage`.

### U4. Livrare și rejucare pentru `anunt`

- **Goal:** un anunț eșuat la o persoană se vede și se rejoacă doar pentru ea.
- **Requirements:** R9.
- **Files:** `src/admin/deliveryLog.ts`, `src/lib/adminApi.ts` (tipul `mod`, `audienta`), `supabase-migration-anunt-rejucare.sql` (nou — extensia `admin_replay_lookup`; separat de U1 ca U1 să se poată aplica și verifica singur), `supabase/functions/send-email/index.ts` (ramura `replay`), `tests/unit/deliveryLog.test.ts`.
- **Approach:**
  - Tipurile: `AdminEmailLogEntry.mod` primește `'anunt' | 'anunt_test'`; `audienta` primește `'istoric'`.
  - `deliveryLog.ts`: eticheta pentru `anunt` în matricea de acoperire; `anunt_test` exclus din acoperire și din rejucare.
  - `admin_replay_lookup`: acceptă `mod = 'anunt'`; destinatarul se caută după adresă în `anunt_recipients('{}')` — dacă între timp s-a dezabonat sau s-a înscris la ediția curentă, întoarce `ok = false` cu motiv `nu_mai_e_in_audienta`, nu retrimite.
  - Ramura `replay` din `send-email` tratează `anunt` ca `broadcast`: șablonul din `sablon`, linkurile de dezabonare din tokenul întors.
- **Test Scenarios:**
  - Un rând `anunt` eșuat apare în lista de nelivrate cu eticheta corectă.
  - Un rând `anunt_test` nu apare nici în acoperire, nici în rejucare.
  - Motivul `nu_mai_e_in_audienta` produce mesajul tradus, nu unul generic.
- **Verification:** `npm run test -- deliveryLog`, plus o rejucare manuală pe un eșec provocat (adresă invalidă în test).

---

## Verification Contract

- `npm run test`, `typecheck`, `typecheck:tests`, `lint` (sub plafonul de 25), `deadcode`, `test:coverage`, `build` — toate verzi.
- Migrarea și funcția Edge se aplică manual; CI-ul nu le deployează.
- Ordinea de producție: U0 verificat → migrarea U1 → deploy `send-email` cu U2+U4 → merge frontend (U3, U4).
- Primul anunț real e precedat de un test trimis operatorului și de verificarea headerului `List-Unsubscribe`.

## Definition of Done

- [ ] `send-email` din producție e cel din `main`; o previzualizare și o confirmare reală au funcționat după redeploy.
- [ ] `unsubscribe()` marchează toate rândurile aceleiași adrese; verificat pe un rând de test.
- [ ] `anunt_recipients()` întoarce o persoană o singură dată, fără înscrișii ediției curente și fără dezabonați; numărul real e notat în `MIGRATIONS.md`.
- [ ] `anunt_recipients()` nu e apelabilă ca `anon`.
- [ ] Modul `anunt` previzualizează, trimite testul și trimite anunțul, cu dezabonare vizibilă și headere `List-Unsubscribe`.
- [ ] A doua trimitere pe aceeași cheie e oprită de zăvor.
- [ ] Tabul „Emailuri" are audiența „Toți de până acum" cu număr, listă, excluderi, test și confirmare.
- [ ] Rândurile `anunt` apar în „Livrare" și un eșec se rejoacă individual.
- [ ] Planul Resend a fost verificat față de numărul de destinatari.

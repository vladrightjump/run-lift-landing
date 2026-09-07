# MIGRATIONS.md — migrările bazei de date

Catalog al migrărilor care ating Run + Lift, cu granița clară față de aplicația vecină
(gym-app + botul de Telegram) care împarte același proiect Supabase.

Ultima actualizare: 7 septembrie 2026.

---

## Context: proiect Supabase PARTAJAT

Proiectul Supabase **`ironworks-gym`** (`whyndrjcezmtajbykeil`, eu-central-1) e folosit de
**două aplicații separate**, izolate pe **scheme**:

| Schema | Aplicație | Ce conține |
|---|---|---|
| `public` | **gym-app** (Vercel) + **bot Telegram** (Railway) | `members`, `payments`, `training_sessions`, `attendance`, `bot_config`, `bot_actions`, … |
| `runlift` | **run-lift-landing** (ACEST repo, Vercel) | `registrations`, `event_waitlist`, `launch_notifications`, `admin_*`, `email_templates`, `app_config`, … |

> **Regulă:** acest repo deține DOAR schema `runlift`. **Nu atinge schema `public`** — e a
> altei aplicații. Botul de Telegram NU face parte din run-lift-landing.

Rutarea către `runlift` se face prin headerele PostgREST `Accept-Profile` (GET) /
`Content-Profile` (scriere). Schema trebuie **expusă** în Supabase → Project Settings → API →
Exposed schemas (`public, graphql_public, runlift`).

---

## Migrări aplicate în proiect (istoric live)

Aplicate prin MCP `apply_migration` (tracked în istoricul Supabase). **Cele Run + Lift** au
prefix `runlift_`:

| Versiune | Nume | Schema | Ce face |
|---|---|---|---|
| 20260720091858 | `runlift_01_schema_tables` | runlift | Tabelele Run + Lift în schema nouă |
| 20260720092132 | `runlift_02_data_registrations` | runlift | Date: înscrieri |
| 20260720092315 | `runlift_03_data_registrations_backup` | runlift | Date: arhiva de înscrieri |
| 20260720092410 | `runlift_04_data_rest` | runlift | Date: restul (config, șabloane, admin) |
| 20260720092534 | `runlift_05_functions` | runlift | Funcțiile (`public_stats`, `confirm_signup`, `template_lookup`, `admin_*`, …) |
| 20260720092558 | `runlift_06_triggers_rls_grants` | runlift | Triggere, RLS, grants |
| 20260804113546 | `runlift_align_dynamic_event_edition` | runlift | Ediția curentă citită dinamic din `app_config` |
| 20260807… | `runlift_waitlist_autopromote` | runlift | Auto-promovare din waitlist la ștergerea unei înscrieri (trigger + `event_capacity` + email via pg_net). Vezi `supabase-migration-waitlist-autopromote.sql` |
| 2026…      | `runlift_registration_guards` | runlift | Cap capacitate + deadline pe `registrations` (trigger BEFORE INSERT → `event_full`/`registration_closed`), doar pt. formularul public; add/promote/auto-promote sar prin flag de bypass. `app_config.registration_deadline`. Vezi `supabase-migration-registration-guards.sql` |
| 2026…      | `runlift_admin_events_and_edit` | runlift | Tabel `admin_events` (audit) + logare în auto-promovare; RPC `admin_list_events` (feed backoffice) + `admin_update_registration` (editare in-place, păstrează `created_at`). Vezi `supabase-migration-admin-events-edit.sql` |
| 2026…      | `runlift_unsubscribe` | runlift | Dezabonare din emailurile în masă: `dezabonat_la` + `token_unsub` pe `registrations`/`launch_notifications`, RPC public `unsubscribe`, recipients (`edition2_recipients`/`waitlist_recipients`) exclud dezabonații + întorc `token_unsub`. Vezi `supabase-migration-unsubscribe.sql` |
| 2026…      | `runlift_reminder_idempotent` | runlift | Reminder pre-eveniment idempotent: `broadcast_once` + `maybe_send_reminder` (fereastră de timp, server-only) + chei `event_start`/`reminder_offset_hours`. Armarea cron: `supabase-cron-reminder-ARM.sql` (manual). Vezi `supabase-migration-reminder-idempotent.sql` |
| 20260827   | `runlift_event_config` | runlift | Configurarea ediției trece în DB: tabelul `event_config` (document `jsonb` per rând, stări `draft`/`published`/`superseded`, RLS fără politici), validarea `event_config_validate`, citirea publică `public_config()` și RPC-urile `admin_get_event_config` / `admin_save_event_config_draft` / `admin_publish_event_config` / `admin_restore_event_config`. Publicarea scrie în ACEEAȘI tranzacție cele cinci scalare din `app_config` citite de guard-uri — de aici încolo nu mai există desincronizare de aliniat manual. Vezi `supabase-migration-event-config.sql` |
| 20260827   | `runlift_event_config_seed_editia5` | runlift | Seed-ul ediției 5 transcris din `src/content/edition.ts`, ca rând `published`. NU trece prin publicare: verifică întâi că scalarele din `app_config` sunt deja de acord cu documentul și crapă la nepotrivire (`seed_drift`). |
| 20260827   | `runlift_server_assigned_edition` | runlift | Politica RLS de insert public pe `registrations` si `event_waitlist` cere `editie = current_event_edition()` - clientul nu-si mai alege editia. Vezi `supabase-migration-server-assigned-edition.sql` |
| 20260827   | `runlift_event_config_validate_duplicate_si_checkin` | runlift | `event_config_validate` respinge si o sectiune duplicata in `layout` (s-ar randa de doua ori) si un `checkinFrom` malformat - alinierea serverului la regulile formularului din admin. |
| 20260827   | `runlift_admin_get_event_config_vede_ciornele` | runlift | `admin_get_event_config` nu mai filtreaza pe editie: filtra pe cea curenta si astfel nu vedea ciorna editiei URMATOARE, care are alt numar. Ciorna disparea din UI si `?config=draft` cadea pe publicat. |
| 20260827   | `runlift_forteaza_editia_la_insert` + `runlift_forteaza_editia_respecta_bypass` | runlift | Trigger BEFORE INSERT care IMPUNE editia curenta pe inserarile publice (un tab vechi aterizeaza corect in loc sa fie respins). Respecta `runlift.guard_bypass`, altfel `admin_promote_waitlist` - care insereaza cu editia intrarii din waitlist, posibil arhivata - ar fi mutat oamenii in editia curenta. Vezi `supabase-migration-server-assigned-edition.sql` |
| 20260827   | `runlift_publish_upsert_toate_scalarele` | runlift | Publicarea/revenirea scriu toate cele cinci scalare prin UPSERT (`scrie_scalarele_editiei`), nu `update` pe doua dintre ele: un rand lipsa ar fi lasat publicarea sa raporteze succes fara sa schimbe nimic. |
| 20260827   | `runlift_event_config_validate_search_path` | runlift | `event_config_validate` primește `search_path` pinuit și apeluri `jsonb` calificate `pg_catalog`, ca restul funcțiilor din schemă. |
| 20260827   | `runlift_reels_si_coming_soon` | runlift | `event_config_validate` acceptă cheia opțională `reels` (banda de clipuri Instagram: plafon 12, cod `^[A-Za-z0-9_-]{5,32}$` pentru că ajunge în `src`-ul unui iframe, `kind` din `(reel,p)`, fără duplicate) și secțiunea `reels` în `layout`. Plus `admin_set_coming_soon(token, show, launch_at, next_edition_at)`: petice exact trei chei pe rândul `published`, revalidează, și scrie un rând NOU (vechiul trece pe `superseded`), deci rămâne reversibil din „Versiuni anterioare". NU atinge `app_config` — niciunul din cele cinci scalare nu derivă din cheile astea. Vezi `supabase-migration-reels-si-coming-soon.sql` |
| 20260904184209 | `runlift_remindere_si_renuntare` | runlift | **Remindere:** orarul devine `config.reminders` (listă în documentul de ediție, editabilă din /admin → „Eveniment"), validat de `event_config_validate` (plafon 5, avans întreg 1–720, fără avansuri duplicate, șablon din listă închisă) și copiat de `scrie_scalarele_editiei` în `app_config.reminder_schedule` — al ȘASELEA scalar. `maybe_send_reminder` parcurge orarul, cu cheie de idempotență per (ediție, avans) și fereastră de declanșare `[scadență, scadență + 2h]` în loc de `[start − avans, start]` întreagă; duce cheia șablonului în apelul de broadcast. Șablon nou `bulk_participant_reminder_final`. **Renunțare:** `token_renunt` + `renuntat_la` pe `registrations`, RPC public `decline_spot` (setează `deleted_at` → declanșează auto-promovarea existentă; refuză edițiile încheiate și cursele începute), jurnal `admin_events` cu tip `renuntare`. `edition2_recipients`, `admin_list_registrations` și `confirm_lookup` întorc `token_renunt` (pentru `{link_renunt}`). Șabloanele de reminder + promovare pierd „Check-in de la {ora_checkin}." și capătă linkul. Vezi `supabase-migration-remindere-si-renuntare.sql` |
| 20260825   | `runlift_soft_delete_registrations` | runlift | Ștergere logică pe `registrations` (`deleted_at`) + undo real (`admin_undelete_registration`, păstrează `id`/`created_at`) + gardă de capacitate pe `admin_add_registration` + jurnal de scrieri în `admin_events` (feed neplafonat). Indexul de unicitate devine PARȚIAL (`where deleted_at is null`), auto-promovarea trece de pe `AFTER DELETE` pe `AFTER UPDATE OF deleted_at`, iar `registrations_backup_sync` propagă `deleted_at` și pe ramura UPDATE. Vezi `supabase-migration-soft-delete-registrations.sql` |
| 20260907033347 | `runlift_undo_waitlist` | runlift | Ștergere logică pe `event_waitlist` (`deleted_at`) + `admin_undelete_waitlist` (reversare, păstrează `created_at` și poziția FIFO). Indexul de unicitate devine PARȚIAL. **`event_waitlist_cap()` numără doar rândurile active** — altfel cele șterse ar fi ocupat în continuare plafonul de 10, tăcut. Toți cei opt cititori ai tabelului sunt actualizați sau notați explicit ca neschimbați. Vezi `supabase-migration-undo-waitlist.sql` |
| 20260907033437 | `runlift_rejucare` | runlift | `email_log.sablon` (fără el, rejucarea unei difuzări ar ghici între două șabloane ale aceleiași audiențe) + `admin_replay_lookup`, care spune ce mod / ce șablon / ce destinatar, sau de ce nu se poate. Destinatarul se rezolvă din starea de ACUM: `participanti` din `registrations`, **`asteptare` din `launch_notifications`** (acolo își ia destinatarii `waitlist_recipients()`). `admin_list_email_log` duce coloana mai departe. Vezi `supabase-migration-rejucare.sql` |
| 20260907033532 | `runlift_escaladare` | runlift | `operator_email()` + `escaladeaza()` (dedup prin `broadcast_once`, tot corpul într-un bloc cu `exception` ca alerta să nu poată anula tranzacția care a chemat-o, ambele revocate de la `anon`/`authenticated`), escaladare din triggerul de auto-promovare, și trigger nou `registrations_locuri_epuizate_trg`. Cere precondiția `runlift_undo_waitlist`. **Inert până se scrie `app_config.operator_email`.** Vezi `supabase-migration-escaladare.sql` |

**Migrări ale altei aplicații** (schema `public`, gym-app + bot — **hands-off**):
`ironworks_initial_schema`, `monthly_summary_security_invoker`, `telegram_bot_phase1_attendance`,
`bot_config_singleton`, `member_attendance_stats_view`, `bot_actions_queue`, `member_is_admin_v2`,
`bot_actions_add_send_poll`, `bot_config_poll_details`, `merge_members_function`,
`stats_view_add_username`, `bot_actions_add_send_summary`, `attendance_log_and_reminder`,
`auto_reminder_config`, `bot_actions_payload_send_message`.

---

## Fișiere SQL „libere" din repo (istorice)

Fișiere `.sql` din rădăcină — artefacte istorice. **NU** le mutăm într-un `supabase/migrations/`
local (repo-ul nu deține ciclul DB-ului partajat). Unele au fost scrise pentru proiectul
**VECHI** `iattqvakxcgepjiecgpf` (abandonat):

| Fișier | Proiect țintă | Ce face | Stare |
|---|---|---|---|
| `supabase-migration-hyrox.sql` | vechi (`iattq…`) | Ediția 2: coloana `editie` + `data_nasterii` | istoric |
| `supabase-migration-email.sql` | vechi (`iattq…`) | RPC `confirm_lookup` pt. emailul de confirmare | istoric |
| `supabase-roteste-secretul.sql` | vechi (`iattq…`) | Rotirea secretului de broadcast (fix securitate) | istoric |
| `supabase-migration-bulk-templates.sql` | **runlift** (curent) | Seed șabloane email + `event_badge` (ediția curentă) | activ ca seed |

Doar ultimul reflectă schema `runlift` curentă și e menținut la zi (seed pentru start curat de
ediție); restul sunt păstrate ca referință.

### `supabase-cron-reminder-ARM.sql` — NEAPLICAT

**`pg_cron` nu e instalat în proiect** (`pg_available_extensions` → `installed_version: null`;
`cron.job` nu există). Verificat pe 4 septembrie 2026, cu ocazia migrării
`runlift_remindere_si_renuntare`.

Consecința, care nu se vede de nicăieri altundeva: **`maybe_send_reminder()` n-a rulat
niciodată**, la nicio ediție. Funcția există din `runlift_reminder_idempotent` (7 august), dar
nimic n-o cheamă — nu există nicio cheie `once_reminder_*` în `app_config`, deci nici un
reminder automat n-a plecat vreodată. Reminderele trimise până acum au fost difuzări MANUALE
din `/admin` → „Emailuri".

Orarul din `/admin` → Eveniment → Remindere e deci configurat, dar inert, până când cineva
rulează fișierul de armare (o singură dată pe proiect). `pg_net` **e** instalat (0.20.3), deci
auto-promovarea de pe lista de așteptare — care merge tot prin `net.http_post` — chiar
funcționează; doar cron-ul lipsește.

### `supabase-migration-undo-waitlist.sql` — APLICAT 7 septembrie 2026

Ștergere logică pe `event_waitlist` + `admin_undelete_waitlist`, cu paritate față de
`runlift_soft_delete_registrations`. Aplicat pe 7 septembrie 2026 ca `runlift_undo_waitlist` (`20260907033347`).

Ce atinge, cu enumerarea completă a cititorilor — un cititor uitat nu dă eroare, dă un rezultat
greșit în tăcere:

- `deleted_at` + index parțial pe `(lower(email), editie)`, ca re-înscrierea aceleiași adrese să
  nu pice pe un rând pe care nimeni nu-l mai vede;
- **`event_waitlist_cap()`** — plafonul de 10 număra TOATE rândurile ediției. Fără corecție,
  rândurile șterse ar fi continuat să ocupe plafonul: lista ar fi arătat 7 oameni în backoffice
  și ar fi respins al optulea cu `waitlist_full`. Plafonul se extrage în `runlift.waitlist_cap()`,
  citit acum din două locuri;
- `admin_delete_waitlist` (devine logică, cu jurnal), `admin_undelete_waitlist` (nou, reversare
  cu gărzi `waitlist_full` / `duplicate_email` / `not_found`);
- cititorii care trebuie să ignore rândurile retrase: `admin_list_waitlist`,
  `admin_promote_waitlist`, `auto_promote_from_waitlist`, `public_stats`, `admin_list_editions`.

Ce **nu** se schimbă, notat ca să nu pară scăpat: `admin_create_edition` (`max(editie)` trebuie
să vadă și rândurile șterse) și ștergerea FIZICĂ a rândului la promovare — manuală sau automată.
Un soft-delete acolo ar face `admin_undelete_waitlist` să readucă pe listă pe cineva deja înscris;
așa, undo-ul pe un rând promovat între timp întoarce `not_found`, iar backoffice-ul spune unde e
persoana.

### `supabase-migration-rejucare.sql` — APLICAT 7 septembrie 2026

Rejucarea unei trimiteri eșuate prin fluxul modului ei. Aplicat pe 7 septembrie 2026 ca
`runlift_rejucare` (`20260907033437`). Funcția Edge — modul `replay`, care depinde de RPC-ul de
aici — **încă nu e deployată**: `supabase functions deploy send-email --no-verify-jwt`.

- **`email_log.sablon`** — coloană nouă. Fără ea, rejucarea unui `broadcast` ar trebui să ghicească
  șablonul din audiență, iar orarul de remindere are DOUĂ șabloane pentru aceeași audiență
  (`bulk_participant_reminder` și `…_final`). Ghicitul ar retrimite tăcut alt text decât cel eșuat.
  Rândurile vechi rămân cu `null`, iar ecranul spune de ce nu se pot rejuca.
- `log_emails` și `admin_list_email_log` duc coloana mai departe.
- **`admin_replay_lookup(token, log_id)`** — răspunde la „ce mod, ce șablon, ce destinatar, sau de
  ce nu se poate". Nu trimite nimic: decizia stă într-un singur loc, ca ecranul și funcția Edge să
  dea același verdict. Destinatarul se rezolvă din starea de ACUM, deci filtrul de dezabonare al
  difuzării se aplică și la rejucare — exact ce sărea retrimiterea oarbă prin modul `admin`.
  Atenție la audiențe: `participanti` se rezolvă din `registrations` (`lower(email)` + `editie`),
  dar **`asteptare` se rezolvă din `launch_notifications`**, nu din `event_waitlist` — acolo își ia
  destinatarii `waitlist_recipients()`, iar tabelul „de așteptare" al ediției e o populație
  complet diferită.

`info` rămâne exclus deliberat: cooldown-ul de 10 minute și `mark_confirmation_sent` fac din
rejucare o cerere nouă, nu o reparație.

### `supabase-migration-escaladare.sql` — APLICAT 7 septembrie 2026

Anomaliile de flux ajung la operator fără să treacă printr-un login. Aplicat pe 7 septembrie 2026
ca `runlift_escaladare` (`20260907033532`), DUPĂ celelalte două — precondiția din capul fișierului
o impune. Funcția Edge — modul `alert` — **încă nu e deployată**:
`supabase functions deploy send-email --no-verify-jwt`.

**Cere un pas manual în plus.** Cheia `operator_email` din `app_config` NU e scrisă de migrare:

```sql
insert into runlift.app_config (key, value)
values ('operator_email', 'adresa@exemplu.ro')
on conflict (key) do update set value = excluded.value;
```

Până atunci `escaladeaza()` nu face nimic — deliberat. O migrare care ar inventa o adresă ar
trimite alerte către nimeni, cu aerul că sistemul e armat.

Cele trei anomalii, toate de server (o eroare de JS de client sau o violare de CSP **nu** produc
niciun email — `monitoring.ts` rămâne neatins):

- **confirmare / promovare eșuată** — din funcția Edge, unde eșuează. Confirmarea e
  „fire-and-forget" din client, deci un eșec e azi invizibil pentru toată lumea;
- **promovare automată** — din trigger, într-un apel `pg_net` PROPRIU, separat de cel care duce
  emailul către persoană. Dacă acela pică, exact atunci contează cel mai mult ca operatorul să
  afle; o escaladare atârnată de același apel ar tăcea fix în cazul pe care există ca să-l prindă;
- **locuri epuizate** — trigger `AFTER INSERT` pe `registrations`. Din cele două praguri posibile
  s-a ales momentul UMPLERII, nu prima intrare pe lista de așteptare: e momentul în care operatorul
  mai poate face ceva (deschide locuri), și cade înainte ca cineva să fie întors.

Garda de deduplicare pe `(ediție, tip, cheie)` refolosește `broadcast_once` — fără ea, o funcție
care eșuează în buclă ar trimite un email la fiecare încercare și l-ar antrena pe operator să
ignore canalul. Cheia se consumă la apel, nu la trimitere, deci **toate** gărzile (adresă, secret)
stau înaintea ei; altfel o anomalie și-ar arde cheia fără să escaladeze și n-ar mai putea escalada
niciodată. `escaladeaza()` și `operator_email()` sunt amândouă revocate de la `anon`/`authenticated`
și acordate explicit lui `service_role`.

Întregul corp al lui `escaladeaza()` stă într-un bloc cu `exception`, nu doar apelul HTTP: ambele
apelante sunt triggere, deci o eroare din canalul de alertare ar urca prin trigger și ar anula
tranzacția declanșatoare — o înscriere reală respinsă fiindcă n-a mers alerta despre ea.

**Ordinea e obligatorie.** Fișierul începe cu o precondiție care crapă dacă
`supabase-migration-undo-waitlist.sql` n-a rulat: `auto_promote_from_waitlist()` citește
`event_waitlist.deleted_at`, iar Postgres nu verifică corpul unei funcții plpgsql la creare — în
ordine greșită migrarea ar trece tăcut și ar exploda abia la prima renunțare reală, în tranzacția
participantului.

**Rămâne descoperit:** o promovare automată al cărei apel `pg_net` de escaladare pică el însuși.
Prinderea ei cere o reconciliere periodică (`admin_events` vs. `email_log`), deci un ceas — adică
U1 din plan.

---

## Runbook: cum adaug o migrare nouă (runlift)

1. Scrie SQL-ul (DDL) și aplică-l prin MCP `apply_migration`, cu **nume prefixat `runlift_`**
   (ex. `runlift_07_add_column_x`). Toate obiectele în schema `runlift`.
2. **Nu atinge schema `public`** (gym-app / bot Telegram).
3. Adaugă un rând în tabelul de mai sus (versiune, nume, ce face).
4. Dacă schimbi tabele expuse: verifică RLS + grants pentru rolul `anon` (insert public) și
   rulează `get_advisors` (security) după DDL.

## Legătura cu ediția

Sursa de adevăr a ediției e rândul `published` din `runlift.event_config`, editabil din
`/admin` → tabul „Eveniment". Publicarea (`admin_publish_event_config`) scrie în ACEEAȘI
tranzacție cele **șase** valori din `app_config` pe care le citesc guard-urile și cron-ul
(`current_event_edition`, `current_launch_edition`, `event_capacity`, `registration_deadline`,
`event_start`, `reminder_schedule`) — deci nu mai există drift de aliniat manual, iar
`sync-edition` a fost șters.

`src/content/edition.ts` a rămas instantaneul de build (primul cadru + meta de share). Un test
opt-in (`npm run test:integration`) verifică relația care poate încă să se rupă: scalarele din
`app_config` trebuie să urmeze documentul publicat.

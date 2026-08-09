# MIGRATIONS.md — migrările bazei de date

Catalog al migrărilor care ating Run + Lift, cu granița clară față de aplicația vecină
(gym-app + botul de Telegram) care împarte același proiect Supabase.

Ultima actualizare: 4 august 2026.

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

---

## Runbook: cum adaug o migrare nouă (runlift)

1. Scrie SQL-ul (DDL) și aplică-l prin MCP `apply_migration`, cu **nume prefixat `runlift_`**
   (ex. `runlift_07_add_column_x`). Toate obiectele în schema `runlift`.
2. **Nu atinge schema `public`** (gym-app / bot Telegram).
3. Adaugă un rând în tabelul de mai sus (versiune, nume, ce face).
4. Dacă schimbi tabele expuse: verifică RLS + grants pentru rolul `anon` (insert public) și
   rulează `get_advisors` (security) după DDL.

## Legătura cu ediția

Numerele de ediție trăiesc în `app_config` (`current_event_edition`, `current_launch_edition`)
și trebuie să urmeze `src/content/edition.ts`. Rulează `npm run sync-edition` ca să obții
SQL-ul de aliniere. Un test opt-in (`npm run test:integration`) pică dacă apare drift.

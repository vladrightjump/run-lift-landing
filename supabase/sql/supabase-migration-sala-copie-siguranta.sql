-- Copia de siguranță a tabelelor grupului de antrenament, înainte de orice
-- schimbare (planul `docs/plans/2026-10-03-1107-feat-botul-si-prezentele-in-admin-plan.md`,
-- U1, R19, KTD10).
--
-- Aplicată prin MCP `apply_migration` ca `sala_01_copie_siguranta`.
--
-- O schemă SEPARATĂ, nu tabele `*_backup` lângă originale: `public` e expusă prin
-- API (PostgREST), iar o copie pusă acolo ar fi încă o suprafață de citit. Schema
-- nouă nu apare în „Exposed schemas”, deci cheia publică nu ajunge la ea, iar
-- drepturile se revocă oricum explicit, ca a doua barieră.
--
-- `create table … as table …` copiază doar rândurile, fără constrângeri, chei
-- externe sau triggere — exact ce trebuie unei copii: nimic din ea nu reacționează
-- la nimic și nimic nu o leagă de originale.
--
-- Numărul de rânduri în clipa copierii (3 octombrie 2026), ca referință pentru
-- criteriul „niciun tabel nu are mai puține rânduri decât în copie”: vezi
-- `MIGRATIONS.md`, rândul migrării.
--
-- ÎNTOARCERE: `drop schema sala_copie_20261003 cascade;` — numai după oprirea
-- gym-app și verificarea numărului de rânduri (U11).

create schema sala_copie_20261003;
revoke all on schema sala_copie_20261003 from public, anon, authenticated;

create table sala_copie_20261003.members as table public.members;
create table sala_copie_20261003.payments as table public.payments;
create table sala_copie_20261003.training_sessions as table public.training_sessions;
create table sala_copie_20261003.attendance as table public.attendance;
create table sala_copie_20261003.attendance_log as table public.attendance_log;
create table sala_copie_20261003.bot_config as table public.bot_config;
create table sala_copie_20261003.bot_actions as table public.bot_actions;
create table sala_copie_20261003.telegram_unmatched as table public.telegram_unmatched;

revoke all on all tables in schema sala_copie_20261003 from public, anon, authenticated;

comment on schema sala_copie_20261003 is
  'Copia de siguranta a tabelelor grupului de antrenament din public, 3 oct 2026, inainte de mutarea in adminul Run + Lift. Neexpusa prin API. Se sterge dupa U11.';

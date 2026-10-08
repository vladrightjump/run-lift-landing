-- Regenerează `supabase/schema/sala.sql` — instantaneul tabelelor grupului de
-- antrenament din schema `public` (fostul gym-app + botul de Telegram).
--
-- Fratele lui `scripts/schema-snapshot.sql`, care face același lucru pentru
-- `runlift`. Separat, fiindcă aici nu se ia o schemă întreagă: `public` e
-- schema implicită a proiectului și conține și altceva decât grupul. Lista de
-- mai jos e exact ce deține repo-ul din `public`.
--
-- CÂND: după fiecare migrare care atinge tabelele grupului.
-- CUM: rulează interogarea (MCP `execute_sql` sau SQL Editor) și scrie coloana
-- `ddl` peste `supabase/schema/sala.sql`, sub antetul existent.
--
-- Ordinea din ieșire e cea în care se poate REÎNCĂRCA: tabelele, apoi cheile
-- primare și unice, apoi cele externe, vederile (citesc tabelele), funcțiile,
-- triggerele (cheamă funcțiile) și drepturile. Stub-ul pentru `auth.users`
-- (referit de `payments.recorded_by`) NU e aici — îl pune `tests/unit/sql/db.ts`,
-- fiindcă ține de Supabase Auth.

with obiecte as (
  select unnest(array[
    'members', 'payments', 'training_sessions', 'attendance', 'attendance_log',
    'bot_config', 'bot_actions', 'telegram_unmatched', 'telegram_group_memberships',
    'trial_config', 'trial_prospects', 'trial_bookings', 'trial_messages',
    'trial_questions', 'trial_invitations', 'trial_reply_drafts'
  ]) as nume
), vederi_grup as (
  select unnest(array['member_attendance_stats', 'monthly_summary', 'telegram_training_members', 'telegram_training_stats']) as nume
), functii_grup as (
  select unnest(array['merge_members', 'record_telegram_membership', 'telegram_membership_candidates', 'telegram_membership_retry', 'queue_telegram_kick']) as nume
  union select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and left(p.proname,6)='trial_'
), coloane as (
  select c.relname, string_agg('  ' || quote_ident(a.attname) || ' ' || format_type(a.atttypid, a.atttypmod)
       || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')
       || case when a.attnotnull then ' not null' else '' end, E',\n' order by a.attnum) cols
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
   where n.nspname = 'public' and c.relkind = 'r' and c.relname in (select nume from obiecte)
   group by c.relname
), tabele as (
  select string_agg('create table public.' || quote_ident(relname) || E' (\n' || cols || E'\n);\n', E'\n' order by relname) t from coloane
), constrangeri as (
  select string_agg('alter table public.' || quote_ident(c.relname) || ' add constraint ' || quote_ident(con.conname)
       || ' ' || pg_get_constraintdef(con.oid) || E';\n', ''
       order by case when con.contype in ('p', 'u') then 0 else 1 end, c.relname, con.conname) t
    from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in (select nume from obiecte)
), indexuri as (
  select coalesce(string_agg(pg_get_indexdef(i.indexrelid) || E';\n', '' order by i.indexrelid::regclass::text), '') t
    from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname in (select nume from obiecte)
     and not exists (select 1 from pg_constraint con where con.conindid = i.indexrelid)
), vederi as (
  select string_agg('create view public.' || quote_ident(c.relname)
       || coalesce(' with (' || array_to_string(c.reloptions, ', ') || ')', '')
       || E' as\n' || pg_get_viewdef(c.oid, true) || E'\n', E'\n' order by c.relname) t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v' and c.relname in (select nume from vederi_grup)
), functii as (
  select string_agg(pg_get_functiondef(p.oid) || E';\n', E'\n' order by p.proname) t
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (select nume from functii_grup)
), triggere as (
  -- Azi (3 octombrie 2026) tabelele grupului n-au niciun trigger, deci partea asta
  -- iese goală. Un trigger adăugat de gym-app sau de bot intră de la sine în
  -- instantaneu; dacă funcția lui nu e în `functii_grup`, încărcarea în PGlite
  -- pică zgomotos, nu trece pe lângă teste.
  select coalesce(string_agg(pg_get_triggerdef(t.oid) || E';\n', '' order by t.tgname), '') t
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not t.tgisinternal and c.relname in (select nume from obiecte)
), roluri as (select unnest(array['anon', 'authenticated', 'service_role']) r
), drepturi_functii as (
  select string_agg(
    'revoke all on function public.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ') from public, anon, authenticated, service_role;' ||
    coalesce((select string_agg(E'\ngrant execute on function public.' || quote_ident(p.proname) || '(' || pg_get_function_identity_arguments(p.oid) || ') to ' || r || ';', '')
       from roluri where has_function_privilege(r, p.oid, 'execute')), ''), E'\n' order by p.proname) t
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (select nume from functii_grup)
), drepturi_relatii as (
  select string_agg(
    'revoke all on table public.' || quote_ident(c.relname) || ' from public, anon, authenticated, service_role;' ||
    coalesce((select string_agg(E'\ngrant ' || pr || ' on table public.' || quote_ident(c.relname) || ' to ' || r || ';', '')
      from roluri, unnest(array['select', 'insert', 'update', 'delete']) pr
      where has_table_privilege(r, c.oid, pr)), '') ||
    case when c.relrowsecurity then E'\nalter table public.' || quote_ident(c.relname) || ' enable row level security;' else '' end,
    E'\n' order by c.relname) t
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v')
     and c.relname in (select nume from obiecte union all select nume from vederi_grup)
), politici as (
  select coalesce(string_agg('create policy ' || quote_ident(p.policyname) || ' on public.' || quote_ident(p.tablename)
    || ' as ' || p.permissive || ' for ' || p.cmd || ' to ' || array_to_string(p.roles, ', ')
    || coalesce(' using (' || p.qual || ')', '') || coalesce(' with check (' || p.with_check || ')', '') || ';', E'\n'
    order by p.tablename, p.policyname), '') t
  from pg_policies p where p.schemaname = 'public' and p.tablename in (select nume from obiecte)
)
select (select t from tabele) || E'\n' || (select t from constrangeri) || E'\n' || (select t from indexuri)
    || E'\n' || (select t from vederi) || E'\n' || (select t from functii) || (select t from triggere)
    || E'\n' || (select t from drepturi_functii) || E'\n\n' || (select t from drepturi_relatii)
    || E'\n\n' || (select t from politici) || E'\n' as ddl;

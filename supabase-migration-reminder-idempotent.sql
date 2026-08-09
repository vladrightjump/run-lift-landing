-- Faza C.1 — Reminder pre-eveniment idempotent (mecanismul; armarea cron-ului e separată).
--
-- Context: reminderul înainte de eveniment era broadcast MANUAL (buton/curl), fără protecție
-- anti-dublură (puteai trimite de 2 ori). Aici adăugăm:
--  1. `broadcast_once(key)` — flag atomic în app_config: `true` prima dată, `false` după.
--  2. `maybe_send_reminder()` — trimite broadcast-ul o SINGURĂ dată, doar în fereastra
--     [event_start - reminder_offset_hours, event_start]. Sigură chiar dacă e chemată des
--     (cron la 15 min): în afara ferestrei nu face nimic; în fereastră trimite o dată.
--  3. Cheile `event_start` + `reminder_offset_hours` în app_config (urmează EDITION prin sync-edition).
--
-- IMPORTANT: această migrare NU trimite nimic și NU programează nimic. Armarea efectivă
-- (cron.schedule) e într-un fișier separat (`supabase-cron-reminder-ARM.sql`) și se rulează
-- manual, când decizi ora + mesajul. `maybe_send_reminder` e server-only (revocat de la anon).
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.

-- 1. Chei noi în app_config (valori pentru ediția curentă = 4).
insert into runlift.app_config (key, value) values ('event_start', '2026-08-08T06:30:00+03:00')
  on conflict (key) do update set value = excluded.value;
insert into runlift.app_config (key, value) values ('reminder_offset_hours', '24')
  on conflict (key) do nothing;

-- 2. Flag idempotent (atomic prin unique key). Namespace `once_` ca să nu se ciocnească.
create or replace function runlift.broadcast_once(p_key text)
returns boolean
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare v_inserted int;
begin
  insert into app_config (key, value) values ('once_' || p_key, now()::text)
    on conflict (key) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;  -- true = prima dată → trimite; false = deja trimis
end;
$$;

-- 3. Reminder cu fereastră de timp + idempotență. Server-only (o cheamă cron-ul).
create or replace function runlift.maybe_send_reminder()
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare
  v_start  timestamptz;
  v_offset int;
  v_ed     smallint := current_event_edition();
  v_secret text;
  v_first  boolean;
begin
  select value::timestamptz into v_start from app_config where key = 'event_start';
  if v_start is null then return; end if;
  select coalesce((select value::int from app_config where key = 'reminder_offset_hours'), 24)
    into v_offset;

  -- Doar în fereastra [start - offset, start]. În afara ei: nimic.
  if now() < v_start - make_interval(hours => v_offset) or now() > v_start then
    return;
  end if;

  -- O singură dată per ediție.
  select broadcast_once('reminder_editie_' || v_ed) into v_first;
  if not v_first then return; end if;

  select broadcast_secret() into v_secret;
  perform net.http_post(
    url := 'https://whyndrjcezmtajbykeil.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('mode', 'broadcast', 'audience', 'participanti', 'secret', v_secret)
  );
end;
$$;

-- Securitate: aceste funcții rulează cu drepturi de definer (citesc secretul, pot trimite).
-- NU trebuie apelabile de publicul anon/authenticated — doar de cron (owner) / service_role.
-- ATENȚIE: Supabase acordă execute DIRECT la anon/authenticated (default privileges), deci
-- `revoke ... from public` nu e suficient — revocăm explicit de la anon și authenticated.
revoke execute on function runlift.maybe_send_reminder() from public, anon, authenticated;
revoke execute on function runlift.broadcast_once(text) from public, anon, authenticated;
grant execute on function runlift.broadcast_once(text) to service_role;

-- A doua rundă de corecturi din review-ul ramurii
-- `feat/botul-si-prezentele-in-admin`, peste `sala_02` și `sala_03` (planul
-- `docs/plans/2026-10-03-1107-feat-botul-si-prezentele-in-admin-plan.md`).
--
-- Aplicată prin MCP `apply_migration` ca `sala_04_mai_putine_date`.
--
-- Doar `create or replace` pe funcții existente, fără schimbare de semnătură,
-- fără coloane și fără drepturi noi.
--
--   1. `admin_sala_date` nu mai trimite telefonul și emailul membrilor. Niciun
--      ecran nu le arată; un token de admin furat nu mai scoate și datele de
--      contact ale grupului.
--   2. `admin_sala_porneste_bot` creează rândul de setări dacă lipsește: un
--      `update` pe un rând inexistent nu schimba nimic, dar ecranul spunea
--      „Botul e oprit".
--   3. `admin_sala_salveaza_config` taie orice spațiu alb din jurul textelor
--      (tab-uri, rânduri noi), nu doar spațiile — ca verificarea din client.
--
-- ÎNLOCUITĂ PARȚIAL: `admin_sala_date` de aici e redefinită de
-- `supabase-migration-sala-scoateri.sql` (`sala_05`, adaugă `scoateri`). O nouă
-- rulare după `sala_05` scoate cheia, iar ecranele „Membrii" și „Analiza" o cer.
-- Definiția live: `supabase/schema/runlift.sql`.
--
-- ÎNTOARCERE: corpurile funcțiilor 1–2 din
-- `supabase/sql/supabase-migration-sala-functii-admin.sql` și 3 din
-- `supabase/sql/supabase-migration-sala-corecturi.sql`.

create or replace function runlift.admin_sala_date(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'runlift'
as $function$
declare
  v_de_la date := sala_azi() - 800;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  return jsonb_build_object(
    'azi', sala_azi(),
    'config', (
      select to_jsonb(c) from public.bot_config c where c.id = 1
    ),
    'membri', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'full_name', m.full_name, 'status', m.status, 'is_admin', m.is_admin,
        'telegram_user_id', m.telegram_user_id, 'telegram_username', m.telegram_username,
        'bot_dm_enabled', m.bot_dm_enabled, 'join_date', m.join_date
      ) order by m.full_name)
      from public.members m
    ), '[]'::jsonb),
    'antrenamente', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'session_date', t.session_date, 'starts_at', to_char(t.starts_at, 'HH24:MI'),
        'location', t.location, 'status', t.status, 'poll_sent', t.poll_message_id is not null
      ) order by t.session_date desc)
      from public.training_sessions t where t.session_date >= v_de_la
    ), '[]'::jsonb),
    'raspunsuri', coalesce((
      select jsonb_agg(jsonb_build_object(
        'session_id', a.session_id, 'member_id', a.member_id, 'response', a.response,
        'is_first_training', a.is_first_training, 'responded_at', a.responded_at
      ) order by a.responded_at desc)
      from public.attendance a
      join public.training_sessions t on t.id = a.session_id
      where t.session_date >= v_de_la
    ), '[]'::jsonb),
    'necunoscuti', coalesce((
      select jsonb_agg(jsonb_build_object(
        'telegram_user_id', n.telegram_user_id, 'username', n.username,
        'first_name', n.first_name, 'last_name', n.last_name, 'created_at', n.created_at
      ) order by n.created_at desc)
      from public.telegram_unmatched n
    ), '[]'::jsonb),
    'comenzi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'action', b.action, 'member_id', b.member_id, 'status', b.status,
        'result', b.result, 'created_at', b.created_at, 'processed_at', b.processed_at
      ) order by b.created_at desc)
      from (select * from public.bot_actions order by created_at desc limit 30) b
    ), '[]'::jsonb)
  );
end;
$function$;

create or replace function runlift.admin_sala_porneste_bot(p_token uuid, p_pornit boolean)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_pornit is null then raise exception 'config_invalid'; end if;
  -- Fără rând de setări, un `update` n-ar schimba nimic, iar ecranul ar spune
  -- totuși „Botul e oprit". Rândul nou primește valorile implicite ale
  -- coloanelor — aceleași pe care botul le folosește când nu găsește rândul.
  insert into public.bot_config (id, enabled, updated_at) values (1, p_pornit, now())
  on conflict (id) do update set enabled = excluded.enabled, updated_at = excluded.updated_at;
  perform sala_jurnal(p_token, 'sala_pornire', jsonb_build_object('pornit', p_pornit));
end;
$function$;

create or replace function runlift.admin_sala_salveaza_config(p_token uuid, p_config jsonb)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_zile_sondaj smallint[];
  v_zile_rezumat smallint[];
  v_text text;
  v_cheie text;
  v_prag integer;
  -- `btrim` fără al doilea argument taie doar spațiile; clientul taie orice
  -- spațiu alb, deci un titlu din tab-uri ar fi ieșit „text propriu" gol.
  v_alb constant text := E' \t\r\n';
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'config_invalid'; end if;

  -- Zilele: 0 = duminică … 6 = sâmbătă, fără dubluri. O listă goală e voie
  -- (niciun sondaj programat, doar „trimite acum").
  foreach v_cheie in array array['poll_days', 'summary_days'] loop
    if jsonb_typeof(p_config -> v_cheie) is distinct from 'array'
       or exists (
         select 1 from jsonb_array_elements(p_config -> v_cheie) z
          where jsonb_typeof(z) <> 'number' or (z #>> '{}') !~ '^[0-6]$'
       )
       or (select count(*) from jsonb_array_elements(p_config -> v_cheie))
          <> (select count(distinct z) from jsonb_array_elements(p_config -> v_cheie) z)
    then
      raise exception 'zi_invalida';
    end if;
  end loop;
  select coalesce(array_agg((z #>> '{}')::smallint order by (z #>> '{}')::smallint), '{}')
    into v_zile_sondaj from jsonb_array_elements(p_config -> 'poll_days') z;
  select coalesce(array_agg((z #>> '{}')::smallint order by (z #>> '{}')::smallint), '{}')
    into v_zile_rezumat from jsonb_array_elements(p_config -> 'summary_days') z;

  foreach v_cheie in array array['poll_time', 'summary_time', 'training_time'] loop
    if coalesce(p_config ->> v_cheie, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'ora_invalida';
    end if;
  end loop;

  v_text := btrim(coalesce(p_config ->> 'location', ''), v_alb);
  if char_length(v_text) = 0 or char_length(v_text) > 120 then raise exception 'loc_invalid'; end if;

  if jsonb_typeof(p_config -> 'enabled') is distinct from 'boolean'
     or jsonb_typeof(p_config -> 'auto_reminder_enabled') is distinct from 'boolean'
  then
    raise exception 'config_invalid';
  end if;

  if jsonb_typeof(p_config -> 'reminder_threshold') is distinct from 'number'
     or (p_config ->> 'reminder_threshold') !~ '^[0-9]{1,3}$'
  then
    raise exception 'prag_invalid';
  end if;
  v_prag := (p_config ->> 'reminder_threshold')::integer;

  -- Textul sondajului: gol → null, adică textul de azi.
  if char_length(btrim(coalesce(p_config ->> 'poll_title', ''), v_alb)) > 80
     or char_length(btrim(coalesce(p_config ->> 'poll_yes_label', ''), v_alb)) > 32
     or char_length(btrim(coalesce(p_config ->> 'poll_no_label', ''), v_alb)) > 32
  then
    raise exception 'text_prea_lung';
  end if;

  -- `enabled` intră doar la prima scriere, când rândul nu există. După aceea îl
  -- schimbă numai comutatorul (`admin_sala_porneste_bot`): formularul poate
  -- purta o valoare veche, citită înainte ca cineva să oprească botul.
  insert into public.bot_config as c (
    id, enabled, poll_days, poll_time, summary_days, summary_time, training_time, location,
    auto_reminder_enabled, reminder_threshold, poll_title, poll_yes_label, poll_no_label, updated_at
  ) values (
    1,
    (p_config ->> 'enabled')::boolean,
    v_zile_sondaj,
    p_config ->> 'poll_time',
    v_zile_rezumat,
    p_config ->> 'summary_time',
    p_config ->> 'training_time',
    v_text,
    (p_config ->> 'auto_reminder_enabled')::boolean,
    v_prag,
    nullif(btrim(coalesce(p_config ->> 'poll_title', ''), v_alb), ''),
    nullif(btrim(coalesce(p_config ->> 'poll_yes_label', ''), v_alb), ''),
    nullif(btrim(coalesce(p_config ->> 'poll_no_label', ''), v_alb), ''),
    now()
  )
  on conflict (id) do update set
    poll_days = excluded.poll_days,
    poll_time = excluded.poll_time,
    summary_days = excluded.summary_days,
    summary_time = excluded.summary_time,
    training_time = excluded.training_time,
    location = excluded.location,
    auto_reminder_enabled = excluded.auto_reminder_enabled,
    reminder_threshold = excluded.reminder_threshold,
    poll_title = excluded.poll_title,
    poll_yes_label = excluded.poll_yes_label,
    poll_no_label = excluded.poll_no_label,
    updated_at = excluded.updated_at;

  perform sala_jurnal(p_token, 'sala_config', '{}'::jsonb);
end;
$function$;

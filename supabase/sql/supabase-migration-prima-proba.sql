begin;

alter table public.trial_config
  add column if not exists public_host text not null default '' check (length(public_host) <= 100),
  add column if not exists meeting_photo text not null default '' check (meeting_photo = '' or
    (length(meeting_photo) <= 240 and meeting_photo ~ '^/([a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]+[.](jpg|jpeg|webp|png)$')),
  add column if not exists photo_location text;

CREATE OR REPLACE FUNCTION runlift.admin_trial_config(p_token uuid, p_config jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare c public.trial_config; old_c public.trial_config;
begin
 if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
 insert into public.trial_config(id) values(1) on conflict do nothing;
 select * into c from public.trial_config where id=1 for update;
 old_c:=c;
 select * into c from jsonb_populate_record(c,p_config - 'id' - 'permissions_verified_at' - 'updated_at');
 if c.message_texts is null or jsonb_typeof(c.message_texts)<>'object' then raise exception 'invalid_trial_messages'; end if;
 if exists(select 1 from jsonb_each(c.message_texts) e where e.key <> all(array['self_cancelled','booking_confirmed','reminder','session_changed','organizer_booking','attendance_request','cancelled','organizer_cancelled','continuation','rebook','invite','question','answer','name_prompt','choose_session','no_sessions','awaiting_attendance','question_prompt','question_received','booking_received','continuation_yes','continuation_no']) or jsonb_typeof(e.value)<>'string' or length(trim(e.value #>> '{}'))=0 or length(e.value #>> '{}')>1500) then raise exception 'invalid_trial_messages'; end if;
 if c.bot_username is distinct from old_c.bot_username or c.organizer_telegram_id is distinct from old_c.organizer_telegram_id then c.permissions_verified_at:=null; end if;
 if greatest(length(c.welcome_text),length(c.trial_conditions),length(c.trial_price),length(c.bring_text),length(c.continuation_conditions),length(c.contact_text))>1500 then raise exception 'trial_config_text_too_long'; end if;
 if c.bot_username<>'' and c.bot_username !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then raise exception 'invalid_bot_username'; end if;
 if c.enabled and (length(trim(c.welcome_text))=0 or length(trim(c.trial_conditions))=0 or length(trim(c.trial_price))=0
 or length(trim(c.contact_text))=0 or length(trim(c.bring_text))=0 or length(trim(c.continuation_conditions))=0 or c.bot_username=''
 or c.duration_minutes not between 15 and 480 or c.permissions_verified_at is null
 or c.permissions_verified_at<now()-interval '24 hours'
 or not exists(select 1 from public.members where is_admin and telegram_user_id=c.organizer_telegram_id)) then raise exception 'trial_config_incomplete'; end if;
 update public.trial_config set public_host=c.public_host, meeting_photo=c.meeting_photo,
 photo_location=case when c.meeting_photo is distinct from old_c.meeting_photo then
   (select location from public.bot_config where id=1) else old_c.photo_location end,
 message_texts=c.message_texts,enabled=c.enabled,bot_username=c.bot_username,welcome_text=c.welcome_text,
 trial_conditions=c.trial_conditions,trial_price=c.trial_price,bring_text=c.bring_text,continuation_conditions=c.continuation_conditions,
 duration_minutes=c.duration_minutes,organizer_telegram_id=c.organizer_telegram_id,contact_text=c.contact_text,permissions_verified_at=c.permissions_verified_at,updated_at=now() where id=1;
 perform runlift.sala_jurnal(p_token,'trial_config',jsonb_build_object('enabled',c.enabled));
end $function$
;

-- Same 14 local dates and concrete-session precedence as trialSessions in the bot.
create or replace function runlift.public_trial_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  with eligible as (
    select c.*, c.enabled and coalesce(c.permissions_verified_at > now() - interval '24 hours', false) as ready
    from public.trial_config c where c.id = 1
  ), days as (
    select (now() at time zone 'Europe/Chisinau')::date + n as day from generate_series(0, 13) n
  ), schedule as (
    select (d.day + coalesce(s.starts_at, b.training_time::time)) at time zone 'Europe/Chisinau' as starts_at,
           coalesce(s.location, b.location) as location
    from days d cross join public.bot_config b
    left join public.training_sessions s on s.session_date = d.day
    where b.id = 1 and (s.status = 'scheduled' or
      (s.id is null and ((extract(dow from d.day)::int + 6) % 7) = any(b.poll_days)))
  )
  select jsonb_build_object('enabled', ready, 'bot_username', bot_username, 'contact_text', contact_text)
    || case when ready then jsonb_build_object(
      'public_host', public_host, 'bring_text', bring_text, 'trial_price', trial_price,
      'next_session', (select jsonb_build_object('starts_at', starts_at, 'location', location,
        'photo', case when location = photo_location then nullif(meeting_photo, '') end)
        from schedule where starts_at > now() order by starts_at limit 1))
      else '{}'::jsonb end
  from eligible;
$$;

commit;

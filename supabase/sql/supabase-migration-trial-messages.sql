-- Apply after supabase-migration-sala-probe.sql. Overrides affect future sends only.
alter table public.trial_config add column if not exists message_texts jsonb not null default '{}'::jsonb;

create or replace function runlift.admin_trial_config(p_token uuid,p_config jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c public.trial_config; old_c public.trial_config;
begin
 if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
 insert into public.trial_config(id) values(1) on conflict do nothing;
 select * into c from public.trial_config where id=1 for update;
 old_c:=c;
 select * into c from jsonb_populate_record(c,p_config - 'id' - 'permissions_verified_at' - 'updated_at');
 if c.message_texts is null or jsonb_typeof(c.message_texts)<>'object' then raise exception 'invalid_trial_messages'; end if;
 if exists(select 1 from jsonb_each(c.message_texts) e where e.key <> all(array['booking_confirmed','reminder','session_changed','organizer_booking','attendance_request','cancelled','organizer_cancelled','continuation','rebook','invite','question','answer','name_prompt','choose_session','no_sessions','awaiting_attendance','question_prompt','question_received','booking_received','continuation_yes','continuation_no']) or jsonb_typeof(e.value)<>'string' or length(trim(e.value #>> '{}'))=0 or length(e.value #>> '{}')>1500) then raise exception 'invalid_trial_messages'; end if;
 if c.bot_username is distinct from old_c.bot_username or c.organizer_telegram_id is distinct from old_c.organizer_telegram_id then c.permissions_verified_at:=null; end if;
 if greatest(length(c.welcome_text),length(c.trial_conditions),length(c.trial_price),length(c.bring_text),length(c.continuation_conditions),length(c.contact_text))>1500 then raise exception 'trial_config_text_too_long'; end if;
 if c.bot_username<>'' and c.bot_username !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then raise exception 'invalid_bot_username'; end if;
 if c.enabled and (length(trim(c.welcome_text))=0 or length(trim(c.trial_conditions))=0 or length(trim(c.trial_price))=0
 or length(trim(c.contact_text))=0 or length(trim(c.bring_text))=0 or length(trim(c.continuation_conditions))=0 or c.bot_username=''
 or c.duration_minutes not between 15 and 480 or c.permissions_verified_at is null
 or c.permissions_verified_at<now()-interval '24 hours'
 or not exists(select 1 from public.members where is_admin and telegram_user_id=c.organizer_telegram_id)) then raise exception 'trial_config_incomplete'; end if;
 update public.trial_config set message_texts=c.message_texts,enabled=c.enabled,bot_username=c.bot_username,welcome_text=c.welcome_text,
 trial_conditions=c.trial_conditions,trial_price=c.trial_price,bring_text=c.bring_text,continuation_conditions=c.continuation_conditions,
 duration_minutes=c.duration_minutes,organizer_telegram_id=c.organizer_telegram_id,contact_text=c.contact_text,permissions_verified_at=c.permissions_verified_at,updated_at=now() where id=1;
 perform runlift.sala_jurnal(p_token,'trial_config',jsonb_build_object('enabled',c.enabled));
end $$;


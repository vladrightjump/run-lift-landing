-- Review fixes; apply after supabase-migration-trial-messages.sql.
-- Keep old admin attendance calls fail-closed during rolling deployment.
create or replace function runlift.admin_trial_attendance(p_token uuid,p_booking uuid,p_attended boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
 raise exception 'trial_refresh_required';
end $$;
create or replace function runlift.admin_trial_attendance(p_token uuid,p_booking uuid,p_attended boolean,p_version integer,p_correction boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.trial_bookings; result jsonb;
begin
 if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
 select * into strict b from public.trial_bookings where id=p_booking for update;
 if p_version is null or b.version<>p_version or p_correction is distinct from (b.attendance_at is not null) then raise exception 'trial_stale_booking'; end if;
 result:=public.trial_set_attendance(p_booking,p_attended,'admin:'||(select user_id::text from runlift.admin_sessions where token=p_token),p_correction);
 perform runlift.sala_jurnal(p_token,'trial_attendance',jsonb_build_object('booking',p_booking,'attended',p_attended,'version',p_version,'correction',p_correction));
 return result;
end $$;
revoke all on function runlift.admin_trial_attendance(uuid,uuid,boolean,integer,boolean) from public;
grant execute on function runlift.admin_trial_attendance(uuid,uuid,boolean,integer,boolean) to anon,authenticated,service_role;

alter table public.trial_reply_drafts add column if not exists draft_id uuid not null default gen_random_uuid();
create or replace function public.trial_confirm_reply(p_actor bigint,p_draft uuid,p_send boolean) returns void
language plpgsql security definer set search_path='' as $$
declare d public.trial_reply_drafts;
begin
 if not exists(select 1 from public.members where is_admin and telegram_user_id=p_actor) then raise exception 'trial_unauthorized_organizer'; end if;
 select * into d from public.trial_reply_drafts where telegram_user_id=p_actor for update;
 if not found or d.draft_id is distinct from p_draft or d.expires_at<=now() or d.body is null or p_send is null then raise exception 'trial_stale_draft'; end if;
 if p_send then perform public.trial_queue_reply(d.question_id,d.body); end if;
 delete from public.trial_reply_drafts where telegram_user_id=p_actor and draft_id=p_draft;
end $$;
revoke all on function public.trial_confirm_reply(bigint,uuid,boolean) from public,anon,authenticated;
grant execute on function public.trial_confirm_reply(bigint,uuid,boolean) to service_role;

create or replace function public.trial_release_messages(p_claims jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.trial_messages m set status='pending',lease_until=null,attempts=greatest(0,m.attempts-1)
 from jsonb_to_recordset(p_claims) as c(id uuid,lease_until timestamptz)
 where m.id=c.id and m.status='processing' and m.lease_until=c.lease_until;
end $$;
revoke all on function public.trial_release_messages(jsonb) from public,anon,authenticated;
grant execute on function public.trial_release_messages(jsonb) to service_role;

create or replace function runlift.public_trial_config() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',enabled and coalesce(permissions_verified_at>now()-interval '24 hours',false),'bot_username',bot_username,'contact_text',contact_text) from public.trial_config where id=1
$$;
create or replace function public.trial_book(p_telegram_id bigint,p_date date,p_conditions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.trial_prospects; c public.trial_config; s public.training_sessions; b public.trial_bookings; bc public.bot_config; start_time timestamptz;
begin
 select * into strict c from public.trial_config where id=1;
 if not c.enabled then raise exception 'trial_disabled'; end if;
 if c.permissions_verified_at is null or c.permissions_verified_at<now()-interval '24 hours' then raise exception 'trial_permissions_unverified'; end if;
 select * into strict p from public.trial_prospects where telegram_user_id=p_telegram_id for update;
 if not p.dm_enabled or nullif(trim(p.full_name),'') is null then raise exception 'trial_name_required'; end if;
 if p_conditions is null or p_conditions='{}'::jsonb then raise exception 'conditions_required'; end if;
 if exists(select 1 from public.telegram_group_memberships where telegram_user_id=p_telegram_id and state in ('in_group','kicked')) then raise exception 'trial_membership_ineligible'; end if;
 select * into b from public.trial_bookings where prospect_id=p.id and status in ('scheduled','awaiting_attendance','attended');
 if found then
  if b.status='scheduled' and exists(select 1 from public.training_sessions where id=b.session_id and session_date=p_date and status='scheduled') then return to_jsonb(b); end if;
  raise exception 'trial_booking_exists';
 end if;
 if p_date is null or p_date<(now() at time zone 'Europe/Chisinau')::date or p_date>(now() at time zone 'Europe/Chisinau')::date+14 then raise exception 'trial_session_unavailable'; end if;
 select * into s from public.training_sessions where session_date=p_date for update;
 if not found then
  select * into strict bc from public.bot_config where id=1;
  if not ((extract(dow from p_date)::integer+6)%7=any(bc.poll_days)) then raise exception 'trial_session_unavailable'; end if;
  insert into public.training_sessions(session_date,starts_at,location) values(p_date,bc.training_time::time,bc.location) on conflict(session_date) do nothing;
  select * into strict s from public.training_sessions where session_date=p_date for update;
 end if;
 start_time:=(s.session_date+s.starts_at) at time zone 'Europe/Chisinau';
 if s.status<>'scheduled' or start_time<=now() then raise exception 'trial_session_unavailable'; end if;
 insert into public.trial_bookings(prospect_id,session_id,conditions_snapshot,session_start,session_location,duration_minutes)
 values(p.id,s.id,p_conditions,start_time,s.location,c.duration_minutes) returning * into b;
 update public.trial_prospects set stage='scheduled',conversation_step='booked',updated_at=now() where id=p.id;
 perform public.trial_enqueue(b.id,'booking_confirmed',p.telegram_user_id);
 perform public.trial_enqueue(b.id,'organizer_booking',c.organizer_telegram_id);
 if start_time-now()>interval '2 hours' then perform public.trial_enqueue(b.id,'reminder',p.telegram_user_id,start_time-interval '2 hours'); end if;
 perform public.trial_enqueue(b.id,'attendance_request',c.organizer_telegram_id,start_time+make_interval(mins=>c.duration_minutes));
 return to_jsonb(b);
end $$;
create or replace function public.trial_cancel(p_telegram_id bigint,p_booking uuid,p_version integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.trial_bookings; p public.trial_prospects; c public.trial_config;
begin
 select * into strict b from public.trial_bookings where id=p_booking for update;
 select * into strict p from public.trial_prospects where id=b.prospect_id;
 if p.telegram_user_id<>p_telegram_id then raise exception 'trial_wrong_person'; end if;
 if b.status='cancelled' then return to_jsonb(b); end if;
 if b.version<>p_version or b.status<>'scheduled' or b.session_start<=now() then raise exception 'trial_stale_booking'; end if;
 select * into strict c from public.trial_config where id=1;
 update public.trial_messages set status='cancelled',lease_until=null where booking_id=b.id and status in ('pending','processing');
 update public.trial_bookings set status='cancelled',version=version+1 where id=b.id returning * into b;
 update public.trial_prospects set stage='interested',conversation_step='choose_session',updated_at=now() where id=p.id;
 perform public.trial_enqueue(b.id,'self_cancelled',p.telegram_user_id);
 perform public.trial_enqueue(b.id,'organizer_cancelled',c.organizer_telegram_id);
 return to_jsonb(b);
end $$;
create or replace function runlift.admin_trial_config(p_token uuid,p_config jsonb) returns void language plpgsql security definer set search_path='' as $$
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
 update public.trial_config set message_texts=c.message_texts,enabled=c.enabled,bot_username=c.bot_username,welcome_text=c.welcome_text,
 trial_conditions=c.trial_conditions,trial_price=c.trial_price,bring_text=c.bring_text,continuation_conditions=c.continuation_conditions,
 duration_minutes=c.duration_minutes,organizer_telegram_id=c.organizer_telegram_id,contact_text=c.contact_text,permissions_verified_at=c.permissions_verified_at,updated_at=now() where id=1;
 perform runlift.sala_jurnal(p_token,'trial_config',jsonb_build_object('enabled',c.enabled));
end $$;


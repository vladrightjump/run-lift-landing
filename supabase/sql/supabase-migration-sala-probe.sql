-- Trial onboarding is isolated from paid/group membership. Disabled until configured.
begin;
create table if not exists public.trial_config (
 id smallint primary key default 1 check(id=1), enabled boolean not null default false,
 bot_username text not null default '', welcome_text text not null default '', trial_conditions text not null default '',
 trial_price text not null default '', bring_text text not null default '', continuation_conditions text not null default '',
 duration_minutes integer not null default 60 check(duration_minutes between 15 and 480),
 organizer_telegram_id bigint, contact_text text not null default '', permissions_verified_at timestamptz,
 updated_at timestamptz not null default now()
);
insert into public.trial_config(id) values(1) on conflict do nothing;
create table if not exists public.trial_prospects (
 id uuid primary key default gen_random_uuid(), telegram_user_id bigint not null unique,
 telegram_username text, full_name text, source text not null default 'direct', stage text not null default 'interested',
 conversation_step text not null default 'name', dm_enabled boolean not null default true,
 member_id uuid references public.members(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.trial_bookings (
 id uuid primary key default gen_random_uuid(), prospect_id uuid not null references public.trial_prospects(id),
 session_id uuid not null references public.training_sessions(id), status text not null default 'scheduled'
 check(status in ('scheduled','awaiting_attendance','attended','absent','cancelled','closed')),
 version integer not null default 1, conditions_snapshot jsonb not null, accepted_at timestamptz not null default now(),
 attendance_actor text, attendance_at timestamptz, continuation text check(continuation in ('yes','no')), continuation_at timestamptz,
 session_start timestamptz not null, session_location text not null, duration_minutes integer not null,
 created_at timestamptz not null default now()
);
create unique index if not exists trial_one_open_booking on public.trial_bookings(prospect_id)
 where status in ('scheduled','awaiting_attendance','attended');
create table if not exists public.trial_messages (
 id uuid primary key default gen_random_uuid(), prospect_id uuid not null references public.trial_prospects(id),
 booking_id uuid references public.trial_bookings(id), booking_version integer, kind text not null,
 recipient_telegram_id bigint not null, due_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','ambiguous','cancelled')),
 attempts integer not null default 0, lease_until timestamptz, payload jsonb not null default '{}', result text,
 dedupe_key text not null unique, created_at timestamptz not null default now()
);
create index if not exists trial_messages_due on public.trial_messages(due_at) where status='pending';
create table if not exists public.trial_questions (
 id uuid primary key default gen_random_uuid(), prospect_id uuid not null references public.trial_prospects(id),
 body text not null check(length(body) between 1 and 4000), response text,
 status text not null default 'open' check(status in ('open','queued','answered')),
 created_at timestamptz not null default now(), answered_at timestamptz
);
alter table public.trial_questions add column if not exists telegram_message_id bigint;
create unique index if not exists trial_question_message_unique on public.trial_questions(prospect_id,telegram_message_id);
create table if not exists public.trial_invitations (
 id uuid primary key default gen_random_uuid(), booking_id uuid not null references public.trial_bookings(id),
 telegram_user_id bigint not null, invite_link text not null unique, expires_at timestamptz not null, revoked_at timestamptz,
 created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['trial_config','trial_prospects','trial_bookings','trial_messages','trial_questions','trial_invitations'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create or replace function runlift.public_trial_config() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',enabled,'bot_username',bot_username,'contact_text',contact_text) from public.trial_config where id=1
$$;
create or replace function runlift.admin_trial_data(p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
 return jsonb_build_object(
 'config',(select to_jsonb(c) from public.trial_config c where id=1),
 'prospects',coalesce((select jsonb_agg(p order by p.created_at desc) from public.trial_prospects p),'[]'),
 'bookings',coalesce((select jsonb_agg(b order by b.created_at desc) from public.trial_bookings b),'[]'),
 'questions',coalesce((select jsonb_agg(q order by q.created_at desc) from public.trial_questions q),'[]'),
 'messages',coalesce((select jsonb_agg(m order by m.created_at desc) from public.trial_messages m),'[]'),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'booking_id',i.booking_id,'expires_at',i.expires_at,'revoked_at',i.revoked_at)) from public.trial_invitations i),'[]'),
 'organizers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'telegram_user_id',telegram_user_id)) from public.members where is_admin and telegram_user_id is not null),'[]'));
end $$;
create or replace function runlift.admin_trial_config(p_token uuid,p_config jsonb) returns void language plpgsql security definer set search_path='' as $$
declare c public.trial_config; old_c public.trial_config;
begin
 if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
 insert into public.trial_config(id) values(1) on conflict do nothing;
 select * into c from public.trial_config where id=1 for update;
 old_c:=c;
 select * into c from jsonb_populate_record(c,p_config - 'id' - 'permissions_verified_at' - 'updated_at');
 if c.bot_username is distinct from old_c.bot_username or c.organizer_telegram_id is distinct from old_c.organizer_telegram_id then c.permissions_verified_at:=null; end if;
 if greatest(length(c.welcome_text),length(c.trial_conditions),length(c.trial_price),length(c.bring_text),length(c.continuation_conditions),length(c.contact_text))>1500 then raise exception 'trial_config_text_too_long'; end if;
 if c.bot_username<>'' and c.bot_username !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then raise exception 'invalid_bot_username'; end if;
 if c.enabled and (length(trim(c.welcome_text))=0 or length(trim(c.trial_conditions))=0 or length(trim(c.trial_price))=0
 or length(trim(c.contact_text))=0 or length(trim(c.bring_text))=0 or length(trim(c.continuation_conditions))=0 or c.bot_username=''
 or c.duration_minutes not between 15 and 480 or c.permissions_verified_at is null
 or c.permissions_verified_at<now()-interval '24 hours'
 or not exists(select 1 from public.members where is_admin and telegram_user_id=c.organizer_telegram_id)) then raise exception 'trial_config_incomplete'; end if;
 update public.trial_config set enabled=c.enabled,bot_username=c.bot_username,welcome_text=c.welcome_text,
 trial_conditions=c.trial_conditions,trial_price=c.trial_price,bring_text=c.bring_text,continuation_conditions=c.continuation_conditions,
 duration_minutes=c.duration_minutes,organizer_telegram_id=c.organizer_telegram_id,contact_text=c.contact_text,permissions_verified_at=c.permissions_verified_at,updated_at=now() where id=1;
 perform runlift.sala_jurnal(p_token,'trial_config',jsonb_build_object('enabled',c.enabled));
end $$;

-- Internal enqueue uses a deterministic business key, never a send-time random ID.
create or replace function public.trial_enqueue(p_booking uuid,p_kind text,p_recipient bigint,p_due timestamptz default now()) returns void
language plpgsql security definer set search_path='' as $$
declare b public.trial_bookings;
begin
 select * into strict b from public.trial_bookings where id=p_booking;
 insert into public.trial_messages(prospect_id,booking_id,booking_version,kind,recipient_telegram_id,due_at,payload,dedupe_key)
 values(b.prospect_id,b.id,b.version,p_kind,p_recipient,p_due,to_jsonb(b),b.id||':'||b.version||':'||p_kind)
 on conflict(dedupe_key) do nothing;
end $$;
create or replace function public.trial_book(p_telegram_id bigint,p_date date,p_conditions jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.trial_prospects; c public.trial_config; s public.training_sessions; b public.trial_bookings; bc public.bot_config; start_time timestamptz;
begin
 select * into strict c from public.trial_config where id=1;
 if not c.enabled then raise exception 'trial_disabled'; end if;
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
 perform public.trial_enqueue(b.id,'cancelled',p.telegram_user_id);
 perform public.trial_enqueue(b.id,'organizer_cancelled',c.organizer_telegram_id);
 return to_jsonb(b);
end $$;

-- The internal attendance transition is shared by authenticated admin and Telegram organizer.
create or replace function public.trial_set_attendance(p_booking uuid,p_attended boolean,p_actor text,p_correction boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.trial_bookings; p public.trial_prospects; target text;
begin
 if p_attended is null then raise exception 'attendance_required'; end if;
 select * into strict b from public.trial_bookings where id=p_booking for update;
 target:=case when p_attended then 'attended' else 'absent' end;
 if b.status=target then return to_jsonb(b); end if;
 if b.status not in ('scheduled','awaiting_attendance') and not(p_correction and b.status in ('attended','absent','closed')) then raise exception 'trial_attendance_already_recorded'; end if;
 if b.session_start+make_interval(mins=>b.duration_minutes)>now() then raise exception 'trial_not_finished'; end if;
 if exists(select 1 from public.training_sessions where id=b.session_id and status='cancelled') then raise exception 'trial_session_cancelled'; end if;
 select * into strict p from public.trial_prospects where id=b.prospect_id;
 update public.trial_messages set status='cancelled',lease_until=null where booking_id=b.id and status in ('pending','processing');
 update public.trial_invitations set revoked_at=now() where booking_id=b.id and revoked_at is null;
 update public.trial_bookings set status=target,version=version+1,attendance_actor=p_actor,attendance_at=now(),continuation=null,continuation_at=null where id=b.id returning * into b;
 update public.trial_prospects set stage=target,conversation_step=case when p_attended then 'continuation' else 'choose_session' end,updated_at=now() where id=p.id;
 if not p_correction then perform public.trial_enqueue(b.id,case when p_attended then 'continuation' else 'rebook' end,p.telegram_user_id); end if;
 return to_jsonb(b);
end $$;
create or replace function public.trial_attendance(p_booking uuid,p_version integer,p_attended boolean,p_actor bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.trial_bookings;
begin
 if not exists(select 1 from public.members where telegram_user_id=p_actor and is_admin) then raise exception 'trial_unauthorized_organizer'; end if;
 select * into strict b from public.trial_bookings where id=p_booking for update;
 if b.version<>p_version then
  if b.status=(case when p_attended then 'attended' else 'absent' end) then return to_jsonb(b); end if;
  raise exception 'trial_stale_booking';
 end if;
 return public.trial_set_attendance(p_booking,p_attended,'telegram:'||p_actor);
end $$;
create or replace function runlift.admin_trial_attendance(p_token uuid,p_booking uuid,p_attended boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
 result:=public.trial_set_attendance(p_booking,p_attended,'admin:'||(select user_id::text from runlift.admin_sessions where token=p_token),
 exists(select 1 from public.trial_bookings where id=p_booking and attendance_at is not null));
 perform runlift.sala_jurnal(p_token,'trial_attendance',jsonb_build_object('booking',p_booking,'attended',p_attended));
 return result;
end $$;
create or replace function public.trial_continue(p_telegram_id bigint,p_booking uuid,p_version integer,p_continue boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.trial_bookings; p public.trial_prospects;
begin
 select * into strict b from public.trial_bookings where id=p_booking for update;
 select * into strict p from public.trial_prospects where id=b.prospect_id;
 if p.telegram_user_id<>p_telegram_id then raise exception 'trial_wrong_person'; end if;
 if p_continue is null or b.attendance_at is null or b.status not in ('attended','closed') then raise exception 'trial_attendance_required'; end if;
 if b.continuation is not null then
  if b.continuation=(case when p_continue then 'yes' else 'no' end) then return to_jsonb(b); end if;
  raise exception 'trial_continuation_already_recorded';
 end if;
 if b.version<>p_version then raise exception 'trial_stale_booking'; end if;
 if exists(select 1 from public.telegram_group_memberships where telegram_user_id=p_telegram_id and state='kicked') then raise exception 'trial_membership_ineligible'; end if;
 update public.trial_bookings set continuation=case when p_continue then 'yes' else 'no' end,continuation_at=now(),status=case when p_continue then 'attended' else 'closed' end where id=b.id returning * into b;
 update public.trial_prospects set stage=case when p_continue then 'attended' else 'closed' end,conversation_step='complete',updated_at=now() where id=p.id;
 if p_continue then perform public.trial_enqueue(b.id,'invite',p.telegram_user_id); end if;
 return to_jsonb(b);
end $$;
alter table public.trial_invitations add column if not exists prospect_id uuid references public.trial_prospects(id);
alter table public.trial_invitations add column if not exists booking_version integer;
alter table public.trial_invitations add column if not exists status text not null default 'active';
create table if not exists public.trial_reply_drafts (
 telegram_user_id bigint primary key, question_id uuid not null references public.trial_questions(id), body text,
 expires_at timestamptz not null
);
alter table public.trial_reply_drafts enable row level security;
revoke all on public.trial_reply_drafts from anon,authenticated;
grant all on public.trial_reply_drafts to service_role;

drop function if exists public.trial_question(bigint,text);
create or replace function public.trial_question(p_telegram_id bigint,p_body text,p_message_id bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.trial_prospects; q public.trial_questions; c public.trial_config;
begin
 select * into strict p from public.trial_prospects where telegram_user_id=p_telegram_id;
 select * into strict c from public.trial_config where id=1;
 if not c.enabled then raise exception 'trial_disabled'; end if;
 insert into public.trial_questions(prospect_id,body,telegram_message_id) values(p.id,trim(p_body),p_message_id)
 on conflict(prospect_id,telegram_message_id) do nothing returning * into q;
 if not found then select * into strict q from public.trial_questions where prospect_id=p.id and telegram_message_id=p_message_id; return to_jsonb(q); end if;
 insert into public.trial_messages(prospect_id,kind,recipient_telegram_id,payload,dedupe_key)
 values(p.id,'question',c.organizer_telegram_id,to_jsonb(q),'question:'||q.id);
 return to_jsonb(q);
end $$;
create or replace function public.trial_queue_reply(p_question uuid,p_response text) returns void language plpgsql security definer set search_path='' as $$
declare q public.trial_questions; p public.trial_prospects;
begin
 if p_response is null or length(trim(p_response)) not between 1 and 4000 then raise exception 'trial_response_required'; end if;
 select * into strict q from public.trial_questions where id=p_question for update;
 if q.status<>'open' then
  if q.response=p_response then return; end if;
  raise exception 'trial_question_already_answered';
 end if;
 select * into strict p from public.trial_prospects where id=q.prospect_id;
 update public.trial_questions set response=p_response,status='queued' where id=q.id;
 insert into public.trial_messages(prospect_id,kind,recipient_telegram_id,payload,dedupe_key)
 values(p.id,'answer',p.telegram_user_id,jsonb_build_object('question_id',q.id,'body',q.body,'response',p_response),'answer:'||q.id);
end $$;
create or replace function public.trial_reply(p_question uuid,p_response text,p_actor bigint) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.members where is_admin and telegram_user_id=p_actor) then raise exception 'trial_unauthorized_organizer'; end if;
 perform public.trial_queue_reply(p_question,p_response);
end $$;
create or replace function runlift.admin_trial_reply(p_token uuid,p_question uuid,p_response text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
 perform public.trial_queue_reply(p_question,p_response);
 perform runlift.sala_jurnal(p_token,'trial_reply',jsonb_build_object('question',p_question));
end $$;
create or replace function runlift.admin_trial_retry(p_token uuid,p_message uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
 update public.trial_messages set status='pending',attempts=0,lease_until=null,due_at=now(),result=null where id=p_message and status in ('failed','ambiguous');
 if not found then raise exception 'trial_message_not_retryable'; end if;
 perform runlift.sala_jurnal(p_token,'trial_retry',jsonb_build_object('message',p_message));
end $$;
create or replace function public.trial_sync_sessions() returns void language plpgsql security definer set search_path='' as $$
declare b public.trial_bookings; s public.training_sessions; p public.trial_prospects; c public.trial_config; st timestamptz;
begin
 select * into c from public.trial_config where id=1;
 for b in select * from public.trial_bookings where status in ('scheduled','awaiting_attendance') for update loop
  select * into strict s from public.training_sessions where id=b.session_id;
  select * into strict p from public.trial_prospects where id=b.prospect_id;
  st:=(s.session_date+s.starts_at) at time zone 'Europe/Chisinau';
  if s.status='cancelled' or st<>b.session_start or s.location<>b.session_location then
   update public.trial_messages set status='cancelled',lease_until=null where booking_id=b.id and status in ('pending','processing');
   update public.trial_bookings set version=version+1,session_start=st,session_location=s.location,
    status=case when s.status='cancelled' then 'cancelled' else 'scheduled' end where id=b.id returning * into b;
   update public.trial_prospects set stage=case when s.status='cancelled' then 'interested' else 'scheduled' end,updated_at=now() where id=p.id;
   if s.status='cancelled' then
    perform public.trial_enqueue(b.id,'cancelled',p.telegram_user_id);
    perform public.trial_enqueue(b.id,'organizer_cancelled',c.organizer_telegram_id);
   else
    perform public.trial_enqueue(b.id,'session_changed',p.telegram_user_id);
    if st-now()>interval '2 hours' then perform public.trial_enqueue(b.id,'reminder',p.telegram_user_id,st-interval '2 hours'); end if;
    perform public.trial_enqueue(b.id,'attendance_request',c.organizer_telegram_id,st+make_interval(mins=>b.duration_minutes));
   end if;
  end if;
  if b.status='scheduled' and b.session_start+make_interval(mins=>b.duration_minutes)<=now() then
   update public.trial_bookings set status='awaiting_attendance' where id=b.id;
   update public.trial_prospects set stage='awaiting_attendance',updated_at=now() where id=p.id;
  end if;
 end loop;
end $$;
create or replace function public.trial_claim_messages(p_limit integer default 10) returns setof public.trial_messages language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.trial_config where id=1 and enabled) then return; end if;
 perform public.trial_sync_sessions();
 -- A crashed sender may already have delivered. Never blindly replay its lease.
 update public.trial_messages set status='ambiguous',result='Lease expired; delivery requires verification',lease_until=null where status='processing' and lease_until<now();
 update public.trial_messages m set status='cancelled' where status='pending' and booking_id is not null
 and exists(select 1 from public.trial_bookings b where b.id=m.booking_id and b.version<>m.booking_version);
 return query with picked as (
  select m.id from public.trial_messages m join public.trial_prospects p on p.id=m.prospect_id
  where m.status='pending' and m.due_at<=now() and m.attempts<3
   and (p.dm_enabled or m.recipient_telegram_id<>p.telegram_user_id)
  order by m.due_at limit greatest(1,least(p_limit,100)) for update of m skip locked
 ) update public.trial_messages m set status='processing',attempts=m.attempts+1,lease_until=now()+interval '5 minutes'
 from picked where m.id=picked.id returning m.*;
end $$;
create or replace function public.trial_complete_message(p_message uuid,p_status text,p_result text default null) returns void language plpgsql security definer set search_path='' as $$
declare m public.trial_messages;
begin
 if p_status not in ('sent','failed','ambiguous','cancelled') then raise exception 'invalid_message_status'; end if;
 update public.trial_messages set status=p_status,result=p_result,lease_until=null where id=p_message and status='processing' returning * into m;
 if not found then return; end if;
 if p_status='sent' and m.kind='invite' then update public.trial_prospects set stage='invited',updated_at=now() where id=m.prospect_id and stage<>'in_group'; end if;
 if p_status='sent' and m.kind='answer' then update public.trial_questions set status='answered',answered_at=now() where id=(m.payload->>'question_id')::uuid; end if;
end $$;
create or replace function public.trial_convert(p_telegram_id bigint) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.trial_prospects; m uuid;
begin
 select * into p from public.trial_prospects where telegram_user_id=p_telegram_id for update;
 if not found then return null; end if;
 if p.stage='in_group' and exists(select 1 from public.telegram_group_memberships where telegram_user_id=p_telegram_id and state in ('left','kicked')) then
  update public.trial_prospects set stage='closed',updated_at=now() where id=p.id;
  return p.member_id;
 end if;
 if not exists(select 1 from public.telegram_group_memberships where telegram_user_id=p_telegram_id and state='in_group')
 or not exists(select 1 from public.trial_bookings where prospect_id=p.id and status='attended' and attendance_at is not null and continuation='yes') then return null; end if;
 insert into public.members(full_name,telegram_user_id,telegram_username,bot_dm_enabled) values(p.full_name,p.telegram_user_id,p.telegram_username,p.dm_enabled)
 on conflict(telegram_user_id) do nothing;
 select id into strict m from public.members where telegram_user_id=p_telegram_id;
 update public.trial_prospects set member_id=m,stage='in_group',updated_at=now() where id=p.id;
 return m;
end $$;

create or replace function public.trial_request_invite(p_telegram_id bigint,p_booking uuid) returns void language plpgsql security definer set search_path='' as $$
declare b public.trial_bookings; p public.trial_prospects;
begin
 select * into strict b from public.trial_bookings where id=p_booking for update;
 select * into strict p from public.trial_prospects where id=b.prospect_id;
 if p.telegram_user_id<>p_telegram_id or not p.dm_enabled or b.status<>'attended' or b.attendance_at is null or b.continuation is distinct from 'yes'
 or exists(select 1 from public.telegram_group_memberships where telegram_user_id=p_telegram_id and state='kicked') then raise exception 'trial_invitation_ineligible'; end if;
 if exists(select 1 from public.trial_messages where booking_id=b.id and kind='invite' and status in ('pending','processing')) then return; end if;
 insert into public.trial_messages(prospect_id,booking_id,booking_version,kind,recipient_telegram_id,payload,dedupe_key)
 values(p.id,b.id,b.version,'invite',p.telegram_user_id,to_jsonb(b),'invite_request:'||gen_random_uuid());
end $$;

-- Deny default PUBLIC execution, including all internal transition helpers.
do $$ declare f record; begin
 for f in select p.oid::regprocedure sig,n.nspname,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname like 'trial_%') or (n.nspname='runlift' and (p.proname like 'admin_trial_%' or p.proname='public_trial_config')) loop
 execute format('revoke all on function %s from public, anon, authenticated',f.sig);
 execute format('grant execute on function %s to service_role',f.sig);
 if f.nspname='runlift' then execute format('grant execute on function %s to anon, authenticated',f.sig); end if;
 end loop;
end $$;
commit;

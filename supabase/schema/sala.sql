-- Instantaneul tabelelor grupului de antrenament din schema `public` (proiectul
-- ironworks-gym): fostul gym-app + botul de Telegram.
--
-- Generat din baza REALĂ, nu scris de mână: `scripts/schema-snapshot-sala.sql`
-- conține interogarea care îl reproduce. E fixture-ul pe care rulează testele SQL
-- ale grupului (`tests/unit/sql/sala.test.ts`) pe un Postgres în proces (PGlite),
-- lângă `supabase/schema/runlift.sql`.
--
-- NU se aplică nicăieri: nu e o migrare. Ăsta e „ce e acum în producție",
-- regenerat după fiecare migrare care atinge tabelele grupului — vezi MIGRATIONS.md.
--
-- Ultima regenerare: 8 octombrie 2026 (activarea infrastructurii pentru probe).

create table public.attendance (
  id uuid default gen_random_uuid() not null,
  session_id uuid not null,
  member_id uuid not null,
  response text not null,
  is_first_training boolean default false not null,
  responded_at timestamp with time zone default now() not null
);

create table public.attendance_log (
  id uuid default gen_random_uuid() not null,
  session_id uuid,
  member_id uuid,
  telegram_user_id bigint,
  response text not null,
  source text default 'telegram'::text not null,
  created_at timestamp with time zone default now() not null
);

create table public.bot_actions (
  id uuid default gen_random_uuid() not null,
  action text not null,
  member_id uuid,
  telegram_user_id bigint,
  status text default 'pending'::text not null,
  result text,
  created_at timestamp with time zone default now() not null,
  processed_at timestamp with time zone,
  payload jsonb,
  reviewed_at timestamp with time zone
);

create table public.bot_config (
  id smallint default 1 not null,
  enabled boolean default true not null,
  poll_days smallint[] default '{1,3}'::smallint[] not null,
  poll_time text default '20:00'::text not null,
  summary_days smallint[] default '{2,4}'::smallint[] not null,
  summary_time text default '06:00'::text not null,
  updated_at timestamp with time zone default now() not null,
  training_time text default '06:30'::text not null,
  location text default 'Parcul Dumitru Râșcanu'::text not null,
  auto_reminder_enabled boolean default true not null,
  reminder_threshold integer default 6 not null,
  poll_title text,
  poll_yes_label text,
  poll_no_label text
);

create table public.members (
  id uuid default gen_random_uuid() not null,
  full_name text not null,
  phone text,
  email text,
  membership_type text default 'Lunar'::text not null,
  monthly_due numeric(10,2),
  status text default 'active'::text not null,
  join_date date default CURRENT_DATE not null,
  created_at timestamp with time zone default now() not null,
  telegram_user_id bigint,
  telegram_username text,
  bot_dm_enabled boolean default false not null,
  is_admin boolean default false not null
);

create table public.payments (
  id uuid default gen_random_uuid() not null,
  member_id uuid,
  amount numeric(10,2) not null,
  payment_date date default CURRENT_DATE not null,
  payment_method text default 'Numerar'::text not null,
  payment_type text default 'Reînnoire'::text not null,
  notes text,
  recorded_by uuid,
  created_at timestamp with time zone default now() not null
);

create table public.telegram_group_memberships (
  telegram_user_id bigint not null,
  chat_id text not null,
  state text default 'unknown'::text not null,
  observed_at timestamp with time zone,
  next_check_at timestamp with time zone default now() not null,
  check_failed boolean default false not null
);

create table public.telegram_unmatched (
  telegram_user_id bigint not null,
  username text,
  first_name text,
  last_name text,
  created_at timestamp with time zone default now() not null
);

create table public.training_sessions (
  id uuid default gen_random_uuid() not null,
  session_date date not null,
  starts_at time without time zone default '06:30:00'::time without time zone not null,
  location text default 'Parcul Dumitru Râșcanu'::text not null,
  poll_message_id bigint,
  status text default 'scheduled'::text not null,
  created_at timestamp with time zone default now() not null,
  poll_wording jsonb
);

create table public.trial_bookings (
  id uuid default gen_random_uuid() not null,
  prospect_id uuid not null,
  session_id uuid not null,
  status text default 'scheduled'::text not null,
  version integer default 1 not null,
  conditions_snapshot jsonb not null,
  accepted_at timestamp with time zone default now() not null,
  attendance_actor text,
  attendance_at timestamp with time zone,
  continuation text,
  continuation_at timestamp with time zone,
  session_start timestamp with time zone not null,
  session_location text not null,
  duration_minutes integer not null,
  created_at timestamp with time zone default now() not null
);

create table public.trial_config (
  id smallint default 1 not null,
  enabled boolean default false not null,
  bot_username text default ''::text not null,
  welcome_text text default ''::text not null,
  trial_conditions text default ''::text not null,
  trial_price text default ''::text not null,
  bring_text text default ''::text not null,
  continuation_conditions text default ''::text not null,
  duration_minutes integer default 60 not null,
  organizer_telegram_id bigint,
  contact_text text default ''::text not null,
  permissions_verified_at timestamp with time zone,
  updated_at timestamp with time zone default now() not null,
  message_texts jsonb default '{}'::jsonb not null
);

create table public.trial_invitations (
  id uuid default gen_random_uuid() not null,
  booking_id uuid not null,
  telegram_user_id bigint not null,
  invite_link text not null,
  expires_at timestamp with time zone not null,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  prospect_id uuid,
  booking_version integer,
  status text default 'active'::text not null
);

create table public.trial_messages (
  id uuid default gen_random_uuid() not null,
  prospect_id uuid not null,
  booking_id uuid,
  booking_version integer,
  kind text not null,
  recipient_telegram_id bigint not null,
  due_at timestamp with time zone default now() not null,
  status text default 'pending'::text not null,
  attempts integer default 0 not null,
  lease_until timestamp with time zone,
  payload jsonb default '{}'::jsonb not null,
  result text,
  dedupe_key text not null,
  created_at timestamp with time zone default now() not null
);

create table public.trial_prospects (
  id uuid default gen_random_uuid() not null,
  telegram_user_id bigint not null,
  telegram_username text,
  full_name text,
  source text default 'direct'::text not null,
  stage text default 'interested'::text not null,
  conversation_step text default 'name'::text not null,
  dm_enabled boolean default true not null,
  member_id uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null
);

create table public.trial_questions (
  id uuid default gen_random_uuid() not null,
  prospect_id uuid not null,
  body text not null,
  response text,
  status text default 'open'::text not null,
  created_at timestamp with time zone default now() not null,
  answered_at timestamp with time zone,
  telegram_message_id bigint
);

create table public.trial_reply_drafts (
  telegram_user_id bigint not null,
  question_id uuid not null,
  body text,
  expires_at timestamp with time zone not null,
  draft_id uuid default gen_random_uuid() not null
);

alter table public.attendance add constraint attendance_pkey PRIMARY KEY (id);
alter table public.attendance add constraint attendance_session_id_member_id_key UNIQUE (session_id, member_id);
alter table public.attendance_log add constraint attendance_log_pkey PRIMARY KEY (id);
alter table public.bot_actions add constraint bot_actions_pkey PRIMARY KEY (id);
alter table public.bot_config add constraint bot_config_pkey PRIMARY KEY (id);
alter table public.members add constraint members_pkey PRIMARY KEY (id);
alter table public.members add constraint members_telegram_user_id_key UNIQUE (telegram_user_id);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.telegram_group_memberships add constraint telegram_group_memberships_pkey PRIMARY KEY (telegram_user_id);
alter table public.telegram_unmatched add constraint telegram_unmatched_pkey PRIMARY KEY (telegram_user_id);
alter table public.training_sessions add constraint training_sessions_pkey PRIMARY KEY (id);
alter table public.training_sessions add constraint training_sessions_session_date_key UNIQUE (session_date);
alter table public.trial_bookings add constraint trial_bookings_pkey PRIMARY KEY (id);
alter table public.trial_config add constraint trial_config_pkey PRIMARY KEY (id);
alter table public.trial_invitations add constraint trial_invitations_invite_link_key UNIQUE (invite_link);
alter table public.trial_invitations add constraint trial_invitations_pkey PRIMARY KEY (id);
alter table public.trial_messages add constraint trial_messages_dedupe_key_key UNIQUE (dedupe_key);
alter table public.trial_messages add constraint trial_messages_pkey PRIMARY KEY (id);
alter table public.trial_prospects add constraint trial_prospects_pkey PRIMARY KEY (id);
alter table public.trial_prospects add constraint trial_prospects_telegram_user_id_key UNIQUE (telegram_user_id);
alter table public.trial_questions add constraint trial_questions_pkey PRIMARY KEY (id);
alter table public.trial_reply_drafts add constraint trial_reply_drafts_pkey PRIMARY KEY (telegram_user_id);
alter table public.attendance add constraint attendance_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE;
alter table public.attendance add constraint attendance_response_check CHECK ((response = ANY (ARRAY['yes'::text, 'no'::text])));
alter table public.attendance add constraint attendance_session_id_fkey FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE CASCADE;
alter table public.attendance_log add constraint attendance_log_response_check CHECK ((response = ANY (ARRAY['yes'::text, 'no'::text, 'clear'::text])));
alter table public.attendance_log add constraint attendance_log_session_id_fkey FOREIGN KEY (session_id) REFERENCES training_sessions(id) ON DELETE SET NULL;
alter table public.attendance_log add constraint attendance_log_source_check CHECK ((source = ANY (ARRAY['telegram'::text, 'manual'::text])));
alter table public.bot_actions add constraint bot_actions_action_check CHECK ((action = ANY (ARRAY['kick_member'::text, 'send_poll'::text, 'send_summary'::text, 'send_reminder'::text, 'send_message'::text, 'cancel_session'::text, 'reactivate_session'::text, 'move_session'::text, 'add_session'::text])));
alter table public.bot_actions add constraint bot_actions_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
alter table public.bot_actions add constraint bot_actions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'done'::text, 'failed'::text])));
alter table public.bot_config add constraint bot_config_singleton CHECK ((id = 1));
alter table public.members add constraint members_membership_type_check CHECK ((membership_type = ANY (ARRAY['Lunar'::text, 'Anual'::text, 'O zi'::text])));
alter table public.members add constraint members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'cancelled'::text])));
alter table public.payments add constraint payments_amount_check CHECK ((amount > (0)::numeric));
alter table public.payments add constraint payments_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL;
alter table public.payments add constraint payments_payment_method_check CHECK ((payment_method = ANY (ARRAY['Numerar'::text, 'Card'::text, 'Transfer bancar'::text, 'Altele'::text])));
alter table public.payments add constraint payments_payment_type_check CHECK ((payment_type = ANY (ARRAY['Abonament nou'::text, 'Reînnoire'::text, 'Acces 1 zi'::text])));
alter table public.payments add constraint payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
alter table public.telegram_group_memberships add constraint telegram_group_memberships_state_check CHECK ((state = ANY (ARRAY['unknown'::text, 'in_group'::text, 'left'::text, 'kicked'::text])));
alter table public.training_sessions add constraint training_sessions_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'done'::text, 'cancelled'::text])));
alter table public.trial_bookings add constraint trial_bookings_continuation_check CHECK ((continuation = ANY (ARRAY['yes'::text, 'no'::text])));
alter table public.trial_bookings add constraint trial_bookings_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES trial_prospects(id);
alter table public.trial_bookings add constraint trial_bookings_session_id_fkey FOREIGN KEY (session_id) REFERENCES training_sessions(id);
alter table public.trial_bookings add constraint trial_bookings_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'awaiting_attendance'::text, 'attended'::text, 'absent'::text, 'cancelled'::text, 'closed'::text])));
alter table public.trial_config add constraint trial_config_duration_minutes_check CHECK (((duration_minutes >= 15) AND (duration_minutes <= 480)));
alter table public.trial_config add constraint trial_config_id_check CHECK ((id = 1));
alter table public.trial_invitations add constraint trial_invitations_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES trial_bookings(id);
alter table public.trial_invitations add constraint trial_invitations_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES trial_prospects(id);
alter table public.trial_messages add constraint trial_messages_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES trial_bookings(id);
alter table public.trial_messages add constraint trial_messages_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES trial_prospects(id);
alter table public.trial_messages add constraint trial_messages_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'sent'::text, 'failed'::text, 'ambiguous'::text, 'cancelled'::text])));
alter table public.trial_prospects add constraint trial_prospects_member_id_fkey FOREIGN KEY (member_id) REFERENCES members(id);
alter table public.trial_questions add constraint trial_questions_body_check CHECK (((length(body) >= 1) AND (length(body) <= 4000)));
alter table public.trial_questions add constraint trial_questions_prospect_id_fkey FOREIGN KEY (prospect_id) REFERENCES trial_prospects(id);
alter table public.trial_questions add constraint trial_questions_status_check CHECK ((status = ANY (ARRAY['open'::text, 'queued'::text, 'answered'::text])));
alter table public.trial_reply_drafts add constraint trial_reply_drafts_question_id_fkey FOREIGN KEY (question_id) REFERENCES trial_questions(id);

CREATE INDEX attendance_log_session_idx ON public.attendance_log USING btree (session_id, created_at);
CREATE INDEX attendance_member_idx ON public.attendance USING btree (member_id);
CREATE INDEX attendance_session_idx ON public.attendance USING btree (session_id);
CREATE INDEX bot_actions_pending_idx ON public.bot_actions USING btree (created_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_payments_date ON public.payments USING btree (payment_date);
CREATE INDEX idx_payments_member ON public.payments USING btree (member_id);
CREATE INDEX trial_messages_due ON public.trial_messages USING btree (due_at) WHERE (status = 'pending'::text);
CREATE UNIQUE INDEX trial_one_open_booking ON public.trial_bookings USING btree (prospect_id) WHERE (status = ANY (ARRAY['scheduled'::text, 'awaiting_attendance'::text, 'attended'::text]));
CREATE UNIQUE INDEX trial_question_message_unique ON public.trial_questions USING btree (prospect_id, telegram_message_id);

create view public.member_attendance_stats with (security_invoker=true) as
 SELECT m.id,
    m.full_name,
    m.status,
    m.is_admin,
    m.telegram_user_id,
    m.telegram_username,
    m.bot_dm_enabled,
    m.join_date,
    count(a.id) FILTER (WHERE a.response = 'yes'::text) AS yes_count,
    count(a.id) FILTER (WHERE a.response = 'no'::text) AS no_count,
    max(ts.session_date) FILTER (WHERE a.response = 'yes'::text) AS last_attended
   FROM members m
     LEFT JOIN attendance a ON a.member_id = m.id
     LEFT JOIN training_sessions ts ON ts.id = a.session_id
  GROUP BY m.id;

create view public.monthly_summary with (security_invoker=on) as
 SELECT date_trunc('month'::text, payment_date::timestamp with time zone)::date AS month,
    sum(amount) AS total_income,
    count(*) AS num_payments,
    avg(amount) AS avg_payment
   FROM payments
  GROUP BY (date_trunc('month'::text, payment_date::timestamp with time zone)::date)
  ORDER BY (date_trunc('month'::text, payment_date::timestamp with time zone)::date) DESC;

create view public.telegram_training_members as
 SELECT m.id,
    m.full_name,
    m.phone,
    m.email,
    m.membership_type,
    m.monthly_due,
    m.status,
    m.join_date,
    m.created_at,
    m.telegram_user_id,
    m.telegram_username,
    m.bot_dm_enabled,
    m.is_admin
   FROM members m
     LEFT JOIN telegram_group_memberships g ON g.telegram_user_id = m.telegram_user_id
  WHERE m.status = 'active'::text AND m.telegram_user_id IS NOT NULL AND (COALESCE(g.state, 'unknown'::text) <> ALL (ARRAY['left'::text, 'kicked'::text]));

create view public.telegram_training_stats as
 SELECT s.id,
    s.full_name,
    s.status,
    s.is_admin,
    s.telegram_user_id,
    s.telegram_username,
    s.bot_dm_enabled,
    s.join_date,
    s.yes_count,
    s.no_count,
    s.last_attended
   FROM member_attendance_stats s
     JOIN telegram_training_members m ON m.id = s.id;

CREATE OR REPLACE FUNCTION public.merge_members(keep uuid, remove uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r_tg bigint;
  r_un text;
  r_dm boolean;
BEGIN
  IF keep = remove THEN
    RAISE EXCEPTION 'Nu poți îmbina un membru cu el însuși';
  END IF;

  SELECT telegram_user_id, telegram_username, bot_dm_enabled
    INTO r_tg, r_un, r_dm
    FROM public.members WHERE id = remove;

  -- Drop duplicate attendance where the kept member already voted that session.
  DELETE FROM public.attendance a
   WHERE a.member_id = remove
     AND EXISTS (
       SELECT 1 FROM public.attendance b
        WHERE b.member_id = keep AND b.session_id = a.session_id
     );
  UPDATE public.attendance SET member_id = keep WHERE member_id = remove;
  UPDATE public.payments   SET member_id = keep WHERE member_id = remove;

  -- Free the unique telegram id on the removed row before copying it over.
  UPDATE public.members SET telegram_user_id = NULL WHERE id = remove;
  UPDATE public.members k SET
      telegram_user_id  = COALESCE(k.telegram_user_id, r_tg),
      telegram_username = COALESCE(k.telegram_username, r_un),
      bot_dm_enabled    = k.bot_dm_enabled OR COALESCE(r_dm, false)
   WHERE k.id = keep;

  DELETE FROM public.members WHERE id = remove;
END $function$
;

CREATE OR REPLACE FUNCTION public.queue_telegram_kick(p_member uuid, p_expected_id bigint, p_chat_id text, p_actor bigint, p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.members; v_id uuid;
begin
  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'membru_inexistent'; end if;
  if m.is_admin then raise exception 'membru_admin'; end if;
  if m.telegram_user_id is null then raise exception 'fara_telegram'; end if;
  if p_expected_id is not null and p_expected_id <> m.telegram_user_id then raise exception 'telegram_changed'; end if;
  select id into v_id from public.bot_actions where action = 'kick_member'
    and member_id = m.id and status = 'pending' order by created_at desc limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.bot_actions (action, member_id, telegram_user_id, payload)
  values ('kick_member', m.id, m.telegram_user_id, jsonb_build_object(
    'sursa', case when p_actor is null then 'admin' else 'telegram' end,
    'organizator_id', p_actor, 'organizator', p_name, 'chat_id', p_chat_id)) returning id into v_id;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.record_telegram_membership(p_user_id bigint, p_chat_id text, p_state text, p_observed_at timestamp with time zone, p_username text, p_first_name text, p_last_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_state not in ('in_group', 'left', 'kicked') or p_observed_at is null then
    raise exception 'membership_invalid';
  end if;
  insert into public.telegram_group_memberships as old
    (telegram_user_id, chat_id, state, observed_at, next_check_at)
  values (p_user_id, p_chat_id, p_state, p_observed_at, now() + interval '6 hours')
  on conflict (telegram_user_id) do update set
    chat_id = excluded.chat_id, state = excluded.state, observed_at = excluded.observed_at,
    next_check_at = excluded.next_check_at, check_failed = false
  where old.chat_id <> excluded.chat_id or old.observed_at is null or old.observed_at <= excluded.observed_at;
  if not found then return; end if; -- redelivered/stale event cannot undo a newer check
  if p_state = 'in_group' and not exists (select 1 from public.members where telegram_user_id = p_user_id) then
    insert into public.telegram_unmatched (telegram_user_id, username, first_name, last_name)
    values (p_user_id, p_username, p_first_name, p_last_name)
    on conflict (telegram_user_id) do update set username = excluded.username,
      first_name = excluded.first_name, last_name = excluded.last_name;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.telegram_membership_candidates(p_chat_id text)
 RETURNS TABLE(telegram_user_id bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  insert into public.telegram_group_memberships (telegram_user_id, chat_id)
  select m.telegram_user_id, p_chat_id from public.members m where m.telegram_user_id is not null
  union select n.telegram_user_id, p_chat_id from public.telegram_unmatched n where true
  on conflict on constraint telegram_group_memberships_pkey do update set chat_id = excluded.chat_id,
    state = 'unknown', observed_at = null, next_check_at = now(), check_failed = false
    where public.telegram_group_memberships.chat_id <> excluded.chat_id;
  return query select g.telegram_user_id from public.telegram_group_memberships g
    where g.next_check_at <= now() or g.chat_id <> p_chat_id
    order by g.next_check_at limit 10;
end $function$
;

CREATE OR REPLACE FUNCTION public.telegram_membership_retry(p_user_id bigint, p_chat_id text)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  update public.telegram_group_memberships set next_check_at = now() + interval '15 minutes', check_failed = true
    where telegram_user_id = p_user_id and chat_id = p_chat_id;
$function$
;

CREATE OR REPLACE FUNCTION public.trial_attendance(p_booking uuid, p_version integer, p_attended boolean, p_actor bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.trial_bookings;
begin
 if not exists(select 1 from public.members where telegram_user_id=p_actor and is_admin) then raise exception 'trial_unauthorized_organizer'; end if;
 select * into strict b from public.trial_bookings where id=p_booking for update;
 if b.version<>p_version then
  if b.status=(case when p_attended then 'attended' else 'absent' end) then return to_jsonb(b); end if;
  raise exception 'trial_stale_booking';
 end if;
 return public.trial_set_attendance(p_booking,p_attended,'telegram:'||p_actor);
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_book(p_telegram_id bigint, p_date date, p_conditions jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_cancel(p_telegram_id bigint, p_booking uuid, p_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_claim_messages(p_limit integer DEFAULT 10)
 RETURNS SETOF trial_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_complete_message(p_message uuid, p_status text, p_result text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m public.trial_messages;
begin
 if p_status not in ('sent','failed','ambiguous','cancelled') then raise exception 'invalid_message_status'; end if;
 update public.trial_messages set status=p_status,result=p_result,lease_until=null where id=p_message and status='processing' returning * into m;
 if not found then return; end if;
 if p_status='sent' and m.kind='invite' then update public.trial_prospects set stage='invited',updated_at=now() where id=m.prospect_id and stage<>'in_group'; end if;
 if p_status='sent' and m.kind='answer' then update public.trial_questions set status='answered',answered_at=now() where id=(m.payload->>'question_id')::uuid; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_confirm_reply(p_actor bigint, p_draft uuid, p_send boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d public.trial_reply_drafts;
begin
 if not exists(select 1 from public.members where is_admin and telegram_user_id=p_actor) then raise exception 'trial_unauthorized_organizer'; end if;
 select * into d from public.trial_reply_drafts where telegram_user_id=p_actor for update;
 if not found or d.draft_id is distinct from p_draft or d.expires_at<=now() or d.body is null or p_send is null then raise exception 'trial_stale_draft'; end if;
 if p_send then perform public.trial_queue_reply(d.question_id,d.body); end if;
 delete from public.trial_reply_drafts where telegram_user_id=p_actor and draft_id=p_draft;
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_continue(p_telegram_id bigint, p_booking uuid, p_version integer, p_continue boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_convert(p_telegram_id bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_enqueue(p_booking uuid, p_kind text, p_recipient bigint, p_due timestamp with time zone DEFAULT now())
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.trial_bookings;
begin
 select * into strict b from public.trial_bookings where id=p_booking;
 insert into public.trial_messages(prospect_id,booking_id,booking_version,kind,recipient_telegram_id,due_at,payload,dedupe_key)
 values(b.prospect_id,b.id,b.version,p_kind,p_recipient,p_due,to_jsonb(b),b.id||':'||b.version||':'||p_kind)
 on conflict(dedupe_key) do nothing;
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_question(p_telegram_id bigint, p_body text, p_message_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_queue_reply(p_question uuid, p_response text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_release_messages(p_claims jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update public.trial_messages m set status='pending',lease_until=null,attempts=greatest(0,m.attempts-1)
 from jsonb_to_recordset(p_claims) as c(id uuid,lease_until timestamptz)
 where m.id=c.id and m.status='processing' and m.lease_until=c.lease_until;
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_reply(p_question uuid, p_response text, p_actor bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.members where is_admin and telegram_user_id=p_actor) then raise exception 'trial_unauthorized_organizer'; end if;
 perform public.trial_queue_reply(p_question,p_response);
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_request_invite(p_telegram_id bigint, p_booking uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare b public.trial_bookings; p public.trial_prospects;
begin
 select * into strict b from public.trial_bookings where id=p_booking for update;
 select * into strict p from public.trial_prospects where id=b.prospect_id;
 if p.telegram_user_id<>p_telegram_id or not p.dm_enabled or b.status<>'attended' or b.attendance_at is null or b.continuation is distinct from 'yes'
 or exists(select 1 from public.telegram_group_memberships where telegram_user_id=p_telegram_id and state='kicked') then raise exception 'trial_invitation_ineligible'; end if;
 if exists(select 1 from public.trial_messages where booking_id=b.id and kind='invite' and status in ('pending','processing')) then return; end if;
 insert into public.trial_messages(prospect_id,booking_id,booking_version,kind,recipient_telegram_id,payload,dedupe_key)
 values(p.id,b.id,b.version,'invite',p.telegram_user_id,to_jsonb(b),'invite_request:'||gen_random_uuid());
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_set_attendance(p_booking uuid, p_attended boolean, p_actor text, p_correction boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.trial_sync_sessions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

revoke all on function public.merge_members(keep uuid, remove uuid) from public, anon, authenticated, service_role;
grant execute on function public.merge_members(keep uuid, remove uuid) to service_role;
revoke all on function public.queue_telegram_kick(p_member uuid, p_expected_id bigint, p_chat_id text, p_actor bigint, p_name text) from public, anon, authenticated, service_role;
grant execute on function public.queue_telegram_kick(p_member uuid, p_expected_id bigint, p_chat_id text, p_actor bigint, p_name text) to service_role;
revoke all on function public.record_telegram_membership(p_user_id bigint, p_chat_id text, p_state text, p_observed_at timestamp with time zone, p_username text, p_first_name text, p_last_name text) from public, anon, authenticated, service_role;
grant execute on function public.record_telegram_membership(p_user_id bigint, p_chat_id text, p_state text, p_observed_at timestamp with time zone, p_username text, p_first_name text, p_last_name text) to service_role;
revoke all on function public.telegram_membership_candidates(p_chat_id text) from public, anon, authenticated, service_role;
grant execute on function public.telegram_membership_candidates(p_chat_id text) to service_role;
revoke all on function public.telegram_membership_retry(p_user_id bigint, p_chat_id text) from public, anon, authenticated, service_role;
grant execute on function public.telegram_membership_retry(p_user_id bigint, p_chat_id text) to service_role;
revoke all on function public.trial_attendance(p_booking uuid, p_version integer, p_attended boolean, p_actor bigint) from public, anon, authenticated, service_role;
grant execute on function public.trial_attendance(p_booking uuid, p_version integer, p_attended boolean, p_actor bigint) to service_role;
revoke all on function public.trial_book(p_telegram_id bigint, p_date date, p_conditions jsonb) from public, anon, authenticated, service_role;
grant execute on function public.trial_book(p_telegram_id bigint, p_date date, p_conditions jsonb) to service_role;
revoke all on function public.trial_cancel(p_telegram_id bigint, p_booking uuid, p_version integer) from public, anon, authenticated, service_role;
grant execute on function public.trial_cancel(p_telegram_id bigint, p_booking uuid, p_version integer) to service_role;
revoke all on function public.trial_claim_messages(p_limit integer) from public, anon, authenticated, service_role;
grant execute on function public.trial_claim_messages(p_limit integer) to service_role;
revoke all on function public.trial_complete_message(p_message uuid, p_status text, p_result text) from public, anon, authenticated, service_role;
grant execute on function public.trial_complete_message(p_message uuid, p_status text, p_result text) to service_role;
revoke all on function public.trial_confirm_reply(p_actor bigint, p_draft uuid, p_send boolean) from public, anon, authenticated, service_role;
grant execute on function public.trial_confirm_reply(p_actor bigint, p_draft uuid, p_send boolean) to service_role;
revoke all on function public.trial_continue(p_telegram_id bigint, p_booking uuid, p_version integer, p_continue boolean) from public, anon, authenticated, service_role;
grant execute on function public.trial_continue(p_telegram_id bigint, p_booking uuid, p_version integer, p_continue boolean) to service_role;
revoke all on function public.trial_convert(p_telegram_id bigint) from public, anon, authenticated, service_role;
grant execute on function public.trial_convert(p_telegram_id bigint) to service_role;
revoke all on function public.trial_enqueue(p_booking uuid, p_kind text, p_recipient bigint, p_due timestamp with time zone) from public, anon, authenticated, service_role;
grant execute on function public.trial_enqueue(p_booking uuid, p_kind text, p_recipient bigint, p_due timestamp with time zone) to service_role;
revoke all on function public.trial_question(p_telegram_id bigint, p_body text, p_message_id bigint) from public, anon, authenticated, service_role;
grant execute on function public.trial_question(p_telegram_id bigint, p_body text, p_message_id bigint) to service_role;
revoke all on function public.trial_queue_reply(p_question uuid, p_response text) from public, anon, authenticated, service_role;
grant execute on function public.trial_queue_reply(p_question uuid, p_response text) to service_role;
revoke all on function public.trial_release_messages(p_claims jsonb) from public, anon, authenticated, service_role;
grant execute on function public.trial_release_messages(p_claims jsonb) to service_role;
revoke all on function public.trial_reply(p_question uuid, p_response text, p_actor bigint) from public, anon, authenticated, service_role;
grant execute on function public.trial_reply(p_question uuid, p_response text, p_actor bigint) to service_role;
revoke all on function public.trial_request_invite(p_telegram_id bigint, p_booking uuid) from public, anon, authenticated, service_role;
grant execute on function public.trial_request_invite(p_telegram_id bigint, p_booking uuid) to service_role;
revoke all on function public.trial_set_attendance(p_booking uuid, p_attended boolean, p_actor text, p_correction boolean) from public, anon, authenticated, service_role;
grant execute on function public.trial_set_attendance(p_booking uuid, p_attended boolean, p_actor text, p_correction boolean) to service_role;
revoke all on function public.trial_sync_sessions() from public, anon, authenticated, service_role;
grant execute on function public.trial_sync_sessions() to service_role;

revoke all on table public.attendance from public, anon, authenticated, service_role;
grant select on table public.attendance to anon;
grant insert on table public.attendance to anon;
grant update on table public.attendance to anon;
grant delete on table public.attendance to anon;
grant select on table public.attendance to authenticated;
grant insert on table public.attendance to authenticated;
grant update on table public.attendance to authenticated;
grant delete on table public.attendance to authenticated;
grant select on table public.attendance to service_role;
grant insert on table public.attendance to service_role;
grant update on table public.attendance to service_role;
grant delete on table public.attendance to service_role;
alter table public.attendance enable row level security;
revoke all on table public.attendance_log from public, anon, authenticated, service_role;
grant select on table public.attendance_log to anon;
grant insert on table public.attendance_log to anon;
grant update on table public.attendance_log to anon;
grant delete on table public.attendance_log to anon;
grant select on table public.attendance_log to authenticated;
grant insert on table public.attendance_log to authenticated;
grant update on table public.attendance_log to authenticated;
grant delete on table public.attendance_log to authenticated;
grant select on table public.attendance_log to service_role;
grant insert on table public.attendance_log to service_role;
grant update on table public.attendance_log to service_role;
grant delete on table public.attendance_log to service_role;
alter table public.attendance_log enable row level security;
revoke all on table public.bot_actions from public, anon, authenticated, service_role;
grant select on table public.bot_actions to anon;
grant insert on table public.bot_actions to anon;
grant update on table public.bot_actions to anon;
grant delete on table public.bot_actions to anon;
grant select on table public.bot_actions to authenticated;
grant insert on table public.bot_actions to authenticated;
grant update on table public.bot_actions to authenticated;
grant delete on table public.bot_actions to authenticated;
grant select on table public.bot_actions to service_role;
grant insert on table public.bot_actions to service_role;
grant update on table public.bot_actions to service_role;
grant delete on table public.bot_actions to service_role;
alter table public.bot_actions enable row level security;
revoke all on table public.bot_config from public, anon, authenticated, service_role;
grant select on table public.bot_config to anon;
grant insert on table public.bot_config to anon;
grant update on table public.bot_config to anon;
grant delete on table public.bot_config to anon;
grant select on table public.bot_config to authenticated;
grant insert on table public.bot_config to authenticated;
grant update on table public.bot_config to authenticated;
grant delete on table public.bot_config to authenticated;
grant select on table public.bot_config to service_role;
grant insert on table public.bot_config to service_role;
grant update on table public.bot_config to service_role;
grant delete on table public.bot_config to service_role;
alter table public.bot_config enable row level security;
revoke all on table public.member_attendance_stats from public, anon, authenticated, service_role;
grant select on table public.member_attendance_stats to service_role;
grant insert on table public.member_attendance_stats to service_role;
grant update on table public.member_attendance_stats to service_role;
grant delete on table public.member_attendance_stats to service_role;
revoke all on table public.members from public, anon, authenticated, service_role;
grant select on table public.members to anon;
grant insert on table public.members to anon;
grant update on table public.members to anon;
grant delete on table public.members to anon;
grant select on table public.members to authenticated;
grant insert on table public.members to authenticated;
grant update on table public.members to authenticated;
grant delete on table public.members to authenticated;
grant select on table public.members to service_role;
grant insert on table public.members to service_role;
grant update on table public.members to service_role;
grant delete on table public.members to service_role;
alter table public.members enable row level security;
revoke all on table public.monthly_summary from public, anon, authenticated, service_role;
grant select on table public.monthly_summary to anon;
grant insert on table public.monthly_summary to anon;
grant update on table public.monthly_summary to anon;
grant delete on table public.monthly_summary to anon;
grant select on table public.monthly_summary to authenticated;
grant insert on table public.monthly_summary to authenticated;
grant update on table public.monthly_summary to authenticated;
grant delete on table public.monthly_summary to authenticated;
grant select on table public.monthly_summary to service_role;
grant insert on table public.monthly_summary to service_role;
grant update on table public.monthly_summary to service_role;
grant delete on table public.monthly_summary to service_role;
revoke all on table public.payments from public, anon, authenticated, service_role;
grant select on table public.payments to anon;
grant insert on table public.payments to anon;
grant update on table public.payments to anon;
grant delete on table public.payments to anon;
grant select on table public.payments to authenticated;
grant insert on table public.payments to authenticated;
grant update on table public.payments to authenticated;
grant delete on table public.payments to authenticated;
grant select on table public.payments to service_role;
grant insert on table public.payments to service_role;
grant update on table public.payments to service_role;
grant delete on table public.payments to service_role;
alter table public.payments enable row level security;
revoke all on table public.telegram_group_memberships from public, anon, authenticated, service_role;
grant select on table public.telegram_group_memberships to service_role;
grant insert on table public.telegram_group_memberships to service_role;
grant update on table public.telegram_group_memberships to service_role;
grant delete on table public.telegram_group_memberships to service_role;
alter table public.telegram_group_memberships enable row level security;
revoke all on table public.telegram_training_members from public, anon, authenticated, service_role;
grant select on table public.telegram_training_members to service_role;
grant insert on table public.telegram_training_members to service_role;
grant update on table public.telegram_training_members to service_role;
grant delete on table public.telegram_training_members to service_role;
revoke all on table public.telegram_training_stats from public, anon, authenticated, service_role;
grant select on table public.telegram_training_stats to service_role;
grant insert on table public.telegram_training_stats to service_role;
grant update on table public.telegram_training_stats to service_role;
grant delete on table public.telegram_training_stats to service_role;
revoke all on table public.telegram_unmatched from public, anon, authenticated, service_role;
grant select on table public.telegram_unmatched to anon;
grant insert on table public.telegram_unmatched to anon;
grant update on table public.telegram_unmatched to anon;
grant delete on table public.telegram_unmatched to anon;
grant select on table public.telegram_unmatched to authenticated;
grant insert on table public.telegram_unmatched to authenticated;
grant update on table public.telegram_unmatched to authenticated;
grant delete on table public.telegram_unmatched to authenticated;
grant select on table public.telegram_unmatched to service_role;
grant insert on table public.telegram_unmatched to service_role;
grant update on table public.telegram_unmatched to service_role;
grant delete on table public.telegram_unmatched to service_role;
alter table public.telegram_unmatched enable row level security;
revoke all on table public.training_sessions from public, anon, authenticated, service_role;
grant select on table public.training_sessions to anon;
grant insert on table public.training_sessions to anon;
grant update on table public.training_sessions to anon;
grant delete on table public.training_sessions to anon;
grant select on table public.training_sessions to authenticated;
grant insert on table public.training_sessions to authenticated;
grant update on table public.training_sessions to authenticated;
grant delete on table public.training_sessions to authenticated;
grant select on table public.training_sessions to service_role;
grant insert on table public.training_sessions to service_role;
grant update on table public.training_sessions to service_role;
grant delete on table public.training_sessions to service_role;
alter table public.training_sessions enable row level security;
revoke all on table public.trial_bookings from public, anon, authenticated, service_role;
grant select on table public.trial_bookings to service_role;
grant insert on table public.trial_bookings to service_role;
grant update on table public.trial_bookings to service_role;
grant delete on table public.trial_bookings to service_role;
alter table public.trial_bookings enable row level security;
revoke all on table public.trial_config from public, anon, authenticated, service_role;
grant select on table public.trial_config to service_role;
grant insert on table public.trial_config to service_role;
grant update on table public.trial_config to service_role;
grant delete on table public.trial_config to service_role;
alter table public.trial_config enable row level security;
revoke all on table public.trial_invitations from public, anon, authenticated, service_role;
grant select on table public.trial_invitations to service_role;
grant insert on table public.trial_invitations to service_role;
grant update on table public.trial_invitations to service_role;
grant delete on table public.trial_invitations to service_role;
alter table public.trial_invitations enable row level security;
revoke all on table public.trial_messages from public, anon, authenticated, service_role;
grant select on table public.trial_messages to service_role;
grant insert on table public.trial_messages to service_role;
grant update on table public.trial_messages to service_role;
grant delete on table public.trial_messages to service_role;
alter table public.trial_messages enable row level security;
revoke all on table public.trial_prospects from public, anon, authenticated, service_role;
grant select on table public.trial_prospects to service_role;
grant insert on table public.trial_prospects to service_role;
grant update on table public.trial_prospects to service_role;
grant delete on table public.trial_prospects to service_role;
alter table public.trial_prospects enable row level security;
revoke all on table public.trial_questions from public, anon, authenticated, service_role;
grant select on table public.trial_questions to service_role;
grant insert on table public.trial_questions to service_role;
grant update on table public.trial_questions to service_role;
grant delete on table public.trial_questions to service_role;
alter table public.trial_questions enable row level security;
revoke all on table public.trial_reply_drafts from public, anon, authenticated, service_role;
grant select on table public.trial_reply_drafts to service_role;
grant insert on table public.trial_reply_drafts to service_role;
grant update on table public.trial_reply_drafts to service_role;
grant delete on table public.trial_reply_drafts to service_role;
alter table public.trial_reply_drafts enable row level security;

create policy "Authenticated read members" on public.members as PERMISSIVE for SELECT to authenticated using (true);
create policy "Authenticated write members" on public.members as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "Authenticated read payments" on public.payments as PERMISSIVE for SELECT to authenticated using (true);
create policy "Authenticated write payments" on public.payments as PERMISSIVE for ALL to authenticated using (true) with check (true);

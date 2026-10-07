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
-- Ultima regenerare: 7 octombrie 2026 (după `sala_06_ziua_din_telegram`).

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
  payload jsonb
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

alter table public.attendance add constraint attendance_pkey PRIMARY KEY (id);
alter table public.attendance add constraint attendance_session_id_member_id_key UNIQUE (session_id, member_id);
alter table public.attendance_log add constraint attendance_log_pkey PRIMARY KEY (id);
alter table public.bot_actions add constraint bot_actions_pkey PRIMARY KEY (id);
alter table public.bot_config add constraint bot_config_pkey PRIMARY KEY (id);
alter table public.members add constraint members_pkey PRIMARY KEY (id);
alter table public.members add constraint members_telegram_user_id_key UNIQUE (telegram_user_id);
alter table public.payments add constraint payments_pkey PRIMARY KEY (id);
alter table public.telegram_unmatched add constraint telegram_unmatched_pkey PRIMARY KEY (telegram_user_id);
alter table public.training_sessions add constraint training_sessions_pkey PRIMARY KEY (id);
alter table public.training_sessions add constraint training_sessions_session_date_key UNIQUE (session_date);
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
alter table public.training_sessions add constraint training_sessions_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'done'::text, 'cancelled'::text])));

CREATE INDEX attendance_log_session_idx ON public.attendance_log USING btree (session_id, created_at);
CREATE INDEX attendance_member_idx ON public.attendance USING btree (member_id);
CREATE INDEX attendance_session_idx ON public.attendance USING btree (session_id);
CREATE INDEX bot_actions_pending_idx ON public.bot_actions USING btree (created_at) WHERE (status = 'pending'::text);
CREATE INDEX idx_payments_date ON public.payments USING btree (payment_date);
CREATE INDEX idx_payments_member ON public.payments USING btree (member_id);

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

revoke all on function public.merge_members(keep uuid, remove uuid) from public, anon, authenticated, service_role;
grant execute on function public.merge_members(keep uuid, remove uuid) to service_role;

revoke all on table public.attendance from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.attendance to anon, authenticated, service_role;
alter table public.attendance enable row level security;
revoke all on table public.attendance_log from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.attendance_log to anon, authenticated, service_role;
alter table public.attendance_log enable row level security;
revoke all on table public.bot_actions from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.bot_actions to anon, authenticated, service_role;
alter table public.bot_actions enable row level security;
revoke all on table public.bot_config from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.bot_config to anon, authenticated, service_role;
alter table public.bot_config enable row level security;
revoke all on table public.member_attendance_stats from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.member_attendance_stats to service_role;
revoke all on table public.members from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.members to anon, authenticated, service_role;
alter table public.members enable row level security;
revoke all on table public.monthly_summary from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.monthly_summary to anon, authenticated, service_role;
revoke all on table public.payments from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.payments to anon, authenticated, service_role;
alter table public.payments enable row level security;
revoke all on table public.telegram_unmatched from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.telegram_unmatched to anon, authenticated, service_role;
alter table public.telegram_unmatched enable row level security;
revoke all on table public.training_sessions from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.training_sessions to anon, authenticated, service_role;
alter table public.training_sessions enable row level security;

create policy "Authenticated read members" on public.members as PERMISSIVE for SELECT to authenticated using (true);
create policy "Authenticated write members" on public.members as PERMISSIVE for ALL to authenticated using (true) with check (true);
create policy "Authenticated read payments" on public.payments as PERMISSIVE for SELECT to authenticated using (true);
create policy "Authenticated write payments" on public.payments as PERMISSIVE for ALL to authenticated using (true) with check (true);

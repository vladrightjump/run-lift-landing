-- Membership of the single group managed by TELEGRAM_GROUP_CHAT_ID.
-- Apply after sala_06, before deploying the bot/UI. No historical data is deleted.
-- Service-only observation writes; the admin reads through its authenticated RPC.
begin;
create table if not exists public.telegram_group_memberships (
  telegram_user_id bigint primary key,
  chat_id text not null,
  state text not null default 'unknown' check (state in ('unknown', 'in_group', 'left', 'kicked')),
  observed_at timestamptz,
  next_check_at timestamptz not null default now(),
  check_failed boolean not null default false
);
alter table public.telegram_group_memberships enable row level security;
revoke all on public.telegram_group_memberships from public, anon, authenticated;
grant all on public.telegram_group_memberships to service_role;

create or replace function public.record_telegram_membership(
  p_user_id bigint, p_chat_id text, p_state text, p_observed_at timestamptz,
  p_username text, p_first_name text, p_last_name text
) returns void language plpgsql security definer set search_path = '' as $$
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
end $$;

create or replace function public.telegram_membership_candidates(p_chat_id text)
returns table(telegram_user_id bigint) language plpgsql security definer set search_path = '' as $$
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
end $$;

create or replace function public.telegram_membership_retry(p_user_id bigint, p_chat_id text)
returns void language sql security definer set search_path = '' as $$
  update public.telegram_group_memberships set next_check_at = now() + interval '15 minutes', check_failed = true
    where telegram_user_id = p_user_id and chat_id = p_chat_id;
$$;

create or replace function runlift.admin_sala_verifica_membri(p_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  update public.telegram_group_memberships set next_check_at = now();
end $$;

-- Both entry points serialize on the member and deduplicate pending removals.
-- Membership, not the person's training status, changes when Telegram confirms it.
create or replace function public.queue_telegram_kick(
  p_member uuid, p_expected_id bigint, p_chat_id text, p_actor bigint, p_name text
) returns uuid language plpgsql security definer set search_path = '' as $$
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
end $$;

create or replace function runlift.admin_sala_scoate_din_grup(p_token uuid, p_membru uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  v_id := public.queue_telegram_kick(p_membru, null, null, null, null);
  perform runlift.sala_jurnal(p_token, 'sala_scoatere', jsonb_build_object('membru', p_membru, 'comanda', v_id));
  return v_id;
end $$;

revoke all on function public.record_telegram_membership(bigint,text,text,timestamptz,text,text,text),
  public.telegram_membership_candidates(text), public.telegram_membership_retry(bigint,text),
  public.queue_telegram_kick(uuid,bigint,text,bigint,text) from public, anon, authenticated;
grant execute on function public.record_telegram_membership(bigint,text,text,timestamptz,text,text,text),
  public.telegram_membership_candidates(text), public.telegram_membership_retry(bigint,text),
  public.queue_telegram_kick(uuid,bigint,text,bigint,text) to service_role;
revoke all on function runlift.admin_sala_verifica_membri(uuid) from public;
grant execute on function runlift.admin_sala_verifica_membri(uuid) to anon, authenticated, service_role;

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
        'bot_dm_enabled', m.bot_dm_enabled, 'join_date', m.join_date,
        'telegram_membership', coalesce(g.state, 'unknown'),
        'telegram_checked_at', g.observed_at, 'telegram_check_failed', coalesce(g.check_failed, false)
      ) order by m.full_name)
      from public.members m
      left join public.telegram_group_memberships g on g.telegram_user_id = m.telegram_user_id
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
      left join public.telegram_group_memberships g on g.telegram_user_id = n.telegram_user_id
      where coalesce(g.state, 'unknown') not in ('left', 'kicked')
        and not exists (select 1 from public.members m where m.telegram_user_id = n.telegram_user_id)
    ), '[]'::jsonb),
    'comenzi', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'action', b.action, 'member_id', b.member_id, 'status', b.status,
        'result', b.result, 'created_at', b.created_at, 'processed_at', b.processed_at,
        'sursa', b.payload ->> 'sursa', 'organizator', b.payload ->> 'organizator',
        'data', b.payload ->> 'data'
      ) order by b.created_at desc)
      from (select * from public.bot_actions order by created_at desc limit 30) b
    ), '[]'::jsonb),
    -- Ultima scoatere a fiecărui membru, oricât de veche: o scoatere eșuată
    -- trebuie să rămână la vedere până e reîncercată.
    'scoateri', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'action', b.action, 'member_id', b.member_id, 'status', b.status,
        'result', b.result, 'created_at', b.created_at, 'processed_at', b.processed_at
      ) order by b.created_at desc)
      from (
        select distinct on (k.member_id) k.*
          from public.bot_actions k
         where k.action = 'kick_member' and k.member_id is not null
         order by k.member_id, k.created_at desc
      ) b
    ), '[]'::jsonb)
  );
end;
$function$;
-- Scheduled messages must not ask departed members for a response.
create or replace view public.telegram_training_members as
  select m.* from public.members m
  left join public.telegram_group_memberships g on g.telegram_user_id = m.telegram_user_id
  where m.status = 'active' and m.telegram_user_id is not null
    and coalesce(g.state, 'unknown') not in ('left', 'kicked');
revoke all on public.telegram_training_members from public, anon, authenticated;
grant select on public.telegram_training_members to service_role;
create or replace view public.telegram_training_stats as
  select s.* from public.member_attendance_stats s
  join public.telegram_training_members m on m.id = s.id;
revoke all on public.telegram_training_stats from public, anon, authenticated;
grant select on public.telegram_training_stats to service_role;
commit;

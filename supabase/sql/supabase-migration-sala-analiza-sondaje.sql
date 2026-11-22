begin;

alter table public.training_sessions
  add column if not exists poll_recorded_at timestamptz,
  add column if not exists poll_roster uuid[];

-- sendPoll saves Telegram's message ID immediately after a successful post.
-- Keep the first post as the origin even when an organizer resends the poll.
create or replace function runlift.sala_capture_poll()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.poll_recorded_at := clock_timestamp();
  new.poll_roster := array(
    select m.id from public.members m
    join public.telegram_group_memberships g using (telegram_user_id)
    where m.status = 'active' and not m.is_admin and g.state = 'in_group'
      and m.join_date <= new.session_date
  );
  return new;
end $$;
revoke all on function runlift.sala_capture_poll() from public, anon, authenticated;

drop trigger if exists sala_capture_poll on public.training_sessions;
create trigger sala_capture_poll before update of poll_message_id on public.training_sessions
for each row when (old.poll_message_id is null and new.poll_message_id is not null and old.poll_roster is null)
execute function runlift.sala_capture_poll();

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
        'location', t.location, 'status', t.status, 'poll_sent', t.poll_message_id is not null,
        'poll_roster', t.poll_roster
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
        'reviewed_at', b.reviewed_at, 'result', b.result, 'created_at', b.created_at, 'processed_at', b.processed_at,
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
        'reviewed_at', b.reviewed_at, 'result', b.result, 'created_at', b.created_at, 'processed_at', b.processed_at
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

-- Fetch the log only for the workout selected in the analytics screen.
create or replace function runlift.admin_sala_voturi(p_token uuid, p_sesiune uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return jsonb_build_object(
    'posted_at', (select poll_recorded_at from public.training_sessions where id = p_sesiune),
    'votes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', m.id, 'name', m.full_name, 'response', l.response, 'at', l.created_at
      ) order by l.created_at, l.id)
      from public.attendance_log l
      join public.members m on m.id = l.member_id
      where l.session_id = p_sesiune and l.source = 'telegram'
        and not m.is_admin and l.response in ('yes', 'no')
    ), '[]'::jsonb)
  );
end $$;
revoke all on function runlift.admin_sala_voturi(uuid,uuid) from public;
grant execute on function runlift.admin_sala_voturi(uuid,uuid) to anon, authenticated, service_role;
commit;

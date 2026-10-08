-- Acknowledgement is separate from execution status; no Telegram action is queued.
begin;
alter table public.bot_actions add column if not exists reviewed_at timestamptz;
create or replace function runlift.admin_sala_marcheaza_verificat(p_token uuid, p_comanda uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_status text; v_reviewed timestamptz;
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select status, reviewed_at into v_status, v_reviewed from public.bot_actions where id = p_comanda for update;
  if not found then raise exception 'comanda_inexistenta'; end if;
  if v_status <> 'failed' then raise exception 'comanda_neesuata'; end if;
  if v_reviewed is not null then return; end if;
  update public.bot_actions set reviewed_at = now() where id = p_comanda;
  perform runlift.sala_jurnal(p_token, 'sala_comanda_verificata', jsonb_build_object('comanda', p_comanda));
end $$;
revoke all on function runlift.admin_sala_marcheaza_verificat(uuid,uuid) from public;
grant execute on function runlift.admin_sala_marcheaza_verificat(uuid,uuid) to anon, authenticated, service_role;
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

commit;

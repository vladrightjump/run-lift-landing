-- Corectură din al treilea review al ramurii `feat/botul-si-prezentele-in-admin`,
-- peste `sala_04` (planul `docs/plans/2026-10-03-1107-feat-botul-si-prezentele-in-admin-plan.md`).
--
-- Aplicată prin MCP `apply_migration` ca `sala_05_scoateri`.
--
-- Doar `create or replace` pe `admin_sala_date`, fără schimbare de semnătură,
-- fără coloane și fără drepturi noi (`create or replace` păstrează drepturile).
--
-- `admin_sala_date` întoarce și `scoateri`: ultima comandă `kick_member` a
-- fiecărui membru, oricât de veche. Până acum ecranele o căutau doar printre
-- ultimele 30 de comenzi (`comenzi`), așa că, după 30 de comenzi mai noi, o
-- scoatere eșuată dispărea din „Scoateri eșuate", iar membrul — trecut pe
-- „ieșit" la cerere, dar încă în grup — primea „E deja ieșit." cu butonul de
-- reîncercare blocat.
--
-- ÎNTOARCERE: corpul `admin_sala_date` din
-- `supabase/sql/supabase-migration-sala-mai-putine-date.sql` (fără `scoateri`;
-- ecranele de după această migrare au nevoie de cheie, deci se întorc odată cu ele).

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

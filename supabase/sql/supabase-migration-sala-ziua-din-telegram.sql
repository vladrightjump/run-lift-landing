-- Ziua de antrenament condusă din Telegram (planul
-- `docs/plans/2026-10-06-2353-feat-ziua-de-antrenament-din-telegram-plan.md`,
-- U1, KTD4, KTD14), peste `sala_05_scoateri`.
--
-- Se aplică prin MCP `apply_migration` ca `sala_06_ziua_din_telegram`, ODATĂ cu
-- botul care înțelege acțiunile noi. Aplicată înaintea lui, fiecare anulare din
-- admin ar pune în coadă un `cancel_session` pe care botul vechi îl marchează
-- „unsupported" și îl raportează adminilor ca eșec.
--
-- Se poate rula de mai multe ori (`if exists`, `create or replace`): testele SQL
-- o încarcă peste instantaneele de dinainte de ea, până la regenerarea lor.
--
--   1. Coada botului (`public.bot_actions`) primește patru acțiuni noi:
--      `cancel_session`, `reactivate_session`, `move_session`, `add_session`.
--      Botul le scrie ca jurnal pentru ce face din Telegram; adminul pune în
--      coadă primele două, ca botul să anunțe grupul.
--   2. `admin_sala_seteaza_antrenament` primește un motiv opțional și, când
--      starea se schimbă pe un antrenament al cărui sondaj e deja în grup, pune în
--      coadă anunțul (`cancel_session` / `reactivate_session`). Fără sondaj în
--      grup n-are ce anunța (R11), deci nu pune nimic. Semnătura veche (trei
--      parametri) se șterge, ca PostgREST să nu aleagă între două variante; un
--      apel pe nume cu cei trei parametri vechi ajunge la cea nouă.
--   3. `admin_sala_date` întoarce pentru fiecare comandă și `sursa`,
--      `organizator` și `data` din `payload`, ca „Ultimele comenzi" să spună cine
--      a dat-o.
--
-- ÎNTOARCERE: constrângerea cu lista veche (fără cele patru), funcția
-- `admin_sala_seteaza_antrenament(uuid, date, boolean)` din
-- `supabase/sql/supabase-migration-sala-corecturi.sql` cu drepturile ei (vezi
-- `supabase/sql/supabase-migration-sala-functii-admin.sql`) și `admin_sala_date`
-- din `supabase/sql/supabase-migration-sala-scoateri.sql`. Rândurile cu
-- acțiunile noi trebuie scoase din `bot_actions` înainte de constrângere.

-- ---------------------------------------------------------------------------
-- 1. Acțiunile noi din coadă
-- ---------------------------------------------------------------------------

alter table public.bot_actions drop constraint if exists bot_actions_action_check;
alter table public.bot_actions add constraint bot_actions_action_check check (
  action = any (array[
    'kick_member', 'send_poll', 'send_summary', 'send_reminder', 'send_message',
    'cancel_session', 'reactivate_session', 'move_session', 'add_session'
  ])
);

-- ---------------------------------------------------------------------------
-- 2. Anularea și reactivarea anunță grupul (R13)
-- ---------------------------------------------------------------------------

drop function if exists runlift.admin_sala_seteaza_antrenament(uuid, date, boolean);

create or replace function runlift.admin_sala_seteaza_antrenament(
  p_token uuid, p_data date, p_anulat boolean, p_motiv text default null
)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_alb constant text := E' \t\r\n';
  v_motiv text := nullif(btrim(coalesce(p_motiv, ''), v_alb), '');
  v_stare text;
  v_sondaj bigint;
  v_schimbat boolean;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_data is null or p_anulat is null then raise exception 'data_invalida'; end if;
  if char_length(v_motiv) > 200 then raise exception 'motiv_prea_lung'; end if;

  select t.status, t.poll_message_id into v_stare, v_sondaj
    from public.training_sessions t where t.session_date = p_data;

  if p_anulat then
    -- Ora și locul vin din setările botului, ca la rândul pe care îl creează
    -- botul când trimite sondajul; fără setări, rămân valorile coloanelor.
    insert into public.training_sessions (session_date, status, starts_at, location)
    select p_data, 'cancelled',
           coalesce(c.training_time::time, '06:30'::time),
           coalesce(c.location, 'Parcul Dumitru Râșcanu')
      from (select 1) x
      left join public.bot_config c on c.id = 1
    on conflict (session_date) do update set status = 'cancelled';
    v_schimbat := v_stare is distinct from 'cancelled';
  else
    update public.training_sessions set status = 'scheduled'
     where session_date = p_data and status = 'cancelled';
    v_schimbat := v_stare = 'cancelled';
  end if;

  -- Anunțul îl dă botul, la următorul tic (KTD4). Numai când sondajul e în grup:
  -- altfel nimeni n-a votat și n-are pe cine pomeni.
  if v_schimbat and v_sondaj is not null then
    insert into public.bot_actions (action, payload)
    values (
      case when p_anulat then 'cancel_session' else 'reactivate_session' end,
      jsonb_strip_nulls(jsonb_build_object(
        'data', p_data,
        'motiv', v_motiv,
        'sursa', 'admin',
        'organizator', (
          select u.username from admin_sessions s join admin_users u on u.id = s.user_id
           where s.token = p_token
        )
      ))
    );
  end if;

  perform sala_jurnal(p_token, case when p_anulat then 'sala_anulare' else 'sala_reactivare' end,
    jsonb_strip_nulls(jsonb_build_object('data', p_data, 'motiv', v_motiv)));
end;
$function$;

revoke all on function runlift.admin_sala_seteaza_antrenament(uuid, date, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_sala_seteaza_antrenament(uuid, date, boolean, text)
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. „Ultimele comenzi" spun cine a dat comanda (R24)
-- ---------------------------------------------------------------------------

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

-- Corecturile din review-ul ramurii `feat/botul-si-prezentele-in-admin`, peste
-- funcțiile din `sala_02_functii_admin` (planul
-- `docs/plans/2026-10-03-1107-feat-botul-si-prezentele-in-admin-plan.md`).
--
-- Aplicată prin MCP `apply_migration` ca `sala_03_corecturi`.
--
-- Doar `create or replace` pe funcții existente, fără schimbare de semnătură:
-- nicio coloană, niciun drept nou. Drepturile puse în `sala_02` rămân, fiindcă
-- `create or replace` nu le atinge.
--
--   1. `admin_list_events` nu mai întoarce rândurile `sala_*`. Limita de 200 se
--      aplica ÎNAINTEA listei albe din client (`TIPURI_ACTIVITATE`), deci câteva
--      sute de prezențe marcate de mână împingeau renunțările și promovările
--      afară din „Activitate recentă".
--   2. `admin_sala_rezumat` spune și dacă sondajul antrenamentului următor a
--      plecat: un rând `scheduled` fără sondaj (după o reactivare sau o trimitere
--      picată) nu mai apare pe card ca „0 vin" (AE4).
--   3. `admin_sala_salveaza_config` nu mai scrie `enabled` peste un rând
--      existent. Comutatorul (`admin_sala_porneste_bot`) e singurul care îl
--      schimbă: o ciornă de setări deschisă înainte de „Oprește botul" îl
--      repornea la salvare.
--   4. `admin_sala_comanda`:
--      • refuză sondajul și reminderul „acum" când antrenamentul de mâine e
--        anulat — botul nu trimitea nimic, dar comanda ieșea „făcută";
--      • nu mai pune în coadă a doua oară sondajul, rezumatul sau reminderul cât
--        timp unul la fel așteaptă: întoarce comanda existentă. Botul trimite
--        sondajul „acum" chiar dacă a plecat deja, deci două apăsări într-un
--        minut însemnau două sondaje în grup. Mesajul liber rămâne liber.
--   5. `admin_sala_seteaza_antrenament`, când anularea creează rândul, ia ora și
--      locul din setările botului, nu valorile implicite ale coloanelor: după o
--      reactivare, sondajul și ecranele arată ora și locul reale.
--
-- ÎNLOCUITĂ PARȚIAL: `admin_sala_salveaza_config` de aici e redefinită de
-- `supabase-migration-sala-mai-putine-date.sql` (`sala_04`). O nouă rulare a
-- acestui fișier după `sala_04` îi întoarce corectura (spațiile albe). Definiția
-- live: `supabase/schema/runlift.sql`. Întoarcerile se fac în ordine inversă:
-- întâi `sala_05`, apoi `sala_04`, abia apoi aceasta.
--
-- ÎNTOARCERE: rulează din nou corpurile din
-- `supabase/sql/supabase-migration-sala-functii-admin.sql` pentru funcțiile
-- 2–5 și corpul vechi al lui `admin_list_events` (fără `where e.tip not like
-- 'sala\_%'`, vezi `supabase/schema/runlift.sql` din commitul de dinainte).

-- ---------------------------------------------------------------------------
-- 1. Fluxul de activitate al edițiilor
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_list_events(p_token uuid, p_limit integer default 200)
returns table(id uuid, created_at timestamp with time zone, tip text, detaliu jsonb)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select e.id, e.created_at, e.tip, e.detaliu
    from admin_events e
    -- Urma scrierilor din ecranele grupului rămâne în tabel (cine a făcut ce),
    -- dar nu ocupă locurile fluxului edițiilor.
    where e.tip not like 'sala\_%'
    order by e.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Cardul de pe pornire
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_sala_rezumat(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'runlift'
as $function$
declare
  v_urm public.training_sessions;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select * into v_urm from public.training_sessions t
   where t.session_date >= sala_azi()
   order by t.session_date limit 1;

  return jsonb_build_object(
    'azi', sala_azi(),
    'pornit', (select c.enabled from public.bot_config c where c.id = 1),
    'poll_days', (select c.poll_days from public.bot_config c where c.id = 1),
    'poll_time', (select c.poll_time from public.bot_config c where c.id = 1),
    'urmatorul', case when v_urm.id is null then null else jsonb_build_object(
      'session_date', v_urm.session_date,
      'starts_at', to_char(v_urm.starts_at, 'HH24:MI'),
      'location', v_urm.location,
      'status', v_urm.status,
      'poll_sent', v_urm.poll_message_id is not null,
      'vin', (select count(*) from public.attendance a where a.session_id = v_urm.id and a.response = 'yes'),
      'nu_vin', (select count(*) from public.attendance a where a.session_id = v_urm.id and a.response = 'no')
    ) end
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Setările botului
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_sala_salveaza_config(p_token uuid, p_config jsonb)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_zile_sondaj smallint[];
  v_zile_rezumat smallint[];
  v_text text;
  v_cheie text;
  v_prag integer;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'config_invalid'; end if;

  -- Zilele: 0 = duminică … 6 = sâmbătă, fără dubluri. O listă goală e voie
  -- (niciun sondaj programat, doar „trimite acum").
  foreach v_cheie in array array['poll_days', 'summary_days'] loop
    if jsonb_typeof(p_config -> v_cheie) is distinct from 'array'
       or exists (
         select 1 from jsonb_array_elements(p_config -> v_cheie) z
          where jsonb_typeof(z) <> 'number' or (z #>> '{}') !~ '^[0-6]$'
       )
       or (select count(*) from jsonb_array_elements(p_config -> v_cheie))
          <> (select count(distinct z) from jsonb_array_elements(p_config -> v_cheie) z)
    then
      raise exception 'zi_invalida';
    end if;
  end loop;
  select coalesce(array_agg((z #>> '{}')::smallint order by (z #>> '{}')::smallint), '{}')
    into v_zile_sondaj from jsonb_array_elements(p_config -> 'poll_days') z;
  select coalesce(array_agg((z #>> '{}')::smallint order by (z #>> '{}')::smallint), '{}')
    into v_zile_rezumat from jsonb_array_elements(p_config -> 'summary_days') z;

  foreach v_cheie in array array['poll_time', 'summary_time', 'training_time'] loop
    if coalesce(p_config ->> v_cheie, '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'ora_invalida';
    end if;
  end loop;

  v_text := btrim(coalesce(p_config ->> 'location', ''));
  if char_length(v_text) = 0 or char_length(v_text) > 120 then raise exception 'loc_invalid'; end if;

  if jsonb_typeof(p_config -> 'enabled') is distinct from 'boolean'
     or jsonb_typeof(p_config -> 'auto_reminder_enabled') is distinct from 'boolean'
  then
    raise exception 'config_invalid';
  end if;

  if jsonb_typeof(p_config -> 'reminder_threshold') is distinct from 'number'
     or (p_config ->> 'reminder_threshold') !~ '^[0-9]{1,3}$'
  then
    raise exception 'prag_invalid';
  end if;
  v_prag := (p_config ->> 'reminder_threshold')::integer;

  -- Textul sondajului: gol → null, adică textul de azi.
  if char_length(btrim(coalesce(p_config ->> 'poll_title', ''))) > 80
     or char_length(btrim(coalesce(p_config ->> 'poll_yes_label', ''))) > 32
     or char_length(btrim(coalesce(p_config ->> 'poll_no_label', ''))) > 32
  then
    raise exception 'text_prea_lung';
  end if;

  -- `enabled` intră doar la prima scriere, când rândul nu există. După aceea îl
  -- schimbă numai comutatorul (`admin_sala_porneste_bot`): formularul poate
  -- purta o valoare veche, citită înainte ca cineva să oprească botul.
  insert into public.bot_config as c (
    id, enabled, poll_days, poll_time, summary_days, summary_time, training_time, location,
    auto_reminder_enabled, reminder_threshold, poll_title, poll_yes_label, poll_no_label, updated_at
  ) values (
    1,
    (p_config ->> 'enabled')::boolean,
    v_zile_sondaj,
    p_config ->> 'poll_time',
    v_zile_rezumat,
    p_config ->> 'summary_time',
    p_config ->> 'training_time',
    v_text,
    (p_config ->> 'auto_reminder_enabled')::boolean,
    v_prag,
    nullif(btrim(coalesce(p_config ->> 'poll_title', '')), ''),
    nullif(btrim(coalesce(p_config ->> 'poll_yes_label', '')), ''),
    nullif(btrim(coalesce(p_config ->> 'poll_no_label', '')), ''),
    now()
  )
  on conflict (id) do update set
    poll_days = excluded.poll_days,
    poll_time = excluded.poll_time,
    summary_days = excluded.summary_days,
    summary_time = excluded.summary_time,
    training_time = excluded.training_time,
    location = excluded.location,
    auto_reminder_enabled = excluded.auto_reminder_enabled,
    reminder_threshold = excluded.reminder_threshold,
    poll_title = excluded.poll_title,
    poll_yes_label = excluded.poll_yes_label,
    poll_no_label = excluded.poll_no_label,
    updated_at = excluded.updated_at;

  perform sala_jurnal(p_token, 'sala_config', '{}'::jsonb);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Comenzile „acum"
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_sala_comanda(p_token uuid, p_actiune text, p_html text default null)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_id uuid;
  v_html text := btrim(coalesce(p_html, ''));
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_actiune is null or p_actiune not in ('send_poll', 'send_summary', 'send_reminder', 'send_message') then
    raise exception 'comanda_necunoscuta';
  end if;
  if p_actiune = 'send_message' then
    if char_length(v_html) = 0 then raise exception 'mesaj_gol'; end if;
    -- Limita fermă a Telegram pentru `sendMessage`.
    if char_length(v_html) > 4096 then raise exception 'mesaj_prea_lung'; end if;
  end if;

  -- Sondajul și reminderul sunt despre antrenamentul de mâine. Pentru o zi
  -- anulată botul nu trimite nimic, dar comanda ar fi ieșit „făcută".
  if p_actiune in ('send_poll', 'send_reminder') and exists (
    select 1 from public.training_sessions
     where session_date = sala_azi() + 1 and status = 'cancelled'
  ) then
    raise exception 'antrenament_anulat';
  end if;

  -- O a doua apăsare cât prima încă așteaptă nu mai pune nimic în coadă: botul
  -- ar trimite de două ori. Mesajul liber e altceva la fiecare apăsare.
  if p_actiune <> 'send_message' then
    select b.id into v_id from public.bot_actions b
     where b.action = p_actiune and b.status = 'pending'
     order by b.created_at desc limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.bot_actions (action, payload)
  values (p_actiune, case when p_actiune = 'send_message' then jsonb_build_object('html', v_html) end)
  returning id into v_id;

  perform sala_jurnal(p_token, 'sala_comanda', jsonb_build_object('actiune', p_actiune, 'comanda', v_id));
  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Anularea unei zile fără antrenament
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_sala_seteaza_antrenament(
  p_token uuid, p_data date, p_anulat boolean
)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_data is null or p_anulat is null then raise exception 'data_invalida'; end if;

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
  else
    update public.training_sessions set status = 'scheduled'
     where session_date = p_data and status = 'cancelled';
  end if;

  perform sala_jurnal(p_token, case when p_anulat then 'sala_anulare' else 'sala_reactivare' end,
    jsonb_build_object('data', p_data));
end;
$function$;

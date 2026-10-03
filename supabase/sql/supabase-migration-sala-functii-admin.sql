-- Funcțiile adminului Run + Lift peste tabelele grupului de antrenament
-- (planul `docs/plans/2026-10-03-1107-feat-botul-si-prezentele-in-admin-plan.md`,
-- U2; KTD1, KTD2, KTD3, KTD6).
--
-- Aplicată prin MCP `apply_migration` ca `sala_02_functii_admin`.
--
-- Adminul e o aplicație statică: nu are server și nu are cheia de service. Ajunge
-- la tabelele grupului din `public` exact cum ajunge la ale lui din `runlift` —
-- prin funcții SECURITY DEFINER care verifică întâi tokenul de sesiune
-- (`admin_check_token`). Funcțiile stau în `runlift`, ca clientul să le cheme cu
-- același `Content-Profile`; tabelele rămân unde sunt, numite complet calificat.
--
-- Semantica scrierilor e cea a acțiunilor din gym-app (`lib/attendance-actions.ts`,
-- `lib/session-actions.ts`, `lib/bot-config-actions.ts`, `lib/member-actions.ts`),
-- cu două diferențe deliberate:
--   • validarea respinge, nu „repară": o oră `25:00` e o eroare, nu `23:00`;
--   • nu există ștergere definitivă a unui membru (KTD7).
--
-- Re-rulabilă: coloanele cu `if not exists`, funcțiile cu `create or replace`,
-- drepturile se pun de la zero.
--
-- ÎNTOARCERE: doar adaugă (funcții și coloane nule). Se întoarce cu `drop function`
-- pe funcțiile `runlift.admin_sala_*` / `runlift.sala_*` și `alter table … drop
-- column` pe cele patru coloane, plus `grant execute on function
-- public.merge_members(uuid, uuid) to anon` dacă trebuie refăcută exact starea
-- de dinainte (n-ar trebui: era o gaură).

-- ---------------------------------------------------------------------------
-- 1. Textul sondajului (KTD6)
-- ---------------------------------------------------------------------------

-- Gol înseamnă textul de azi, scris în cod în bot. Botul de acum nu citește
-- coloanele, deci adăugarea lor nu-i schimbă nimic.
alter table public.bot_config add column if not exists poll_title text;
alter table public.bot_config add column if not exists poll_yes_label text;
alter table public.bot_config add column if not exists poll_no_label text;

-- Copia textului cu care a plecat sondajul. Webhook-ul redesenează mesajul la
-- fiecare vot din copia asta, nu din setările curente: o editare făcută cât un
-- sondaj e deja în grup ajunge doar la următorul (AE1).
alter table public.training_sessions add column if not exists poll_wording jsonb;

-- ---------------------------------------------------------------------------
-- 2. Ajutoare interne (nu se pot chema din API)
-- ---------------------------------------------------------------------------

-- Ziua de azi la Chișinău — „antrenamentul următor" se măsoară de aici, nu în UTC.
create or replace function runlift.sala_azi()
returns date
language sql
stable
set search_path to ''
as $function$
  select (pg_catalog.now() at time zone 'Europe/Chisinau')::date;
$function$;

-- Urma unei scrieri, cu numele adminului care a cerut-o (KTD3). Tipurile
-- `sala_*` nu apar în fluxul de activitate al edițiilor, care are listă albă.
create or replace function runlift.sala_jurnal(p_token uuid, p_tip text, p_detaliu jsonb)
returns void
language sql
security definer
set search_path to 'runlift'
as $function$
  insert into admin_events (tip, detaliu)
  values (
    p_tip,
    coalesce(p_detaliu, '{}'::jsonb) || jsonb_build_object(
      'admin',
      (select u.username from admin_sessions s join admin_users u on u.id = s.user_id
        where s.token = p_token)
    )
  );
$function$;

-- ---------------------------------------------------------------------------
-- 3. Citiri (KTD2)
-- ---------------------------------------------------------------------------

-- Tot ce le trebuie celor patru ecrane, dintr-o cerere. Datele sunt mici (zeci
-- de membri, sute de răspunsuri); analiza se calculează în browser. Fereastra de
-- 800 de zile e cea din gym-app: analiza pe un an compară cu anul dinainte.
-- Plățile nu apar nicăieri (R21).
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
        'phone', m.phone, 'email', m.email
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
    ), '[]'::jsonb)
  );
end;
$function$;

-- Cardul de pe pornire (R4, AE4): antrenamentul următor și câți vin, plus cât
-- îi trebuie cardului ca să spună când pleacă sondajul dacă antrenamentul nu
-- există încă.
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
      'vin', (select count(*) from public.attendance a where a.session_id = v_urm.id and a.response = 'yes'),
      'nu_vin', (select count(*) from public.attendance a where a.session_id = v_urm.id and a.response = 'no')
    ) end
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Prezențe și antrenamente
-- ---------------------------------------------------------------------------

-- Prezența de mână (R6): „yes", „no" sau „clear". Ca în gym-app: primul „yes"
-- al cuiva e marcat ca prim antrenament, iar jurnalul primește sursa `manual`.
create or replace function runlift.admin_sala_set_prezenta(
  p_token uuid, p_sesiune uuid, p_membru uuid, p_raspuns text
)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_primul boolean := false;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_raspuns is null or p_raspuns not in ('yes', 'no', 'clear') then
    raise exception 'raspuns_invalid';
  end if;
  if not exists (select 1 from public.training_sessions where id = p_sesiune) then
    raise exception 'antrenament_inexistent';
  end if;
  if not exists (select 1 from public.members where id = p_membru) then
    raise exception 'membru_inexistent';
  end if;

  if p_raspuns = 'clear' then
    delete from public.attendance where session_id = p_sesiune and member_id = p_membru;
  else
    if p_raspuns = 'yes' then
      v_primul := not exists (
        select 1 from public.attendance
         where member_id = p_membru and response = 'yes' and session_id <> p_sesiune
      );
    end if;
    insert into public.attendance (session_id, member_id, response, is_first_training, responded_at)
    values (p_sesiune, p_membru, p_raspuns, v_primul, now())
    on conflict (session_id, member_id) do update
      set response = excluded.response,
          is_first_training = excluded.is_first_training,
          responded_at = excluded.responded_at;
  end if;

  insert into public.attendance_log (session_id, member_id, response, source)
  values (p_sesiune, p_membru, p_raspuns, 'manual');

  perform sala_jurnal(p_token, 'sala_prezenta',
    jsonb_build_object('sesiune', p_sesiune, 'membru', p_membru, 'raspuns', p_raspuns));
end;
$function$;

-- Anularea sau reactivarea unei zile (R6). Anularea creează rândul dacă lipsește:
-- botul nu postează sondaj pentru o zi anulată.
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
    insert into public.training_sessions (session_date, status)
    values (p_data, 'cancelled')
    on conflict (session_date) do update set status = 'cancelled';
  else
    update public.training_sessions set status = 'scheduled'
     where session_date = p_data and status = 'cancelled';
  end if;

  perform sala_jurnal(p_token, case when p_anulat then 'sala_anulare' else 'sala_reactivare' end,
    jsonb_build_object('data', p_data));
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Setările botului (R11, R12)
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
    enabled = excluded.enabled,
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

-- Comutatorul pornit/oprit, fără să atingă orarul (ca în gym-app).
create or replace function runlift.admin_sala_porneste_bot(p_token uuid, p_pornit boolean)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_pornit is null then raise exception 'config_invalid'; end if;
  update public.bot_config set enabled = p_pornit, updated_at = now() where id = 1;
  perform sala_jurnal(p_token, 'sala_pornire', jsonb_build_object('pornit', p_pornit));
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Comenzi pentru bot (R13)
-- ---------------------------------------------------------------------------

-- Lista închisă de comenzi „acum". Scoaterea din grup are funcția ei, cu regulile
-- ei. Botul golește coada la fiecare minut.
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

  insert into public.bot_actions (action, payload)
  values (p_actiune, case when p_actiune = 'send_message' then jsonb_build_object('html', v_html) end)
  returning id into v_id;

  perform sala_jurnal(p_token, 'sala_comanda', jsonb_build_object('actiune', p_actiune, 'comanda', v_id));
  return v_id;
end;
$function$;

-- Scoaterea din grupul de Telegram (R9): adminii nu se scot, iar fără cont de
-- Telegram n-are ce scoate botul. Membrul trece pe `cancelled`, ca în gym-app.
create or replace function runlift.admin_sala_scoate_din_grup(p_token uuid, p_membru uuid)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_m public.members;
  v_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select * into v_m from public.members where id = p_membru;
  if v_m.id is null then raise exception 'membru_inexistent'; end if;
  if v_m.is_admin then raise exception 'membru_admin'; end if;
  if v_m.telegram_user_id is null then raise exception 'fara_telegram'; end if;

  insert into public.bot_actions (action, member_id, telegram_user_id)
  values ('kick_member', v_m.id, v_m.telegram_user_id)
  returning id into v_id;
  update public.members set status = 'cancelled' where id = v_m.id;

  perform sala_jurnal(p_token, 'sala_scoatere',
    jsonb_build_object('membru', v_m.id, 'nume', v_m.full_name, 'comanda', v_id));
  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Membrii (R8)
-- ---------------------------------------------------------------------------

-- Editarea unui membru, dintr-o bucată: nume, cont de Telegram, stare, admin.
-- Validările sunt cele din `updateMemberDetails` (gym-app).
create or replace function runlift.admin_sala_salveaza_membru(
  p_token uuid, p_membru uuid, p_nume text, p_telegram_id bigint, p_telegram_user text,
  p_status text, p_admin boolean
)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_nume text := btrim(regexp_replace(coalesce(p_nume, ''), '\s+', ' ', 'g'));
  v_user text := nullif(regexp_replace(btrim(coalesce(p_telegram_user, '')), '^@', ''), '');
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if not exists (select 1 from public.members where id = p_membru) then raise exception 'membru_inexistent'; end if;
  if char_length(v_nume) < 2 or char_length(v_nume) > 80 then raise exception 'nume_invalid'; end if;
  if p_telegram_id is not null and (p_telegram_id < 100 or p_telegram_id > 999999999999999) then
    raise exception 'telegram_invalid';
  end if;
  -- Doar litere, cifre și „_": orice altceva ar ajunge interpolat în HTML-ul
  -- unui mesaj din grup.
  if v_user is not null and v_user !~ '^[A-Za-z0-9_]{1,40}$' then raise exception 'utilizator_invalid'; end if;
  if p_status is null or p_status not in ('active', 'paused', 'cancelled') then raise exception 'status_invalid'; end if;
  if p_admin is null then raise exception 'status_invalid'; end if;
  if p_telegram_id is not null and exists (
    select 1 from public.members where telegram_user_id = p_telegram_id and id <> p_membru
  ) then
    raise exception 'telegram_deja_legat';
  end if;

  update public.members set
    full_name = v_nume,
    telegram_user_id = p_telegram_id,
    telegram_username = v_user,
    status = p_status,
    is_admin = p_admin
  where id = p_membru;

  perform sala_jurnal(p_token, 'sala_membru', jsonb_build_object('membru', p_membru, 'nume', v_nume));
end;
$function$;

-- Un cont de Telegram necunoscut (a votat, dar nu e legat de nimeni) devine al
-- unui membru existent. De acum voturile lui se numără la membru.
create or replace function runlift.admin_sala_leaga_cont(p_token uuid, p_telegram_id bigint, p_membru uuid)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_n public.telegram_unmatched;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select * into v_n from public.telegram_unmatched where telegram_user_id = p_telegram_id;
  if v_n.telegram_user_id is null then raise exception 'cont_inexistent'; end if;
  if not exists (select 1 from public.members where id = p_membru) then raise exception 'membru_inexistent'; end if;
  if exists (select 1 from public.members where telegram_user_id = p_telegram_id and id <> p_membru) then
    raise exception 'telegram_deja_legat';
  end if;

  update public.members set telegram_user_id = v_n.telegram_user_id, telegram_username = v_n.username
   where id = p_membru;
  delete from public.telegram_unmatched where telegram_user_id = p_telegram_id;

  perform sala_jurnal(p_token, 'sala_legare', jsonb_build_object('membru', p_membru, 'telegram', p_telegram_id));
end;
$function$;

-- Un cont necunoscut devine membru nou, cu numele prins de bot.
create or replace function runlift.admin_sala_membru_din_cont(p_token uuid, p_telegram_id bigint, p_nume text)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_n public.telegram_unmatched;
  v_nume text;
  v_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select * into v_n from public.telegram_unmatched where telegram_user_id = p_telegram_id;
  if v_n.telegram_user_id is null then raise exception 'cont_inexistent'; end if;
  if exists (select 1 from public.members where telegram_user_id = p_telegram_id) then
    raise exception 'telegram_deja_legat';
  end if;

  v_nume := left(btrim(regexp_replace(coalesce(p_nume, ''), '\s+', ' ', 'g')), 80);
  if char_length(v_nume) < 2 then
    v_nume := coalesce('@' || v_n.username, 'Membru nou');
  end if;

  insert into public.members (full_name, status, telegram_user_id, telegram_username, bot_dm_enabled)
  values (v_nume, 'active', v_n.telegram_user_id, v_n.username, false)
  returning id into v_id;
  delete from public.telegram_unmatched where telegram_user_id = p_telegram_id;

  perform sala_jurnal(p_token, 'sala_membru_nou', jsonb_build_object('membru', v_id, 'nume', v_nume));
  return v_id;
end;
$function$;

-- Unirea a doi membri: delegă la `public.merge_members`, care mută răspunsurile
-- pe cel păstrat și îl șterge pe duplicat.
create or replace function runlift.admin_sala_uneste(p_token uuid, p_pastrat uuid, p_eliminat uuid)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_nume text;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_pastrat is null or p_eliminat is null or p_pastrat = p_eliminat then raise exception 'acelasi_membru'; end if;
  select full_name into v_nume from public.members where id = p_eliminat;
  if v_nume is null or not exists (select 1 from public.members where id = p_pastrat) then
    raise exception 'membru_inexistent';
  end if;

  perform public.merge_members(p_pastrat, p_eliminat);

  perform sala_jurnal(p_token, 'sala_unire',
    jsonb_build_object('pastrat', p_pastrat, 'eliminat', p_eliminat, 'nume_eliminat', v_nume));
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Drepturile
-- ---------------------------------------------------------------------------

-- Ajutoarele interne: doar funcțiile de mai sus le cheamă.
revoke all on function runlift.sala_azi() from public, anon, authenticated, service_role;
revoke all on function runlift.sala_jurnal(uuid, text, jsonb) from public, anon, authenticated, service_role;

-- Funcțiile adminului: executabile de oricine, apărarea e tokenul din corp.
do $drepturi$
declare
  v_semnatura text;
begin
  foreach v_semnatura in array array[
    'runlift.admin_sala_date(uuid)',
    'runlift.admin_sala_rezumat(uuid)',
    'runlift.admin_sala_set_prezenta(uuid, uuid, uuid, text)',
    'runlift.admin_sala_seteaza_antrenament(uuid, date, boolean)',
    'runlift.admin_sala_salveaza_config(uuid, jsonb)',
    'runlift.admin_sala_porneste_bot(uuid, boolean)',
    'runlift.admin_sala_comanda(uuid, text, text)',
    'runlift.admin_sala_scoate_din_grup(uuid, uuid)',
    'runlift.admin_sala_salveaza_membru(uuid, uuid, text, bigint, text, text, boolean)',
    'runlift.admin_sala_leaga_cont(uuid, bigint, uuid)',
    'runlift.admin_sala_membru_din_cont(uuid, bigint, text)',
    'runlift.admin_sala_uneste(uuid, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_semnatura);
    execute format('grant execute on function %s to anon, authenticated, service_role', v_semnatura);
  end loop;
end;
$drepturi$;

-- `merge_members` rulează cu drepturile proprietarului și nu verifică cine o
-- cheamă: cu cheia publică, oricine știa două id-uri putea șterge un membru.
--
-- Constatat la aplicare (3 octombrie 2026): `anon` și `authenticated` n-aveau
-- drept explicit, ci îl moșteneau de la PUBLIC — instantaneul nu poate face
-- diferența, fiindcă îl citește prin `has_function_privilege`. Revocarea de la
-- PUBLIC i-a închis deci pe amândoi, nu doar pe `anon`. Rămân `postgres` și
-- `service_role`. gym-app nu e afectat: o cheamă cu cheia de service
-- (`createAdminClient` în `lib/member-actions.ts`), nu ca `authenticated`.
-- Pasul din U11 care ar fi revocat `authenticated` e astfel deja făcut.
revoke execute on function public.merge_members(uuid, uuid) from public, anon;

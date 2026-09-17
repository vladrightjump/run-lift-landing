-- Instantaneul schemei `runlift` din producție (proiectul ironworks-gym).
--
-- Generat din baza REALĂ, nu scris de mână: `scripts/schema-snapshot.sql` conține
-- interogarea care îl reproduce. E fixture-ul pe care rulează testele SQL
-- (`tests/unit/sql/*.test.ts`) pe un Postgres în proces (PGlite).
--
-- NU se aplică nicăieri: nu e o migrare. Migrările rămân fișierele
-- `supabase-migration-*.sql`. Ăsta e „ce e acum în producție", regenerat după
-- fiecare migrare aplicată — vezi MIGRATIONS.md.
--
-- Ultima regenerare: 17 septembrie 2026 (după `runlift_turnstile_lockdown`).

CREATE OR REPLACE FUNCTION runlift.admin_add_registration(p_token uuid, p_nume text, p_telefon text, p_email text, p_force boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_id uuid; v_cap int; v_count int; v_ed smallint := current_event_edition();
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  if not p_force then
    select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
      into v_cap;
    select count(*) into v_count
      from registrations where editie = v_ed and deleted_at is null;
    if v_count >= v_cap then raise exception 'event_full'; end if;
  end if;

  perform set_config('runlift.guard_bypass', '1', true);
  insert into registrations (nume, telefon, email, acord, editie)
  values (trim(p_nume), trim(p_telefon), lower(trim(p_email)), true, v_ed)
  returning id into v_id;

  insert into admin_events (tip, detaliu)
  values ('admin_add', jsonb_build_object(
    'id', v_id, 'nume', trim(p_nume), 'email', lower(trim(p_email)),
    'editie', v_ed, 'fortat', p_force));

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_check_token(p_token uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
  select exists (select 1 from admin_sessions where token = p_token and expires_at > now());
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_create_edition(p_token uuid)
 RETURNS smallint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_max  smallint;
  v_next smallint;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select greatest(
    coalesce((select max(r.editie) from registrations r), 0),
    coalesce((select max(w.editie) from event_waitlist w), 0),
    coalesce((select max(l.editie) from launch_notifications l), 0),
    current_event_edition(),
    current_launch_edition()
  ) into v_max;

  v_next := v_max + 1;
  if v_next > 100 then raise exception 'edition_limit'; end if;

  insert into app_config (key, value) values ('current_event_edition', v_next::text)
    on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value) values ('current_launch_edition', v_next::text)
    on conflict (key) do update set value = excluded.value;
  delete from app_config where key in ('registration_deadline', 'event_start');

  insert into admin_events (tip, detaliu)
  values ('editie_noua', jsonb_build_object('editie', v_next, 'anterioara', v_max));

  return v_next;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_delete_registration(p_token uuid, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_ed smallint; v_nume text; v_email text;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select editie, nume, email into v_ed, v_nume, v_email
    from registrations where id = p_id and deleted_at is null;
  if v_ed is null then return; end if;
  if v_ed <> current_event_edition() then raise exception 'edition_archived'; end if;

  update registrations set deleted_at = now() where id = p_id;

  insert into admin_events (tip, detaliu)
  values ('admin_delete', jsonb_build_object(
    'id', p_id, 'nume', v_nume, 'email', v_email, 'editie', v_ed));
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_delete_waitlist(p_token uuid, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_ed smallint; v_nume text; v_email text;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select editie, nume, email into v_ed, v_nume, v_email
    from event_waitlist where id = p_id and deleted_at is null;
  if v_ed is null then return; end if;
  if v_ed <> current_event_edition() then raise exception 'edition_archived'; end if;

  update event_waitlist set deleted_at = now() where id = p_id;

  insert into admin_events (tip, detaliu)
  values ('admin_delete_waitlist', jsonb_build_object(
    'id', p_id, 'nume', v_nume, 'email', v_email, 'editie', v_ed));
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_get_event_config(p_token uuid, p_editie integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, editie smallint, config jsonb, status text, created_at timestamp with time zone, published_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select c.id, c.editie, c.config, c.status, c.created_at, c.published_at
    from event_config c
    order by
      case c.status when 'draft' then 0 when 'published' then 1 else 2 end,
      c.published_at desc nulls last,
      c.created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_list_editions(p_token uuid)
 RETURNS TABLE(editie smallint, participanti integer, asteptare integer, lansare integer, prima timestamp with time zone, ultima timestamp with time zone, este_curenta boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_ed  smallint := current_event_edition();
  v_led smallint := current_launch_edition();
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    with toate as (
      select r.editie from registrations r
      union select w.editie from event_waitlist w
      union select l.editie from launch_notifications l
      union select v_ed
      union select v_led
    )
    select
      t.editie,
      (select count(*)::int from registrations r        where r.editie = t.editie and r.deleted_at is null),
      (select count(*)::int from event_waitlist w       where w.editie = t.editie and w.deleted_at is null),
      (select count(*)::int from launch_notifications l where l.editie = t.editie),
      (select min(r.created_at) from registrations r    where r.editie = t.editie and r.deleted_at is null),
      (select max(r.created_at) from registrations r    where r.editie = t.editie and r.deleted_at is null),
      t.editie = v_ed
    from toate t
    where t.editie is not null
    order by t.editie asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_list_email_log(p_token uuid, p_editie integer DEFAULT NULL::integer, p_limit integer DEFAULT 500, p_cu_text boolean DEFAULT true)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, email text, nume text, subiect text, text_email text, mod text, audienta text, sablon text, status text, provider_status integer, eroare text, editie smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_ed    smallint := coalesce(p_editie::smallint, current_event_edition());
  v_limit int      := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select e.id, e.created_at, e.email, e.nume, e.subiect,
           case when coalesce(p_cu_text, true) then e.text_email else '' end,
           e.mod, e.audienta, e.sablon, e.status, e.provider_status, e.eroare, e.editie
    from email_log e where e.editie = v_ed
    order by e.created_at desc
    limit v_limit;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_list_email_templates(p_token uuid)
 RETURNS TABLE(cheie text, subiect text, text_email text, actualizat_la timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query select t.cheie, t.subiect, t.text_email, t.actualizat_la from email_templates t order by t.cheie;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_list_events(p_token uuid, p_limit integer DEFAULT 200)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, tip text, detaliu jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select e.id, e.created_at, e.tip, e.detaliu
    from admin_events e
    order by e.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_list_launch_notifications(p_token uuid)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, nume text, prenume text, email text, telefon text, editie smallint, sursa text, confirmat_la timestamp with time zone, dezabonat_la timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select l.id, l.created_at, l.nume, l.prenume, l.email, l.telefon, l.editie,
           l.sursa, l.confirmat_la, l.dezabonat_la
    from launch_notifications l order by l.created_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_list_registrations(p_token uuid, p_editie integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, nume text, telefon text, email text, echipa text, editie smallint, dezabonat_la timestamp with time zone, token_renunt uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_ed smallint := coalesce(p_editie::smallint, current_event_edition());
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select r.id, r.created_at, r.nume, r.telefon, r.email, r.echipa, r.editie,
           r.dezabonat_la, r.token_renunt
    from registrations r
    where r.editie = v_ed and r.deleted_at is null
    order by r.created_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_list_waitlist(p_token uuid, p_editie integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, nume text, telefon text, email text, editie smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_ed smallint := coalesce(p_editie::smallint, current_event_edition());
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select w.id, w.created_at, w.nume, w.telefon, w.email, w.editie
    from event_waitlist w
    where w.editie = v_ed and w.deleted_at is null
    order by w.created_at asc;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_login(p_username text, p_password text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift', 'extensions'
AS $function$
declare v_user_id bigint; v_token uuid; v_locked timestamptz;
begin
  delete from admin_sessions where expires_at < now();
  select locked_until into v_locked from admin_login_attempts where username = p_username;
  if v_locked is not null and v_locked > now() then
    perform pg_sleep(1);
    return null;
  end if;
  select id into v_user_id from admin_users
  where username = p_username and password_hash = crypt(p_password, password_hash);
  if v_user_id is null then
    perform pg_sleep(1);
    insert into admin_login_attempts as a (username, failed_count, updated_at)
    values (p_username, 1, now())
    on conflict (username) do update
      set failed_count = a.failed_count + 1, updated_at = now(),
          locked_until = case when a.failed_count + 1 >= 5 then now() + interval '15 minutes' else a.locked_until end;
    return null;
  end if;
  delete from admin_login_attempts where username = p_username;
  insert into admin_sessions (user_id) values (v_user_id) returning token into v_token;
  return v_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_logout(p_token uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
  delete from admin_sessions where token = p_token;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_promote_waitlist(p_token uuid, p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_w runlift.event_waitlist; v_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select * into v_w from event_waitlist where id = p_id and deleted_at is null;
  if v_w.id is null then raise exception 'not_found'; end if;
  perform set_config('runlift.guard_bypass', '1', true);
  insert into registrations (nume, telefon, email, data_nasterii, acord, editie)
  values (trim(v_w.nume), trim(v_w.telefon), lower(trim(v_w.email)), v_w.data_nasterii, true, v_w.editie)
  on conflict (lower(email), editie) where deleted_at is null do nothing
  returning id into v_id;
  delete from event_waitlist where id = p_id;

  insert into admin_events (tip, detaliu)
  values ('admin_promote', jsonb_build_object(
    'id', v_id, 'nume', v_w.nume, 'email', lower(trim(v_w.email)), 'editie', v_w.editie));

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_publish_event_config(p_token uuid, p_editie integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_id uuid;
  v_config jsonb;
  v_deadline timestamptz;
  v_ascunde_inscrierea boolean;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select c.id, c.config into v_id, v_config
  from event_config c
  where c.editie = p_editie::smallint and c.status = 'draft';

  if v_id is null then raise exception 'no_draft'; end if;

  perform event_config_validate(v_config);

  v_deadline := ((v_config ->> 'registrationDeadline') || (v_config ->> 'tz'))::timestamptz;
  select coalesce(bool_or(not (s ->> 'visible')::boolean), false)
    into v_ascunde_inscrierea
  from jsonb_array_elements(v_config -> 'layout') s
  where s ->> 'key' = 'registration';

  if v_ascunde_inscrierea and v_deadline > now() then
    raise exception 'registration_hidden_while_open: inscrierile sunt deschise pana la %', v_deadline;
  end if;

  update event_config set status = 'superseded'
    where status = 'published' and id <> v_id;
  update event_config set status = 'published', published_at = now()
    where id = v_id;

  perform scrie_scalarele_editiei(v_config);

  insert into admin_events (tip, detaliu)
  values ('config_publish', jsonb_build_object(
    'id', v_id, 'editie', p_editie, 'config', v_config));

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_replay_anunt_lookup(p_token uuid, p_log_id uuid)
 RETURNS TABLE(ok boolean, motiv text, email text, nume text, subiect text, text_email text, token_unsub uuid, editie smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_log runlift.email_log;
  v_dest record;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select * into v_log from email_log where id = p_log_id;
  if v_log.id is null then
    return query select false, 'jurnal_lipsa', null::text, null::text, null::text,
                        null::text, null::uuid, null::smallint;
    return;
  end if;

  if v_log.mod <> 'anunt' then
    return query select false, 'mod_exclus', v_log.email, v_log.nume, null::text,
                        null::text, null::uuid, v_log.editie;
    return;
  end if;

  select * into v_dest
    from anunt_recipients('{}') a
   where lower(btrim(a.email)) = lower(btrim(v_log.email));

  if not found then
    if exists (
      select 1 from registrations r
       where lower(btrim(r.email)) = lower(btrim(v_log.email)) and r.dezabonat_la is not null
      union all
      select 1 from launch_notifications l
       where lower(btrim(l.email)) = lower(btrim(v_log.email)) and l.dezabonat_la is not null
    ) then
      return query select false, 'dezabonat', v_log.email, v_log.nume, null::text,
                          null::text, null::uuid, v_log.editie;
    else
      return query select false, 'nu_mai_e_in_audienta', v_log.email, v_log.nume, null::text,
                          null::text, null::uuid, v_log.editie;
    end if;
    return;
  end if;

  return query select true, null::text, v_dest.email, v_dest.nume, v_log.subiect,
                      v_log.text_email, v_dest.token_unsub, v_log.editie;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_replay_lookup(p_token uuid, p_log_id uuid)
 RETURNS TABLE(ok boolean, motiv text, mod text, sablon text, audienta text, email text, nume text, token_renunt uuid, token_unsub uuid, editie smallint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_log    runlift.email_log;
  v_sablon text;
  v_r      runlift.registrations;
  v_email  text;
  v_nume   text;
  v_unsub  uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select * into v_log from email_log where id = p_log_id;
  if v_log.id is null then
    return query select false, 'jurnal_lipsa', null::text, null::text, null::text,
                        null::text, null::text, null::uuid, null::uuid, null::smallint;
    return;
  end if;

  if v_log.mod not in ('confirm', 'promoted', 'broadcast') then
    return query select false, 'mod_exclus', v_log.mod, null::text, v_log.audienta,
                        v_log.email, v_log.nume, null::uuid, null::uuid, v_log.editie;
    return;
  end if;

  v_sablon := case v_log.mod
    when 'confirm'  then 'bulk_participant_confirmare'
    when 'promoted' then 'bulk_waitlist_promovare'
    else v_log.sablon
  end;
  if v_sablon is null then
    return query select false, 'sablon_necunoscut', v_log.mod, null::text, v_log.audienta,
                        v_log.email, v_log.nume, null::uuid, null::uuid, v_log.editie;
    return;
  end if;

  -- Audiența „asteptare" a unei difuzări NU e `event_waitlist`:
  -- `waitlist_recipients()` citește `launch_notifications` (confirmați,
  -- nedezabonați). Sunt două tabele cu populații diferite.
  if v_log.mod = 'broadcast' and v_log.audienta = 'asteptare' then
    select l.email,
           trim(coalesce(l.prenume, '') || ' ' || coalesce(l.nume, '')),
           l.token_unsub
      into v_email, v_nume, v_unsub
      from launch_notifications l
     where lower(l.email) = lower(v_log.email)
       and l.confirmat_la is not null
       and l.dezabonat_la is null
     limit 1;
    if v_email is null then
      return query select false, 'destinatar_lipsa', v_log.mod, v_sablon, v_log.audienta,
                          v_log.email, v_log.nume, null::uuid, null::uuid, v_log.editie;
      return;
    end if;
    return query select true, null::text, v_log.mod, v_sablon, v_log.audienta,
                        v_email, v_nume, null::uuid, v_unsub, v_log.editie;
    return;
  end if;

  select * into v_r
    from registrations r
   where r.editie = v_log.editie and lower(r.email) = lower(v_log.email)
     and r.deleted_at is null
   limit 1;
  if v_r.id is null then
    return query select false, 'destinatar_lipsa', v_log.mod, v_sablon, v_log.audienta,
                        v_log.email, v_log.nume, null::uuid, null::uuid, v_log.editie;
    return;
  end if;

  -- Filtrul de dezabonare al difuzării, aplicat și la rejucare.
  if v_log.mod = 'broadcast' and v_r.dezabonat_la is not null then
    return query select false, 'dezabonat', v_log.mod, v_sablon, v_log.audienta,
                        v_log.email, v_log.nume, null::uuid, null::uuid, v_log.editie;
    return;
  end if;

  return query select true, null::text, v_log.mod, v_sablon, v_log.audienta,
                      v_r.email, v_r.nume, v_r.token_renunt, v_r.token_unsub, v_r.editie;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_restore_event_config(p_token uuid, p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_config jsonb; v_editie smallint;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select c.config, c.editie into v_config, v_editie
  from event_config c where c.id = p_id;
  if v_config is null then raise exception 'not_found'; end if;

  perform event_config_validate(v_config);

  update event_config set status = 'superseded'
    where status = 'published' and id <> p_id;
  update event_config set status = 'published', published_at = now()
    where id = p_id;

  perform scrie_scalarele_editiei(v_config);

  insert into admin_events (tip, detaliu)
  values ('config_restore', jsonb_build_object(
    'id', p_id, 'editie', v_editie, 'config', v_config));

  return p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_save_email_template(p_token uuid, p_cheie text, p_subiect text, p_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if char_length(trim(p_subiect)) = 0 then raise exception 'subiect_gol'; end if;
  if char_length(trim(p_text)) = 0 then raise exception 'text_gol'; end if;
  insert into email_templates (cheie, subiect, text_email, actualizat_la)
  values (p_cheie, p_subiect, p_text, now())
  on conflict (cheie) do update
    set subiect = excluded.subiect, text_email = excluded.text_email, actualizat_la = now();
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_save_event_config_draft(p_token uuid, p_editie integer, p_config jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  perform event_config_validate(p_config);

  insert into event_config (editie, config, status)
  values (p_editie::smallint, p_config, 'draft')
  on conflict (editie) where status = 'draft'
  do update set config = excluded.config, created_at = now()
  returning event_config.id into v_id;

  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_set_coming_soon(p_token uuid, p_show boolean, p_launch_at text, p_next_edition_at text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_vechi_id uuid;
  v_editie smallint;
  v_config jsonb;
  v_nou jsonb;
  v_nou_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select c.id, c.editie, c.config into v_vechi_id, v_editie, v_config
  from event_config c
  where c.status = 'published';

  if v_vechi_id is null then raise exception 'no_published'; end if;

  if p_launch_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$' then
    raise exception 'config_invalid: launchAt trebuie scris ca 2026-08-19T12:00:00, fără fus';
  end if;
  if p_next_edition_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$' then
    raise exception 'config_invalid: nextEditionAt trebuie scris ca 2026-08-29T07:00:00, fără fus';
  end if;

  v_nou := jsonb_set(v_config, '{showComingSoon}', to_jsonb(p_show));
  v_nou := jsonb_set(v_nou, '{launchAt}', to_jsonb(p_launch_at));
  v_nou := jsonb_set(v_nou, '{nextEditionAt}', to_jsonb(p_next_edition_at));

  perform event_config_validate(v_nou);

  update event_config set status = 'superseded' where id = v_vechi_id;

  insert into event_config (editie, config, status, published_at)
  values (v_editie, v_nou, 'published', now())
  returning id into v_nou_id;

  insert into admin_events (tip, detaliu)
  values ('coming_soon_set', jsonb_build_object(
    'id', v_nou_id,
    'editie', v_editie,
    'showComingSoon', p_show,
    'launchAt', p_launch_at,
    'nextEditionAt', p_next_edition_at));

  return v_nou_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_undelete_registration(p_token uuid, p_id uuid, p_force boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_ed smallint; v_nume text; v_email text; v_cap int; v_count int;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select editie, nume, email into v_ed, v_nume, v_email
    from registrations where id = p_id and deleted_at is not null;
  if v_ed is null then return; end if;
  if v_ed <> current_event_edition() then raise exception 'edition_archived'; end if;

  if not p_force then
    select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
      into v_cap;
    select count(*) into v_count
      from registrations where editie = v_ed and deleted_at is null;
    if v_count >= v_cap then raise exception 'event_full'; end if;
  end if;

  if exists (
    select 1 from registrations
     where editie = v_ed and lower(email) = lower(v_email)
       and deleted_at is null and id <> p_id
  ) then
    raise exception 'duplicate_email';
  end if;

  update registrations set deleted_at = null where id = p_id;

  insert into admin_events (tip, detaliu)
  values ('admin_undelete', jsonb_build_object(
    'id', p_id, 'nume', v_nume, 'email', v_email, 'editie', v_ed, 'fortat', p_force));
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_undelete_waitlist(p_token uuid, p_id uuid, p_force boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_ed smallint; v_nume text; v_email text; v_count int;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select editie, nume, email into v_ed, v_nume, v_email
    from event_waitlist where id = p_id and deleted_at is not null;
  if v_ed is null then raise exception 'not_found'; end if;
  if v_ed <> current_event_edition() then raise exception 'edition_archived'; end if;

  if not p_force then
    select count(*) into v_count
      from event_waitlist where editie = v_ed and deleted_at is null;
    if v_count >= waitlist_cap() then raise exception 'waitlist_full'; end if;
  end if;

  if exists (
    select 1 from event_waitlist
     where editie = v_ed and lower(email) = lower(v_email)
       and deleted_at is null and id <> p_id
  ) then
    raise exception 'duplicate_email';
  end if;

  update event_waitlist set deleted_at = null where id = p_id;

  insert into admin_events (tip, detaliu)
  values ('admin_undelete_waitlist', jsonb_build_object(
    'id', p_id, 'nume', v_nume, 'email', v_email, 'editie', v_ed, 'fortat', p_force));
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.admin_update_registration(p_token uuid, p_id uuid, p_nume text, p_telefon text, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_ed smallint;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select editie into v_ed from registrations where id = p_id and deleted_at is null;
  if v_ed is null then raise exception 'not_found'; end if;
  if v_ed <> current_event_edition() then raise exception 'edition_archived'; end if;
  update registrations
    set nume = trim(p_nume), telefon = trim(p_telefon), email = lower(trim(p_email))
    where id = p_id;

  insert into admin_events (tip, detaliu)
  values ('admin_edit', jsonb_build_object(
    'id', p_id, 'nume', trim(p_nume), 'email', lower(trim(p_email)), 'editie', v_ed));
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.anunt_recipients(p_exclude text[] DEFAULT '{}'::text[])
 RETURNS TABLE(email text, nume text, token_unsub uuid, ultima_editie smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with randuri as (
    select lower(btrim(r.email)) as cheie, r.email, r.nume, r.token_unsub, r.editie, r.created_at
      from runlift.registrations r
     where (r.deleted_at is null or r.renuntat_la is not null)
       and nullif(btrim(r.email), '') is not null
  ),
  exclusi as (
    select lower(btrim(x.email)) as cheie
      from runlift.registrations x where x.dezabonat_la is not null
    union
    select lower(btrim(l.email))
      from runlift.launch_notifications l where l.dezabonat_la is not null
    union
    select lower(btrim(c.email))
      from runlift.registrations c
     where c.editie = runlift.current_event_edition() and c.deleted_at is null
    union
    select lower(btrim(e)) from unnest(coalesce(p_exclude, '{}'::text[])) as e
  ),
  ultimele as (
    select distinct on (cheie) cheie, email, nume, token_unsub
      from randuri
     order by cheie, created_at desc
  )
  select u.email,
         u.nume,
         u.token_unsub,
         (select max(r2.editie) from randuri r2 where r2.cheie = u.cheie)::smallint
    from ultimele u
   where not exists (select 1 from exclusi x where x.cheie = u.cheie)
   order by u.nume;
$function$
;

CREATE OR REPLACE FUNCTION runlift.auto_promote_from_waitlist()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_cap int;
  v_w   runlift.event_waitlist;
  v_id  uuid;
begin
  if old.editie <> current_event_edition() then
    return new;
  end if;

  perform set_config('runlift.guard_bypass', '1', true);

  select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
    into v_cap;

  loop
    if (select count(*) from registrations
         where editie = old.editie and deleted_at is null) >= v_cap then
      exit;
    end if;

    select * into v_w
      from event_waitlist
     where editie = old.editie and deleted_at is null
     order by created_at asc
     for update skip locked
     limit 1;
    if v_w.id is null then
      exit;
    end if;

    insert into registrations (nume, telefon, email, data_nasterii, acord, editie)
    values (trim(v_w.nume), trim(v_w.telefon), lower(trim(v_w.email)),
            v_w.data_nasterii, true, v_w.editie)
    on conflict (lower(email), editie) where deleted_at is null do nothing
    returning id into v_id;

    delete from event_waitlist where id = v_w.id;

    if v_id is not null then
      insert into admin_events (tip, detaliu)
      values ('auto_promote', jsonb_build_object(
        'nume', v_w.nume, 'email', lower(trim(v_w.email)), 'editie', v_w.editie));
      begin
        perform net.http_post(
          url := 'https://whyndrjcezmtajbykeil.supabase.co/functions/v1/send-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh'
          ),
          body := jsonb_build_object('mode', 'promoted', 'id', v_id::text)
        );
      exception when others then
        null;
      end;

      perform escaladeaza(
        'promovare',
        lower(trim(v_w.email)),
        'Promovare automată de pe lista de așteptare',
        v_w.nume || ' (' || lower(trim(v_w.email)) || ') a urcat de pe lista de așteptare pe '
          || 'lista de participanți, la ediția ' || v_w.editie || '. '
          || 'Emailul către persoană a plecat best-effort — verifică în /admin → Livrare că a ajuns.',
        v_w.editie
      );
      exit;
    end if;
  end loop;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.broadcast_once(p_key text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_inserted int;
begin
  insert into app_config (key, value) values ('once_' || p_key, now()::text)
    on conflict (key) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted > 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.broadcast_secret()
 RETURNS text
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select value from runlift.app_config where key = 'broadcast_secret';
$function$
;

CREATE OR REPLACE FUNCTION runlift.confirm_lookup(p_id uuid)
 RETURNS TABLE(email text, nume text, token_renunt uuid)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select email, nume, token_renunt from runlift.registrations
  where id = p_id
    and editie = (select value::smallint from runlift.app_config where key = 'current_event_edition')
    and deleted_at is null
    and created_at > now() - interval '15 minutes';
$function$
;

CREATE OR REPLACE FUNCTION runlift.confirm_signup(p_token uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_confirmat timestamptz;
begin
  select confirmat_la into v_confirmat from launch_notifications where token_confirmare = p_token;
  if not found then return 'invalid'; end if;
  if v_confirmat is not null then return 'deja_confirmat'; end if;
  update launch_notifications set confirmat_la = now() where token_confirmare = p_token;
  return 'confirmat';
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.current_event_edition()
 RETURNS smallint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'runlift', 'pg_temp'
AS $function$
  select coalesce((select value::smallint from runlift.app_config where key='current_event_edition'), 2);
$function$
;

CREATE OR REPLACE FUNCTION runlift.current_launch_edition()
 RETURNS smallint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'runlift', 'pg_temp'
AS $function$
  select coalesce((select value::smallint from runlift.app_config where key = 'current_launch_edition'), 3);
$function$
;

CREATE OR REPLACE FUNCTION runlift.decline_spot(p_token uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_id     uuid;
  v_ed     smallint;
  v_nume   text;
  v_email  text;
  v_sters  timestamptz;
  v_renunt timestamptz;
  v_start  timestamptz;
begin
  select id, editie, nume, email, deleted_at, renuntat_la
    into v_id, v_ed, v_nume, v_email, v_sters, v_renunt
    from registrations where token_renunt = p_token;

  if v_id is null then return 'invalid'; end if;

  if v_sters is not null or v_renunt is not null then
    return 'deja_renuntat';
  end if;

  if v_ed <> current_event_edition() then return 'prea_tarziu'; end if;

  select value::timestamptz into v_start from app_config where key = 'event_start';
  if v_start is not null and now() >= v_start then return 'prea_tarziu'; end if;

  update registrations
     set renuntat_la = now(), deleted_at = now()
   where id = v_id;

  insert into admin_events (tip, detaliu)
  values ('renuntare', jsonb_build_object(
    'id', v_id, 'nume', v_nume, 'email', v_email, 'editie', v_ed));

  return 'renuntat';
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.edition2_recipients()
 RETURNS TABLE(email text, nume text, token_unsub uuid, token_renunt uuid)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select email, nume, token_unsub, token_renunt
  from runlift.registrations
  where editie = (select value::smallint from runlift.app_config where key = 'current_event_edition')
    and dezabonat_la is null
    and deleted_at is null
  order by created_at;
$function$
;

CREATE OR REPLACE FUNCTION runlift.escaladeaza(p_tip text, p_cheie text, p_subiect text, p_detaliu text, p_editie smallint DEFAULT NULL::smallint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_ed     smallint;
  v_catre  text;
  v_secret text;
begin
  v_ed    := coalesce(p_editie, current_event_edition());
  v_catre := operator_email();
  if v_catre is null then return false; end if;

  select broadcast_secret() into v_secret;
  if v_secret is null then return false; end if;

  if not broadcast_once('alert_ed' || v_ed || '_' || p_tip || '_' || p_cheie) then
    return false;
  end if;

  insert into admin_events (tip, detaliu)
  values ('escaladare', jsonb_build_object(
    'tip', p_tip, 'cheie', p_cheie, 'subiect', p_subiect, 'editie', v_ed));

  perform net.http_post(
    url := 'https://whyndrjcezmtajbykeil.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh',
      'x-broadcast-secret', v_secret
    ),
    body := jsonb_build_object(
      'mode', 'alert', 'subject', p_subiect, 'text', p_detaliu, 'editie', v_ed
    )
  );

  return true;
exception when others then
  -- Orice a eșuat aici — config, gardă, jurnal, HTTP — rămâne aici.
  return false;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.event_config_validate(p_config jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  v_cheie text;
  v_start timestamptz;
  v_deadline timestamptz;
  v_next timestamptz;
  v_tz text;
  v_sectiune jsonb;
  v_chei text[] := array[]::text[];
  v_chei_permise text[] := array['format', 'venue', 'registration', 'participants', 'reels'];
  v_clip jsonb;
  v_coduri text[] := array[]::text[];
  v_cod text;
  v_rem jsonb;
  v_offset int;
  v_avansuri int[] := array[]::int[];
  v_sabloane text[] := array['bulk_participant_reminder', 'bulk_participant_reminder_final'];
begin
  foreach v_cheie in array array[
    'number', 'launchNumber', 'eventName', 'concept', 'tz', 'start',
    'durationHours', 'checkinFrom', 'registrationDeadline', 'launchAt',
    'showComingSoon', 'leaderboardLeadHours', 'nextEditionAt', 'venue',
    'slots', 'layout'
  ] loop
    if p_config -> v_cheie is null then
      raise exception 'config_invalid: lipsește câmpul %', v_cheie;
    end if;
  end loop;

  v_tz := p_config ->> 'tz';
  if v_tz !~ '^[+-][0-9]{2}:[0-9]{2}$' then
    raise exception 'config_invalid: tz trebuie să fie de forma +03:00';
  end if;

  if (p_config ->> 'checkinFrom') !~ '^[0-9]{2}:[0-9]{2}$' then
    raise exception 'config_invalid: checkinFrom trebuie să fie de forma 06:30';
  end if;

  v_start := ((p_config ->> 'start') || v_tz)::timestamptz;
  v_deadline := ((p_config ->> 'registrationDeadline') || v_tz)::timestamptz;
  v_next := ((p_config ->> 'nextEditionAt') || v_tz)::timestamptz;

  if v_deadline > v_start then
    raise exception 'config_invalid: deadline-ul de înscriere e după startul cursei';
  end if;

  if v_next <= v_start + ((p_config ->> 'durationHours')::numeric * interval '1 hour') then
    raise exception 'config_invalid: următorul antrenament e înainte de finalul cursei';
  end if;

  if (p_config -> 'slots' ->> 'total')::int <= 0 then
    raise exception 'config_invalid: capacitatea trebuie să fie pozitivă';
  end if;

  if (p_config -> 'venue' ->> 'mapQuery') !~ '^-?[0-9]+(\.[0-9]+)?,-?[0-9]+(\.[0-9]+)?$' then
    raise exception 'config_invalid: venue.mapQuery trebuie să fie „lat,lng"';
  end if;

  if pg_catalog.jsonb_typeof(p_config -> 'layout') <> 'array' then
    raise exception 'config_invalid: layout trebuie să fie o listă';
  end if;

  for v_sectiune in select * from pg_catalog.jsonb_array_elements(p_config -> 'layout') loop
    if not (v_sectiune ->> 'key' = any (v_chei_permise)) then
      raise exception 'config_invalid: secțiune necunoscută „%"', v_sectiune ->> 'key';
    end if;
    if pg_catalog.jsonb_typeof(v_sectiune -> 'visible') <> 'boolean' then
      raise exception 'config_invalid: secțiunea „%" nu are „visible" boolean', v_sectiune ->> 'key';
    end if;
    if (v_sectiune ->> 'key') = any (v_chei) then
      raise exception 'config_invalid: secțiunea „%" apare de două ori', v_sectiune ->> 'key';
    end if;
    v_chei := v_chei || (v_sectiune ->> 'key');
  end loop;

  if p_config -> 'reels' is not null then
    if pg_catalog.jsonb_typeof(p_config -> 'reels') <> 'object' then
      raise exception 'config_invalid: reels trebuie să fie un obiect';
    end if;

    if p_config -> 'reels' -> 'items' is not null then
      if pg_catalog.jsonb_typeof(p_config -> 'reels' -> 'items') <> 'array' then
        raise exception 'config_invalid: reels.items trebuie să fie o listă';
      end if;

      if pg_catalog.jsonb_array_length(p_config -> 'reels' -> 'items') > 12 then
        raise exception 'config_invalid: cel mult 12 clipuri în banda Instagram';
      end if;

      for v_clip in
        select * from pg_catalog.jsonb_array_elements(p_config -> 'reels' -> 'items')
      loop
        v_cod := v_clip ->> 'code';

        if v_cod is null or v_cod !~ '^[A-Za-z0-9_-]{5,32}$' then
          raise exception 'config_invalid: cod de clip invalid „%"', coalesce(v_cod, '(lipsă)');
        end if;

        if not ((v_clip ->> 'kind') in ('reel', 'p')) then
          raise exception 'config_invalid: kind-ul clipului „%" trebuie să fie reel sau p', v_cod;
        end if;

        if v_cod = any (v_coduri) then
          raise exception 'config_invalid: clipul „%" apare de două ori', v_cod;
        end if;
        v_coduri := v_coduri || v_cod;
      end loop;
    end if;
  end if;

  -- Orarul reminderelor. Cheia e optionala (documentele vechi n-o au); daca
  -- exista, fiecare rand trebuie sa descrie un email care chiar poate pleca.
  if p_config -> 'reminders' is not null then
    if pg_catalog.jsonb_typeof(p_config -> 'reminders') <> 'array' then
      raise exception 'config_invalid: reminders trebuie să fie o listă';
    end if;

    if pg_catalog.jsonb_array_length(p_config -> 'reminders') > 5 then
      raise exception 'config_invalid: cel mult 5 remindere per ediție';
    end if;

    for v_rem in select * from pg_catalog.jsonb_array_elements(p_config -> 'reminders') loop
      if pg_catalog.jsonb_typeof(v_rem -> 'offsetHours') <> 'number' then
        raise exception 'config_invalid: reminderul n-are avansul în ore';
      end if;
      v_offset := (v_rem ->> 'offsetHours')::numeric::int;
      if (v_rem ->> 'offsetHours')::numeric <> v_offset or v_offset <= 0 or v_offset > 720 then
        raise exception 'config_invalid: avansul reminderului („%") trebuie să fie un întreg între 1 și 720',
          v_rem ->> 'offsetHours';
      end if;

      if pg_catalog.jsonb_typeof(v_rem -> 'enabled') <> 'boolean' then
        raise exception 'config_invalid: reminderul de % ore n-are „enabled" boolean', v_offset;
      end if;

      if not ((v_rem ->> 'template') = any (v_sabloane)) then
        raise exception 'config_invalid: șablon de reminder necunoscut „%"', v_rem ->> 'template';
      end if;

      if v_offset = any (v_avansuri) then
        raise exception 'config_invalid: două remindere la % ore înainte', v_offset;
      end if;
      v_avansuri := v_avansuri || v_offset;
    end loop;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.event_waitlist_cap()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
begin
  if (select count(*) from event_waitlist
       where editie = new.editie and deleted_at is null) >= waitlist_cap() then
    raise exception 'waitlist_full';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.forteaza_editia_curenta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
begin
  -- Scriere din admin: editia e aleasa deliberat (promovare dintr-o editie
  -- arhivata), deci nu o atingem.
  if coalesce(current_setting('runlift.guard_bypass', true), '') = '1' then
    return new;
  end if;
  new.editie := current_event_edition();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.info_lookup(p_email text)
 RETURNS TABLE(email text, nume text, prenume text, token_confirmare uuid, email_trimis_la timestamp with time zone)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select email, nume, prenume, token_confirmare, email_trimis_la
  from runlift.launch_notifications
  where lower(email) = lower(p_email) and created_at > now() - interval '15 minutes'
  order by created_at desc limit 1;
$function$
;

CREATE OR REPLACE FUNCTION runlift.info_template()
 RETURNS TABLE(subiect text, text_email text)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select subiect, text_email from runlift.email_templates where cheie = 'info';
$function$
;

CREATE OR REPLACE FUNCTION runlift.log_emails(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then return 0; end if;

  with intrari as (
    select
      nullif(trim(x->>'email'), '')                    as email,
      coalesce(x->>'nume', '')                         as nume,
      coalesce(x->>'subiect', '')                      as subiect,
      coalesce(x->>'text_email', '')                   as text_email,
      coalesce(x->>'mod', 'admin')                     as mod,
      coalesce(x->>'audienta', '')                     as audienta,
      nullif(trim(x->>'sablon'), '')                   as sablon,
      case when (x->>'ok')::boolean then 'trimis' else 'esuat' end as status,
      (x->>'provider_status')::int                     as provider_status,
      left(nullif(x->>'eroare', ''), 500)              as eroare,
      coalesce((x->>'editie')::smallint, current_event_edition()) as editie
    from jsonb_array_elements(p_rows) as x
  )
  insert into email_log (email, nume, subiect, text_email, mod, audienta, sablon, status, provider_status, eroare, editie)
  select lower(email), nume, subiect, text_email, mod, audienta, sablon, status, provider_status, eroare, editie
  from intrari where email is not null;

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.mark_confirmation_sent(p_email text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  update runlift.launch_notifications set email_trimis_la = now() where lower(email) = lower(p_email);
$function$
;

CREATE OR REPLACE FUNCTION runlift.maybe_send_reminder()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_start   timestamptz;
  v_ed      smallint := current_event_edition();
  v_secret  text;
  v_orar    jsonb;
  v_rem     jsonb;
  v_offset  int;
  v_sablon  text;
  v_scadent timestamptz;
begin
  select value::timestamptz into v_start from app_config where key = 'event_start';
  if v_start is null then return; end if;

  if now() > v_start then return; end if;

  -- Conversia stă în blocul ei: un text care nu e JSON nu trebuie să oprească
  -- reminderul, ci să cadă pe orarul implicit de mai jos.
  begin
    select value::jsonb into v_orar from app_config where key = 'reminder_schedule';
  exception when others then
    v_orar := null;
  end;

  if v_orar is null or jsonb_typeof(v_orar) <> 'array' then
    v_orar := jsonb_build_array(jsonb_build_object(
      'offsetHours', coalesce(
        (select value::int from app_config where key = 'reminder_offset_hours'), 24),
      'enabled', true,
      'template', 'bulk_participant_reminder'));
  end if;

  select broadcast_secret() into v_secret;

  for v_rem in select * from jsonb_array_elements(v_orar) loop
    continue when (v_rem ->> 'enabled') is distinct from 'true';

    continue when jsonb_typeof(v_rem -> 'offsetHours') <> 'number';
    v_offset := (v_rem ->> 'offsetHours')::numeric::int;
    continue when v_offset <= 0;

    v_sablon := coalesce(nullif(v_rem ->> 'template', ''), 'bulk_participant_reminder');
    v_scadent := v_start - make_interval(hours => v_offset);

    continue when now() < v_scadent or now() > v_scadent + interval '2 hours';

    continue when not broadcast_once('reminder_ed' || v_ed || '_h' || v_offset);

    perform net.http_post(
      url := 'https://whyndrjcezmtajbykeil.supabase.co/functions/v1/send-email',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'mode', 'broadcast',
        'audience', 'participanti',
        'template', v_sablon,
        'secret', v_secret)
    );
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.operator_email()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select nullif(trim(value), '') from runlift.app_config where key = 'operator_email';
$function$
;

CREATE OR REPLACE FUNCTION runlift.public_config()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select c.config
  from runlift.event_config c
  where c.status = 'published'
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION runlift.public_stats()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select json_build_object(
    'count', count(*),
    'participants', coalesce(json_agg(json_build_object('nume', r.public_name, 'echipa', r.echipa) order by r.created_at), '[]'::json),
    'waitlist', (select count(*) from runlift.event_waitlist
                  where editie = runlift.current_event_edition() and deleted_at is null)
  )
  from (
    select created_at, echipa,
      case when array_length(regexp_split_to_array(trim(nume), '\s+'), 1) > 1
        then (regexp_split_to_array(trim(nume), '\s+'))[1] || ' ' ||
             upper(left((regexp_split_to_array(trim(nume), '\s+'))[array_length(regexp_split_to_array(trim(nume), '\s+'), 1)], 1)) || '.'
        else trim(nume) end as public_name
    from runlift.registrations
    where editie = runlift.current_event_edition()
      and deleted_at is null
  ) r;
$function$
;

CREATE OR REPLACE FUNCTION runlift.registrations_backup_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into registrations_backup (id, created_at, nume, telefon, email, echipa, acord, editie, data_nasterii)
    values (new.id, new.created_at, new.nume, new.telefon, new.email, new.echipa, new.acord, new.editie, new.data_nasterii)
    on conflict (id) do update
      set nume = excluded.nume, telefon = excluded.telefon, email = excluded.email,
          echipa = excluded.echipa, acord = excluded.acord, editie = excluded.editie,
          data_nasterii = excluded.data_nasterii, backed_up_at = now(), deleted_at = null;
    return new;
  elsif tg_op = 'UPDATE' then
    update registrations_backup
      set created_at = new.created_at, nume = new.nume, telefon = new.telefon,
          email = new.email, echipa = new.echipa, acord = new.acord, editie = new.editie,
          data_nasterii = new.data_nasterii, backed_up_at = now(),
          deleted_at = new.deleted_at
      where id = new.id;
    return new;
  elsif tg_op = 'DELETE' then
    update registrations_backup set deleted_at = now() where id = old.id;
    return old;
  end if;
  return null;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.registrations_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_cap      int;
  v_deadline timestamptz;
  v_count    int;
begin
  if coalesce(current_setting('runlift.guard_bypass', true), '') = '1' then
    return new;
  end if;

  if new.editie <> current_event_edition() then
    return new;
  end if;

  select value::timestamptz into v_deadline
    from app_config where key = 'registration_deadline';
  if v_deadline is not null and now() > v_deadline then
    raise exception 'registration_closed';
  end if;

  select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
    into v_cap;
  select count(*) into v_count
    from registrations where editie = new.editie and deleted_at is null;
  if v_count >= v_cap then
    raise exception 'event_full';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.scrie_scalarele_editiei(p_config jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_tz text := p_config ->> 'tz';
begin
  insert into app_config (key, value) values ('current_event_edition', p_config ->> 'number')
    on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value) values ('current_launch_edition', p_config ->> 'launchNumber')
    on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value) values ('event_capacity', p_config -> 'slots' ->> 'total')
    on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value) values ('waitlist_capacity', p_config -> 'slots' ->> 'waitlist')
    on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value)
    values ('registration_deadline', (p_config ->> 'registrationDeadline') || v_tz)
    on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value) values ('event_start', (p_config ->> 'start') || v_tz)
    on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value)
    values ('reminder_schedule', coalesce(
      p_config -> 'reminders',
      '[{"offsetHours":24,"enabled":true,"template":"bulk_participant_reminder"}]'::jsonb
    )::text)
    on conflict (key) do update set value = excluded.value;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.semnaleaza_locuri_epuizate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare v_cap int; v_count int;
begin
  if new.editie <> current_event_edition() then return new; end if;

  select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
    into v_cap;
  select count(*) into v_count
    from registrations where editie = new.editie and deleted_at is null;
  if v_count < v_cap then return new; end if;

  perform escaladeaza(
    'locuri_epuizate',
    'editie',
    'Locurile s-au epuizat',
    'Ediția ' || new.editie || ' și-a ocupat toate cele ' || v_cap || ' locuri. '
      || 'De aici încolo înscrierile intră pe lista de așteptare. '
      || 'Dacă vrei mai multe locuri, schimbă capacitatea în /admin → Eveniment și publică.',
    new.editie
  );
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.template_lookup(p_cheie text)
 RETURNS TABLE(subiect text, text_email text)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select subiect, text_email from runlift.email_templates where cheie = p_cheie;
$function$
;

CREATE OR REPLACE FUNCTION runlift.unsubscribe(p_token uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'runlift'
AS $function$
declare
  v_email text;
  v_reg int;
  v_lans int;
begin
  select lower(btrim(email)) into v_email
    from registrations where token_unsub = p_token limit 1;
  if v_email is null then
    select lower(btrim(email)) into v_email
      from launch_notifications where token_unsub = p_token limit 1;
  end if;
  if v_email is null then return 'invalid'; end if;

  update registrations set dezabonat_la = now()
   where lower(btrim(email)) = v_email and dezabonat_la is null;
  get diagnostics v_reg = row_count;

  update launch_notifications set dezabonat_la = now()
   where lower(btrim(email)) = v_email and dezabonat_la is null;
  get diagnostics v_lans = row_count;

  if v_reg + v_lans > 0 then return 'dezabonat'; end if;
  return 'deja_dezabonat';
end;
$function$
;

CREATE OR REPLACE FUNCTION runlift.waitlist_cap()
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(
    (select value::int from runlift.app_config where key = 'waitlist_capacity'),
    10
  );
$function$
;

CREATE OR REPLACE FUNCTION runlift.waitlist_recipients()
 RETURNS TABLE(email text, nume text, token_unsub uuid)
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select email, trim(coalesce(prenume,'') || ' ' || coalesce(nume,'')) as nume, token_unsub
  from runlift.launch_notifications
  where confirmat_la is not null
    and dezabonat_la is null
  order by created_at;
$function$
;

create table runlift.admin_events (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  tip text not null,
  detaliu jsonb default '{}'::jsonb not null
);

create table runlift.admin_login_attempts (
  username text not null,
  failed_count integer default 0 not null,
  locked_until timestamp with time zone,
  updated_at timestamp with time zone default now() not null
);

create table runlift.admin_sessions (
  token uuid default gen_random_uuid() not null,
  user_id bigint not null,
  created_at timestamp with time zone default now() not null,
  expires_at timestamp with time zone default (now() + '7 days'::interval) not null
);

create table runlift.admin_users (
  id bigint generated always as identity not null,
  username text not null,
  password_hash text not null,
  created_at timestamp with time zone default now() not null
);

create table runlift.app_config (
  key text not null,
  value text not null
);

create table runlift.email_log (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  email text not null,
  nume text default ''::text not null,
  subiect text default ''::text not null,
  text_email text default ''::text not null,
  mod text not null,
  audienta text default ''::text not null,
  status text not null,
  provider_status integer,
  eroare text,
  editie smallint default runlift.current_event_edition() not null,
  sablon text
);

create table runlift.email_templates (
  cheie text not null,
  subiect text not null,
  text_email text not null,
  actualizat_la timestamp with time zone default now() not null
);

create table runlift.event_config (
  id uuid default gen_random_uuid() not null,
  editie smallint not null,
  config jsonb not null,
  status text not null,
  created_at timestamp with time zone default now() not null,
  published_at timestamp with time zone
);

create table runlift.event_waitlist (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  nume text not null,
  telefon text not null,
  email text not null,
  data_nasterii date,
  acord boolean default true not null,
  editie smallint default runlift.current_event_edition() not null,
  deleted_at timestamp with time zone
);

create table runlift.launch_notifications (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  nume text not null,
  prenume text not null,
  email text not null,
  telefon text not null,
  editie smallint default runlift.current_launch_edition() not null,
  sursa text default 'lansare'::text not null,
  token_confirmare uuid default gen_random_uuid() not null,
  confirmat_la timestamp with time zone,
  email_trimis_la timestamp with time zone,
  dezabonat_la timestamp with time zone,
  token_unsub uuid default gen_random_uuid() not null
);

create table runlift.launch_notifications_backup_20260718 (
  id uuid,
  created_at timestamp with time zone,
  nume text,
  prenume text,
  email text,
  telefon text
);

create table runlift.registrations (
  id uuid default gen_random_uuid() not null,
  created_at timestamp with time zone default now() not null,
  nume text not null,
  telefon text not null,
  email text not null,
  echipa text default ''::text not null,
  acord boolean not null,
  editie smallint default runlift.current_event_edition() not null,
  data_nasterii date,
  dezabonat_la timestamp with time zone,
  token_unsub uuid default gen_random_uuid() not null,
  deleted_at timestamp with time zone,
  token_renunt uuid default gen_random_uuid() not null,
  renuntat_la timestamp with time zone
);

create table runlift.registrations_backup (
  id uuid not null,
  created_at timestamp with time zone,
  nume text,
  telefon text,
  email text,
  echipa text,
  acord boolean,
  backed_up_at timestamp with time zone default now() not null,
  deleted_at timestamp with time zone,
  editie smallint,
  data_nasterii date
);

alter table runlift.admin_events add constraint admin_events_pkey PRIMARY KEY (id);
alter table runlift.admin_login_attempts add constraint admin_login_attempts_pkey PRIMARY KEY (username);
alter table runlift.admin_sessions add constraint admin_sessions_pkey PRIMARY KEY (token);
alter table runlift.admin_users add constraint admin_users_pkey PRIMARY KEY (id);
alter table runlift.admin_users add constraint admin_users_username_key UNIQUE (username);
alter table runlift.app_config add constraint app_config_pkey PRIMARY KEY (key);
alter table runlift.email_log add constraint email_log_pkey PRIMARY KEY (id);
alter table runlift.email_templates add constraint email_templates_pkey PRIMARY KEY (cheie);
alter table runlift.event_config add constraint event_config_pkey PRIMARY KEY (id);
alter table runlift.event_waitlist add constraint event_waitlist_pkey PRIMARY KEY (id);
alter table runlift.launch_notifications add constraint launch_notifications_pkey PRIMARY KEY (id);
alter table runlift.registrations add constraint registrations_pkey PRIMARY KEY (id);
alter table runlift.registrations_backup add constraint registrations_backup_pkey PRIMARY KEY (id);
alter table runlift.admin_sessions add constraint admin_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES runlift.admin_users(id);
alter table runlift.event_config add constraint event_config_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'superseded'::text])));
alter table runlift.launch_notifications add constraint launch_notifications_editie_check CHECK (((editie >= 1) AND (editie <= 100)));
alter table runlift.launch_notifications add constraint launch_notifications_sursa_check CHECK ((sursa = ANY (ARRAY['lansare'::text, 'despre-noi'::text])));
alter table runlift.registrations add constraint registrations_acord_check CHECK (acord);
alter table runlift.registrations add constraint registrations_echipa_check CHECK ((char_length(echipa) <= 100));
alter table runlift.registrations add constraint registrations_email_check CHECK (((email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'::text) AND (char_length(email) <= 254)));
alter table runlift.registrations add constraint registrations_nume_check CHECK (((char_length(TRIM(BOTH FROM nume)) >= 3) AND (char_length(TRIM(BOTH FROM nume)) <= 100)));
alter table runlift.registrations add constraint registrations_telefon_check CHECK ((telefon ~ '^\+?\d{8,15}$'::text));

CREATE INDEX admin_sessions_user_id_idx ON runlift.admin_sessions USING btree (user_id);
CREATE INDEX email_log_editie_idx ON runlift.email_log USING btree (editie, created_at DESC);
CREATE INDEX email_log_email_idx ON runlift.email_log USING btree (lower(email));
CREATE INDEX email_log_status_idx ON runlift.email_log USING btree (status);
CREATE INDEX event_config_editie_istoric ON runlift.event_config USING btree (editie, published_at DESC);
CREATE UNIQUE INDEX event_config_o_ciorna ON runlift.event_config USING btree (editie) WHERE (status = 'draft'::text);
CREATE UNIQUE INDEX event_config_un_singur_publicat ON runlift.event_config USING btree (status) WHERE (status = 'published'::text);
CREATE INDEX event_waitlist_editie_activi ON runlift.event_waitlist USING btree (editie) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX event_waitlist_email_editie_key ON runlift.event_waitlist USING btree (lower(email), editie) WHERE (deleted_at IS NULL);
CREATE INDEX launch_notifications_editie_created_idx ON runlift.launch_notifications USING btree (editie, created_at DESC);
CREATE UNIQUE INDEX launch_notifications_email_editie_idx ON runlift.launch_notifications USING btree (lower(email), editie);
CREATE INDEX launch_notifications_sursa_idx ON runlift.launch_notifications USING btree (sursa, editie, created_at DESC);
CREATE UNIQUE INDEX launch_notifications_token_idx ON runlift.launch_notifications USING btree (token_confirmare);
CREATE INDEX registrations_editie_activi ON runlift.registrations USING btree (editie) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX registrations_email_editie_key ON runlift.registrations USING btree (lower(email), editie) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX registrations_token_renunt_idx ON runlift.registrations USING btree (token_renunt);

CREATE TRIGGER event_waitlist_cap_trg BEFORE INSERT ON runlift.event_waitlist FOR EACH ROW EXECUTE FUNCTION runlift.event_waitlist_cap();
CREATE TRIGGER registrations_autopromote_trg AFTER UPDATE OF deleted_at ON runlift.registrations FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION runlift.auto_promote_from_waitlist();
CREATE TRIGGER registrations_backup_trigger AFTER INSERT OR DELETE OR UPDATE ON runlift.registrations FOR EACH ROW EXECUTE FUNCTION runlift.registrations_backup_sync();
CREATE TRIGGER registrations_forteaza_editia BEFORE INSERT ON runlift.registrations FOR EACH ROW EXECUTE FUNCTION runlift.forteaza_editia_curenta();
CREATE TRIGGER registrations_guard_trg BEFORE INSERT ON runlift.registrations FOR EACH ROW EXECUTE FUNCTION runlift.registrations_guard();
CREATE TRIGGER registrations_locuri_epuizate_trg AFTER INSERT ON runlift.registrations FOR EACH ROW EXECUTE FUNCTION runlift.semnaleaza_locuri_epuizate();
CREATE TRIGGER waitlist_forteaza_editia BEFORE INSERT ON runlift.event_waitlist FOR EACH ROW EXECUTE FUNCTION runlift.forteaza_editia_curenta();

revoke all on function runlift.admin_add_registration(p_token uuid, p_nume text, p_telefon text, p_email text, p_force boolean) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_add_registration(p_token uuid, p_nume text, p_telefon text, p_email text, p_force boolean) to anon;
grant execute on function runlift.admin_add_registration(p_token uuid, p_nume text, p_telefon text, p_email text, p_force boolean) to authenticated;
grant execute on function runlift.admin_add_registration(p_token uuid, p_nume text, p_telefon text, p_email text, p_force boolean) to service_role;
revoke all on function runlift.admin_check_token(p_token uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_check_token(p_token uuid) to anon;
grant execute on function runlift.admin_check_token(p_token uuid) to authenticated;
grant execute on function runlift.admin_check_token(p_token uuid) to service_role;
revoke all on function runlift.admin_create_edition(p_token uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_create_edition(p_token uuid) to anon;
grant execute on function runlift.admin_create_edition(p_token uuid) to authenticated;
grant execute on function runlift.admin_create_edition(p_token uuid) to service_role;
revoke all on function runlift.admin_delete_registration(p_token uuid, p_id uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_delete_registration(p_token uuid, p_id uuid) to anon;
grant execute on function runlift.admin_delete_registration(p_token uuid, p_id uuid) to authenticated;
grant execute on function runlift.admin_delete_registration(p_token uuid, p_id uuid) to service_role;
revoke all on function runlift.admin_delete_waitlist(p_token uuid, p_id uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_delete_waitlist(p_token uuid, p_id uuid) to anon;
grant execute on function runlift.admin_delete_waitlist(p_token uuid, p_id uuid) to authenticated;
grant execute on function runlift.admin_delete_waitlist(p_token uuid, p_id uuid) to service_role;
revoke all on function runlift.admin_get_event_config(p_token uuid, p_editie integer) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_get_event_config(p_token uuid, p_editie integer) to anon;
grant execute on function runlift.admin_get_event_config(p_token uuid, p_editie integer) to authenticated;
grant execute on function runlift.admin_get_event_config(p_token uuid, p_editie integer) to service_role;
revoke all on function runlift.admin_list_editions(p_token uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_list_editions(p_token uuid) to anon;
grant execute on function runlift.admin_list_editions(p_token uuid) to authenticated;
grant execute on function runlift.admin_list_editions(p_token uuid) to service_role;
revoke all on function runlift.admin_list_email_log(p_token uuid, p_editie integer, p_limit integer, p_cu_text boolean) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_list_email_log(p_token uuid, p_editie integer, p_limit integer, p_cu_text boolean) to anon;
grant execute on function runlift.admin_list_email_log(p_token uuid, p_editie integer, p_limit integer, p_cu_text boolean) to authenticated;
grant execute on function runlift.admin_list_email_log(p_token uuid, p_editie integer, p_limit integer, p_cu_text boolean) to service_role;
revoke all on function runlift.admin_list_email_templates(p_token uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_list_email_templates(p_token uuid) to anon;
grant execute on function runlift.admin_list_email_templates(p_token uuid) to authenticated;
grant execute on function runlift.admin_list_email_templates(p_token uuid) to service_role;
revoke all on function runlift.admin_list_events(p_token uuid, p_limit integer) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_list_events(p_token uuid, p_limit integer) to anon;
grant execute on function runlift.admin_list_events(p_token uuid, p_limit integer) to authenticated;
grant execute on function runlift.admin_list_events(p_token uuid, p_limit integer) to service_role;
revoke all on function runlift.admin_list_launch_notifications(p_token uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_list_launch_notifications(p_token uuid) to anon;
grant execute on function runlift.admin_list_launch_notifications(p_token uuid) to authenticated;
grant execute on function runlift.admin_list_launch_notifications(p_token uuid) to service_role;
revoke all on function runlift.admin_list_registrations(p_token uuid, p_editie integer) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_list_registrations(p_token uuid, p_editie integer) to anon;
grant execute on function runlift.admin_list_registrations(p_token uuid, p_editie integer) to authenticated;
grant execute on function runlift.admin_list_registrations(p_token uuid, p_editie integer) to service_role;
revoke all on function runlift.admin_list_waitlist(p_token uuid, p_editie integer) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_list_waitlist(p_token uuid, p_editie integer) to anon;
grant execute on function runlift.admin_list_waitlist(p_token uuid, p_editie integer) to authenticated;
grant execute on function runlift.admin_list_waitlist(p_token uuid, p_editie integer) to service_role;
revoke all on function runlift.admin_login(p_username text, p_password text) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_login(p_username text, p_password text) to anon;
grant execute on function runlift.admin_login(p_username text, p_password text) to authenticated;
grant execute on function runlift.admin_login(p_username text, p_password text) to service_role;
revoke all on function runlift.admin_logout(p_token uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_logout(p_token uuid) to anon;
grant execute on function runlift.admin_logout(p_token uuid) to authenticated;
grant execute on function runlift.admin_logout(p_token uuid) to service_role;
revoke all on function runlift.admin_promote_waitlist(p_token uuid, p_id uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_promote_waitlist(p_token uuid, p_id uuid) to anon;
grant execute on function runlift.admin_promote_waitlist(p_token uuid, p_id uuid) to authenticated;
grant execute on function runlift.admin_promote_waitlist(p_token uuid, p_id uuid) to service_role;
revoke all on function runlift.admin_publish_event_config(p_token uuid, p_editie integer) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_publish_event_config(p_token uuid, p_editie integer) to anon;
grant execute on function runlift.admin_publish_event_config(p_token uuid, p_editie integer) to authenticated;
grant execute on function runlift.admin_publish_event_config(p_token uuid, p_editie integer) to service_role;
revoke all on function runlift.admin_replay_anunt_lookup(p_token uuid, p_log_id uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_replay_anunt_lookup(p_token uuid, p_log_id uuid) to service_role;
revoke all on function runlift.admin_replay_lookup(p_token uuid, p_log_id uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_replay_lookup(p_token uuid, p_log_id uuid) to anon;
grant execute on function runlift.admin_replay_lookup(p_token uuid, p_log_id uuid) to authenticated;
grant execute on function runlift.admin_replay_lookup(p_token uuid, p_log_id uuid) to service_role;
revoke all on function runlift.admin_restore_event_config(p_token uuid, p_id uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_restore_event_config(p_token uuid, p_id uuid) to anon;
grant execute on function runlift.admin_restore_event_config(p_token uuid, p_id uuid) to authenticated;
grant execute on function runlift.admin_restore_event_config(p_token uuid, p_id uuid) to service_role;
revoke all on function runlift.admin_save_email_template(p_token uuid, p_cheie text, p_subiect text, p_text text) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_save_email_template(p_token uuid, p_cheie text, p_subiect text, p_text text) to anon;
grant execute on function runlift.admin_save_email_template(p_token uuid, p_cheie text, p_subiect text, p_text text) to authenticated;
grant execute on function runlift.admin_save_email_template(p_token uuid, p_cheie text, p_subiect text, p_text text) to service_role;
revoke all on function runlift.admin_save_event_config_draft(p_token uuid, p_editie integer, p_config jsonb) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_save_event_config_draft(p_token uuid, p_editie integer, p_config jsonb) to anon;
grant execute on function runlift.admin_save_event_config_draft(p_token uuid, p_editie integer, p_config jsonb) to authenticated;
grant execute on function runlift.admin_save_event_config_draft(p_token uuid, p_editie integer, p_config jsonb) to service_role;
revoke all on function runlift.admin_set_coming_soon(p_token uuid, p_show boolean, p_launch_at text, p_next_edition_at text) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_set_coming_soon(p_token uuid, p_show boolean, p_launch_at text, p_next_edition_at text) to anon;
grant execute on function runlift.admin_set_coming_soon(p_token uuid, p_show boolean, p_launch_at text, p_next_edition_at text) to authenticated;
grant execute on function runlift.admin_set_coming_soon(p_token uuid, p_show boolean, p_launch_at text, p_next_edition_at text) to service_role;
revoke all on function runlift.admin_undelete_registration(p_token uuid, p_id uuid, p_force boolean) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_undelete_registration(p_token uuid, p_id uuid, p_force boolean) to anon;
grant execute on function runlift.admin_undelete_registration(p_token uuid, p_id uuid, p_force boolean) to authenticated;
grant execute on function runlift.admin_undelete_registration(p_token uuid, p_id uuid, p_force boolean) to service_role;
revoke all on function runlift.admin_undelete_waitlist(p_token uuid, p_id uuid, p_force boolean) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_undelete_waitlist(p_token uuid, p_id uuid, p_force boolean) to anon;
grant execute on function runlift.admin_undelete_waitlist(p_token uuid, p_id uuid, p_force boolean) to authenticated;
grant execute on function runlift.admin_undelete_waitlist(p_token uuid, p_id uuid, p_force boolean) to service_role;
revoke all on function runlift.admin_update_registration(p_token uuid, p_id uuid, p_nume text, p_telefon text, p_email text) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_update_registration(p_token uuid, p_id uuid, p_nume text, p_telefon text, p_email text) to anon;
grant execute on function runlift.admin_update_registration(p_token uuid, p_id uuid, p_nume text, p_telefon text, p_email text) to authenticated;
grant execute on function runlift.admin_update_registration(p_token uuid, p_id uuid, p_nume text, p_telefon text, p_email text) to service_role;
revoke all on function runlift.anunt_recipients(p_exclude text[]) from public, anon, authenticated, service_role;
grant execute on function runlift.anunt_recipients(p_exclude text[]) to service_role;
revoke all on function runlift.auto_promote_from_waitlist() from public, anon, authenticated, service_role;
grant execute on function runlift.auto_promote_from_waitlist() to anon;
grant execute on function runlift.auto_promote_from_waitlist() to authenticated;
grant execute on function runlift.auto_promote_from_waitlist() to service_role;
revoke all on function runlift.broadcast_once(p_key text) from public, anon, authenticated, service_role;
grant execute on function runlift.broadcast_once(p_key text) to service_role;
revoke all on function runlift.broadcast_secret() from public, anon, authenticated, service_role;
grant execute on function runlift.broadcast_secret() to anon;
grant execute on function runlift.broadcast_secret() to authenticated;
grant execute on function runlift.broadcast_secret() to service_role;
revoke all on function runlift.confirm_lookup(p_id uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.confirm_lookup(p_id uuid) to anon;
grant execute on function runlift.confirm_lookup(p_id uuid) to authenticated;
grant execute on function runlift.confirm_lookup(p_id uuid) to service_role;
revoke all on function runlift.confirm_signup(p_token uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.confirm_signup(p_token uuid) to anon;
grant execute on function runlift.confirm_signup(p_token uuid) to authenticated;
grant execute on function runlift.confirm_signup(p_token uuid) to service_role;
revoke all on function runlift.current_event_edition() from public, anon, authenticated, service_role;
grant execute on function runlift.current_event_edition() to anon;
grant execute on function runlift.current_event_edition() to authenticated;
grant execute on function runlift.current_event_edition() to service_role;
revoke all on function runlift.current_launch_edition() from public, anon, authenticated, service_role;
grant execute on function runlift.current_launch_edition() to anon;
grant execute on function runlift.current_launch_edition() to authenticated;
grant execute on function runlift.current_launch_edition() to service_role;
revoke all on function runlift.decline_spot(p_token uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.decline_spot(p_token uuid) to anon;
grant execute on function runlift.decline_spot(p_token uuid) to authenticated;
grant execute on function runlift.decline_spot(p_token uuid) to service_role;
revoke all on function runlift.edition2_recipients() from public, anon, authenticated, service_role;
grant execute on function runlift.edition2_recipients() to anon;
grant execute on function runlift.edition2_recipients() to authenticated;
grant execute on function runlift.edition2_recipients() to service_role;
revoke all on function runlift.escaladeaza(p_tip text, p_cheie text, p_subiect text, p_detaliu text, p_editie smallint) from public, anon, authenticated, service_role;
grant execute on function runlift.escaladeaza(p_tip text, p_cheie text, p_subiect text, p_detaliu text, p_editie smallint) to service_role;
revoke all on function runlift.event_config_validate(p_config jsonb) from public, anon, authenticated, service_role;
grant execute on function runlift.event_config_validate(p_config jsonb) to anon;
grant execute on function runlift.event_config_validate(p_config jsonb) to authenticated;
grant execute on function runlift.event_config_validate(p_config jsonb) to service_role;
revoke all on function runlift.event_waitlist_cap() from public, anon, authenticated, service_role;
grant execute on function runlift.event_waitlist_cap() to anon;
grant execute on function runlift.event_waitlist_cap() to authenticated;
grant execute on function runlift.event_waitlist_cap() to service_role;
revoke all on function runlift.forteaza_editia_curenta() from public, anon, authenticated, service_role;
grant execute on function runlift.forteaza_editia_curenta() to service_role;
revoke all on function runlift.info_lookup(p_email text) from public, anon, authenticated, service_role;
grant execute on function runlift.info_lookup(p_email text) to anon;
grant execute on function runlift.info_lookup(p_email text) to authenticated;
grant execute on function runlift.info_lookup(p_email text) to service_role;
revoke all on function runlift.info_template() from public, anon, authenticated, service_role;
grant execute on function runlift.info_template() to anon;
grant execute on function runlift.info_template() to authenticated;
grant execute on function runlift.info_template() to service_role;
revoke all on function runlift.log_emails(p_rows jsonb) from public, anon, authenticated, service_role;
grant execute on function runlift.log_emails(p_rows jsonb) to service_role;
revoke all on function runlift.mark_confirmation_sent(p_email text) from public, anon, authenticated, service_role;
grant execute on function runlift.mark_confirmation_sent(p_email text) to anon;
grant execute on function runlift.mark_confirmation_sent(p_email text) to authenticated;
grant execute on function runlift.mark_confirmation_sent(p_email text) to service_role;
revoke all on function runlift.maybe_send_reminder() from public, anon, authenticated, service_role;
grant execute on function runlift.maybe_send_reminder() to service_role;
revoke all on function runlift.operator_email() from public, anon, authenticated, service_role;
grant execute on function runlift.operator_email() to service_role;
revoke all on function runlift.public_config() from public, anon, authenticated, service_role;
grant execute on function runlift.public_config() to anon;
grant execute on function runlift.public_config() to authenticated;
grant execute on function runlift.public_config() to service_role;
revoke all on function runlift.public_stats() from public, anon, authenticated, service_role;
grant execute on function runlift.public_stats() to anon;
grant execute on function runlift.public_stats() to authenticated;
grant execute on function runlift.public_stats() to service_role;
revoke all on function runlift.registrations_backup_sync() from public, anon, authenticated, service_role;
grant execute on function runlift.registrations_backup_sync() to anon;
grant execute on function runlift.registrations_backup_sync() to authenticated;
grant execute on function runlift.registrations_backup_sync() to service_role;
revoke all on function runlift.registrations_guard() from public, anon, authenticated, service_role;
grant execute on function runlift.registrations_guard() to anon;
grant execute on function runlift.registrations_guard() to authenticated;
grant execute on function runlift.registrations_guard() to service_role;
revoke all on function runlift.scrie_scalarele_editiei(p_config jsonb) from public, anon, authenticated, service_role;
grant execute on function runlift.scrie_scalarele_editiei(p_config jsonb) to service_role;
revoke all on function runlift.semnaleaza_locuri_epuizate() from public, anon, authenticated, service_role;
grant execute on function runlift.semnaleaza_locuri_epuizate() to anon;
grant execute on function runlift.semnaleaza_locuri_epuizate() to authenticated;
grant execute on function runlift.semnaleaza_locuri_epuizate() to service_role;
revoke all on function runlift.template_lookup(p_cheie text) from public, anon, authenticated, service_role;
grant execute on function runlift.template_lookup(p_cheie text) to anon;
grant execute on function runlift.template_lookup(p_cheie text) to authenticated;
grant execute on function runlift.template_lookup(p_cheie text) to service_role;
revoke all on function runlift.unsubscribe(p_token uuid) from public, anon, authenticated, service_role;
grant execute on function runlift.unsubscribe(p_token uuid) to anon;
grant execute on function runlift.unsubscribe(p_token uuid) to authenticated;
grant execute on function runlift.unsubscribe(p_token uuid) to service_role;
revoke all on function runlift.waitlist_cap() from public, anon, authenticated, service_role;
grant execute on function runlift.waitlist_cap() to anon;
grant execute on function runlift.waitlist_cap() to authenticated;
grant execute on function runlift.waitlist_cap() to service_role;
revoke all on function runlift.waitlist_recipients() from public, anon, authenticated, service_role;
grant execute on function runlift.waitlist_recipients() to anon;
grant execute on function runlift.waitlist_recipients() to authenticated;
grant execute on function runlift.waitlist_recipients() to service_role;

revoke all on table runlift.admin_events from public, anon, authenticated, service_role;
grant select on table runlift.admin_events to anon;
grant insert on table runlift.admin_events to anon;
grant update on table runlift.admin_events to anon;
grant delete on table runlift.admin_events to anon;
grant select on table runlift.admin_events to authenticated;
grant insert on table runlift.admin_events to authenticated;
grant update on table runlift.admin_events to authenticated;
grant delete on table runlift.admin_events to authenticated;
grant select on table runlift.admin_events to service_role;
grant insert on table runlift.admin_events to service_role;
grant update on table runlift.admin_events to service_role;
grant delete on table runlift.admin_events to service_role;
alter table runlift.admin_events enable row level security;
revoke all on table runlift.admin_login_attempts from public, anon, authenticated, service_role;
grant select on table runlift.admin_login_attempts to anon;
grant insert on table runlift.admin_login_attempts to anon;
grant update on table runlift.admin_login_attempts to anon;
grant delete on table runlift.admin_login_attempts to anon;
grant select on table runlift.admin_login_attempts to authenticated;
grant insert on table runlift.admin_login_attempts to authenticated;
grant update on table runlift.admin_login_attempts to authenticated;
grant delete on table runlift.admin_login_attempts to authenticated;
grant select on table runlift.admin_login_attempts to service_role;
grant insert on table runlift.admin_login_attempts to service_role;
grant update on table runlift.admin_login_attempts to service_role;
grant delete on table runlift.admin_login_attempts to service_role;
alter table runlift.admin_login_attempts enable row level security;
revoke all on table runlift.admin_sessions from public, anon, authenticated, service_role;
grant select on table runlift.admin_sessions to anon;
grant insert on table runlift.admin_sessions to anon;
grant update on table runlift.admin_sessions to anon;
grant delete on table runlift.admin_sessions to anon;
grant select on table runlift.admin_sessions to authenticated;
grant insert on table runlift.admin_sessions to authenticated;
grant update on table runlift.admin_sessions to authenticated;
grant delete on table runlift.admin_sessions to authenticated;
grant select on table runlift.admin_sessions to service_role;
grant insert on table runlift.admin_sessions to service_role;
grant update on table runlift.admin_sessions to service_role;
grant delete on table runlift.admin_sessions to service_role;
alter table runlift.admin_sessions enable row level security;
revoke all on table runlift.admin_users from public, anon, authenticated, service_role;
grant select on table runlift.admin_users to anon;
grant insert on table runlift.admin_users to anon;
grant update on table runlift.admin_users to anon;
grant delete on table runlift.admin_users to anon;
grant select on table runlift.admin_users to authenticated;
grant insert on table runlift.admin_users to authenticated;
grant update on table runlift.admin_users to authenticated;
grant delete on table runlift.admin_users to authenticated;
grant select on table runlift.admin_users to service_role;
grant insert on table runlift.admin_users to service_role;
grant update on table runlift.admin_users to service_role;
grant delete on table runlift.admin_users to service_role;
alter table runlift.admin_users enable row level security;
revoke all on table runlift.app_config from public, anon, authenticated, service_role;
grant select on table runlift.app_config to anon;
grant insert on table runlift.app_config to anon;
grant update on table runlift.app_config to anon;
grant delete on table runlift.app_config to anon;
grant select on table runlift.app_config to authenticated;
grant insert on table runlift.app_config to authenticated;
grant update on table runlift.app_config to authenticated;
grant delete on table runlift.app_config to authenticated;
grant select on table runlift.app_config to service_role;
grant insert on table runlift.app_config to service_role;
grant update on table runlift.app_config to service_role;
grant delete on table runlift.app_config to service_role;
alter table runlift.app_config enable row level security;
revoke all on table runlift.email_log from public, anon, authenticated, service_role;
grant select on table runlift.email_log to anon;
grant insert on table runlift.email_log to anon;
grant update on table runlift.email_log to anon;
grant delete on table runlift.email_log to anon;
grant select on table runlift.email_log to authenticated;
grant insert on table runlift.email_log to authenticated;
grant update on table runlift.email_log to authenticated;
grant delete on table runlift.email_log to authenticated;
grant select on table runlift.email_log to service_role;
grant insert on table runlift.email_log to service_role;
grant update on table runlift.email_log to service_role;
grant delete on table runlift.email_log to service_role;
alter table runlift.email_log enable row level security;
revoke all on table runlift.email_templates from public, anon, authenticated, service_role;
grant select on table runlift.email_templates to anon;
grant insert on table runlift.email_templates to anon;
grant update on table runlift.email_templates to anon;
grant delete on table runlift.email_templates to anon;
grant select on table runlift.email_templates to authenticated;
grant insert on table runlift.email_templates to authenticated;
grant update on table runlift.email_templates to authenticated;
grant delete on table runlift.email_templates to authenticated;
grant select on table runlift.email_templates to service_role;
grant insert on table runlift.email_templates to service_role;
grant update on table runlift.email_templates to service_role;
grant delete on table runlift.email_templates to service_role;
alter table runlift.email_templates enable row level security;
revoke all on table runlift.event_config from public, anon, authenticated, service_role;
grant select on table runlift.event_config to anon;
grant insert on table runlift.event_config to anon;
grant update on table runlift.event_config to anon;
grant delete on table runlift.event_config to anon;
grant select on table runlift.event_config to authenticated;
grant insert on table runlift.event_config to authenticated;
grant update on table runlift.event_config to authenticated;
grant delete on table runlift.event_config to authenticated;
grant select on table runlift.event_config to service_role;
grant insert on table runlift.event_config to service_role;
grant update on table runlift.event_config to service_role;
grant delete on table runlift.event_config to service_role;
alter table runlift.event_config enable row level security;
revoke all on table runlift.event_waitlist from public, anon, authenticated, service_role;
grant select on table runlift.event_waitlist to anon;
grant update on table runlift.event_waitlist to anon;
grant delete on table runlift.event_waitlist to anon;
grant select on table runlift.event_waitlist to authenticated;
grant insert on table runlift.event_waitlist to authenticated;
grant update on table runlift.event_waitlist to authenticated;
grant delete on table runlift.event_waitlist to authenticated;
grant select on table runlift.event_waitlist to service_role;
grant insert on table runlift.event_waitlist to service_role;
grant update on table runlift.event_waitlist to service_role;
grant delete on table runlift.event_waitlist to service_role;
alter table runlift.event_waitlist enable row level security;
revoke all on table runlift.launch_notifications from public, anon, authenticated, service_role;
grant select on table runlift.launch_notifications to anon;
grant update on table runlift.launch_notifications to anon;
grant delete on table runlift.launch_notifications to anon;
grant select on table runlift.launch_notifications to authenticated;
grant insert on table runlift.launch_notifications to authenticated;
grant update on table runlift.launch_notifications to authenticated;
grant delete on table runlift.launch_notifications to authenticated;
grant select on table runlift.launch_notifications to service_role;
grant insert on table runlift.launch_notifications to service_role;
grant update on table runlift.launch_notifications to service_role;
grant delete on table runlift.launch_notifications to service_role;
alter table runlift.launch_notifications enable row level security;
revoke all on table runlift.launch_notifications_backup_20260718 from public, anon, authenticated, service_role;
grant select on table runlift.launch_notifications_backup_20260718 to anon;
grant insert on table runlift.launch_notifications_backup_20260718 to anon;
grant update on table runlift.launch_notifications_backup_20260718 to anon;
grant delete on table runlift.launch_notifications_backup_20260718 to anon;
grant select on table runlift.launch_notifications_backup_20260718 to authenticated;
grant insert on table runlift.launch_notifications_backup_20260718 to authenticated;
grant update on table runlift.launch_notifications_backup_20260718 to authenticated;
grant delete on table runlift.launch_notifications_backup_20260718 to authenticated;
grant select on table runlift.launch_notifications_backup_20260718 to service_role;
grant insert on table runlift.launch_notifications_backup_20260718 to service_role;
grant update on table runlift.launch_notifications_backup_20260718 to service_role;
grant delete on table runlift.launch_notifications_backup_20260718 to service_role;
alter table runlift.launch_notifications_backup_20260718 enable row level security;
revoke all on table runlift.registrations from public, anon, authenticated, service_role;
grant select on table runlift.registrations to anon;
grant update on table runlift.registrations to anon;
grant delete on table runlift.registrations to anon;
grant select on table runlift.registrations to authenticated;
grant insert on table runlift.registrations to authenticated;
grant update on table runlift.registrations to authenticated;
grant delete on table runlift.registrations to authenticated;
grant select on table runlift.registrations to service_role;
grant insert on table runlift.registrations to service_role;
grant update on table runlift.registrations to service_role;
grant delete on table runlift.registrations to service_role;
alter table runlift.registrations enable row level security;
revoke all on table runlift.registrations_backup from public, anon, authenticated, service_role;
grant select on table runlift.registrations_backup to anon;
grant insert on table runlift.registrations_backup to anon;
grant update on table runlift.registrations_backup to anon;
grant delete on table runlift.registrations_backup to anon;
grant select on table runlift.registrations_backup to authenticated;
grant insert on table runlift.registrations_backup to authenticated;
grant update on table runlift.registrations_backup to authenticated;
grant delete on table runlift.registrations_backup to authenticated;
grant select on table runlift.registrations_backup to service_role;
grant insert on table runlift.registrations_backup to service_role;
grant update on table runlift.registrations_backup to service_role;
grant delete on table runlift.registrations_backup to service_role;
alter table runlift.registrations_backup enable row level security;

-- (nicio politică: după lockdown-ul anti-bot, nimeni nu scrie direct din browser)

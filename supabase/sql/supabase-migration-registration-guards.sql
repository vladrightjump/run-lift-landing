-- Faza A — Siguranță date pe server: cap de capacitate + deadline pe `registrations`.
--
-- Context: până acum `registrations` NU avea nicio regulă pe server — capacitatea
-- (20) și deadline-ul de înscriere trăiau doar în frontend (`edition.ts`), unde
-- numărătoarea e stale (refresh la 15s) și deadline-ul depinde de ceasul vizitatorului.
-- Rezultat: overbooking (race pe ultimul loc) și înscrieri după deadline erau posibile.
-- Waitlist-ul ARE deja cap pe server (`event_waitlist_cap` → `waitlist_full`); asta
-- aduce aceeași protecție și pe înscrieri, ca sursa de adevăr să fie DB-ul.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
--
-- Ce face:
--  1. `app_config.registration_deadline` — deadline-ul ediției în DB (oglindește
--     EDITION.registrationDeadline; îl scrie `scripts/sync-edition.ts` la rollover).
--  2. Trigger BEFORE INSERT pe `registrations` care, DOAR pentru formularul public
--     (rol `anon`), respinge inserturile peste capacitate (`event_full`) sau după
--     deadline (`registration_closed`). Oglindește pattern-ul `event_waitlist_cap`.
--  3. Căile admin/automate (add din backoffice, promovare manuală, auto-promovare din
--     waitlist) SAR peste guard printr-un flag pe tranzacție — adminul e autoritatea
--     și un loc eliberat trebuie umplut chiar dacă ediția pare „plină"/după deadline.

-- 1. Deadline-ul ediției curente în DB (fără el, guard-ul nu blochează pe timp).
--    Valoare = EDITION.registrationDeadline + EDITION.tz (fus Chișinău).
insert into runlift.app_config (key, value)
values ('registration_deadline', '2026-08-08T06:30:00+03:00')
on conflict (key) do update set value = excluded.value;

-- 2. Funcția de guard. SECURITY DEFINER ca să poată număra înscrierile (RLS blochează
--    SELECT pentru `anon`). Enforce-ul se face DOAR când nu e setat flagul de bypass
--    (setat de funcțiile SECURITY DEFINER de mai jos) și doar pentru ediția curentă.
create or replace function runlift.registrations_guard()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare
  v_cap      int;
  v_deadline timestamptz;
  v_count    int;
begin
  -- Căile admin/automate setează flagul → nu le blocăm.
  if coalesce(current_setting('runlift.guard_bypass', true), '') = '1' then
    return new;
  end if;

  -- Guard-ul e doar pentru ediția curentă (inserturi de test/istorice trec).
  if new.editie <> current_event_edition() then
    return new;
  end if;

  -- Deadline (opțional): dacă lipsește din app_config, nu blocăm pe timp.
  select value::timestamptz into v_deadline
    from app_config where key = 'registration_deadline';
  if v_deadline is not null and now() > v_deadline then
    raise exception 'registration_closed';
  end if;

  -- Capacitate (fallback 20 dacă lipsește). BEFORE INSERT: rândul nou nu e încă în
  -- tabel, deci count reflectă locurile deja ocupate.
  select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
    into v_cap;
  select count(*) into v_count from registrations where editie = new.editie;
  if v_count >= v_cap then
    raise exception 'event_full';
  end if;

  return new;
end;
$$;

drop trigger if exists registrations_guard_trg on runlift.registrations;
create trigger registrations_guard_trg
  before insert on runlift.registrations
  for each row
  execute function runlift.registrations_guard();

-- 3. Bypass pentru căile SECURITY DEFINER. `set_config(..., true)` = local pe
--    tranzacția curentă (se resetează automat la final), deci nu scapă către alte
--    cereri. Adăugăm o singură linie fiecăreia, restul definiției rămâne identic.

-- 3a. Add manual din backoffice.
create or replace function runlift.admin_add_registration(p_token uuid, p_nume text, p_telefon text, p_email text)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  perform set_config('runlift.guard_bypass', '1', true);
  insert into registrations (nume, telefon, email, acord, editie)
  values (trim(p_nume), trim(p_telefon), lower(trim(p_email)), true, current_event_edition())
  returning id into v_id;
  return v_id;
end;
$function$;

-- 3b. Promovare manuală din waitlist (butonul „Promovează").
create or replace function runlift.admin_promote_waitlist(p_token uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_w runlift.event_waitlist; v_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select * into v_w from event_waitlist where id = p_id;
  if v_w.id is null then raise exception 'not_found'; end if;
  perform set_config('runlift.guard_bypass', '1', true);
  insert into registrations (nume, telefon, email, data_nasterii, acord, editie)
  values (trim(v_w.nume), trim(v_w.telefon), lower(trim(v_w.email)), v_w.data_nasterii, true, v_w.editie)
  on conflict (lower(email), editie) do nothing
  returning id into v_id;
  delete from event_waitlist where id = p_id;
  return v_id;
end;
$function$;

-- 3c. Auto-promovare la eliberarea unui loc (trigger AFTER DELETE). Identică cu cea din
--     supabase-migration-waitlist-autopromote.sql, plus linia de bypass.
create or replace function runlift.auto_promote_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare
  v_cap int;
  v_w   runlift.event_waitlist;
  v_id  uuid;
begin
  if old.editie <> current_event_edition() then
    return old;
  end if;

  perform set_config('runlift.guard_bypass', '1', true);

  select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
    into v_cap;

  loop
    if (select count(*) from registrations where editie = old.editie) >= v_cap then
      exit;
    end if;

    select * into v_w
      from event_waitlist
     where editie = old.editie
     order by created_at asc
     for update skip locked
     limit 1;
    if v_w.id is null then
      exit;
    end if;

    insert into registrations (nume, telefon, email, data_nasterii, acord, editie)
    values (trim(v_w.nume), trim(v_w.telefon), lower(trim(v_w.email)),
            v_w.data_nasterii, true, v_w.editie)
    on conflict (lower(email), editie) do nothing
    returning id into v_id;

    delete from event_waitlist where id = v_w.id;

    if v_id is not null then
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
      exit;
    end if;
  end loop;

  return old;
end;
$$;

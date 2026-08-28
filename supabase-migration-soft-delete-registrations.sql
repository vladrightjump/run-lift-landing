-- Ștergere logică pe `registrations` + undo real + jurnal de scrieri din admin.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Context: butonul „Undo" din toast-ul de ștergere nu restaura nimic — reinsera.
-- Consecințele erau amândouă tăcute:
--   1. `admin_add_registration` setează necondiționat `runlift.guard_bypass` și nu
--      citea niciodată `event_capacity`, deci reinserarea putea trece ediția peste
--      capacitate. Între ștergere și undo se putea strecura și auto-promovarea
--      (trigger AFTER DELETE), care elibera locul spre altcineva.
--   2. Rândul recreat primea un `created_at` nou, deci persoana își pierdea locul
--      în ordinea FIFO de promovare, fără niciun semn.
--
-- Tiparul de rezolvare exista deja în proiect: `registrations_backup` ține de la
-- prima ediție o coloană `deleted_at`. Decizia fusese luată o dată, doar că nu
-- fusese aplicată pe tabelul viu.
--
-- Migrarea e re-rulabilă (idempotentă): proiectul nu are branch de staging.

begin;

-- ---------------------------------------------------------------------------
-- 1. Coloana + unicitatea care trebuie să ignore rândurile șterse logic.
-- ---------------------------------------------------------------------------
alter table runlift.registrations
  add column if not exists deleted_at timestamptz;

create index if not exists registrations_editie_activi
  on runlift.registrations (editie)
  where deleted_at is null;

-- Fără indexul PARȚIAL, un rând șters logic ar ocupa în continuare locul din
-- index, iar re-înscrierea aceleiași adrese pe aceeași ediție ar pica cu
-- „duplicate". Indexul vechi era pe expresie, deci e index, nu constrângere.
drop index if exists runlift.registrations_email_editie_key;
create unique index if not exists registrations_email_editie_key
  on runlift.registrations (lower(email), editie)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. Tabelul-umbră trebuie să afle de ștergerea logică.
--
--    ATENȚIE: asta e interacțiunea care rupe tăcut arhiva. Trigger-ul de backup
--    scria `deleted_at` DOAR pe ramura DELETE. Din momentul în care ștergerea
--    devine un UPDATE, ramura DELETE nu mai pleacă niciodată, iar ramura UPDATE
--    nu propaga flagul — deci `registrations_backup` ar fi încetat complet să
--    mai înregistreze retragerile, fără nicio eroare.
-- ---------------------------------------------------------------------------
create or replace function runlift.registrations_backup_sync()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
          -- Oglindim starea de ștergere logică: și retragerea, și revenirea.
          deleted_at = new.deleted_at
      where id = new.id;
    return new;
  elsif tg_op = 'DELETE' then
    -- Ștergerea fizică rămâne posibilă (curățenie manuală) și se oglindește.
    update registrations_backup set deleted_at = now() where id = old.id;
    return old;
  end if;
  return null;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Auto-promovarea se mută de pe AFTER DELETE pe eliberarea logică a locului.
--    Clauza WHEN o ține departe de editările obișnuite, care sunt tot UPDATE.
-- ---------------------------------------------------------------------------
create or replace function runlift.auto_promote_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
    -- Indexul e acum parțial, deci inferența ON CONFLICT trebuie să poarte și
    -- predicatul, altfel Postgres nu găsește arbitrul și aruncă.
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
      exit;
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists registrations_autopromote_trg on runlift.registrations;
create trigger registrations_autopromote_trg
  after update of deleted_at on runlift.registrations
  for each row
  when (old.deleted_at is null and new.deleted_at is not null)
  execute function runlift.auto_promote_from_waitlist();

-- ---------------------------------------------------------------------------
-- 4. Ștergerea din admin devine logică; undo o reversează.
-- ---------------------------------------------------------------------------
create or replace function runlift.admin_delete_registration(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
$function$;

-- Undo REAL: același rând, același `id`, același `created_at` — deci aceeași
-- poziție în ordinea de promovare. Nu o reinserare.
create or replace function runlift.admin_undelete_registration(p_token uuid, p_id uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_ed smallint; v_nume text; v_email text; v_cap int; v_count int;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select editie, nume, email into v_ed, v_nume, v_email
    from registrations where id = p_id and deleted_at is not null;
  if v_ed is null then return; end if;
  if v_ed <> current_event_edition() then raise exception 'edition_archived'; end if;

  -- Locul poate fi ocupat între timp de auto-promovare. Fără garda asta, undo-ul
  -- trece ediția peste capacitate exact ca înainte.
  if not p_force then
    select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
      into v_cap;
    select count(*) into v_count
      from registrations where editie = v_ed and deleted_at is null;
    if v_count >= v_cap then raise exception 'event_full'; end if;
  end if;

  -- Adresa poate fi fost re-înscrisă între timp: indexul parțial ar respinge.
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
$function$;

-- ---------------------------------------------------------------------------
-- 5. Adăugarea din admin respectă capacitatea, cu derogare explicită.
-- ---------------------------------------------------------------------------
drop function if exists runlift.admin_add_registration(uuid, text, text, text);
create or replace function runlift.admin_add_registration(
  p_token uuid, p_nume text, p_telefon text, p_email text, p_force boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
$function$;

-- ---------------------------------------------------------------------------
-- 6. Cititorii. Enumerarea e completă: 11 funcții din `runlift` ating
--    `registrations`. Cele care NU se schimbă sunt notate explicit, ca să nu
--    pară scăpate:
--      • admin_create_edition — `max(editie)` trebuie să vadă și rândurile șterse;
--      • unsubscribe          — `dezabonat_la` pe un rând retras e inofensiv.
-- ---------------------------------------------------------------------------
create or replace function runlift.admin_list_registrations(p_token uuid, p_editie integer default null)
returns table(id uuid, created_at timestamptz, nume text, telefon text, email text, echipa text, editie smallint, dezabonat_la timestamptz)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_ed smallint := coalesce(p_editie::smallint, current_event_edition());
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select r.id, r.created_at, r.nume, r.telefon, r.email, r.echipa, r.editie, r.dezabonat_la
    from registrations r
    where r.editie = v_ed and r.deleted_at is null
    order by r.created_at asc;
end;
$function$;

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
$$;

create or replace function runlift.public_stats()
returns json
language sql
stable security definer
set search_path to ''
as $function$
  select json_build_object(
    'count', count(*),
    'participants', coalesce(json_agg(json_build_object('nume', r.public_name, 'echipa', r.echipa) order by r.created_at), '[]'::json),
    'waitlist', (select count(*) from runlift.event_waitlist where editie = runlift.current_event_edition())
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
$function$;

create or replace function runlift.edition2_recipients()
returns table(email text, nume text, token_unsub uuid)
language sql
set search_path to ''
as $function$
  select email, nume, token_unsub
  from runlift.registrations
  where editie = (select value::smallint from runlift.app_config where key = 'current_event_edition')
    and dezabonat_la is null
    and deleted_at is null
  order by created_at;
$function$;

-- Un participant retras nu mai primește confirmarea de înscriere.
create or replace function runlift.confirm_lookup(p_id uuid)
returns table(email text, nume text)
language sql
set search_path to ''
as $function$
  select email, nume from runlift.registrations
  where id = p_id
    and editie = (select value::smallint from runlift.app_config where key = 'current_event_edition')
    and deleted_at is null
    and created_at > now() - interval '15 minutes';
$function$;

create or replace function runlift.admin_list_editions(p_token uuid)
returns table(editie smallint, participanti integer, asteptare integer, lansare integer, prima timestamptz, ultima timestamptz, este_curenta boolean)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
      (select count(*)::int from event_waitlist w       where w.editie = t.editie),
      (select count(*)::int from launch_notifications l where l.editie = t.editie),
      (select min(r.created_at) from registrations r    where r.editie = t.editie and r.deleted_at is null),
      (select max(r.created_at) from registrations r    where r.editie = t.editie and r.deleted_at is null),
      t.editie = v_ed
    from toate t
    where t.editie is not null
    order by t.editie asc;
end;
$function$;

-- Editarea unui rând retras n-are sens: întâi îl readuci.
create or replace function runlift.admin_update_registration(p_token uuid, p_id uuid, p_nume text, p_telefon text, p_email text)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
$function$;

-- Promovarea manuală: aceeași corecție de inferență ON CONFLICT + jurnal.
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
  on conflict (lower(email), editie) where deleted_at is null do nothing
  returning id into v_id;
  delete from event_waitlist where id = p_id;

  insert into admin_events (tip, detaliu)
  values ('admin_promote', jsonb_build_object(
    'id', v_id, 'nume', v_w.nume, 'email', lower(trim(v_w.email)), 'editie', v_w.editie));

  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Feedul de audit nu mai e plafonat la 50: acum el e răspunsul la
--    „ce s-a întâmplat cu Ana?", nu doar o listă de promovări automate.
-- ---------------------------------------------------------------------------
drop function if exists runlift.admin_list_events(uuid);
create or replace function runlift.admin_list_events(p_token uuid, p_limit integer default 200)
returns table(id uuid, created_at timestamptz, tip text, detaliu jsonb)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select e.id, e.created_at, e.tip, e.detaliu
    from admin_events e
    order by e.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$function$;

-- ---------------------------------------------------------------------------
-- 8. Grants — aceleași ca pentru restul RPC-urilor de admin (cheia publicabilă
--    rulează ca `anon`; autoritatea vine din token, verificat în funcție).
-- ---------------------------------------------------------------------------
grant execute on function runlift.admin_undelete_registration(uuid, uuid, boolean) to anon, authenticated, service_role;
grant execute on function runlift.admin_add_registration(uuid, text, text, text, boolean) to anon, authenticated, service_role;
grant execute on function runlift.admin_list_events(uuid, integer) to anon, authenticated, service_role;

commit;

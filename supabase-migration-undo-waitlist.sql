-- Ștergere logică pe `event_waitlist` + undo real, cu paritate față de înscrieri.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Context: `AdminDashboard` are toast cu „Undo" la ștergerea unei ÎNSCRIERI, dar
-- nu și la ștergerea din lista de așteptare — o funcție mai sus în același fișier.
-- Asimetria nu era o scăpare de UI: `admin_delete_waitlist` ștergea FIZIC rândul,
-- deci n-avea ce reversa. Tiparul de rezolvare e deja adjudecat în proiect de
-- `supabase-migration-soft-delete-registrations.sql`; asta îl aplică pe al doilea
-- tabel de audiență.
--
-- Reversare, nu reinserare: același rând, deci același `created_at`, deci aceeași
-- poziție în ordinea FIFO de promovare. O reinserare ar trimite persoana la
-- coada listei fără niciun semn.
--
-- ATENȚIE — enumerarea completă a ceea ce „vede" tabelul. Aceeași lecție ca la
-- `registrations_backup_sync()`: un cititor uitat nu dă eroare, dă un rezultat
-- greșit în tăcere. Opt locuri ating `event_waitlist`; fiecare e tratat mai jos,
-- inclusiv cele care NU se schimbă, ca să nu pară scăpate.
--
-- Migrarea e idempotentă, dar re-rulabilă DOAR ÎNAINTE de
-- `supabase-migration-escaladare.sql`. Amândouă rescriu
-- `auto_promote_from_waitlist()`, iar versiunea de aici n-are apelul de
-- escaladare: re-rulată DUPĂ, ar scoate în tăcere alerta de promovare automată
-- — chiar anomalia pentru care escaladarea există. Dacă trebuie re-rulată după,
-- rulează imediat și `supabase-migration-escaladare.sql` din nou.

begin;

-- ---------------------------------------------------------------------------
-- 1. Coloana + unicitatea care trebuie să ignore rândurile șterse logic.
-- ---------------------------------------------------------------------------
alter table runlift.event_waitlist
  add column if not exists deleted_at timestamptz;

create index if not exists event_waitlist_editie_activi
  on runlift.event_waitlist (editie)
  where deleted_at is null;

-- Fără indexul PARȚIAL, un rând șters logic ar ocupa în continuare locul din
-- index, iar re-înscrierea aceleiași adrese pe aceeași ediție ar pica cu
-- „duplicate" — și, mai rău, ar pica pentru un rând pe care nimeni nu-l mai
-- vede nicăieri în backoffice.
drop index if exists runlift.event_waitlist_email_editie_key;
create unique index if not exists event_waitlist_email_editie_key
  on runlift.event_waitlist (lower(email), editie)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 2. Plafonul listei, într-un singur loc.
--
--    ASTA e interacțiunea care s-ar fi stricat tăcut. `event_waitlist_cap()`
--    numără TOATE rândurile ediției și refuză la 10. Din momentul în care
--    ștergerea devine logică, rândurile șterse ar fi continuat să ocupe plafonul:
--    lista ar fi arătat 7 oameni în backoffice și ar fi respins al optulea cu
--    `waitlist_full`, fără nicio explicație vizibilă nicăieri.
--
--    Plafonul se extrage în funcția lui pentru că de aici încolo îl citesc două
--    locuri — trigger-ul de insert și undo-ul. Două `10` scrise separat sunt
--    două valori care vor diverge.
-- ---------------------------------------------------------------------------
create or replace function runlift.waitlist_cap()
returns integer
language sql
immutable
set search_path to ''
as $function$ select 10; $function$;

create or replace function runlift.event_waitlist_cap()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if (select count(*) from event_waitlist
       where editie = new.editie and deleted_at is null) >= waitlist_cap() then
    raise exception 'waitlist_full';
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Ștergerea din admin devine logică; undo o reversează.
-- ---------------------------------------------------------------------------
create or replace function runlift.admin_delete_waitlist(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
$function$;

-- Undo REAL: același rând, același `id`, același `created_at` — deci aceeași
-- poziție în ordinea de promovare. Nu o reinserare.
--
-- `not_found` e explicit, nu o întoarcere tăcută: rândul poate să fi fost
-- promovat între timp (promovarea îl șterge FIZIC — vezi punctul 4), iar
-- „nu s-a întâmplat nimic, dar îți spun că a mers" e exact răspunsul greșit
-- pentru cineva care tocmai a apăsat „Undo".
create or replace function runlift.admin_undelete_waitlist(p_token uuid, p_id uuid, p_force boolean default false)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_ed smallint; v_nume text; v_email text; v_count int;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select editie, nume, email into v_ed, v_nume, v_email
    from event_waitlist where id = p_id and deleted_at is not null;
  if v_ed is null then raise exception 'not_found'; end if;
  if v_ed <> current_event_edition() then raise exception 'edition_archived'; end if;

  -- Locul pe listă poate fi ocupat între timp: plafonul e de 10, iar înscrierile
  -- publice au continuat cât timp rândul era retras.
  if not p_force then
    select count(*) into v_count
      from event_waitlist where editie = v_ed and deleted_at is null;
    if v_count >= waitlist_cap() then raise exception 'waitlist_full'; end if;
  end if;

  -- Adresa poate fi fost re-adăugată pe listă între timp: indexul parțial ar
  -- respinge oricum, dar cu un mesaj care nu spune de ce.
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
$function$;

-- ---------------------------------------------------------------------------
-- 4. Cititorii. Enumerarea e completă: opt locuri din `runlift` ating
--    `event_waitlist`. Cele care NU se schimbă sunt notate explicit:
--      • admin_create_edition — `max(editie)` trebuie să vadă și rândurile
--        șterse, altfel o ediție în care toți au fost retrași s-ar putea
--        redeschide peste ea însăși;
--      • promovarea (manuală și automată) ȘTERGE FIZIC rândul promovat —
--        deliberat. Persoana nu mai e pe listă, e participant. Un soft-delete
--        acolo ar face `admin_undelete_waitlist` să readucă pe listă pe cineva
--        care e deja înscris.
-- ---------------------------------------------------------------------------

-- Lista din backoffice: rândurile retrase nu se mai arată.
create or replace function runlift.admin_list_waitlist(p_token uuid, p_editie int default null)
returns table(id uuid, created_at timestamptz, nume text, telefon text, email text, editie smallint)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_ed smallint := coalesce(p_editie::smallint, current_event_edition());
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select w.id, w.created_at, w.nume, w.telefon, w.email, w.editie
    from event_waitlist w
    where w.editie = v_ed and w.deleted_at is null
    order by w.created_at asc;
end;
$function$;

-- Promovarea manuală: un rând retras nu se promovează. Fără garda asta, undo-ul
-- și promovarea ar putea readuce aceeași persoană pe două căi diferite.
create or replace function runlift.admin_promote_waitlist(p_token uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
$function$;

-- Auto-promovarea: la fel. Fără `deleted_at is null` aici, un rând șters din
-- backoffice ar fi tras înapoi în `registrations` la prima eliberare de loc —
-- ștergerea s-ar fi anulat singură, fără ca cineva să apese ceva.
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
      exit;
    end if;
  end loop;

  return new;
end;
$function$;

-- Numărul public de pe listă. Un rând retras nu mai e „încă X pe lista de
-- așteptare" pentru vizitator.
create or replace function runlift.public_stats()
returns json
language sql
stable security definer
set search_path to ''
as $function$
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
$function$;

-- Numărătoarea per ediție din tabul „Ediții".
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
      (select count(*)::int from event_waitlist w       where w.editie = t.editie and w.deleted_at is null),
      (select count(*)::int from launch_notifications l where l.editie = t.editie),
      (select min(r.created_at) from registrations r    where r.editie = t.editie and r.deleted_at is null),
      (select max(r.created_at) from registrations r    where r.editie = t.editie and r.deleted_at is null),
      t.editie = v_ed
    from toate t
    where t.editie is not null
    order by t.editie asc;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Grants — aceleași ca pentru restul RPC-urilor de admin (cheia publicabilă
--    rulează ca `anon`; autoritatea vine din token, verificat în funcție).
-- ---------------------------------------------------------------------------
grant execute on function runlift.admin_undelete_waitlist(uuid, uuid, boolean) to anon, authenticated, service_role;

commit;

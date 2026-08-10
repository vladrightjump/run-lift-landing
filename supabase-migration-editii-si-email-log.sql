-- Backoffice: ediții separate + jurnal de livrare a emailurilor.
--
-- Context: /admin arăta DOAR ediția curentă (RPC-urile filtrau hardcodat pe
-- `current_event_edition()`), iar despre emailuri nu rămânea nicio urmă — dacă
-- Resend refuza o adresă, adminul vedea doar un toast „eșuate: 3", fără să afle
-- CINE n-a primit și DE CE.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
--
-- Ce face:
--  1. `admin_list_editions`     — inventarul edițiilor + contoare (pentru taburi).
--  2. `admin_list_registrations`/`admin_list_waitlist` primesc `p_editie`
--     (null = ediția curentă) → adminul poate deschide arhiva oricărei ediții.
--  3. `admin_create_edition`    — deschide ediția următoare (tab nou, gol).
--  4. `email_log` + `log_emails` (scris de funcția Edge) + `admin_list_email_log`.
--  5. Guard de ediție pe RPC-urile de scriere: arhiva devine read-only în DB, nu
--     doar în interfață.

-- ---------------------------------------------------------------------------
-- 1. Inventarul edițiilor — orice ediție care are date undeva, plus cea curentă.
-- ---------------------------------------------------------------------------
create or replace function runlift.admin_list_editions(p_token uuid)
returns table(
  editie       smallint,
  participanti int,
  asteptare    int,
  lansare      int,
  prima        timestamptz,
  ultima       timestamptz,
  este_curenta boolean
)
language plpgsql
security definer
set search_path to 'runlift'
as $$
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
      (select count(*)::int from registrations r        where r.editie = t.editie),
      (select count(*)::int from event_waitlist w       where w.editie = t.editie),
      (select count(*)::int from launch_notifications l where l.editie = t.editie),
      (select min(r.created_at) from registrations r    where r.editie = t.editie),
      (select max(r.created_at) from registrations r    where r.editie = t.editie),
      t.editie = v_ed
    from toate t
    where t.editie is not null
    order by t.editie asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Listările de admin devin per-ediție. `p_editie` null => ediția curentă,
--    ca apelurile existente (doar cu `p_token`) să meargă neschimbate.
-- ---------------------------------------------------------------------------
drop function if exists runlift.admin_list_registrations(uuid);
create or replace function runlift.admin_list_registrations(p_token uuid, p_editie int default null)
returns table(
  id uuid, created_at timestamptz, nume text, telefon text, email text,
  echipa text, editie smallint, dezabonat_la timestamptz
)
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare v_ed smallint := coalesce(p_editie::smallint, current_event_edition());
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select r.id, r.created_at, r.nume, r.telefon, r.email, r.echipa, r.editie, r.dezabonat_la
    from registrations r where r.editie = v_ed order by r.created_at asc;
end;
$$;

drop function if exists runlift.admin_list_waitlist(uuid);
create or replace function runlift.admin_list_waitlist(p_token uuid, p_editie int default null)
returns table(id uuid, created_at timestamptz, nume text, telefon text, email text, editie smallint)
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare v_ed smallint := coalesce(p_editie::smallint, current_event_edition());
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select w.id, w.created_at, w.nume, w.telefon, w.email, w.editie
    from event_waitlist w where w.editie = v_ed order by w.created_at asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Ediție nouă = tab gol. Mută `current_event_edition`/`current_launch_edition`
--    pe max+1 și ȘTERGE reperele de timp ale ediției încheiate:
--      • `registration_deadline` — altfel guard-ul ar respinge orice înscriere
--        nouă cu `registration_closed` (deadline-ul vechi e în trecut);
--      • `event_start`           — altfel reminderul programat s-ar raporta la
--        data ediției vechi.
--    Le pune la loc `npm run sync-edition`, după ce editezi `content/edition.ts`.
-- ---------------------------------------------------------------------------
create or replace function runlift.admin_create_edition(p_token uuid)
returns smallint
language plpgsql
security definer
set search_path to 'runlift'
as $$
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

  -- Upsert, nu update: dacă rândul lipsește, un `update` ar fi un no-op tăcut și
  -- funcția ar raporta succes fără să schimbe ediția (backoffice-ul ar arăta
  -- ediția nouă ca arhivă, fără cale de întoarcere din UI).
  insert into app_config (key, value) values ('current_event_edition', v_next::text)
    on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value) values ('current_launch_edition', v_next::text)
    on conflict (key) do update set value = excluded.value;
  delete from app_config where key in ('registration_deadline', 'event_start');

  insert into admin_events (tip, detaliu)
  values ('editie_noua', jsonb_build_object('editie', v_next, 'anterioara', v_max));

  return v_next;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Jurnalul de livrare. Un rând per email încercat, indiferent de mod.
--    RLS pornit fără politici: se ajunge la el DOAR prin RPC-urile de mai jos.
-- ---------------------------------------------------------------------------
create table if not exists runlift.email_log (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  email           text        not null,
  nume            text        not null default '',
  subiect         text        not null default '',
  text_email      text        not null default '',
  -- admin | confirm | promoted | info | broadcast
  mod             text        not null,
  -- participanti | asteptare | '' (necunoscut)
  audienta        text        not null default '',
  -- trimis | esuat
  status          text        not null,
  provider_status int,
  eroare          text,
  editie          smallint    not null default runlift.current_event_edition()
);
alter table runlift.email_log enable row level security;

create index if not exists email_log_editie_idx  on runlift.email_log (editie, created_at desc);
create index if not exists email_log_email_idx   on runlift.email_log (lower(email));
create index if not exists email_log_status_idx  on runlift.email_log (status);

comment on table runlift.email_log is
  'Jurnal de livrare a emailurilor (Resend). Scris de funcția Edge send-email, citit din /admin → Livrare.';

-- Scriere în lot, apelată de funcția Edge cu service_role. Un singur round-trip
-- pentru toată trimiterea în masă. Rândurile care nu au `email` sunt ignorate.
create or replace function runlift.log_emails(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path to 'runlift'
as $$
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
      case when (x->>'ok')::boolean then 'trimis' else 'esuat' end as status,
      (x->>'provider_status')::int                     as provider_status,
      left(nullif(x->>'eroare', ''), 500)              as eroare,
      coalesce((x->>'editie')::smallint, current_event_edition()) as editie
    from jsonb_array_elements(p_rows) as x
  )
  insert into email_log (email, nume, subiect, text_email, mod, audienta, status, provider_status, eroare, editie)
  select lower(email), nume, subiect, text_email, mod, audienta, status, provider_status, eroare, editie
  from intrari where email is not null;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Citire din backoffice: ediția cerută (null = curentă), cele mai noi primele.
--
-- `p_cu_text`: corpul emailului e cel mai greu câmp din rând și e nevoie de el
-- DOAR în tab-ul „Livrare" (previzualizare + retrimitere). Dashboard-ul face poll
-- la 15s doar pentru badge + statusul per participant, deci cere false și evită
-- să care sute de KB de text la fiecare refresh.
drop function if exists runlift.admin_list_email_log(uuid, int, int);
create or replace function runlift.admin_list_email_log(
  p_token uuid, p_editie int default null, p_limit int default 500,
  p_cu_text boolean default true
)
returns table(
  id uuid, created_at timestamptz, email text, nume text, subiect text,
  text_email text, mod text, audienta text, status text,
  provider_status int, eroare text, editie smallint
)
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare
  v_ed    smallint := coalesce(p_editie::smallint, current_event_edition());
  v_limit int      := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select e.id, e.created_at, e.email, e.nume, e.subiect,
           case when coalesce(p_cu_text, true) then e.text_email else '' end,
           e.mod, e.audienta, e.status, e.provider_status, e.eroare, e.editie
    from email_log e where e.editie = v_ed
    order by e.created_at desc
    limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Arhiva chiar read-only. Până acum RPC-urile de scriere nu se uitau la ediție:
--    verificau doar token-ul, deci o ediție încheiată putea fi modificată (UI-ul o
--    ascundea, dar asta nu e o garanție). `registrations_guard` nu acoperă cazul —
--    rulează doar pe INSERT și iese devreme exact pentru edițiile ne-curente.
-- ---------------------------------------------------------------------------
create or replace function runlift.admin_update_registration(
  p_token uuid, p_id uuid, p_nume text, p_telefon text, p_email text
)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare v_ed smallint;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select editie into v_ed from registrations where id = p_id;
  if v_ed is null then raise exception 'not_found'; end if;
  if v_ed <> current_event_edition() then raise exception 'edition_archived'; end if;
  update registrations
    set nume = trim(p_nume), telefon = trim(p_telefon), email = lower(trim(p_email))
    where id = p_id;
end;
$$;

create or replace function runlift.admin_delete_registration(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare v_ed smallint;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select editie into v_ed from registrations where id = p_id;
  if v_ed is null then return; end if;  -- deja șters: ștergerea e idempotentă
  if v_ed <> current_event_edition() then raise exception 'edition_archived'; end if;
  delete from registrations where id = p_id;
end;
$$;

create or replace function runlift.admin_delete_waitlist(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare v_ed smallint;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select editie into v_ed from event_waitlist where id = p_id;
  if v_ed is null then return; end if;
  if v_ed <> current_event_edition() then raise exception 'edition_archived'; end if;
  delete from event_waitlist where id = p_id;
end;
$$;

create or replace function runlift.admin_promote_waitlist(p_token uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare v_w runlift.event_waitlist; v_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select * into v_w from event_waitlist where id = p_id;
  if v_w.id is null then raise exception 'not_found'; end if;
  if v_w.editie <> current_event_edition() then raise exception 'edition_archived'; end if;
  perform set_config('runlift.guard_bypass', '1', true);
  insert into registrations (nume, telefon, email, data_nasterii, acord, editie)
  values (trim(v_w.nume), trim(v_w.telefon), lower(trim(v_w.email)), v_w.data_nasterii, true, v_w.editie)
  on conflict (lower(email), editie) do nothing
  returning id into v_id;
  delete from event_waitlist where id = p_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. `dezabonat_la` iese și în lista de lansare. Fără el, backoffice-ul nu poate
--    ști pe cine să NU mai bifeze la trimiterea manuală: modul `admin` al funcției
--    Edge nu aplică filtrul pe care-l aplică broadcast-ul (`waitlist_recipients`).
-- ---------------------------------------------------------------------------
drop function if exists runlift.admin_list_launch_notifications(uuid);
create or replace function runlift.admin_list_launch_notifications(p_token uuid)
returns table(
  id uuid, created_at timestamptz, nume text, prenume text, email text, telefon text,
  editie smallint, sursa text, confirmat_la timestamptz, dezabonat_la timestamptz
)
language plpgsql
security definer
set search_path to 'runlift'
as $$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select l.id, l.created_at, l.nume, l.prenume, l.email, l.telefon, l.editie,
           l.sursa, l.confirmat_la, l.dezabonat_la
    from launch_notifications l order by l.created_at asc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Cele de admin sunt token-checked (același model ca restul);
-- `log_emails` NU se expune publicului — o apelează doar funcția Edge.
-- ---------------------------------------------------------------------------
grant execute on function runlift.admin_list_editions(uuid)                  to anon, authenticated;
grant execute on function runlift.admin_list_registrations(uuid, int)        to anon, authenticated;
grant execute on function runlift.admin_list_waitlist(uuid, int)             to anon, authenticated;
grant execute on function runlift.admin_create_edition(uuid)                 to anon, authenticated;
grant execute on function runlift.admin_list_launch_notifications(uuid)      to anon, authenticated;
grant execute on function runlift.admin_list_email_log(uuid, int, int, boolean) to anon, authenticated;
revoke execute on function runlift.log_emails(jsonb) from anon, authenticated, public;
grant  execute on function runlift.log_emails(jsonb) to service_role;

notify pgrst, 'reload schema';

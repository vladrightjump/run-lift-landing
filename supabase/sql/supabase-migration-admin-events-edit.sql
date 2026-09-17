-- Faza B — Vizibilitate auto-promote + editare participant.
--
-- Context: triggerul `auto_promote_from_waitlist` promovează automat + trimite email
-- best-effort FĂRĂ să lase vreo urmă. Adminul nu vede că s-a produs (afla doar din
-- diferența de liste, la refresh la 15s) și nu putea corecta un participant decât prin
-- delete + re-add (pierde `created_at`, re-declanșează backup/logică).
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
--
-- Ce face:
--  1. `admin_events` — feed simplu de audit (promovări automate etc.), citit din backoffice.
--  2. `auto_promote_from_waitlist` scrie un rând la fiecare promovare (nume, email, id, req email).
--  3. `admin_list_events` — ultimele 50 evenimente (token-checked).
--  4. `admin_update_registration` — editare in-place (păstrează `created_at`; unic pe email/ediție).

-- 1. Tabelul de audit. RLS pornit fără politici — accesibil DOAR prin RPC SECURITY DEFINER
--    (același model ca admin_users/admin_sessions).
create table if not exists runlift.admin_events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tip        text not null,
  detaliu    jsonb not null default '{}'::jsonb
);
alter table runlift.admin_events enable row level security;

-- 2. Auto-promovare: identică cu Faza A (guard_bypass), plus logare în admin_events.
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
  v_req bigint;
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
      v_req := null;
      begin
        select net.http_post(
          url := 'https://whyndrjcezmtajbykeil.supabase.co/functions/v1/send-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh'
          ),
          body := jsonb_build_object('mode', 'promoted', 'id', v_id::text)
        ) into v_req;
      exception when others then
        v_req := null;  -- emailul e opțional; nu blocăm ștergerea
      end;

      -- Urmă pentru admin: cine a fost promovat + dacă emailul a plecat în coadă.
      insert into admin_events (tip, detaliu)
      values ('auto_promote', jsonb_build_object(
        'nume', trim(v_w.nume),
        'email', lower(trim(v_w.email)),
        'registration_id', v_id,
        'editie', v_w.editie,
        'email_queued', v_req is not null
      ));

      exit;  -- un loc eliberat → o promovare reușită. Gata.
    end if;
  end loop;

  return old;
end;
$$;

-- 3. Feed de audit pentru backoffice (ultimele 50).
create or replace function runlift.admin_list_events(p_token uuid)
returns table(id uuid, created_at timestamptz, tip text, detaliu jsonb)
language plpgsql
security definer
set search_path to 'runlift'
as $$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select e.id, e.created_at, e.tip, e.detaliu
    from admin_events e
    order by e.created_at desc
    limit 50;
end;
$$;

-- 4. Editare in-place a unui participant (păstrează created_at + id).
--    Unicitatea (lower(email), editie) e enforce-uită de constraint → 409 la duplicat.
create or replace function runlift.admin_update_registration(
  p_token uuid, p_id uuid, p_nume text, p_telefon text, p_email text
)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  update registrations
    set nume = trim(p_nume), telefon = trim(p_telefon), email = lower(trim(p_email))
    where id = p_id;
  if not found then raise exception 'not_found'; end if;
end;
$$;

-- Grants pentru PostgREST (același model ca restul RPC-urilor de admin: token-checked).
grant execute on function runlift.admin_list_events(uuid) to anon, authenticated;
grant execute on function runlift.admin_update_registration(uuid, uuid, text, text, text) to anon, authenticated;

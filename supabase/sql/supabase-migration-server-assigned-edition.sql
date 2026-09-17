-- Ediția inserărilor publice o decide SERVERUL, nu bundle-ul clientului.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Context: `submitRegistration` / `submitWaitlist` trimiteau `editie` din
-- constanta compilată în bundle. Cât timp ediția se schimba doar la deploy, cele
-- două coincideau. De când configul se publică din admin FĂRĂ deploy, un tab
-- deschis înainte de publicare trimite numărul vechi.
--
-- Migrarea are DOUĂ straturi, aplicate în ordinea asta:
--
--  1. politica RLS cere `editie = current_event_edition()` — respinge o valoare
--     străină venită din client;
--  2. un trigger BEFORE INSERT SUPRASCRIE valoarea cu ediția curentă.
--
-- Al doilea strat există pentru că primul singur era prea aspru: un tab vechi ar
-- fi primit înscrierea REFUZATĂ exact în fereastra pe care planul voia s-o
-- repare. Cu trigger-ul, tabul vechi aterizează în ediția corectă. În Postgres
-- `WITH CHECK` se evaluează DUPĂ trigger-ele BEFORE, deci politica rămâne
-- valabilă ca plasă de siguranță, dar nu mai are cum să pice.
--
-- Migrarea e re-rulabilă (idempotentă): proiectul nu are branch de staging.

begin;

-- ---------------------------------------------------------------------------
-- 1. RLS: valoarea venită din client trebuie să fie ediția curentă.
--    Același tipar folosit deja pe `launch_notifications`.
-- ---------------------------------------------------------------------------
alter policy "anon can register" on runlift.registrations
  with check (acord and editie = runlift.current_event_edition());

alter policy "anon insert waitlist" on runlift.event_waitlist
  with check (acord = true and editie = runlift.current_event_edition());

-- ---------------------------------------------------------------------------
-- 2. Trigger-ul care impune ediția pe inserările PUBLICE.
--
--    Respectă `runlift.guard_bypass` — mecanismul pe care funcțiile de admin îl
--    setează deja înainte de scriere (vezi `registrations_guard`). Fără asta,
--    `admin_promote_waitlist`, care inserează cu `editie = v_w.editie` (posibil o
--    ediție ARHIVATĂ), ar fi mutat tăcut acei oameni în ediția curentă.
-- ---------------------------------------------------------------------------
create or replace function runlift.forteaza_editia_curenta()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  -- Scriere din admin: ediția e aleasă deliberat, deci nu o atingem.
  if coalesce(current_setting('runlift.guard_bypass', true), '') = '1' then
    return new;
  end if;
  new.editie := current_event_edition();
  return new;
end;
$function$;

drop trigger if exists registrations_forteaza_editia on runlift.registrations;
create trigger registrations_forteaza_editia
  before insert on runlift.registrations
  for each row execute function runlift.forteaza_editia_curenta();

drop trigger if exists waitlist_forteaza_editia on runlift.event_waitlist;
create trigger waitlist_forteaza_editia
  before insert on runlift.event_waitlist
  for each row execute function runlift.forteaza_editia_curenta();

-- Trigger-ul nu trebuie apelabil din client (vezi nota din
-- supabase-migration-event-config.sql despre grantul implicit către PUBLIC).
revoke all on function runlift.forteaza_editia_curenta() from public, anon, authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Cum se revine (dacă e nevoie)
--
--   drop trigger if exists registrations_forteaza_editia on runlift.registrations;
--   drop trigger if exists waitlist_forteaza_editia on runlift.event_waitlist;
--   alter policy "anon can register" on runlift.registrations with check (acord);
--   alter policy "anon insert waitlist" on runlift.event_waitlist with check (acord = true);
--
-- Atenție: după revenire, clientul TREBUIE să trimită iar `editie` explicit,
-- altfel coloana cade pe DEFAULT (`current_event_edition()`) — ceea ce e corect,
-- dar nu mai e impus.
-- ---------------------------------------------------------------------------

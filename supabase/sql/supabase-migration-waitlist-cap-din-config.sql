-- Plafonul listei de așteptare vine din configul ediției, nu din cod.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Bug-ul: `waitlist_cap()` întorcea `10`, scris în cod, iar
-- `scrie_scalarele_editiei()` nu ducea niciodată `slots.waitlist` din documentul
-- publicat în `app_config`. Câmpul „listă de așteptare" din /admin → „Eveniment"
-- era deci decorativ pentru baza de date: pus pe 20, site-ul arăta 20 de locuri
-- de așteptare, dar al unsprezecelea om primea `waitlist_full`. Pus pe 5, se
-- înscriau zece.
--
-- După migrare: `waitlist_cap()` citește `app_config.waitlist_capacity`, cu
-- aceeași valoare 10 ca plasă dacă lipsește cheia — deci comportamentul de azi
-- nu se schimbă. Cheia o scrie publicarea, ca pe celelalte scalare derivate.
--
-- Volatilitatea trece din `immutable` în `stable`: funcția citește acum un
-- tabel. `immutable` ar fi lăsat planificatorul s-o evalueze o singură dată.

begin;

create or replace function runlift.waitlist_cap()
returns integer
language sql
stable
set search_path to ''
as $function$
  select coalesce(
    (select value::int from runlift.app_config where key = 'waitlist_capacity'),
    10
  );
$function$;

-- Publicarea duce mai departe și plafonul listei, lângă capacitatea cursei.
create or replace function runlift.scrie_scalarele_editiei(p_config jsonb)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
$function$;

-- Aduce cheia la zi acum, din documentul deja publicat, fără să aștepte
-- următoarea publicare.
insert into runlift.app_config (key, value)
select 'waitlist_capacity', c.config -> 'slots' ->> 'waitlist'
  from runlift.event_config c
 where c.status = 'published' and c.config -> 'slots' ? 'waitlist'
on conflict (key) do update set value = excluded.value;

commit;

-- --- VERIFICARE ---
--   select runlift.waitlist_cap();  -- egal cu `slots.waitlist` din configul publicat
--   select value from runlift.app_config where key = 'waitlist_capacity';

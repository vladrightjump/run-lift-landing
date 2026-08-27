-- Configurarea ediției trece în DB: `event_config` devine sursa de adevăr.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Context: până acum ediția trăia în DOUĂ locuri — `src/content/edition.ts`
-- (compilat în bundle) și `app_config` (citit de guard-uri). Nimic nu le ținea
-- în acord în afară de un om care rula `npm run sync-edition` și copia SQL-ul
-- în Supabase. Între cele două acte, backendul era pe ediția nouă și site-ul
-- servea încă ediția veche.
--
-- Soluția nu e un interlock peste desincronizare, ci eliminarea celei de-a doua
-- copii: un rând `published` din `event_config` e adevărul, iar publicarea îi
-- scrie ea însăși, în ACEEAȘI tranzacție, cele cinci scalare din `app_config` pe
-- care le citesc guard-urile. Cheile rămân exact cele de dinainte, deci
-- `registrations_guard`, auto-promovarea din waitlist și reminderul programat nu
-- se ating (vezi migrările lor).
--
-- `src/content/edition.ts` rămâne în repo ca INSTANTANEU de build: randează primul
-- cadru și acoperă cazul „backendul nu răspunde". Nu mai e canonic.
--
-- Migrarea e re-rulabilă (idempotentă): proiectul nu are branch de staging.

begin;

-- ---------------------------------------------------------------------------
-- 1. Tabelul. Un document jsonb per rând, cu stare.
--
--    De ce document și nu chei libere în `app_config`: `app_config` nu are
--    atomicitate între chei — douăzeci de câmpuri ar fi douăzeci de instrucțiuni
--    și niciun mod de a spune „setul ăsta, împreună". Documentul dă și ciornă,
--    și versiuni păstrate pentru revenire, și un loc firesc pentru aranjarea
--    secțiunilor.
-- ---------------------------------------------------------------------------
create table if not exists runlift.event_config (
  id uuid primary key default gen_random_uuid(),
  editie smallint not null,
  config jsonb not null,
  status text not null check (status in ('draft', 'published', 'superseded')),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

alter table runlift.event_config enable row level security;
-- Fără politici: tot accesul trece prin RPC-uri SECURITY DEFINER. Cheia publică
-- singură nu poate citi nici scrie nimic aici.

-- O singură ciornă per ediție.
create unique index if not exists event_config_o_ciorna
  on runlift.event_config (editie)
  where status = 'draft';

-- Un singur rând publicat în tot tabelul. `public_config()` se bazează pe asta
-- ca să citească direct după stare, fără să treacă prin `current_event_edition`
-- — altfel scalarele ar fi și intrare a citirii, nu doar ieșire a publicării.
create unique index if not exists event_config_un_singur_publicat
  on runlift.event_config (status)
  where status = 'published';

create index if not exists event_config_editie_istoric
  on runlift.event_config (editie, published_at desc);

-- ---------------------------------------------------------------------------
-- 2. Validarea. Aceleași reguli pe care le aplică și formularul din admin —
--    dar aici sunt cele care contează, pentru că aici nu se poate ocoli.
-- ---------------------------------------------------------------------------
create or replace function runlift.event_config_validate(p_config jsonb)
returns void
language plpgsql
immutable
-- Pin ca la restul funcțiilor. E pură (nu atinge tabele), dar fără pin
-- operatorii se pot umbri — de aceea și apelurile jsonb sunt calificate.
set search_path to ''
as $function$
declare
  v_cheie text;
  v_start timestamptz;
  v_deadline timestamptz;
  v_next timestamptz;
  v_tz text;
  v_sectiune jsonb;
  v_chei text[] := array[]::text[];
  v_chei_permise text[] := array['format', 'venue', 'registration', 'participants'];
begin
  -- Câmpuri obligatorii.
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

  -- Deadline după start ar însemna înscrieri acceptate după ce cursa a pornit.
  if v_deadline > v_start then
    raise exception 'config_invalid: deadline-ul de înscriere e după startul cursei';
  end if;

  -- Ținta countdown-ului de după cursă trebuie să fie după finalul cursei,
  -- altfel faza `next` pornește pe un moment deja trecut.
  if v_next <= v_start + ((p_config ->> 'durationHours')::numeric * interval '1 hour') then
    raise exception 'config_invalid: următorul antrenament e înainte de finalul cursei';
  end if;

  if (p_config -> 'slots' ->> 'total')::int <= 0 then
    raise exception 'config_invalid: capacitatea trebuie să fie pozitivă';
  end if;

  -- Punct exact, nu căutare text: căutarea cade oriunde în zonă.
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
    -- Duplicatul ar randa aceeași secțiune de două ori, cu numere diferite.
    if (v_sectiune ->> 'key') = any (v_chei) then
      raise exception 'config_invalid: secțiunea „%" apare de două ori', v_sectiune ->> 'key';
    end if;
    v_chei := v_chei || (v_sectiune ->> 'key');
  end loop;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Citirea publică. Aceeași formă ca `public_stats`: SECURITY DEFINER peste un
--    tabel închis de RLS, apelat cu cheia publicabilă.
-- ---------------------------------------------------------------------------
create or replace function runlift.public_config()
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  select c.config
  from runlift.event_config c
  where c.status = 'published'
  limit 1;
$function$;

-- Cele cinci scalare derivate, toate prin UPSERT.
--
-- De ce nu `update`: dacă rândul lipsește, un UPDATE nu afectează nimic și NU dă
-- eroare — publicarea ar raporta succes, iar guard-urile ar citi în continuare
-- valoarea veche. Exact clasa de drift tăcut pe care migrarea asta o elimină,
-- reintrodusă pe o cale laterală.
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
  insert into app_config (key, value)
    values ('registration_deadline', (p_config ->> 'registrationDeadline') || v_tz)
    on conflict (key) do update set value = excluded.value;
  insert into app_config (key, value) values ('event_start', (p_config ->> 'start') || v_tz)
    on conflict (key) do update set value = excluded.value;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. RPC-urile de backoffice. Toate validează token-ul, ca restul admin-ului.
-- ---------------------------------------------------------------------------

-- Tot ce-i trebuie backoffice-ului: ciorna, publicatul, istoricul.
--
-- ATENȚIE la ce NU face: nu filtrează pe ediție. Prima variantă filtra pe
-- `editie = current_event_edition()` și astfel nu vedea ciorna ediției URMĂTOARE
-- — care are, prin construcție, alt număr. Ciorna salvată dispărea din UI la
-- reîncărcare, iar `?config=draft` cădea înapoi pe publicat, deci butonul
-- „Previzualizează" nu arăta niciodată ciorna pentru care exista.
--
-- Tabelul crește cu un rând per publicare, deci nu e nimic de filtrat.
-- `p_editie` rămâne în semnătură pentru compatibilitate, dar e ignorat.
create or replace function runlift.admin_get_event_config(p_token uuid, p_editie integer default null)
returns table(id uuid, editie smallint, config jsonb, status text, created_at timestamptz, published_at timestamptz)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
$function$;

-- Salvarea ciornei. Nu atinge nimic din ce vede vizitatorul.
create or replace function runlift.admin_save_event_config_draft(
  p_token uuid, p_editie integer, p_config jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
$function$;

-- Publicarea. ASTA e tot fixul de desincronizare: aceeași tranzacție schimbă
-- rândul publicat ȘI scrie cele cinci scalare pe care le citesc guard-urile.
-- Este exact ce emitea `scripts/sync-edition.ts` pentru un om, rulat atomic.
create or replace function runlift.admin_publish_event_config(p_token uuid, p_editie integer)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_id uuid;
  v_config jsonb;
  v_tz text;
  v_deadline timestamptz;
  v_ascunde_inscrierea boolean;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select c.id, c.config into v_id, v_config
  from event_config c
  where c.editie = p_editie::smallint and c.status = 'draft';

  if v_id is null then raise exception 'no_draft'; end if;

  perform event_config_validate(v_config);

  -- Nu poți ascunde înscrierea cât timp înscrierile sunt deschise. Refuzul e
  -- aici, nu la randare: o suprimare la randare ar lăsa admin-ul să arate un
  -- comutator care tace.
  v_tz := v_config ->> 'tz';
  v_deadline := ((v_config ->> 'registrationDeadline') || v_tz)::timestamptz;
  select coalesce(bool_or(not (s ->> 'visible')::boolean), false)
    into v_ascunde_inscrierea
  from jsonb_array_elements(v_config -> 'layout') s
  where s ->> 'key' = 'registration';

  if v_ascunde_inscrierea and v_deadline > now() then
    raise exception 'registration_hidden_while_open: înscrierile sunt deschise până la %', v_deadline;
  end if;

  -- Ordinea contează: indexul „un singur publicat" e verificat imediat, deci
  -- vechiul rând iese din starea `published` înainte ca noul să intre.
  update event_config set status = 'superseded'
    where status = 'published' and id <> v_id;

  update event_config set status = 'published', published_at = now()
    where id = v_id;

  -- Scalarele derivate. Cheile rămân exact cele citite de guard-uri.
  perform scrie_scalarele_editiei(v_config);

  insert into admin_events (tip, detaliu)
  values ('config_publish', jsonb_build_object(
    'id', v_id, 'editie', p_editie, 'config', v_config));

  return v_id;
end;
$function$;

-- Revenirea la o versiune păstrată: aceeași tranzacție ca publicarea, deci
-- scalarele se rescriu odată cu ea. Nu e o cale separată de rollback.
create or replace function runlift.admin_restore_event_config(p_token uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
$function$;

-- ---------------------------------------------------------------------------
-- 5. Grants — aceleași roluri ca restul RPC-urilor. Protecția vine din
--    `admin_check_token`, nu din grant.
-- ---------------------------------------------------------------------------
grant execute on function runlift.public_config() to anon, authenticated, service_role;
grant execute on function runlift.admin_get_event_config(uuid, integer) to anon, authenticated, service_role;
grant execute on function runlift.admin_save_event_config_draft(uuid, integer, jsonb) to anon, authenticated, service_role;
grant execute on function runlift.admin_publish_event_config(uuid, integer) to anon, authenticated, service_role;
grant execute on function runlift.admin_restore_event_config(uuid, uuid) to anon, authenticated, service_role;

commit;

-- ===========================================================================
-- Seed-ul, ca TRANZACȚIE SEPARATĂ.
--
-- Deliberat în afara celei de mai sus, și așa a fost aplicat și în producție
-- (migrare proprie: `runlift_event_config_seed_editia5`). Dacă garda anti-drift
-- de mai jos crapă, vrem să pice DOAR seed-ul — schema și funcțiile rămân
-- aplicate, iar drift-ul se rezolvă separat. Într-o singură tranzacție, un
-- `seed_drift` ar fi șters și tabelul, ceea ce face migrarea greu de reluat.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 6. Seed-ul ediției 5, transcris din `src/content/edition.ts`.
--
--    Seed-ul NU trece prin `admin_publish_event_config`: ediția 5 e live, iar
--    cele cinci scalare ale ei sunt deja corecte. În loc să le rescrie, seed-ul
--    VERIFICĂ dacă documentul transcris e de acord cu ele și crapă dacă nu — o
--    nepotrivire ar însemna că baza și codul deployat sunt deja în dezacord,
--    ceea ce trebuie rezolvat ÎNAINTE de inversare, nu în timpul ei.
-- ---------------------------------------------------------------------------
do $$
declare
  v_config jsonb := jsonb_build_object(
    'number', 5,
    'launchNumber', 5,
    'eventName', 'Hyrox Trial',
    'concept', 'Outdoor Adaptive',
    'ordinalOverride', null,
    'tz', '+03:00',
    'start', '2026-08-22T07:00:00',
    'durationHours', 2,
    'checkinFrom', '06:30',
    'registrationDeadline', '2026-08-22T07:00:00',
    'launchAt', '2026-08-19T12:00:00',
    'showComingSoon', false,
    'leaderboardLeadHours', 1,
    'nextEditionAt', '2026-08-29T07:00:00',
    'venue', jsonb_build_object(
      'name', 'Scările de Granit',
      'city', 'Valea Morilor',
      'mapQuery', '47.0182357,28.8213041',
      'zoom', 16),
    'slots', jsonb_build_object('total', 40, 'waitlist', 10, 'occupiedFallback', 0),
    'layout', jsonb_build_array(
      jsonb_build_object('key', 'format', 'visible', true),
      jsonb_build_object('key', 'venue', 'visible', true),
      jsonb_build_object('key', 'registration', 'visible', true),
      jsonb_build_object('key', 'participants', 'visible', true))
  );
  v_scalar text;
begin
  perform runlift.event_config_validate(v_config);

  -- Garda anti-inversare-pe-drift.
  select value into v_scalar from runlift.app_config where key = 'current_event_edition';
  if v_scalar is distinct from (v_config ->> 'number') then
    raise exception 'seed_drift: current_event_edition = %, documentul are %', v_scalar, v_config ->> 'number';
  end if;
  select value into v_scalar from runlift.app_config where key = 'current_launch_edition';
  if v_scalar is distinct from (v_config ->> 'launchNumber') then
    raise exception 'seed_drift: current_launch_edition = %, documentul are %', v_scalar, v_config ->> 'launchNumber';
  end if;
  select value into v_scalar from runlift.app_config where key = 'event_capacity';
  if v_scalar is distinct from (v_config -> 'slots' ->> 'total') then
    raise exception 'seed_drift: event_capacity = %, documentul are %', v_scalar, v_config -> 'slots' ->> 'total';
  end if;
  select value into v_scalar from runlift.app_config where key = 'registration_deadline';
  if v_scalar is distinct from ((v_config ->> 'registrationDeadline') || (v_config ->> 'tz')) then
    raise exception 'seed_drift: registration_deadline = %', v_scalar;
  end if;
  select value into v_scalar from runlift.app_config where key = 'event_start';
  if v_scalar is distinct from ((v_config ->> 'start') || (v_config ->> 'tz')) then
    raise exception 'seed_drift: event_start = %', v_scalar;
  end if;

  -- Idempotent: dacă există deja un rând publicat, seed-ul nu face nimic.
  if not exists (select 1 from runlift.event_config where status = 'published') then
    insert into runlift.event_config (editie, config, status, published_at)
    values (5, v_config, 'published', now());
  end if;
end;
$$;

commit;

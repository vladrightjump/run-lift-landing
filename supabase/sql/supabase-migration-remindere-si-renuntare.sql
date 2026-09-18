-- Remindere programate din admin + renunțarea la loc printr-un click din email.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Migrarea e re-rulabilă (idempotentă): proiectul nu are branch de staging.
--
-- ---------------------------------------------------------------------------
-- CONTEXT — două probleme, una lângă alta, pentru că se rezolvă în același email.
-- ---------------------------------------------------------------------------
--
-- 1. REMINDERUL era un singur email pe ediție, cu avansul (`reminder_offset_hours`)
--    scris direct în `app_config` — invizibil și needitabil din backoffice — iar
--    cron-ul se arma de mână, dintr-un fișier separat. Mai rău, fereastra de
--    declanșare era [start − offset, start] ÎNTREAGĂ: reminderul „cu 24 de ore
--    înainte" pleca la prima rulare de cron nimerită oriunde în acele 24 de ore.
--    Armezi cron-ul cu trei ore înainte de start și oamenii primesc „mâine
--    alergăm" în drum spre cursă.
--
--    Aici: orarul devine o LISTĂ în documentul de ediție (`config.reminders`),
--    editabilă din /admin → Eveniment, fiecare rând cu avansul lui, un comutator
--    și șablonul lui. Publicarea îl copiază în `app_config.reminder_schedule`,
--    de unde îl citește cron-ul. Declanșarea capătă o fereastră de GRAȚIE de 2
--    ore după scadență: ori pleacă aproape de ora promisă, ori nu mai pleacă.
--
-- 2. RENUNȚAREA la loc era o rugăminte în text: „răspunde la acest email ca să
--    eliberăm locul". Cine chiar răspundea depindea de cineva care să citească
--    inboxul și să șteargă rândul manual; până atunci locul rămânea blocat, iar
--    lista de așteptare aștepta degeaba. Aici primește un link cu token, o
--    pagină de confirmare (`/renunt`) și un RPC care marchează retragerea. Restul
--    lanțului există deja: `deleted_at` declanșează `registrations_autopromote_trg`,
--    care urcă primul din așteptare și îi trimite emailul de promovare.
--
-- Tot aici scoatem „Check-in de la {ora_checkin}." din cele două șabloane care o
-- purtau. Variabila și câmpul din admin RĂMÂN — pot fi puse înapoi în orice
-- șablon, fără migrare.

-- ---------------------------------------------------------------------------
-- 1. Tokenul de renunțare + urma retragerii.
-- ---------------------------------------------------------------------------
--
-- Token SEPARAT de `token_unsub`, deliberat. Sunt două cereri diferite: „nu-mi
-- mai trimite emailuri" nu înseamnă „nu mai vin", iar un singur token le-ar fi
-- confundat într-un sens ireversibil — cineva care voia doar liniște și-ar fi
-- pierdut locul, luat între timp de primul din lista de așteptare.
--
-- `not null default gen_random_uuid()` e volatil, deci rândurile existente
-- primesc fiecare un UUID distinct la rewrite (același tipar ca `token_unsub`).
alter table runlift.registrations
  add column if not exists token_renunt uuid not null default gen_random_uuid(),
  add column if not exists renuntat_la timestamptz;

comment on column runlift.registrations.renuntat_la is
  'Și-a eliberat locul singur, din linkul din email. `deleted_at` se setează în '
  'aceeași scriere (asta declanșează auto-promovarea); coloana asta reține CINE a '
  'decis, ca jurnalul să nu confunde o retragere voluntară cu o ștergere din admin.';

-- Căutarea din `decline_spot` merge după token. Unic, pentru că e un secret:
-- două rânduri cu același token ar face RPC-ul nedeterminist.
create unique index if not exists registrations_token_renunt_idx
  on runlift.registrations (token_renunt);

-- ---------------------------------------------------------------------------
-- 2. RPC-ul public de renunțare.
-- ---------------------------------------------------------------------------
--
-- Tokenul (UUID) e secretul, ca la dezabonare. Întoarce STAREA, nu date
-- personale: cu un token ghicit n-ai ce afla despre nimeni.
--
-- ATENȚIE la ce NU face: nu e chemat de un GET. Pagina `/renunt` cere un click
-- explicit pe buton înainte să-l apeleze, iar linkul din email duce la pagină,
-- nu aici. Motivul e același pentru care RFC 8058 cere POST la dezabonare:
-- scanerele de linkuri ale providerilor deschid URL-urile din emailuri ca să le
-- verifice. Un GET care eliberează locul ar fi dat locul mai departe fără ca
-- omul să fi atins ceva.
create or replace function runlift.decline_spot(p_token uuid)
returns text
language plpgsql
security definer
set search_path to 'runlift'
as $$
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

  -- Locul e deja liber — fie a renunțat el mai devreme, fie l-a scos adminul.
  -- Din perspectiva lui e același adevăr („nu mai ești pe listă"), iar a-l
  -- distinge în răspuns ar scurge ce a făcut adminul cu înscrierea lui.
  if v_sters is not null or v_renunt is not null then
    return 'deja_renuntat';
  end if;

  -- O ediție încheiată nu mai are ce elibera, iar auto-promovarea nu trebuie să
  -- urce pe nimeni într-o cursă care s-a alergat deja.
  if v_ed <> current_event_edition() then return 'prea_tarziu'; end if;

  select value::timestamptz into v_start from app_config where key = 'event_start';
  if v_start is not null and now() >= v_start then return 'prea_tarziu'; end if;

  -- O singură scriere: `deleted_at` e ce declanșează `registrations_autopromote_trg`
  -- (after update of deleted_at), deci locul se umple din lista de așteptare în
  -- aceeași tranzacție. `renuntat_la` e doar urma pentru jurnal.
  update registrations
     set renuntat_la = now(), deleted_at = now()
   where id = v_id;

  insert into admin_events (tip, detaliu)
  values ('renuntare', jsonb_build_object(
    'id', v_id, 'nume', v_nume, 'email', v_email, 'editie', v_ed));

  return 'renuntat';
end;
$$;

grant execute on function runlift.decline_spot(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Cititorii care trebuie să vadă tokenul.
-- ---------------------------------------------------------------------------
--
-- `edition2_recipients` îl duce în broadcast (reminderul programat construiește
-- linkul per destinatar), `admin_list_registrations` în backoffice (ca
-- {link_renunt} să meargă și la trimiterile manuale — altfel variabila ar fi
-- plecat literală tocmai din tabul unde omul o vede în listă).
--
-- Amândouă întorc RETURNS TABLE, deci semnătura se schimbă → drop + create.
drop function if exists runlift.edition2_recipients();
create function runlift.edition2_recipients()
returns table(email text, nume text, token_unsub uuid, token_renunt uuid)
language sql
set search_path to ''
as $$
  select email, nume, token_unsub, token_renunt
  from runlift.registrations
  where editie = (select value::smallint from runlift.app_config where key = 'current_event_edition')
    and dezabonat_la is null
    and deleted_at is null
  order by created_at;
$$;

drop function if exists runlift.admin_list_registrations(uuid, integer);
create function runlift.admin_list_registrations(p_token uuid, p_editie integer default null)
returns table(id uuid, created_at timestamptz, nume text, telefon text, email text,
              echipa text, editie smallint, dezabonat_la timestamptz, token_renunt uuid)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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
$function$;

grant execute on function runlift.admin_list_registrations(uuid, integer)
  to anon, authenticated, service_role;

-- Emailul de promovare („s-a eliberat un loc, ești înăuntru") poartă și el
-- linkul de renunțare: cine urcă de pe lista de așteptare poate, la rândul lui,
-- să nu mai poată veni — iar dacă n-are cum s-o spună, locul se blochează exact
-- ca înainte. `confirm_lookup` e citit și de modul `confirm`, al cărui șablon nu
-- conține variabila; o coloană în plus nu-l deranjează.
drop function if exists runlift.confirm_lookup(uuid);
create function runlift.confirm_lookup(p_id uuid)
returns table(email text, nume text, token_renunt uuid)
language sql
set search_path to ''
as $function$
  select email, nume, token_renunt from runlift.registrations
  where id = p_id
    and editie = (select value::smallint from runlift.app_config where key = 'current_event_edition')
    and deleted_at is null
    and created_at > now() - interval '15 minutes';
$function$;

grant execute on function runlift.confirm_lookup(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Șabloanele.
-- ---------------------------------------------------------------------------

-- Reminderul „obișnuit" (cel de cu zile înainte): fără linia de check-in, cu
-- linkul de renunțare în locul rugăminții de a răspunde la email.
update runlift.email_templates
   set subiect = 'Mâine alergăm — Run + Lift {numele_cursei}',
       text_email = E'Salut, {prenume}!\n\nÎți reamintim că Run + Lift — {numele_cursei} are loc pe {data_scurta}, ora {ora_start}, la {locul}.\n\nDacă nu mai poți participa, eliberează-ți locul aici, ca să-l primească cineva de pe lista de așteptare:\n{link_renunt}\n\nNe vedem la start!\nEchipa Run + Lift'
 where cheie = 'bulk_participant_reminder';

-- Reminderul final (cel de cu ore înainte). Text nou, nu o copie: cu trei ore
-- înainte, „dacă nu mai poți participa" nu mai are ce elibera util, iar ce
-- contează e ora și locul.
insert into runlift.email_templates (cheie, subiect, text_email)
values (
  'bulk_participant_reminder_final',
  'Azi alergăm — ora {ora_start}',
  E'Salut, {prenume}!\n\nAzi e ziua: Run + Lift — {numele_cursei}, ora {ora_start}, la {locul}.\n\nAdu echipament sport și apă.\n\nDacă în ultima clipă nu mai poți veni, spune-ne aici:\n{link_renunt}\n\nNe vedem la start!\nEchipa Run + Lift'
)
on conflict (cheie) do nothing;

-- Promovarea automată de pe lista de așteptare: aceeași curățare.
update runlift.email_templates
   set text_email = E'Salut, {prenume}!\n\nS-a eliberat un loc și ai fost mutat de pe lista de așteptare pe lista de participanți. Locul tău la Run + Lift — {numele_cursei} este acum confirmat!\n\n• Când: {data_cursei}, ora {ora_start}\n• Unde: {locul}\n\nDacă totuși nu poți veni, eliberează locul aici:\n{link_renunt}\n\nNe vedem la start!\nEchipa Run + Lift'
 where cheie = 'bulk_waitlist_promovare';

-- ---------------------------------------------------------------------------
-- 5. Validarea documentului: cheia `reminders`.
-- ---------------------------------------------------------------------------
--
-- Recreăm `event_config_validate` ÎNTREAGĂ (nu se poate extinde parțial),
-- pornind de la varianta din `supabase-migration-reels-si-coming-soon.sql`.
-- Singura diferență e blocul `reminders` de la final.
create or replace function runlift.event_config_validate(p_config jsonb)
returns void
language plpgsql
immutable
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
  v_chei_permise text[] := array['format', 'venue', 'registration', 'participants', 'reels'];
  v_clip jsonb;
  v_coduri text[] := array[]::text[];
  v_cod text;
  v_rem jsonb;
  v_offset int;
  v_avansuri int[] := array[]::int[];
  -- Aceleași chei ca `REMINDER_TEMPLATE_KEYS` din `content/eventConfig.ts`.
  v_sabloane text[] := array['bulk_participant_reminder', 'bulk_participant_reminder_final'];
begin
  -- Câmpuri obligatorii. `reels` și `reminders` NU sunt printre ele, deliberat:
  -- documentele publicate înainte de migrări nu le au, iar clientul cade pe implicit.
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

  -- Banda „Instagram". Cheia e opțională; dacă există, trebuie să fie coerentă.
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

  -- Orarul reminderelor. Cheia e opțională (documentele vechi n-o au); dacă
  -- există, fiecare rând trebuie să descrie un email care chiar poate pleca.
  if p_config -> 'reminders' is not null then
    if pg_catalog.jsonb_typeof(p_config -> 'reminders') <> 'array' then
      raise exception 'config_invalid: reminders trebuie să fie o listă';
    end if;

    -- Același plafon ca `MAX_REMINDERS` din client.
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

      -- Listă închisă: o cheie greșit tastată ar trimite emailul pe textul de
      -- rezervă din cod. Plecat, deci ireparabil.
      if not ((v_rem ->> 'template') = any (v_sabloane)) then
        raise exception 'config_invalid: șablon de reminder necunoscut „%"', v_rem ->> 'template';
      end if;

      -- Cheia de idempotență e (ediție, avans), deci al doilea rând cu același
      -- avans n-ar pleca niciodată. Mai bine refuzat decât tăcut inert.
      if v_offset = any (v_avansuri) then
        raise exception 'config_invalid: două remindere la % ore înainte', v_offset;
      end if;
      v_avansuri := v_avansuri || v_offset;
    end loop;
  end if;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Publicarea duce orarul în `app_config`, lângă celelalte scalare.
-- ---------------------------------------------------------------------------
--
-- Cron-ul rulează cu drepturi de owner și n-are token de admin; îi trebuie orarul
-- undeva la îndemână, într-o formă deja rezolvată. `app_config` e locul unde
-- stau deja `event_start` și `event_capacity`, scrise în ACEEAȘI tranzacție cu
-- publicarea — deci orarul nu poate rămâne în urma startului față de care se măsoară.
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
  -- Documentele publicate înainte de migrarea asta n-au cheia. `'[]'` ar fi
  -- oprit tăcut reminderul de 24h pe care ediția în curs îl are deja promis,
  -- deci absența cade pe același implicit ca în client (`DEFAULT_REMINDERS`).
  insert into app_config (key, value)
    values ('reminder_schedule', coalesce(
      p_config -> 'reminders',
      '[{"offsetHours":24,"enabled":true,"template":"bulk_participant_reminder"}]'::jsonb
    )::text)
    on conflict (key) do update set value = excluded.value;
end;
$function$;

-- Documentele care există DEJA (publicat + ciorne) primesc orarul, ca prima
-- deschidere a tabului „Eveniment" să arate reminderul care chiar e programat,
-- nu o listă goală care ar fi șters orarul la prima salvare.
update runlift.event_config
   set config = config || jsonb_build_object('reminders', jsonb_build_array(
     jsonb_build_object(
       'offsetHours', coalesce(
         (select value::int from runlift.app_config where key = 'reminder_offset_hours'), 24),
       'enabled', true,
       'template', 'bulk_participant_reminder')))
 where config -> 'reminders' is null;

-- …și `app_config`, ca orarul să fie citibil de cron chiar înainte de următoarea
-- publicare. Fără asta, `maybe_send_reminder` ar cădea pe ramura de compatibilitate.
select runlift.scrie_scalarele_editiei(config)
  from runlift.event_config where status = 'published';

-- ---------------------------------------------------------------------------
-- 7. Declanșarea: orar multiplu, fereastră de grație, idempotență per rând.
-- ---------------------------------------------------------------------------
--
-- Diferențele față de varianta din `supabase-migration-reminder-idempotent.sql`:
--
--  • parcurge ORARUL (`reminder_schedule`), nu un singur offset;
--  • cheia de idempotență e per (ediție, avans), nu per ediție — altfel al
--    doilea reminder al aceleiași ediții n-ar mai pleca niciodată;
--  • fereastra e [scadență, scadență + 2h], nu [start − offset, start]. Vechea
--    fereastră însemna că ora la care pleacă reminderul depinde de când s-a
--    întâmplat să fie armat cron-ul; asta e vizibil și în admin, ca stare „ratat";
--  • duce cheia șablonului în apelul de broadcast, ca fiecare reminder să-și
--    aibă textul lui.
--
-- Rămâne sigură chemată des (cron la 15 min): în afara ferestrelor nu face nimic.
-- Grația de 2 ore trebuie să rămână mai mare decât intervalul cron-ului, altfel
-- o singură rulare ratată ar sări un reminder. Aceeași valoare e în
-- `REMINDER_GRACE_HOURS` din `content/eventConfig.ts`.
create or replace function runlift.maybe_send_reminder()
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $$
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

  -- Startul a trecut: nu mai are ce reaminti.
  if now() > v_start then return; end if;

  select value::jsonb into v_orar from app_config where key = 'reminder_schedule';

  -- Compatibilitate: dacă orarul lipsește sau e stricat, cade pe reminderul unic
  -- de dinainte. Un orar nevalid nu trebuie să însemne „niciun reminder".
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

    -- Verificat cu `jsonb_typeof` înainte de cast, nu prins cu un handler de
    -- excepții: un rând stricat trebuie sărit, nu transformat în eroare de cron.
    continue when jsonb_typeof(v_rem -> 'offsetHours') <> 'number';
    v_offset := (v_rem ->> 'offsetHours')::numeric::int;
    continue when v_offset <= 0;

    v_sablon := coalesce(nullif(v_rem ->> 'template', ''), 'bulk_participant_reminder');
    v_scadent := v_start - make_interval(hours => v_offset);

    -- În afara ferestrei de declanșare: ori încă n-a venit vremea, ori a trecut
    -- de mult și un reminder întârziat ar face mai mult rău decât bine.
    continue when now() < v_scadent or now() > v_scadent + interval '2 hours';

    -- O singură dată per (ediție, avans). Atomic — vezi `broadcast_once`.
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
$$;

-- Securitate: definer, citește secretul, poate trimite. Supabase acordă execute
-- DIRECT la anon/authenticated (default privileges), deci `revoke from public`
-- nu e suficient — le revocăm explicit.
revoke execute on function runlift.maybe_send_reminder() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- VERIFICĂRI (rulează-le după migrare)
-- ---------------------------------------------------------------------------
--   select value from runlift.app_config where key = 'reminder_schedule';
--   select config -> 'reminders' from runlift.event_config where status = 'published';
--   select cheie, subiect from runlift.email_templates where cheie like 'bulk_participant_reminder%';
--   select jobname, schedule, active from cron.job where jobname = 'runlift_reminder';
--
-- Armarea cron-ului rămâne un pas manual, o singură dată: vezi
-- `supabase-cron-reminder-ARM.sql`. Odată armat, orarul se schimbă din /admin,
-- fără SQL.

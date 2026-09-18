-- Migrare: banda „Instagram" în documentul de config + panoul Coming Soon.
--
-- Două schimbări fără legătură între ele, în același fișier pentru că ating
-- aceeași funcție de validare:
--
--  1. `event_config_validate` acceptă cheia `reels` (banda de clipuri de pe
--     landing) și secțiunea `reels` în `layout`. Fără asta, orice ciornă
--     salvată din admin cu secțiunea nouă ar fi respinsă la publicare.
--
--  2. `admin_set_coming_soon` — peticul de comutare a ecranului de dinainte de
--     lansare, cu efect IMEDIAT pe site, fără să treacă prin ciornă → publică.
--
-- De ce un RPC separat, și nu tabul „Eveniment": comutarea Coming Soon ↔ landing
-- e o operație de un singur gest, făcută de regulă sub presiune („anunțul iese
-- acum"). Fluxul ciornă → publică e potrivit pentru o ediție întreagă, unde
-- verificarea înainte de publicare merită pașii; aici e o manetă.
--
-- Ce NU atinge peticul: `app_config`. Cele cinci scalare scrise de
-- `scrie_scalarele_editiei` sunt `current_event_edition`, `current_launch_edition`,
-- `event_capacity`, `registration_deadline` și `event_start`. Niciunul nu derivă
-- din `showComingSoon`, `launchAt` sau `nextEditionAt`, deci peticul nu poate
-- desincroniza guard-urile. (Verificat în `supabase-migration-event-config.sql`.)

-- ---------------------------------------------------------------------------
-- 1. Validarea acceptă `reels`
-- ---------------------------------------------------------------------------

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
  -- `reels` se adaugă la capăt: un document publicat înainte de migrarea asta
  -- n-o conține, iar `layoutComplet` din admin o completează la prima ciornă.
  v_chei_permise text[] := array['format', 'venue', 'registration', 'participants', 'reels'];
  v_clip jsonb;
  v_coduri text[] := array[]::text[];
  v_cod text;
begin
  -- Câmpuri obligatorii. `reels` NU e printre ele, deliberat: documentele
  -- publicate înainte de migrare n-o au, iar clientul cade pe implicit.
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

      -- Plafon: o bandă, nu un feed. Aceeași valoare ca `MAX_REELS` din client.
      if pg_catalog.jsonb_array_length(p_config -> 'reels' -> 'items') > 12 then
        raise exception 'config_invalid: cel mult 12 clipuri în banda Instagram';
      end if;

      for v_clip in
        select * from pg_catalog.jsonb_array_elements(p_config -> 'reels' -> 'items')
      loop
        v_cod := v_clip ->> 'code';

        -- Îngust deliberat: codul ajunge în `src`-ul unui iframe, iar un „/" sau
        -- un „?" strecurat acolo ar schimba ADRESA, nu doar clipul. Regula e
        -- aceeași ca `REEL_CODE_RE` din `content/eventConfig.ts`.
        if v_cod is null or v_cod !~ '^[A-Za-z0-9_-]{5,32}$' then
          raise exception 'config_invalid: cod de clip invalid „%"', coalesce(v_cod, '(lipsă)');
        end if;

        -- Instagram nu servește un reel pe ruta „/p/": `kind` decide ruta, deci
        -- o valoare inventată ar produce un iframe gol, nu o eroare vizibilă.
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
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Peticul Coming Soon, cu efect imediat
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_set_coming_soon(
  p_token uuid,
  p_show boolean,
  p_launch_at text,
  p_next_edition_at text
)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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

  -- Formatul datelor e verificat AICI, înainte de `jsonb_set`: altfel
  -- `event_config_validate` ar da eroarea la castul spre timestamptz, cu un
  -- mesaj despre sintaxă în loc de unul despre câmp.
  if p_launch_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$' then
    raise exception 'config_invalid: launchAt trebuie scris ca 2026-08-19T12:00:00, fără fus';
  end if;
  if p_next_edition_at !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$' then
    raise exception 'config_invalid: nextEditionAt trebuie scris ca 2026-08-29T07:00:00, fără fus';
  end if;

  -- Exact trei chei. Restul documentului publicat rămâne bit-cu-bit ce era.
  v_nou := jsonb_set(v_config, '{showComingSoon}', to_jsonb(p_show));
  v_nou := jsonb_set(v_nou, '{launchAt}', to_jsonb(p_launch_at));
  v_nou := jsonb_set(v_nou, '{nextEditionAt}', to_jsonb(p_next_edition_at));

  -- Aceeași poartă ca la publicare. Peticul e rapid, nu privilegiat.
  perform event_config_validate(v_nou);

  -- Rând NOU, nu `update` pe loc: așa peticul apare în „Versiuni anterioare" și
  -- „Revino la asta" îl poate întoarce, exact ca o publicare obișnuită. Un
  -- update pe loc ar fi fost cu o linie mai scurt și ireversibil.
  --
  -- Ordinea contează: indexul „un singur publicat" e verificat imediat, deci
  -- vechiul rând iese din `published` înainte ca noul să intre.
  update event_config set status = 'superseded' where id = v_vechi_id;

  insert into event_config (editie, config, status, published_at)
  values (v_editie, v_nou, 'published', now())
  returning id into v_nou_id;

  -- `app_config` NU se atinge: niciunul din cele cinci scalare nu derivă din
  -- cheile de mai sus. Vezi nota din capul fișierului.

  insert into admin_events (tip, detaliu)
  values ('coming_soon_set', jsonb_build_object(
    'id', v_nou_id,
    'editie', v_editie,
    'showComingSoon', p_show,
    'launchAt', p_launch_at,
    'nextEditionAt', p_next_edition_at));

  return v_nou_id;
end;
$function$;

-- Același grant ca la celelalte RPC-uri de admin: cheia publică poate APELA
-- funcția, dar prima linie din ea cere un token de sesiune valid. Protecția e
-- în funcție, nu în grant.
grant execute on function runlift.admin_set_coming_soon(uuid, boolean, text, text)
  to anon, authenticated, service_role;

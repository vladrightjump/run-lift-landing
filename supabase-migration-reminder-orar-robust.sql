-- Un orar de remindere nevalid nu mai oprește reminderul.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Bug-ul: `maybe_send_reminder()` avea deja plasa
--     if v_orar is null or jsonb_typeof(v_orar) <> 'array' then ... implicit
-- dar nu ajungea niciodată la ea, fiindcă `value::jsonb` de deasupra arunca
-- excepție pe un text care nu e JSON. Funcția e chemată de `pg_cron` din 15 în
-- 15 minute: o excepție acolo înseamnă reminder netrimis, tăcut, iar singurul
-- loc unde s-ar vedea e lipsa rândurilor din „Livrare", după cursă.
--
-- Valoarea o scrie azi doar `scrie_scalarele_editiei()`, deci JSON nevalid poate
-- veni doar dintr-o editare manuală în `app_config`. Plasa exista tocmai pentru
-- cazul ăla; migrarea o face să funcționeze.
--
-- Restul funcției rămâne neschimbat.

begin;

create or replace function runlift.maybe_send_reminder()
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
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

  if now() > v_start then return; end if;

  -- Conversia stă în blocul ei: un text care nu e JSON nu trebuie să oprească
  -- reminderul, ci să cadă pe orarul implicit de mai jos.
  begin
    select value::jsonb into v_orar from app_config where key = 'reminder_schedule';
  exception when others then
    v_orar := null;
  end;

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

    continue when jsonb_typeof(v_rem -> 'offsetHours') <> 'number';
    v_offset := (v_rem ->> 'offsetHours')::numeric::int;
    continue when v_offset <= 0;

    v_sablon := coalesce(nullif(v_rem ->> 'template', ''), 'bulk_participant_reminder');
    v_scadent := v_start - make_interval(hours => v_offset);

    continue when now() < v_scadent or now() > v_scadent + interval '2 hours';

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
$function$;

commit;

-- --- VERIFICARE ---
--   update runlift.app_config set value = 'nu-i json' where key = 'reminder_schedule';
--   select runlift.maybe_send_reminder();   -- nu mai aruncă
--   -- pune orarul la loc din /admin → „Eveniment" (publicare) sau manual.

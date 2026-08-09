-- ⚠️ ARMARE reminder programat — RULEAZĂ MANUAL, DELIBERAT. NU e aplicat de nicio migrare.
--
-- Ce face: programează pg_cron să cheme `runlift.maybe_send_reminder()` la fiecare 15 min.
-- Funcția trimite reminderul către participanții ediției curente O SINGURĂ DATĂ, doar în
-- fereastra [event_start - reminder_offset_hours, event_start] (vezi
-- supabase-migration-reminder-idempotent.sql). În afara ferestrei nu face nimic.
--
-- ⚠️ ATENȚIE la momentul armării:
--   Cu `reminder_offset_hours = 24` și `event_start = 2026-08-08 06:30`, fereastra e
--   [2026-08-07 06:30, 2026-08-08 06:30]. Dacă armezi ÎN acest interval, reminderul
--   pleacă la următoarea rulare (≤15 min) către TOȚI participanții confirmați. Emailul
--   folosește șablonul `bulk_participant_reminder` (editabil din /admin → Șabloane).
--   Verifică întâi conținutul șablonului!
--
-- Cum verifici înainte:
--   select value from runlift.app_config where key in ('event_start','reminder_offset_hours');
--   select subiect, text_email from runlift.email_templates where cheie = 'bulk_participant_reminder';
--   select count(*) from runlift.edition2_recipients();   -- câți primesc
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema runlift.

create extension if not exists pg_cron;

-- Programează (idempotent: re-rularea suprascrie job-ul cu același nume).
select cron.schedule(
  'runlift_reminder',
  '*/15 * * * *',
  $$select runlift.maybe_send_reminder();$$
);

-- --- DEZARMARE (rulează asta ca să oprești cron-ul) ---
-- select cron.unschedule('runlift_reminder');

-- --- INSPECȚIE ---
-- select jobid, jobname, schedule, active from cron.job where jobname = 'runlift_reminder';
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname='runlift_reminder') order by start_time desc limit 5;

-- ⚠️ ARMARE reminder programat — RULEAZĂ MANUAL, O SINGURĂ DATĂ.
--
-- Ce face: programează pg_cron să cheme `runlift.maybe_send_reminder()` la fiecare 15 min.
-- Funcția citește ORARUL din `app_config.reminder_schedule` (scris la fiecare publicare
-- din /admin) și trimite fiecare reminder o singură dată, aproape de ora lui.
-- În afara ferestrelor nu face nimic.
--
-- ⚠️ ARMEAZĂ O DATĂ, apoi uită de fișierul ăsta. Orarul (câte remindere, cu cât
--    înainte, cu ce text) se schimbă din /admin → „Eveniment" → Remindere. Nu mai e
--    nevoie de SQL la fiecare ediție.
--
-- DE CE E SIGUR SĂ ARMEZI ORICÂND (spre deosebire de varianta veche):
--   Fereastra de declanșare a unui reminder e [scadență, scadență + 2h], unde
--   scadența = start − avans. Dacă armezi cron-ul DUPĂ ce a trecut fereastra unui
--   reminder, acela pur și simplu nu mai pleacă — nu se descarcă întârziat peste
--   participanți. Vechea fereastră era [start − avans, start] întreagă, deci un
--   reminder „cu 24h înainte" putea pleca cu 20 de minute înainte de start, dacă
--   atunci se nimerea prima rulare de cron. Starea fiecărui reminder („pleacă
--   joi, ora 07:00" / „a trecut — nu mai pleacă") se vede în /admin.
--
-- Cum verifici înainte:
--   select value from runlift.app_config where key in ('event_start','reminder_schedule');
--   select cheie, subiect from runlift.email_templates where cheie like 'bulk_participant_reminder%';
--   select count(*) from runlift.edition2_recipients();   -- câți primesc
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema runlift.

create extension if not exists pg_cron;

-- Programează (idempotent: re-rularea suprascrie job-ul cu același nume).
--
-- Intervalul trebuie să rămână MAI MIC decât fereastra de grație de 2 ore din
-- `maybe_send_reminder`; altfel o rulare ratată ar sări complet un reminder.
select cron.schedule(
  'runlift_reminder',
  '*/15 * * * *',
  $$select runlift.maybe_send_reminder();$$
);

-- --- DEZARMARE (oprește TOATE reminderele, ale tuturor edițiilor) ---
-- Pentru a opri un singur reminder, scoate-i bifa din /admin — nu dezarma cron-ul.
-- select cron.unschedule('runlift_reminder');

-- --- INSPECȚIE ---
-- select jobid, jobname, schedule, active from cron.job where jobname = 'runlift_reminder';
-- select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname='runlift_reminder') order by start_time desc limit 5;
--
-- Ce s-a trimis deja (cheile de idempotență, una per ediție + avans):
-- select key, value from runlift.app_config where key like 'once_reminder_%' order by value desc;
--
-- Retrimitere deliberată a unui reminder deja plecat (rar; gândește-te de două ori —
-- oamenii primesc al doilea email identic):
-- delete from runlift.app_config where key = 'once_reminder_ed5_h24';

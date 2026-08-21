-- Lockdown anti-bot: formularele publice nu mai scriu direct în tabele.
--
-- Context: până acum browserul făcea INSERT direct în PostgREST cu cheia
-- publishable, care e vizibilă în bundle-ul JS. Un bot nu deschide site-ul, ci dă
-- `curl` pe endpoint — deci un captcha pus doar în React n-ar fi oprit nimic.
--
-- După migrarea asta, singura cale de scriere e funcția Edge `submit-form`, care
-- folosește cheia de service DOAR după ce a verificat token-ul Turnstile la
-- Cloudflare (vezi supabase/functions/submit-form/index.ts).
--
-- ATENȚIE — ordinea deploy-ului contează. Rulează migrarea DOAR DUPĂ ce:
--   1. funcția `submit-form` e deployată  (supabase functions deploy submit-form --no-verify-jwt)
--   2. secretul e pus                     (supabase secrets set TURNSTILE_SECRET_KEY=...)
--   3. frontendul nou e în producție      (altfel clienții vechi primesc 401 la înscriere)
-- Între pasul 3 și migrarea asta poate exista o fereastră în care ambele căi merg
-- — e intenționat, ca vizitatorii cu pagina veche deschisă în tab să nu pice.
--
-- ROLLBACK: la finalul fișierului, comentat.
--
-- NU atinge schema `public` (gym-app / botul de Telegram).

begin;

-- 1) Politicile care permiteau INSERT din browser (rol `anon`).
--    `service_role` ocolește RLS, deci `submit-form` scrie în continuare.
drop policy if exists "anon can register"    on runlift.registrations;
drop policy if exists "anon insert waitlist" on runlift.event_waitlist;
drop policy if exists "anon can subscribe"   on runlift.launch_notifications;

-- 2) Grant-urile de tabelă. Fără politică, RLS ar bloca oricum, dar lăsăm și
--    grant-ul curat: dacă cineva reactivează din greșeală o politică, `anon` tot
--    nu poate scrie.
revoke insert on runlift.registrations        from anon;
revoke insert on runlift.event_waitlist       from anon;
revoke insert on runlift.launch_notifications from anon;

commit;

-- Verificare (rulează separat, după commit) — ambele trebuie să dea 0 rânduri:
--
--   select tablename, policyname from pg_policies
--    where schemaname = 'runlift' and cmd = 'INSERT' and roles::text like '%anon%';
--
--   select table_name, privilege_type from information_schema.role_table_grants
--    where table_schema = 'runlift' and grantee = 'anon' and privilege_type = 'INSERT';
--
-- Și testul care contează cu adevărat, din terminal (trebuie să dea 401/403):
--
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     -X POST 'https://whyndrjcezmtajbykeil.supabase.co/rest/v1/registrations' \
--     -H 'apikey: sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh' \
--     -H 'Content-Type: application/json' -H 'Content-Profile: runlift' \
--     -d '{"nume":"Bot Test","telefon":"069000000","email":"bot@test.md","acord":true}'
--
-- Ce NU se schimbă:
--   • trigger-ele `registrations_guard_trg` (event_full / registration_closed) și
--     `event_waitlist_cap_trg` (waitlist_full) rămân active — sunt trigger-e, nu
--     politici RLS, deci se aplică și scrierilor cu cheia de service;
--   • backoffice-ul /admin merge prin RPC-uri SECURITY DEFINER cu `p_token`
--     (`admin_add_registration` &co.), deci nu e atins;
--   • `public_stats`, `confirm_signup`, `unsubscribe` rămân apelabile din `anon`.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK (dacă `submit-form` are probleme și vrei înapoi calea directă):
--
-- begin;
-- grant insert on runlift.registrations        to anon;
-- grant insert on runlift.event_waitlist       to anon;
-- grant insert on runlift.launch_notifications to anon;
--
-- create policy "anon can register" on runlift.registrations
--   for insert to anon with check (acord);
--
-- create policy "anon insert waitlist" on runlift.event_waitlist
--   for insert to anon with check (acord = true);
--
-- create policy "anon can subscribe" on runlift.launch_notifications
--   for insert to anon with check (
--     char_length(btrim(nume)) > 0
--     and char_length(btrim(prenume)) > 0
--     and position('@' in email) > 1
--     and char_length(btrim(email)) >= 5
--     and char_length(btrim(telefon)) >= 6
--     and editie = runlift.current_launch_edition()
--     and sursa = any (array['lansare', 'despre-noi'])
--   );
-- commit;

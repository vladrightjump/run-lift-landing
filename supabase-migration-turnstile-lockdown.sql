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
-- CUM SE APLICĂ: prin MCP `apply_migration`, cu numele `runlift_turnstile_lockdown`
-- (convenția din `MIGRATIONS.md`, scrisă după ce PR-ul ăsta a fost deschis — de
-- aceea runbook-ul vechi spunea „SQL Editor"). După DDL: adaugă rândul în tabelul
-- din `MIGRATIONS.md` și rulează `get_advisors` (security), ca la orice migrare
-- care atinge RLS.
--
-- ATENȚIE — ordinea deploy-ului contează. Rulează migrarea ULTIMA, DOAR DUPĂ ce:
--   1. secretele sunt puse       (TURNSTILE_SECRET_KEY *și* RUNLIFT_SERVICE_KEY)
--   2. funcția `submit-form` e deployată (--no-verify-jwt)
--   3. cheia publică e în Vercel (Production) — înainte de merge, altfel garda
--      din `scripts/check-deploy-config.ts` pică build-ul de producție
--   4. PR-ul e merge-uit ȘI CI-ul a publicat frontendul. Merge-ul în `main` ESTE
--      deploy-ul: `.github/workflows/ci-deploy.yml` apasă deploy hook-ul Vercel.
--   5. o înscriere reală, cap-coadă, a trecut pe calea nouă
-- Între pasul 4 și migrarea asta există o fereastră în care ambele căi merg — e
-- intenționat, ca noul frontend să fie confirmat live înainte ca `submit-form` să
-- rămână singura cale de scriere.
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

-- Verificare (rulează separat, după commit) — ambele trebuie să dea 0 rânduri.
-- Interogările NU numesc cele trei tabele: întreabă „mai poate `anon` insera
-- ORIUNDE în runlift?". Dacă o migrare viitoare adaugă un tabel public cu
-- politică de insert, vrem să apară aici, nu să treacă pe lângă listă.
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
-- ROLLBACK — DOI PAȘI, ÎN ORDINE. Blocul SQL singur NU repară nimic.
--
-- Pasul 1: întoarce frontendul. Bundle-ul livrat scrie DOAR prin `submit-form`
-- (zero `fetch` spre /rest/v1/* din `src/`), deci re-acordarea insert-ului către
-- `anon` redeschide gaura fără să repună niciun formular în funcțiune. Promovează
-- în Vercel deployment-ul de producție dinaintea merge-ului — auto-deploy-ul git
-- e dezactivat (`vercel.json`: git.deploymentEnabled.main = false), deci e o
-- promovare manuală din dashboard, nu un push.
--
-- Pasul 2: abia apoi, SQL-ul de mai jos.
--
-- Politicile de mai jos sunt copiate din starea LIVE de la 28 aug 2026, nu din
-- forma lor originală. Versiunea veche a acestui bloc recrea `with check (acord)`
-- — adică forma de dinainte de `supabase-migration-server-assigned-edition.sql`,
-- fără garda de ediție. Un rollback rulat așa ar fi reintrodus tăcut bug-ul „un
-- tab vechi scrie în ediția greșită", și nimeni n-ar fi observat până la ediția
-- următoare.
--
-- begin;
-- grant insert on runlift.registrations        to anon;
-- grant insert on runlift.event_waitlist       to anon;
-- grant insert on runlift.launch_notifications to anon;
--
-- create policy "anon can register" on runlift.registrations
--   for insert to anon with check (acord and editie = runlift.current_event_edition());
--
-- create policy "anon insert waitlist" on runlift.event_waitlist
--   for insert to anon with check (acord = true and editie = runlift.current_event_edition());
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
--
-- Verificare după rollback — trebuie să dea exact trei rânduri, cu `with_check`
-- identic cu cel de mai sus:
--
--   select tablename, policyname, pg_get_expr(polwithcheck, polrelid)
--     from pg_policy join pg_class c on c.oid = polrelid
--     join pg_policies pp on pp.policyname = polname
--    where pp.schemaname = 'runlift' and pp.cmd = 'INSERT';

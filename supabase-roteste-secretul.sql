-- =====================================================================
--  A MAI RĂMAS UN SINGUR LUCRU: rotirea secretului de broadcast
--  Proiect: run-lift (iattqvakxcgepjiecgpf)
--  18 iulie 2026
--
--  Gaura de securitate e ÎNCHISĂ (detalii mai jos). Dar între momentul în
--  care a apărut și momentul reparării, secretul a fost citibil public prin
--  /rest/v1/rpc/broadcast_secret de către oricine avea cheia publicabilă —
--  adică oricine se uita în bundle-ul JS al site-ului.
--
--  Nu există dovezi că l-a luat cineva. Dar un secret care a fost expus
--  se consideră compromis. Rotirea durează 5 secunde.
-- =====================================================================


-- ---------------------------------------------------------------------
--  ROTIREA (rulează în Supabase → SQL Editor)
-- ---------------------------------------------------------------------
update public.app_config
   set value = encode(gen_random_bytes(32), 'hex')
 where key = 'broadcast_secret';

-- Vezi noul secret ca să-l salvezi unde ai nevoie:
select value as secret_nou from public.app_config where key = 'broadcast_secret';

-- Dacă ai secretul vechi salvat undeva — script, Postman, cron, notițe —
-- înlocuiește-l acolo. Emailurile de CONFIRMARE nu folosesc secretul,
-- deci nu se rup; doar broadcast-ul manual îl cere.


-- =====================================================================
--  CE E DEJA APLICAT ȘI VERIFICAT ÎN PRODUCȚIE
-- =====================================================================
--
--  SECURITATE
--  ✓ broadcast_secret(), edition2_recipients(), waitlist_recipients() și
--    confirm_lookup() trecute de pe SECURITY DEFINER pe SECURITY INVOKER.
--    Erau apelabile de oricine cu cheia publică și scurgeau:
--      • 20 de participanți (nume + email)
--      • 9 destinatari de pe lista de notificare
--      • secretul care autorizează broadcast-ul de emailuri
--    Verificat după fix, rulând ca rolul `anon`:
--      broadcast_secret()     → null
--      edition2_recipients()  → 0 rânduri
--      waitlist_recipients()  → 0 rânduri
--    Și ca service_role (edge function-ul): citește tot, ca înainte.
--  ✓ RLS activat pe launch_notifications_backup_20260718
--  ✓ Advisor-ul Supabase nu mai raportează niciun ERROR
--
--  STRUCTURA PE EDIȚII
--  ✓ coloana `editie`, default = ediția curentă, pusă de server
--  ✓ cei 8 din 13–16 iulie marcați ca ediția 2
--  ✓ index unic pe (lower(email), editie) — reînscriere permisă între ediții
--  ✓ politica RLS respinge ediția trimisă de client (testat cu 999 și cu 2)
--  ✓ admin_list_launch_notifications() returnează și ediția
--  ✓ funcția current_launch_edition() + app_config.current_launch_edition
--
--  DATE
--  ✓ ediția 2: 8 persoane, neatinse
--  ✓ ediția 3: înscrieri reale de pe site
--  ✓ rândurile mele de test șterse (toate cu email @example.com)
--  ✓ backup complet în launch_notifications_backup_20260718
--
-- =====================================================================
--  DE ȘTIUT PENTRU ANUNȚUL DIN 22 IULIE
-- =====================================================================
--  edition2_recipients() și confirm_lookup() au `editie = 2` scris în cod.
--  Când trimiți anunțul pentru ediția a treia, funcțiile astea trebuie
--  actualizate, altfel trimit tot către lista veche.
--
--  Lista corectă pentru anunțul ediției curente:
--    select nume, prenume, email, telefon
--    from public.launch_notifications
--    where editie = public.current_launch_edition()
--    order by created_at;
-- =====================================================================

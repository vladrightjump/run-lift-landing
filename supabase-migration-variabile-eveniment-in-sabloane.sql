-- Șabloanele de email trec pe variabile de eveniment.
--
-- DE CE: până acum data și locul cursei erau text literal în șablon. Publicarea
-- unei ediții noi schimba site-ul și lăsa emailurile în urmă. La momentul
-- migrării, în DB era exact asta — divergență live:
--
--   șablon:  „sâmbătă, 22 august 2026, ora 07:00" · „Scările de Granit, Valea Morilor, Chișinău"
--   publicat: 2026-09-05T07:00:00 · „Terenul de Basketball, Parcul La Izvor" (ediția 6)
--
-- Adică oricine se înscria primea confirmarea cu data greșită cu două săptămâni
-- și cu alt parc. Variabilele de mai jos se completează la trimitere din rândul
-- `published` din `event_config`, deci nu mai pot rămâne în urmă.
--
-- Variabile disponibile (o singură acoladă), rezolvate în:
--   • trimiterile din admin  → src/admin/emailAudience.ts (fillTemplate)
--   • confirmarea automată   → supabase/functions/send-email/index.ts (loadTemplate)
--
--   {data_cursei}   „Sâmbătă, 5 septembrie 2026"
--   {data_scurta}   „5 septembrie"            (pentru subiect)
--   {ora_start}     „07:00"
--   {ora_checkin}   „06:45"
--   {locul}         „Terenul de Basketball, Parcul La Izvor"
--   {numele_cursei} „Hyrox Trial"
--   {editia}        „6"
--
-- Variabilele de PERSOANĂ rămân neschimbate: {prenume}, {nume}, {email},
-- {telefon}, {data_inscrierii}.
--
-- CE NU SE ATINGE, și de ce:
--   • `bulk_waitlist_promovare` — nu pomenește data sau locul („îți trimitem
--     detaliile în curând"), deci n-are ce rămâne în urmă.
--   • `confirmare` și `info` — fluxul de lansare, cu acoladă DUBLĂ ({{prenume}},
--     {{link}}), altă substituție; nu pomenesc cursa.
--
-- ROLLBACK: valorile dinainte sunt păstrate în comentariul de la finalul
-- fișierului, gata de rulat.

update runlift.email_templates set
  subiect = 'Confirmare înscriere — {numele_cursei}, {data_scurta}',
  text_email = E'Salut, {prenume}!\n\nÎnscrierea ta la Run + Lift — {numele_cursei} este confirmată.\n\n• Când: {data_cursei}, ora {ora_start}\n• Unde: {locul}\n\nNe vedem la start!\n\nEchipa Run + Lift',
  actualizat_la = now()
where cheie = 'bulk_participant_confirmare';

-- „{data_scurta}" la mijloc de frază, nu „{data_cursei}": acesta din urmă începe
-- cu ziua săptămânii cu majusculă („Sâmbătă"), care ar cădea prost după virgulă.
update runlift.email_templates set
  subiect = 'Mâine e ziua — {numele_cursei}, {data_scurta}, {ora_start}',
  text_email = E'Salut, {prenume}!\n\nÎți reamintim că Run + Lift — {numele_cursei} are loc mâine, pe {data_scurta}, ora {ora_start}, la {locul}.\n\nCheck-in de la {ora_checkin}.\n\nDacă nu mai poți participa, răspunde la acest email ca să eliberăm locul.\n\nNe vedem la start!\nEchipa Run + Lift',
  actualizat_la = now()
where cheie = 'bulk_participant_reminder';

update runlift.email_templates set
  subiect = 'S-au deschis înscrierile — {numele_cursei}, {data_scurta}',
  text_email = E'Salut, {prenume}!\n\nEvenimentul pe care îl așteptai e aici: Run + Lift — {numele_cursei}.\n\n• Când: {data_cursei}, ora {ora_start}\n• Unde: {locul}\n\nCursă în stil HYROX în aer liber — alergi, treci stația, repeți, contra cronometru. Locuri limitate.\n\nÎnscrie-te aici:\nhttps://parktraining.fit\n\nNe vedem la start!\nEchipa Run + Lift',
  actualizat_la = now()
where cheie = 'bulk_waitlist_anunt';

-- Eticheta din capul fiecărui email. Avea aceeași boală: „Hyrox Trial · 22 august".
update runlift.email_templates set
  text_email = '{numele_cursei} · {data_scurta}',
  actualizat_la = now()
where cheie = 'event_badge';

-- ---------------------------------------------------------------------------
-- ROLLBACK (valorile de dinainte de migrare, 2026-09-04)
-- ---------------------------------------------------------------------------
-- update runlift.email_templates set
--   subiect = 'Confirmare înscriere — Hyrox Trial, 22 august',
--   text_email = E'Salut, {prenume}!\n\nÎnscrierea ta la Run + Lift — Hyrox Trial este confirmată.\n\n• Când: sâmbătă, 22 august 2026, ora 07:00\n• Unde: Scările de Granit, Valea Morilor, Chișinău\n\nNe vedem la start!\n\nEchipa Run + Lift'
-- where cheie = 'bulk_participant_confirmare';
--
-- update runlift.email_templates set
--   subiect = 'Mâine e ziua — Hyrox Trial, 22 august, 07:00',
--   text_email = E'Salut, {prenume}!\n\nÎți reamintim că Run + Lift — Hyrox Trial are loc mâine, sâmbătă 22 august, ora 07:00, la Scările de Granit, Valea Morilor.\n\nDacă nu mai poți participa, răspunde la acest email ca să eliberăm locul.\n\nNe vedem la start!\nEchipa Run + Lift'
-- where cheie = 'bulk_participant_reminder';
--
-- update runlift.email_templates set
--   subiect = 'S-au deschis înscrierile — Hyrox Trial, 22 august',
--   text_email = E'Salut, {prenume}!\n\nEvenimentul pe care îl așteptai e aici: Run + Lift — Hyrox Trial, sâmbătă 22 august 2026, ora 07:00, la Scările de Granit, Valea Morilor, Chișinău.\n\nCursă în stil HYROX în aer liber — alergi, treci stația, repeți, contra cronometru. Locuri limitate.\n\nÎnscrie-te aici:\nhttps://parktraining.fit\n\nNe vedem la start!\nEchipa Run + Lift'
-- where cheie = 'bulk_waitlist_anunt';
--
-- update runlift.email_templates set text_email = 'Hyrox Trial · 22 august'
-- where cheie = 'event_badge';

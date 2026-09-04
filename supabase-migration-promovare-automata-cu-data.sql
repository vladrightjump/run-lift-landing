-- Promovarea automată de pe lista de așteptare spune data și locul.
--
-- DE CE: `bulk_waitlist_promovare` e singurul șablon rămas fără variabile de
-- eveniment după migrarea precedentă. Zicea „Îți trimitem detaliile în curând"
-- — o promisiune rezonabilă când ediția e departe, dar goală când locul se
-- eliberează cu o zi înainte de cursă. Omul află că are loc, nu și când sau
-- unde, exact în momentul în care are cel mai mult nevoie să știe.
--
-- Nu s-a prins la prima migrare fiindcă textul nu conținea nicio dată greșită —
-- nu conținea nicio dată deloc. Divergența era o absență, nu o contradicție.
--
-- Cine îl trimite: trigger-ul `auto_promote_from_waitlist` (via pg_net), cu
-- `mode: 'promoted'`. Acela trece prin `loadTemplate` din funcția Edge, care
-- rezolvă variabilele de eveniment — deci nu e nevoie de nicio schimbare de cod.
--
-- ATENȚIE la ce NU e afectat: promovarea MANUALĂ din /admin nu folosește
-- șablonul ăsta. Ea inserează înscrierea (`admin_promote_waitlist`), iar
-- clientul cheamă apoi `sendConfirmationEmail`, adică `mode: 'confirm'` cu
-- `bulk_participant_confirmare`. Cele două căi de promovare trimit deliberat
-- texte diferite; ambele spun acum data și locul.
--
-- ROLLBACK la finalul fișierului.

update runlift.email_templates set
  subiect = 'Ai loc confirmat — {numele_cursei}, {data_scurta}',
  text_email = E'Salut, {prenume}!\n\nS-a eliberat un loc și ai fost mutat de pe lista de așteptare pe lista de participanți. Locul tău la Run + Lift — {numele_cursei} este acum confirmat!\n\n• Când: {data_cursei}, ora {ora_start}\n• Unde: {locul}\n\nCheck-in de la {ora_checkin}.\n\nDacă nu mai poți participa, răspunde la acest email ca să eliberăm locul.\n\nNe vedem la start!\nEchipa Run + Lift',
  actualizat_la = now()
where cheie = 'bulk_waitlist_promovare';

-- ---------------------------------------------------------------------------
-- ROLLBACK (valoarea de dinainte, 2026-09-04)
-- ---------------------------------------------------------------------------
-- update runlift.email_templates set
--   subiect = 'Ai loc confirmat — Run + Lift',
--   text_email = E'Salut, {prenume}!\n\nS-a eliberat un loc și ai fost mutat de pe lista de așteptare pe lista de participanți. Locul tău la Run + Lift este acum confirmat!\n\nÎți trimitem detaliile în curând. Echipa Run + Lift'
-- where cheie = 'bulk_waitlist_promovare';

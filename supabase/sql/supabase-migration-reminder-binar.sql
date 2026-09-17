-- Al treilea șablon de reminder: întrebarea binară de la 72 de ore.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Context: orarul de remindere poate alege azi între două texte — „mâine
-- alergăm" (24h) și „azi alergăm" (ultimele ore). Amândouă REAMINTESC. Niciunul
-- nu ÎNTREABĂ.
--
-- Diferența contează pentru că mecanismul din spate există deja și e nefolosit:
-- `decline_spot` eliberează locul, iar `auto_promote_from_waitlist()` urcă
-- automat primul om de pe listă. Lanțul e livrat integral. Ce lipsește e
-- momentul în care e util să-l folosești: la 24 de ore, un loc eliberat e un
-- loc gol, fiindcă nimeni nu-și mai face planuri peste noapte. La 72 de ore, e
-- încă cineva care apucă să vină.
--
-- „Binar" e o descriere a răspunsului, nu a interfeței. Nu există buton de
-- „vin", și nici nu trebuie: tăcerea E răspunsul afirmativ. Singura acțiune e
-- cea care schimbă ceva — eliberarea locului. Un al doilea buton, „confirm că
-- vin", ar cere o coloană de confirmare pe care nimeni n-ar citi-o și ar
-- transforma o tăcere inofensivă într-o absență ambiguă.
--
-- `{link_renunt}` e obligatoriu în text. Paragraful care îl poartă e FILTRAT
-- pentru destinatarii fără token (vezi `faraLinkRenunt` din `emailAudience.ts`),
-- deci un text binar fără el ar pune întrebarea și ar înghiți butonul — o
-- întrebare la care nu se poate răspunde.
--
-- Idempotentă prin `on conflict do nothing`: re-rularea nu suprascrie un text
-- pe care operatorul l-a editat între timp din /admin → „Șabloane". Textul de
-- mai jos e un punct de plecare, nu o sursă de adevăr — după prima editare,
-- sursa e DB-ul.
--
-- Rândul de orar la `offsetHours: 72` NU se adaugă aici. Orarul e al
-- operatorului și se scrie din /admin → „Eveniment" → Remindere, la
-- configurarea ediției. `MAX_REMINDERS` e 5, deci al treilea rând încape.

begin;

insert into runlift.email_templates (cheie, subiect, text_email)
values (
  'bulk_participant_reminder_binar',
  'Mai vii pe {data_scurta}? — Run + Lift {numele_cursei}',
  E'Salut, {prenume}!\n'
  '\n'
  'Peste trei zile alergăm: Run + Lift — {numele_cursei}, pe {data_scurta}, ora {ora_start}, la {locul}.\n'
  '\n'
  'O singură întrebare, ca să știm pe cine punem la socoteală:\n'
  '\n'
  'VIN — nu trebuie să faci nimic. Ne vedem la start.\n'
  '\n'
  'NU MAI VIN — eliberează-ți locul de aici, ca să-l primească cineva de pe lista de așteptare:\n'
  '{link_renunt}\n'
  '\n'
  'Un loc eliberat acum înseamnă cineva care apucă să-și facă planuri. Unul eliberat sâmbătă dimineață înseamnă un loc gol la start.\n'
  '\n'
  'Echipa Run + Lift'
)
on conflict (cheie) do nothing;

commit;

-- --- VERIFICARE ---
-- select cheie, subiect, (text_email like '%{link_renunt}%') as are_link
--   from runlift.email_templates
--  where cheie like 'bulk_participant_reminder%';
--
-- Apoi, din /admin → „Eveniment" → Remindere: adaugă un rând cu avansul 72 și
-- alege „Reminder binar („mai vii?")". Starea lui se citește din jurnal, deci
-- până la prima plecare va arăta „programat", nu „trimis".

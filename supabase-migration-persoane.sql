-- `runlift.persoane` — cine a mai fost pe aici, dedus din înscrieri.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- ⚠️ PRECONDIȚIE: `supabase-migration-prezenta.sql` trebuie aplicată ÎNAINTE.
--    Vederea citește `registrations.prezent`, care de acolo vine.
--
-- Context: singurele date care traversează edițiile azi sunt agregate —
-- numărători, niciodată persoane. Nimic nu răspunde la „omul din fața mea e la
-- a treia ediție?".
--
-- VEDERE, nu tabel (KTD6): un `group by` peste rândurile care există deja.
-- Nicio colectare nouă de date, nicio migrare de identități, iar când regula de
-- identitate se dovedește greșită se corectează rescriind vederea — nu
-- reparând un tabel în care greșeala s-a materializat.

begin;

/**
 * Cheia de identitate a unei persoane.
 *
 * Emailul normalizat (minuscule, fără spații) e cheia principală. Telefonul e
 * rezerva, folosită doar când emailul lipsește — de aceea `tel:` în față, ca o
 * persoană cheiată pe telefon să nu se ciocnească niciodată cu una cheiată pe
 * email.
 *
 * Telefonul se reduce la ULTIMELE 8 CIFRE, nu doar la cifre. Datele reale au
 * același număr scris în trei forme: `+373 60 000 000` (11 cifre), `060000000`
 * (9, cu zeroul de trunchi) și `60000000` (8, doar numărul național). Un
 * `regexp_replace(telefon, '\D', '', 'g')` simplu le-ar ține pe toate trei
 * separate, adică ar rata exact cazul pentru care există rezerva. Ultimele 8
 * cifre le unifică pe toate, și tratează la fel și prefixul românesc (+40).
 */
create or replace function runlift.cheie_persoana(p_email text, p_telefon text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select coalesce(
    nullif(lower(btrim(p_email)), ''),
    nullif('tel:' || right(regexp_replace(coalesce(p_telefon, ''), '\D', '', 'g'), 8), 'tel:')
  );
$function$;

create or replace view runlift.persoane as
  select
    runlift.cheie_persoana(r.email, r.telefon) as cheie,
    -- Ultimul nume cunoscut, nu primul: oamenii se mărită, își corectează
    -- diacriticele, își scriu prenumele întâi. Cel mai recent e cel pe care
    -- l-ar recunoaște.
    (array_agg(r.nume order by r.created_at desc))[1] as nume,
    (array_agg(r.email order by r.created_at desc))[1] as email,
    (array_agg(r.telefon order by r.created_at desc))[1] as telefon,
    count(*)::int as inscrieri,
    count(*) filter (where r.prezent)::int as participari,
    array_agg(distinct r.editie order by r.editie) as editii_inscris,
    array_remove(
      array_agg(distinct case when r.prezent then r.editie end order by
                case when r.prezent then r.editie end),
      null
    ) as editii_prezent,
    min(r.created_at) as prima_inscriere,
    max(r.created_at) as ultima_inscriere
  from runlift.registrations r
  -- Rândurile șterse logic ies natural: `deleted_at is null` e și regula
  -- listării din backoffice. Consecința, deliberată: o persoană a cărei
  -- singură înscriere a fost ștearsă dispare din istoric, iar un undo o aduce
  -- înapoi la aceeași cheie — nu ca persoană nouă, fiindcă cheia se calculează
  -- din email/telefon, nu din `id`.
  where r.deleted_at is null
    and runlift.cheie_persoana(r.email, r.telefon) is not null
  group by 1;

comment on view runlift.persoane is
  'Identitatea unei persoane peste ediții, dedusă din înscrieri. '
  'REGULA: cheia e emailul normalizat (lower+trim); când lipsește, ultimele 8 cifre '
  'ale telefonului, prefixate cu „tel:". '
  'GREȘEȘTE ÎN DOUĂ FELURI, amândouă cunoscute și acceptate la scara asta (30 de '
  'locuri pe ediție, corectabil manual): (1) doi frați care folosesc un singur email '
  'devin o singură persoană; (2) cine își schimbă emailul între ediții devine două '
  'persoane. A treia, mai rară: două numere din țări diferite care se termină în '
  'aceleași 8 cifre s-ar uni — dar numai dacă amândouă înscrierile n-au email deloc. '
  'Dacă regula se dovedește greșită, se rescrie vederea; nu există date de migrat.';

/**
 * Citirea, prin RPC ca tot restul.
 *
 * Tabelele au RLS fără politici, deci cheia publică singură nu poate citi
 * nimic; `security definer` plus verificarea tokenului e tiparul fiecărui
 * `admin_*` din proiect.
 */
create or replace function runlift.admin_list_persoane(p_token uuid)
returns table (
  cheie text, nume text, email text, telefon text,
  inscrieri int, participari int,
  editii_inscris smallint[], editii_prezent smallint[],
  prima_inscriere timestamptz, ultima_inscriere timestamptz
)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select p.cheie, p.nume, p.email, p.telefon,
           p.inscrieri, p.participari,
           p.editii_inscris, p.editii_prezent,
           p.prima_inscriere, p.ultima_inscriere
      from persoane p
     -- Cei mai fideli primii: ăsta e răspunsul la „cine merită salutat pe nume".
     order by p.inscrieri desc, p.ultima_inscriere desc;
end;
$function$;

grant execute on function runlift.admin_list_persoane(uuid)
  to anon, authenticated, service_role;

commit;

-- --- VERIFICARE, pe datele reale ---
-- select cheie, nume, inscrieri, participari, editii_inscris
--   from runlift.persoane order by inscrieri desc limit 20;
--
-- Câți oameni distincți au trecut prin toate edițiile, față de câte înscrieri:
-- select (select count(*) from runlift.persoane) as persoane,
--        (select count(*) from runlift.registrations where deleted_at is null) as inscrieri;
--
-- Cheia unifică formele telefonului:
-- select runlift.cheie_persoana(null, '+373 60 000 000'),
--        runlift.cheie_persoana(null, '060000000'),
--        runlift.cheie_persoana(null, '60000000');   -- toate trei: tel:60000000

-- Anunțul de ediție nouă către toți participanții de până acum.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Trei piese, într-o tranzacție:
--   1. `unsubscribe()` se aplică PERSOANEI, nu rândului.
--   2. `anunt_recipients()` — cine primește anunțul, rezolvat pe server.
--   3. Șablonul implicit `bulk_participant_anunt`.
--
-- Context, verificat pe 17 septembrie 2026: 151 de înscrieri pe șase ediții, dar
-- doar 69 de oameni — 35 de adrese apar la mai mult de o ediție. Un anunț „către
-- toți" construit pe rânduri ar ajunge la jumătate din public de două până la
-- șase ori.
--
-- Plan: docs/plans/2026-09-17-1517-feat-anunt-catre-toti-participantii-plan.md

begin;

-- 1. Dezabonarea pe persoană.
--
-- Înainte: `update registrations set dezabonat_la = now() where token_unsub = p_token`
-- — adică exact rândul din care a venit emailul. Un om cu trei înscrieri care
-- apăsa „Dezabonează-te" rămânea abonat pe celelalte două, iar un anunț către
-- toți participanții de până acum l-ar fi găsit exact pe acolo.
--
-- Acum tokenul identifică o ADRESĂ, iar dezabonarea se scrie pe toate rândurile
-- ei, în ambele tabele. Semnătura și valorile întoarse rămân aceleași
-- (`dezabonat` / `deja_dezabonat` / `invalid`), deci pagina `/unsubscribe` și
-- funcția Edge `unsubscribe` nu se schimbă. `create or replace` păstrează
-- drepturile existente.
--
-- Nu atinge rândurile create DUPĂ dezabonare: cine se reînscrie la o ediție
-- viitoare primește confirmarea și reminderele acelei ediții. Anunțurile însă
-- rămân oprite pentru el — vezi filtrul din `anunt_recipients`.

create or replace function runlift.unsubscribe(p_token uuid)
returns text
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_email text;
  v_reg int;
  v_lans int;
begin
  select lower(btrim(email)) into v_email
    from registrations where token_unsub = p_token limit 1;
  if v_email is null then
    select lower(btrim(email)) into v_email
      from launch_notifications where token_unsub = p_token limit 1;
  end if;
  if v_email is null then return 'invalid'; end if;

  update registrations set dezabonat_la = now()
   where lower(btrim(email)) = v_email and dezabonat_la is null;
  get diagnostics v_reg = row_count;

  update launch_notifications set dezabonat_la = now()
   where lower(btrim(email)) = v_email and dezabonat_la is null;
  get diagnostics v_lans = row_count;

  if v_reg + v_lans > 0 then return 'dezabonat'; end if;
  return 'deja_dezabonat';
end;
$function$;

-- 2. Audiența anunțului.
--
-- Pe SERVER, nu în client: lista poartă tokenurile de dezabonare ale tuturor
-- edițiilor, iar clientul n-are nevoie de ele — are nevoie doar să vadă cine
-- primește. De aceea funcția nu e apelabilă din PostgREST cu cheia publică; o
-- cheamă doar `send-email`, cu cheia de service.
--
-- Regulile, în ordinea în care scot oameni din listă:
--   • rândurile șterse de admin NU contribuie — dar cele eliberate de participant
--     (`renuntat_la`) DA: cine și-a eliberat locul rămâne un om care a vrut să vină;
--   • o adresă e o persoană (`lower(btrim(email))`);
--   • dezabonat pe ORICE rând, în oricare tabel → exclus. Plasă pentru
--     dezabonările făcute înainte ca `unsubscribe()` să propage pe persoană;
--   • înscris deja la ediția curentă → exclus: nu are nevoie de „s-au deschis
--     înscrierile";
--   • `p_exclude` — adresele debifate de operator. Pot doar SCOATE oameni,
--     niciodată adăuga: un client stricat nu poate trimite cuiva din afara audienței.
--
-- Numele și tokenul vin de pe rândul CEL MAI RECENT al persoanei: numele e cel pe
-- care l-ar recunoaște azi, iar orice token al ei duce, prin `unsubscribe()` de
-- mai sus, la aceeași dezabonare completă.

create or replace function runlift.anunt_recipients(p_exclude text[] default '{}')
returns table (email text, nume text, token_unsub uuid, ultima_editie smallint)
language sql
stable
security definer
set search_path to ''
as $function$
  with randuri as (
    select lower(btrim(r.email)) as cheie, r.email, r.nume, r.token_unsub, r.editie, r.created_at
      from runlift.registrations r
     where (r.deleted_at is null or r.renuntat_la is not null)
       and nullif(btrim(r.email), '') is not null
  ),
  exclusi as (
    select lower(btrim(x.email)) as cheie
      from runlift.registrations x where x.dezabonat_la is not null
    union
    select lower(btrim(l.email))
      from runlift.launch_notifications l where l.dezabonat_la is not null
    union
    select lower(btrim(c.email))
      from runlift.registrations c
     where c.editie = runlift.current_event_edition() and c.deleted_at is null
    union
    select lower(btrim(e)) from unnest(coalesce(p_exclude, '{}'::text[])) as e
  ),
  ultimele as (
    select distinct on (cheie) cheie, email, nume, token_unsub
      from randuri
     order by cheie, created_at desc
  )
  select u.email,
         u.nume,
         u.token_unsub,
         (select max(r2.editie) from randuri r2 where r2.cheie = u.cheie)::smallint
    from ultimele u
   -- `not exists`, nu `not in`: un NULL în lista de excluderi ar face `not in`
   -- să întoarcă zero rânduri, tăcut.
   where not exists (select 1 from exclusi x where x.cheie = u.cheie)
   order by u.nume;
$function$;

revoke execute on function runlift.anunt_recipients(text[]) from public, anon, authenticated;
grant execute on function runlift.anunt_recipients(text[]) to service_role;

-- 3. Șablonul implicit.
--
-- Spune DE CE primește omul emailul. Un anunț către cineva care n-a cerut
-- anunțuri, fără motiv, arată a spam — pentru el și pentru filtrul lui.
-- `{link_renunt}` lipsește deliberat: nimeni din audiență n-are loc la ediția
-- anunțată. Linkul de dezabonare îl adaugă funcția Edge, nu textul.
--
-- `on conflict do nothing`: textul e un punct de plecare; după prima editare din
-- /admin → „Șabloane", sursa de adevăr e DB-ul.

insert into runlift.email_templates (cheie, subiect, text_email)
values (
  'bulk_participant_anunt',
  'Ne vedem din nou? {numele_cursei}, {data_scurta}',
  E'Salut, {prenume}!\n'
  '\n'
  'Îți scriem pentru că ai alergat cu noi la o ediție Run + Lift.\n'
  '\n'
  'Am deschis înscrierile pentru {numele_cursei}: {data_cursei}, ora {ora_start}, la {locul}.\n'
  '\n'
  'Locurile sunt limitate și se ocupă în ordinea înscrierii:\n'
  'https://parktraining.fit/inscriere\n'
  '\n'
  'Echipa Run + Lift'
)
on conflict (cheie) do nothing;

commit;

-- --- VERIFICARE, după aplicare ---
--
-- Numărul de destinatari, față de o interogare de control fără funcție
-- (pe 17 septembrie 2026, cu ediția curentă 7 și un înscris: 68):
--   select count(*) from runlift.anunt_recipients();
--
-- Nimeni de două ori:
--   select lower(email), count(*) from runlift.anunt_recipients() group by 1 having count(*) > 1;
--   -- așteptat: zero rânduri
--
-- Nu e apelabilă cu cheia publică:
--   set role anon; select * from runlift.anunt_recipients(); reset role;
--   -- așteptat: ERROR: permission denied for function anunt_recipients
--
-- Dezabonarea pe persoană — pe o adresă de TEST cu două înscrieri:
--   select runlift.unsubscribe('<token_unsub al unui rând>');       -- 'dezabonat'
--   select count(*) filter (where dezabonat_la is null)
--     from runlift.registrations where lower(btrim(email)) = '<adresa>';  -- 0
--   select runlift.unsubscribe('<același token>');                  -- 'deja_dezabonat'

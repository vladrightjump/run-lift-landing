-- Anomaliile de flux ajung la operator, fără să treacă printr-un login.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Context: `IDEI.md` pornește de la faptul că `monitoring.ts` prinde erorile de
-- client și violările de CSP și le scrie în consola vizitatorului. Corect ca
-- observație, greșit ca punct de plecare: cele trei anomalii pe care le numește
-- — confirmare eșuată, promovare de pe listă, locuri epuizate — sunt evenimente
-- de SERVER, deja înregistrate în `email_log` și în triggerul de auto-promovare.
-- Un client care poate cere trimiterea unui email e un releu de spam deschis
-- către oricine deschide pagina. Escaladarea se declanșează de acolo de unde se
-- produce anomalia.
--
-- `monitoring.ts` rămâne NEATINS: erorile de JS și violările de CSP rămân în
-- consolă. Erorile de client vin și de la extensii de browser și de la roboți;
-- fără filtrare l-ai antrena pe operator să ignore exact canalul construit.
--
-- Garda de deduplicare e obligatorie, nu opțională. Fără ea, o funcție care
-- eșuează în buclă trimite un email la fiecare încercare — iar pragul de
-- escaladare e singurul lucru care decide valoarea ideii.
--
-- Migrarea e re-rulabilă (idempotentă): proiectul nu are branch de staging.

begin;

-- ---------------------------------------------------------------------------
-- 0. Precondiție: `supabase-migration-undo-waitlist.sql` a rulat deja.
--
--    `auto_promote_from_waitlist()` se rescrie mai jos citind
--    `event_waitlist.deleted_at`, coloană adăugată de acea migrare. Postgres NU
--    verifică corpul unei funcții plpgsql la `create or replace`, deci în
--    ordine greșită migrarea ar TRECE fără nicio eroare, iar coloana lipsă ar
--    exploda abia la prima ștergere logică reală — în aceeași tranzacție cu
--    renunțarea unui participant, adică picând chiar acțiunea lui.
--
--    O eroare zgomotoasă acum, la aplicare, în locul uneia deferate și
--    decuplate de cauză.
-- ---------------------------------------------------------------------------
do $precond$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'runlift' and table_name = 'event_waitlist'
       and column_name = 'deleted_at'
  ) then
    raise exception 'aplică întâi supabase-migration-undo-waitlist.sql (lipsește runlift.event_waitlist.deleted_at)';
  end if;
end;
$precond$;

-- ---------------------------------------------------------------------------
-- 1. Unde ajunge escaladarea.
--
--    Cheia se scrie manual, o dată; până atunci `escaladeaza()` nu face nimic
--    și n-o semnalează nicăieri. Deliberat: o migrare care ar inventa o adresă
--    ar trimite alerte către nimeni, cu aerul că sistemul e armat.
--
--        insert into runlift.app_config (key, value)
--        values ('operator_email', 'adresa@exemplu.ro')
--        on conflict (key) do update set value = excluded.value;
-- ---------------------------------------------------------------------------
create or replace function runlift.operator_email()
returns text
language sql
stable
set search_path to ''
as $function$
  select nullif(trim(value), '') from runlift.app_config where key = 'operator_email';
$function$;

-- ---------------------------------------------------------------------------
-- 2. Escaladarea propriu-zisă — o singură cale, pentru toate anomaliile.
--
--    `p_cheie` e ce face garda: (ediție, tip, subiect). Aceeași confirmare
--    eșuată de zece ori produce UN email; o eșuare pentru altă adresă produce
--    unul nou. Refolosește `broadcast_once`, primitiva atomică deja folosită de
--    reminderul programat — nu inventăm un al doilea mecanism de idempotență.
--
--    Best-effort din construcție: fluxul care a declanșat anomalia nu are voie
--    să cadă pentru că n-a plecat un email despre ea. Un `raise` de aici ar
--    anula o promovare reușită din cauza unei alerte eșuate.
--
--    De aceea ÎNTREGUL corp stă într-un bloc cu `exception`, nu doar apelul
--    HTTP. Ambele apelante sunt triggere — `perform escaladeaza(...)` fără bloc
--    propriu — deci orice eroare ridicată de citirea configului, de garda de
--    unicitate sau de jurnalul de audit ar urca prin trigger și ar anula
--    tranzacția declanșatoare: o înscriere reală respinsă fiindcă n-a mers
--    alerta despre ea, sau o promovare deja aplicată desfăcută. Canalul lateral
--    de alertare nu are voie să fie un punct de eșec pentru fluxul principal.
--
--    Ordinea gărzilor contează la fel de mult. Secretul se citește ÎNAINTE de
--    `broadcast_once`: cheia de unicitate se consumă la apel, nu la trimitere,
--    deci o gardă de după ea ar arde cheia fără să trimită, iar aceeași anomalie
--    n-ar mai putea escalada niciodată — nici după ce secretul e configurat.
-- ---------------------------------------------------------------------------
create or replace function runlift.escaladeaza(
  p_tip text, p_cheie text, p_subiect text, p_detaliu text, p_editie smallint default null
)
returns boolean
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_ed     smallint;
  v_catre  text;
  v_secret text;
begin
  v_ed    := coalesce(p_editie, current_event_edition());
  v_catre := operator_email();
  if v_catre is null then return false; end if;

  select broadcast_secret() into v_secret;
  if v_secret is null then return false; end if;

  if not broadcast_once('alert_ed' || v_ed || '_' || p_tip || '_' || p_cheie) then
    return false;
  end if;

  -- Jurnalul de audit primește rândul chiar dacă emailul pică: „am escaladat"
  -- e o informație despre sistem, nu despre provider.
  insert into admin_events (tip, detaliu)
  values ('escaladare', jsonb_build_object(
    'tip', p_tip, 'cheie', p_cheie, 'subiect', p_subiect, 'editie', v_ed));

  perform net.http_post(
    url := 'https://whyndrjcezmtajbykeil.supabase.co/functions/v1/send-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh',
      'x-broadcast-secret', v_secret
    ),
    body := jsonb_build_object(
      'mode', 'alert', 'subject', p_subiect, 'text', p_detaliu, 'editie', v_ed
    )
  );

  return true;
exception when others then
  -- Orice a eșuat aici — config, gardă, jurnal, HTTP — rămâne aici.
  return false;
end;
$function$;

-- Server-only, ca `maybe_send_reminder`. Un client care poate cere trimiterea
-- unui email e un releu de spam deschis către oricine deschide pagina.
revoke execute on function runlift.escaladeaza(text, text, text, text, smallint)
  from public, anon, authenticated;
-- Funcția Edge o cheamă cu service_role, pentru anomalia care se produce chiar
-- în ea (o confirmare care nu pleacă). Grantul e explicit tocmai pentru că
-- `revoke ... from public` de mai sus i-ar fi luat-o odată cu restul.
grant execute on function runlift.escaladeaza(text, text, text, text, smallint) to service_role;
-- Aceeași revocare și pentru citirea adresei. Supabase acordă `execute` DIRECT
-- lui anon/authenticated la fiecare funcție nouă (vezi nota din
-- `supabase-migration-reminder-idempotent.sql`), deci fără linia asta oricine
-- ar putea citi adresa operatorului cu cheia publicabilă — exact contactul pe
-- care restul funcției e construită să nu-l expună.
revoke execute on function runlift.operator_email() from public, anon, authenticated;
grant execute on function runlift.operator_email() to service_role;

-- ---------------------------------------------------------------------------
-- 3. Anomalia 1 — promovarea automată de pe lista de așteptare.
--
--    Promovarea trimite emailul „best-effort" prin `pg_net`, iar un eșec NU
--    blochează ștergerea din listă. Deci cineva poate fi promovat în tăcere:
--    are loc, dar nu știe, și nimeni nu află fără să deschidă backoffice-ul.
--
--    Escaladarea pleacă din trigger, într-un apel PROPRIU — nu din modul
--    `promoted` al funcției Edge. Dacă apelul care duce emailul către persoană
--    pică, exact atunci contează cel mai mult ca operatorul să afle; o
--    escaladare atârnată de același apel ar tăcea fix în cazul pe care există
--    ca să-l prindă.
--
--    Restul funcției e neschimbat față de `supabase-migration-undo-waitlist.sql`
--    (inclusiv `deleted_at is null` pe selectul din listă) — se rescrie întreagă
--    pentru că `create or replace` nu petice.
-- ---------------------------------------------------------------------------
create or replace function runlift.auto_promote_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_cap int;
  v_w   runlift.event_waitlist;
  v_id  uuid;
begin
  if old.editie <> current_event_edition() then
    return new;
  end if;

  perform set_config('runlift.guard_bypass', '1', true);

  select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
    into v_cap;

  loop
    if (select count(*) from registrations
         where editie = old.editie and deleted_at is null) >= v_cap then
      exit;
    end if;

    select * into v_w
      from event_waitlist
     where editie = old.editie and deleted_at is null
     order by created_at asc
     for update skip locked
     limit 1;
    if v_w.id is null then
      exit;
    end if;

    insert into registrations (nume, telefon, email, data_nasterii, acord, editie)
    values (trim(v_w.nume), trim(v_w.telefon), lower(trim(v_w.email)),
            v_w.data_nasterii, true, v_w.editie)
    on conflict (lower(email), editie) where deleted_at is null do nothing
    returning id into v_id;

    delete from event_waitlist where id = v_w.id;

    if v_id is not null then
      insert into admin_events (tip, detaliu)
      values ('auto_promote', jsonb_build_object(
        'nume', v_w.nume, 'email', lower(trim(v_w.email)), 'editie', v_w.editie));
      begin
        perform net.http_post(
          url := 'https://whyndrjcezmtajbykeil.supabase.co/functions/v1/send-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh'
          ),
          body := jsonb_build_object('mode', 'promoted', 'id', v_id::text)
        );
      exception when others then
        null;
      end;

      perform escaladeaza(
        'promovare',
        lower(trim(v_w.email)),
        'Promovare automată de pe lista de așteptare',
        v_w.nume || ' (' || lower(trim(v_w.email)) || ') a urcat de pe lista de așteptare pe '
          || 'lista de participanți, la ediția ' || v_w.editie || '. '
          || 'Emailul către persoană a plecat best-effort — verifică în /admin → Livrare că a ajuns.',
        v_w.editie
      );
      exit;
    end if;
  end loop;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Anomalia 2 — locurile s-au epuizat.
--
--    Pragul ales dintre cele două posibile (momentul umplerii vs. prima intrare
--    pe lista de așteptare): momentul UMPLERII. E momentul în care operatorul
--    mai poate face ceva — să deschidă locuri în plus — și cade înainte ca
--    cineva să fie întors de la înscriere. Prima intrare pe listă e deja
--    consecința, nu ocazia.
--
--    `>=`, nu `=`: adăugările din admin pot trece peste capacitate cu derogare
--    explicită, iar o egalitate ratată ar face pragul să nu se atingă niciodată.
--    Garda de unicitate din `escaladeaza` face restul.
-- ---------------------------------------------------------------------------
create or replace function runlift.semnaleaza_locuri_epuizate()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_cap int; v_count int;
begin
  if new.editie <> current_event_edition() then return new; end if;

  select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
    into v_cap;
  select count(*) into v_count
    from registrations where editie = new.editie and deleted_at is null;
  if v_count < v_cap then return new; end if;

  perform escaladeaza(
    'locuri_epuizate',
    'editie',
    'Locurile s-au epuizat',
    'Ediția ' || new.editie || ' și-a ocupat toate cele ' || v_cap || ' locuri. '
      || 'De aici încolo înscrierile intră pe lista de așteptare. '
      || 'Dacă vrei mai multe locuri, schimbă capacitatea în /admin → Eveniment și publică.',
    new.editie
  );
  return new;
end;
$function$;

drop trigger if exists registrations_locuri_epuizate_trg on runlift.registrations;
create trigger registrations_locuri_epuizate_trg
  after insert on runlift.registrations
  for each row
  execute function runlift.semnaleaza_locuri_epuizate();

commit;

-- Prezența, numărul și timpul final pe `runlift.registrations`.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Context: singurele date care traversează edițiile azi sunt AGREGATE —
-- numărători, niciodată persoane. `AdminRegistration` n-are niciun câmp de
-- prezență, iar exportul CSV e `Nr, Nume, Telefon, Email, Data înscrierii`.
-- Patru elemente din `BACKLOG.md` sunt blocate pe exact coloanele astea.
--
-- Toate trei sunt NULE până la completare, deliberat. O coloană
-- `prezent boolean not null default false` ar afirma ABSENȚA fiecărui înscris
-- din clipa înscrierii, cu săptămâni înainte de cursă — adică ar înlocui „nu
-- știm" cu „n-a venit". Distincția e tot rostul coloanei.
--
-- ⚠️ ATENȚIE — `registrations_backup_sync()` enumeră coloanele PE NUME, în toate
-- cele trei ramuri (INSERT / UPDATE / DELETE). O coloană adăugată la
-- `registrations` fără să fie adăugată și acolo rămâne în afara backupului,
-- TĂCUT, și se pierde la primul ciclu ștergere/undo. De aceea trigger-ul e
-- rescris mai jos în întregime, nu petecit.
--
-- Notă despre ce NU repară migrarea asta: `registrations_backup` n-are nici azi
-- `token_unsub`, `token_renunt`, `dezabonat_la` sau `renuntat_la`. Backupul e
-- deci parțial și dinainte — un rând readus prin undo își pierde tokenurile.
-- Nu e regresie introdusă aici și nu e în scopul unității; e scris ca să nu fie
-- redescoperit ca surpriză.

begin;

-- 1. Coloanele, pe tabelul viu ȘI pe backup.

alter table runlift.registrations
  add column if not exists prezent    boolean,
  add column if not exists numar      smallint,
  add column if not exists timp_final interval;

alter table runlift.registrations_backup
  add column if not exists prezent    boolean,
  add column if not exists numar      smallint,
  add column if not exists timp_final interval;

comment on column runlift.registrations.prezent is
  'A venit la cursă. NULL = încă nu se știe (implicit până la check-in), '
  'false = s-a constatat că n-a venit. Diferența contează: „nu știm" nu e „n-a venit".';
comment on column runlift.registrations.numar is
  'Numărul de concurs. Unic pe ediție între rândurile vii — vezi indexul parțial.';
comment on column runlift.registrations.timp_final is
  'Timpul final, ca interval. NULL până la completare.';

-- Numărul de concurs e unic pe ediție. Două persoane cu același număr e o
-- eroare de operare care se descoperă la premiere, nu la introducere.
-- Parțial pe două condiții: rândurile fără număr nu se ciocnesc între ele, iar
-- un rând șters logic nu mai blochează numărul pentru cine îl primește după.
create unique index if not exists registrations_numar_unic_pe_editie
  on runlift.registrations (editie, numar)
  where numar is not null and deleted_at is null;

-- 2. Trigger-ul de backup, rescris cu cele trei coloane în TOATE ramurile.

create or replace function runlift.registrations_backup_sync()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if tg_op = 'INSERT' then
    insert into registrations_backup (
      id, created_at, nume, telefon, email, echipa, acord, editie, data_nasterii,
      prezent, numar, timp_final
    )
    values (
      new.id, new.created_at, new.nume, new.telefon, new.email, new.echipa,
      new.acord, new.editie, new.data_nasterii,
      new.prezent, new.numar, new.timp_final
    )
    on conflict (id) do update
      set nume = excluded.nume, telefon = excluded.telefon, email = excluded.email,
          echipa = excluded.echipa, acord = excluded.acord, editie = excluded.editie,
          data_nasterii = excluded.data_nasterii,
          prezent = excluded.prezent, numar = excluded.numar,
          timp_final = excluded.timp_final,
          backed_up_at = now(), deleted_at = null;
    return new;
  elsif tg_op = 'UPDATE' then
    update registrations_backup
      set created_at = new.created_at, nume = new.nume, telefon = new.telefon,
          email = new.email, echipa = new.echipa, acord = new.acord, editie = new.editie,
          data_nasterii = new.data_nasterii,
          prezent = new.prezent, numar = new.numar, timp_final = new.timp_final,
          backed_up_at = now(),
          deleted_at = new.deleted_at
      where id = new.id;
    return new;
  elsif tg_op = 'DELETE' then
    update registrations_backup set deleted_at = now() where id = old.id;
    return old;
  end if;
  return null;
end;
$function$;

-- 3. Listarea întoarce cele trei câmpuri noi.
--
-- `drop` + `create`, nu `create or replace`: se schimbă tipul returnat, iar
-- Postgres refuză înlocuirea unei funcții cu altă semnătură de ieșire. Atomic
-- în tranzacția asta, deci nu există clipă în care RPC-ul lipsește. Drepturile
-- se pierd la drop și se redau explicit mai jos.

drop function if exists runlift.admin_list_registrations(uuid, integer);

create function runlift.admin_list_registrations(
  p_token uuid,
  p_editie integer default null
)
returns table (
  id uuid, created_at timestamptz, nume text, telefon text, email text,
  echipa text, editie smallint, dezabonat_la timestamptz, token_renunt uuid,
  prezent boolean, numar smallint, timp_final text
)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_ed smallint := coalesce(p_editie::smallint, current_event_edition());
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select r.id, r.created_at, r.nume, r.telefon, r.email, r.echipa, r.editie,
           r.dezabonat_la, r.token_renunt,
           r.prezent, r.numar,
           -- Ca text, nu ca `interval`: serializarea unui interval prin
           -- PostgREST depinde de `intervalstyle` al conexiunii, deci clientul
           -- ar primi când „00:32:15", când „32 mins 15 secs". Un `::text` aici
           -- fixează forma la HH:MM:SS și mută formatarea unde se vede.
           case when r.timp_final is null then null else r.timp_final::text end
    from registrations r
    where r.editie = v_ed and r.deleted_at is null
    order by r.created_at asc;
end;
$function$;

grant execute on function runlift.admin_list_registrations(uuid, integer)
  to anon, authenticated, service_role;

-- 4. Scrierea celor trei câmpuri, pe un rând.
--
-- Semantica e „scrie starea de prezență a rândului", nu „actualizează ce ți-am
-- dat": toate trei se scriu exact cum vin, iar `null` ȘTERGE. Alternativa —
-- `null` înseamnă „lasă neatins" — ar face imposibilă corectarea unei greșeli
-- (un număr pus din greșeală n-ar mai putea fi scos). Clientul trimite mereu
-- tripleta întreagă, din formular.
--
-- `p_timp_final` e text, nu interval: validarea unui text liber se face aici,
-- cu un mesaj pe care clientul îl poate traduce, în loc să lase PostgREST să
-- întoarcă o eroare de cast pe care n-o înțelege nimeni.

create or replace function runlift.admin_set_prezenta(
  p_token uuid,
  p_id uuid,
  p_prezent boolean,
  p_numar smallint,
  p_timp_final text
)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_interval interval;
  v_ed smallint;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select editie into v_ed
    from registrations where id = p_id and deleted_at is null;
  if v_ed is null then raise exception 'not_found'; end if;

  if p_timp_final is not null and btrim(p_timp_final) <> '' then
    begin
      v_interval := p_timp_final::interval;
    exception when others then
      raise exception 'timp_invalid';
    end;
    if v_interval < interval '0' then raise exception 'timp_invalid'; end if;
  else
    v_interval := null;
  end if;

  if p_numar is not null and p_numar <= 0 then
    raise exception 'numar_invalid';
  end if;

  begin
    update registrations
       set prezent = p_prezent, numar = p_numar, timp_final = v_interval
     where id = p_id;
  exception when unique_violation then
    raise exception 'numar_duplicat';
  end;

  insert into admin_events (tip, detaliu)
  values ('admin_prezenta', jsonb_build_object(
    'id', p_id, 'editie', v_ed, 'prezent', p_prezent,
    'numar', p_numar, 'timp_final', p_timp_final));
end;
$function$;

grant execute on function runlift.admin_set_prezenta(uuid, uuid, boolean, smallint, text)
  to anon, authenticated, service_role;

commit;

-- --- VERIFICARE ---
-- Coloanele există pe AMBELE tabele:
-- select table_name, column_name from information_schema.columns
--  where table_schema='runlift' and column_name in ('prezent','numar','timp_final')
--  order by table_name, column_name;   -- așteptat: 6 rânduri
--
-- Trigger-ul le duce mai departe (ciclul care prinde omiterea din KTD5):
-- select runlift.admin_set_prezenta('<token>', '<id>', true, 12::smallint, '00:32:15');
-- select prezent, numar, timp_final from runlift.registrations_backup where id = '<id>';
--
-- Numărul e unic pe ediție:
-- select runlift.admin_set_prezenta('<token>', '<alt-id>', true, 12::smallint, null);
--   -- așteptat: ERROR: numar_duplicat

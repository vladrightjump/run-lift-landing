-- Rejucarea unei trimiteri eșuate prin FLUXUL ei, nu printr-o retrimitere oarbă.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Context: `AdminDeliveryTab` restrânge azi reîncercarea la modul `admin`, cu
-- patru motive scrise în cod (`:87-99`). Motivele sunt CORECTE și rămân valide:
--   • `broadcast` — textul din jurnal e salvat ÎNAINTE ca funcția Edge să adauge
--     linkul de dezabonare, iar modul `admin` nu-l adaugă deloc; în plus s-ar
--     sări peste filtrul `dezabonat_la is null`, deci ar pleca email și către
--     cine s-a dezabonat între timp;
--   • `info` — s-ar sări peste cooldown-ul de 10 minute și peste
--     `mark_confirmation_sent`;
--   • `confirm`/`promoted` — se re-declanșează din fluxul lor.
--
-- Soluția nu e să contrazicem motivele, ci să nu mai reluăm TEXTUL din jurnal.
-- Rejucarea reconstruiește mesajul din ȘABLON și din starea de ACUM a
-- destinatarului: dacă s-a dezabonat între timp, nu mai e destinatar; dacă
-- înscrierea a fost ștearsă, n-are cui pleca. Jurnalul rămâne sursa pentru CE se
-- rejoacă (ce mod, ce șablon, cui), niciodată pentru ce conține emailul.
--
-- `info` rămâne exclus deliberat: cooldown-ul și `mark_confirmation_sent` fac din
-- rejucare o CERERE nouă, nu o reparație. Ecranul spune asta, în loc să ascundă
-- rândul.
--
-- Migrarea e re-rulabilă (idempotentă): proiectul nu are branch de staging.

begin;

-- ---------------------------------------------------------------------------
-- 1. Jurnalul trebuie să știe CE ȘABLON a plecat.
--
--    Fără coloana asta, rejucarea unui `broadcast` ar trebui să ghicească
--    șablonul din audiență — iar orarul de remindere are DOUĂ șabloane pentru
--    aceeași audiență (`bulk_participant_reminder` și `…_final`). Ghicitul ar
--    retrimite tăcut alt text decât cel eșuat: exact clasa de defect pe care
--    tabul „Livrare" există ca s-o facă vizibilă.
--
--    Rândurile vechi rămân cu `null` — pentru ele rejucarea de broadcast nu e
--    disponibilă, și ecranul spune de ce. Mai bine indisponibil decât greșit.
-- ---------------------------------------------------------------------------
alter table runlift.email_log
  add column if not exists sablon text;

comment on column runlift.email_log.sablon is
  'Cheia din email_templates cu care s-a randat mesajul. Null pe rândurile de dinainte de runlift_rejucare — acolo rejucarea de broadcast nu e disponibilă.';

-- Scrierea în lot preia și șablonul, când apelantul îl trimite.
create or replace function runlift.log_emails(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_n int;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then return 0; end if;

  with intrari as (
    select
      nullif(trim(x->>'email'), '')                    as email,
      coalesce(x->>'nume', '')                         as nume,
      coalesce(x->>'subiect', '')                      as subiect,
      coalesce(x->>'text_email', '')                   as text_email,
      coalesce(x->>'mod', 'admin')                     as mod,
      coalesce(x->>'audienta', '')                     as audienta,
      nullif(trim(x->>'sablon'), '')                   as sablon,
      case when (x->>'ok')::boolean then 'trimis' else 'esuat' end as status,
      (x->>'provider_status')::int                     as provider_status,
      left(nullif(x->>'eroare', ''), 500)              as eroare,
      coalesce((x->>'editie')::smallint, current_event_edition()) as editie
    from jsonb_array_elements(p_rows) as x
  )
  insert into email_log (email, nume, subiect, text_email, mod, audienta, sablon, status, provider_status, eroare, editie)
  select lower(email), nume, subiect, text_email, mod, audienta, sablon, status, provider_status, eroare, editie
  from intrari where email is not null;

  get diagnostics v_n = row_count;
  return v_n;
end;
$function$;

-- Cititorul din backoffice duce coloana mai departe, ca ecranul să poată spune
-- de ce un rând vechi nu se poate rejuca.
drop function if exists runlift.admin_list_email_log(uuid, int, int, boolean);
create or replace function runlift.admin_list_email_log(
  p_token uuid, p_editie int default null, p_limit int default 500,
  p_cu_text boolean default true
)
returns table(
  id uuid, created_at timestamptz, email text, nume text, subiect text,
  text_email text, mod text, audienta text, sablon text, status text,
  provider_status int, eroare text, editie smallint
)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_ed    smallint := coalesce(p_editie::smallint, current_event_edition());
  v_limit int      := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select e.id, e.created_at, e.email, e.nume, e.subiect,
           case when coalesce(p_cu_text, true) then e.text_email else '' end,
           e.mod, e.audienta, e.sablon, e.status, e.provider_status, e.eroare, e.editie
    from email_log e where e.editie = v_ed
    order by e.created_at desc
    limit v_limit;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Ce se poate rejuca, și cu ce.
--
--    Funcția răspunde la o singură întrebare: „pentru rândul ăsta de jurnal, ce
--    mod, ce șablon și ce destinatar — SAU de ce nu se poate?". Nu trimite
--    nimic; decizia stă aici, ca ecranul și funcția Edge să dea același verdict
--    fără să-l calculeze fiecare pe cont propriu.
--
--    Destinatarul se rezolvă din starea de ACUM, nu din jurnal: potrivirea se
--    face pe `lower(email)` + `editie`, coloane care au deja index. Un rând
--    pentru cineva șters, dezabonat sau care nu mai e pe listă întoarce refuz cu
--    motiv, nu un destinatar învechit.
-- ---------------------------------------------------------------------------
create or replace function runlift.admin_replay_lookup(p_token uuid, p_log_id uuid)
returns table(
  ok boolean, motiv text, mod text, sablon text, audienta text,
  email text, nume text, token_renunt uuid, token_unsub uuid, editie smallint
)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_log    runlift.email_log;
  v_sablon text;
  v_r      runlift.registrations;
  v_email  text;
  v_nume   text;
  v_unsub  uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select * into v_log from email_log where id = p_log_id;
  if v_log.id is null then
    return query select false, 'jurnal_lipsa', null::text, null::text, null::text,
                        null::text, null::text, null::uuid, null::uuid, null::smallint;
    return;
  end if;

  -- Modul de la care rejucarea n-ar fi o reparație, ci o cerere nouă.
  if v_log.mod not in ('confirm', 'promoted', 'broadcast') then
    return query select false, 'mod_exclus', v_log.mod, null::text, v_log.audienta,
                        v_log.email, v_log.nume, null::uuid, null::uuid, v_log.editie;
    return;
  end if;

  -- Șablonul: fix pentru cele două moduri automate, înregistrat pentru broadcast.
  v_sablon := case v_log.mod
    when 'confirm'  then 'bulk_participant_confirmare'
    when 'promoted' then 'bulk_waitlist_promovare'
    else v_log.sablon
  end;
  if v_sablon is null then
    return query select false, 'sablon_necunoscut', v_log.mod, null::text, v_log.audienta,
                        v_log.email, v_log.nume, null::uuid, null::uuid, v_log.editie;
    return;
  end if;

  -- Audiența „asteptare" a unei difuzări NU e `event_waitlist`.
  --
  -- `waitlist_recipients()` — funcția din care își ia destinatarii modul
  -- `broadcast` cu `audience = 'asteptare'` — citește `launch_notifications`
  -- (confirmați, nedezabonați): lista de lansare, nu lista de așteptare a
  -- ediției. Sunt două tabele cu populații diferite, iar căutarea în cel greșit
  -- ar refuza fiecare rejucare cu „destinatarul lipsește" despre cineva intact,
  -- și — la o adresă aflată din întâmplare în amândouă — ar trece peste
  -- filtrele de confirmare și dezabonare și ar trimite fără linkul de
  -- dezabonare, fiindcă tokenul ar rămâne null.
  --
  -- `token_renunt` rămâne null aici: cine e pe lista de lansare n-are un loc de
  -- eliberat, deci paragraful care poartă variabila cade — exact ca la
  -- difuzarea originală.
  if v_log.mod = 'broadcast' and v_log.audienta = 'asteptare' then
    select l.email,
           trim(coalesce(l.prenume, '') || ' ' || coalesce(l.nume, '')),
           l.token_unsub
      into v_email, v_nume, v_unsub
      from launch_notifications l
     where lower(l.email) = lower(v_log.email)
       and l.confirmat_la is not null
       and l.dezabonat_la is null
     limit 1;
    if v_email is null then
      return query select false, 'destinatar_lipsa', v_log.mod, v_sablon, v_log.audienta,
                          v_log.email, v_log.nume, null::uuid, null::uuid, v_log.editie;
      return;
    end if;
    return query select true, null::text, v_log.mod, v_sablon, v_log.audienta,
                        v_email, v_nume, null::uuid, v_unsub, v_log.editie;
    return;
  end if;

  select * into v_r
    from registrations r
   where r.editie = v_log.editie and lower(r.email) = lower(v_log.email)
     and r.deleted_at is null
   limit 1;
  if v_r.id is null then
    return query select false, 'destinatar_lipsa', v_log.mod, v_sablon, v_log.audienta,
                        v_log.email, v_log.nume, null::uuid, null::uuid, v_log.editie;
    return;
  end if;

  -- Filtrul de dezabonare al difuzării, aplicat la rejucare. Fără el, rejucarea
  -- ar face exact ce face azi retrimiterea oarbă prin modul `admin`: ar trimite
  -- către cine s-a dezabonat între timp.
  if v_log.mod = 'broadcast' and v_r.dezabonat_la is not null then
    return query select false, 'dezabonat', v_log.mod, v_sablon, v_log.audienta,
                        v_log.email, v_log.nume, null::uuid, null::uuid, v_log.editie;
    return;
  end if;

  return query select true, null::text, v_log.mod, v_sablon, v_log.audienta,
                      v_r.email, v_r.nume, v_r.token_renunt, v_r.token_unsub, v_r.editie;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Grants — cheia publicabilă rulează ca `anon`; autoritatea vine din tokenul
--    de sesiune, verificat în funcție. Funcția Edge o cheamă cu service_role.
-- ---------------------------------------------------------------------------
grant execute on function runlift.admin_replay_lookup(uuid, uuid) to anon, authenticated, service_role;
grant execute on function runlift.admin_list_email_log(uuid, int, int, boolean) to anon, authenticated, service_role;

commit;

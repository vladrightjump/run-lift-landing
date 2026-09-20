-- Programul antrenamentelor — de la „un singur antrenament" la Săptămâna 1…N.
--
-- Antrenamentul săptămânii exista deja, dar ca UN text care se suprascrie:
-- rândurile `superseded` erau undo pentru o greșeală, nu istoric. Cine voia
-- acum să înceapă să alerge n-avea de unde porni. Migrarea asta îi dă tabelului
-- o coloană de poziție (`numar`) și mută vizibilitatea de pe pagină pe fiecare
-- săptămână în parte.
--
-- Decizii și context: `docs/plans/2026-09-20-0838-feat-programul-antrenamentelor-pe-saptamani-plan.md`
-- (KTD1, KTD2, KTD3, KTD5, KTD6b, KTD10, KTD12).
--
-- PREMISĂ: tabelul era GOL în producție când s-a scris migrarea (verificat în
-- `ironworks-gym`, 20 septembrie 2026: 0 rânduri). De asta `numar int not null`
-- se poate adăuga fără `default` și fără backfill. Dacă între timp s-a scris
-- primul antrenament real, vezi pasul 2 — e un `update` în plus, nu alt plan.

-- ---------------------------------------------------------------------------
-- 0. TOT fișierul rulează într-o singură tranzacție
-- ---------------------------------------------------------------------------
--
-- Fără ea, ordinea din fișier e o capcană: secțiunea 1 șterge trei funcții VII,
-- iar secțiunea 2 face `add column … not null` fără `default` — exact
-- instrucțiunea care eșuează dacă tabelul nu mai e gol. Drop-urile s-ar fi comis
-- deja, iar rezultatul ar fi fost `/antrenament` și ecranul de admin fără nicio
-- funcție de chemat, până la o intervenție manuală.
--
-- Tot ce urmează e DDL tranzacțional în Postgres, deci `rollback` e complet.

begin;

-- Premisa care ține toată migrarea, verificată AICI, nu doar în proză: dacă
-- tabelul nu mai e gol, oprește-te zgomotos și atomic, în loc să lași
-- `add column … not null` să pice după ce funcțiile au dispărut.
do $$
begin
  if exists (select 1 from runlift.weekly_workout) then
    raise exception
      'weekly_workout nu mai e gol: foloseste calea de backfill din sectiunea 2 (coloana fara not null, update, apoi not null)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Apoi șterge funcțiile care NU pot fi înlocuite pe loc
-- ---------------------------------------------------------------------------
--
-- `create or replace` nu schimbă tipul de retur al unei funcții și nu
-- înlocuiește o funcție cu altă semnătură — o SUPRASOLICITĂ. Fără `drop`
-- explicit, `admin_save_weekly_workout` ar fi rămas în două variante, iar
-- PostgREST ar fi putut alege alta decât cea vrută.
--
-- `public_weekly_workout()` pleacă prima: corpul ei interoghează coloana
-- `activ`, pe care pasul 2 o redenumește.

drop function if exists runlift.public_weekly_workout();
drop function if exists runlift.admin_save_weekly_workout(uuid, text, text, boolean);
drop function if exists runlift.admin_list_weekly_workout(uuid);

-- ---------------------------------------------------------------------------
-- 2. Tabelul
-- ---------------------------------------------------------------------------

alter table runlift.weekly_workout
  add column if not exists numar int not null;
-- Dacă tabelul NU mai e gol la aplicare, adaugă coloana fără `not null`, rulează
--   update runlift.weekly_workout set numar = 1 where numar is null;
-- și abia apoi pune `not null`.

alter table runlift.weekly_workout rename column activ to vizibil;

comment on column runlift.weekly_workout.numar is
  'Poziția în program: 1…N, fără goluri. Poziție, nu identificator etern — mutarea și ștergerea renumerotează.';

-- Unicitatea trece de pe „un singur publicat în tot tabelul" pe „un singur
-- publicat per săptămână".
drop index if exists runlift.weekly_workout_un_singur_publicat;

create unique index if not exists weekly_workout_un_publicat_pe_numar
  on runlift.weekly_workout (numar) where status = 'published';

create index if not exists weekly_workout_program
  on runlift.weekly_workout (numar);

-- ---------------------------------------------------------------------------
-- 3. Salvarea
-- ---------------------------------------------------------------------------
--
-- `p_id` null = săptămână nouă, cu numărul următor pus automat. `p_id` dat =
-- editez săptămâna aceea, păstrându-i numărul. `p_id` e id-ul rândului PUBLICAT
-- al săptămânii, nu numărul ei: un număr trimis dintr-un ecran rămas în urmă
-- după o renumerotare ar fi lovit altă săptămână decât cea apăsată.

create or replace function runlift.admin_save_weekly_workout(
  p_token uuid,
  p_id uuid,
  p_titlu text,
  p_corp text,
  p_vizibil boolean
)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_numar int;
  v_titlu text;
  v_corp text;
  v_nou_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  -- `btrim` cu setul explicit, nu `trim`: `trim` scoate DOAR spații, iar un corp
  -- de forma "   \n  " ar fi trecut drept scris.
  if coalesce(p_vizibil, false)
     and char_length(btrim(coalesce(p_corp, ''), E' \t\r\n')) = 0
  then
    raise exception 'workout_empty';
  end if;

  if p_id is null then
    select coalesce(max(w.numar), 0) + 1 into v_numar from weekly_workout w;

    insert into weekly_workout (numar, status, titlu, corp, vizibil)
    values (v_numar, 'published', coalesce(p_titlu, ''), coalesce(p_corp, ''),
            coalesce(p_vizibil, false))
    returning id into v_nou_id;

    insert into admin_events (tip, detaliu)
    values ('workout_save', jsonb_build_object('id', v_nou_id, 'numar', v_numar,
                                               'vizibil', coalesce(p_vizibil, false)));
    return v_nou_id;
  end if;

  select w.numar, w.titlu, w.corp into v_numar, v_titlu, v_corp
  from weekly_workout w where w.id = p_id and w.status = 'published';
  if v_numar is null then raise exception 'not_found'; end if;

  -- Conținut neschimbat → petic pe loc, același id, nicio versiune.
  if v_titlu is not distinct from coalesce(p_titlu, '')
     and v_corp is not distinct from coalesce(p_corp, '')
  then
    update weekly_workout set vizibil = coalesce(p_vizibil, false) where id = p_id;
    return p_id;
  end if;

  update weekly_workout set status = 'superseded' where id = p_id;

  insert into weekly_workout (numar, status, titlu, corp, vizibil)
  values (v_numar, 'published', coalesce(p_titlu, ''), coalesce(p_corp, ''),
          coalesce(p_vizibil, false))
  returning id into v_nou_id;

  insert into admin_events (tip, detaliu)
  values ('workout_save', jsonb_build_object('id', v_nou_id, 'numar', v_numar,
                                             'vizibil', coalesce(p_vizibil, false)));
  return v_nou_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Ordinea programului
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_move_weekly_workout(
  p_token uuid,
  p_id uuid,
  p_directie int
)
returns int
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_numar int;
  v_vecin int;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_directie is null or p_directie not in (-1, 1) then
    raise exception 'directie_invalida';
  end if;

  select w.numar into v_numar from weekly_workout w
  where w.id = p_id and w.status = 'published';
  if v_numar is null then raise exception 'not_found'; end if;

  v_vecin := v_numar + p_directie;

  -- La capăt de program nu există vecin. Nu e o eroare — butonul e dezactivat
  -- în ecran, dar ecranul nu e singura cale spre RPC.
  if not exists (select 1 from weekly_workout w where w.numar = v_vecin) then
    return v_numar;
  end if;

  -- Schimbul trece printr-un interval-tampon NEGATIV, în trei pași.
  --
  -- De ce nu un singur `update … set numar = case numar when A then B …`:
  -- indexul de unicitate e PARȚIAL, deci nu poate fi `deferrable` — numai
  -- constrângerile pot fi, iar o constrângere unică parțială nu există în
  -- Postgres. Verificarea se face rând cu rând, în timpul instrucțiunii, așa că
  -- primul rând schimbat scrie peste un număr încă ocupat de al doilea.
  --
  -- Nu e o teorie: forma cu `case` pică măsurat, cu „duplicate key value
  -- violates unique constraint weekly_workout_un_publicat_pe_numar". La fel și
  -- orice `set numar = numar + 1` pe mai multe rânduri.
  --
  -- Numerele reale sunt >= 1, deci intervalul negativ nu se poate ciocni de nimic.
  update weekly_workout set numar = 0 - v_numar where numar = v_numar;
  update weekly_workout set numar = v_numar where numar = v_vecin;
  update weekly_workout set numar = v_vecin where numar = 0 - v_numar;

  insert into admin_events (tip, detaliu)
  values ('workout_move', jsonb_build_object('id', p_id, 'din', v_numar, 'in', v_vecin));

  return v_vecin;
end;
$function$;

create or replace function runlift.admin_delete_weekly_workout(p_token uuid, p_id uuid)
returns int
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_numar int;
  v_titlu text;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  -- Titlul se citește ÎNAINTE de ștergere, pentru jurnal: după compactare,
  -- `numar` arată deja spre altă săptămână, deci singur n-ar mai identifica
  -- nimic pentru cine citește `admin_events` peste o lună.
  select w.numar, w.titlu into v_numar, v_titlu from weekly_workout w
  where w.id = p_id and w.status = 'published';
  if v_numar is null then raise exception 'not_found'; end if;

  -- Săptămâna, cu tot cu versiunile ei. Definitiv: soft-delete ar fi cerut un
  -- filtru în fiecare RPC și în indexul de unicitate, pentru un gest rar pe care
  -- confirmarea din ecran îl acoperă deja.
  delete from weekly_workout where numar = v_numar;

  -- Compactarea trece prin același tampon. Aici forma naivă
  -- (`set numar = numar - 1 where numar > v_numar`) se ÎNTÂMPLĂ să treacă:
  -- rândurile sunt inserate crescător, deci ordinea fizică coincide cu ordinea
  -- în care coborârea e sigură. E o coincidență de așezare pe disc, nu o
  -- garanție — mutările rescriu tupluri și pot schimba acea ordine. Tamponul o
  -- face independentă de ea.
  update weekly_workout set numar = 0 - numar where numar > v_numar;
  update weekly_workout set numar = (0 - numar) - 1 where numar < 0;

  insert into admin_events (tip, detaliu)
  values ('workout_delete',
          jsonb_build_object('id', p_id, 'numar', v_numar, 'titlu', v_titlu));

  return v_numar;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Programul și revenirea
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_list_weekly_workout(p_token uuid)
returns table (
  id uuid,
  numar int,
  status text,
  titlu text,
  corp text,
  vizibil boolean,
  creat_la timestamptz
)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  return query
    select w.id, w.numar, w.status, w.titlu, w.corp, w.vizibil, w.creat_la
    from weekly_workout w
    order by w.numar asc, w.creat_la desc;
end;
$function$;

-- Revenirea e ÎN CADRUL unei săptămâni: versiunea aleasă îi ia locul celei
-- publicate din aceeași poziție. Restul programului nu se clintește.
create or replace function runlift.admin_restore_weekly_workout(p_token uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_numar int;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select w.numar into v_numar from weekly_workout w where w.id = p_id;
  if v_numar is null then raise exception 'not_found'; end if;

  update weekly_workout set status = 'superseded'
    where status = 'published' and numar = v_numar and id <> p_id;
  update weekly_workout set status = 'published' where id = p_id;

  insert into admin_events (tip, detaliu)
  values ('workout_restore', jsonb_build_object('id', p_id, 'numar', v_numar));

  return p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Ce vede publicul
-- ---------------------------------------------------------------------------
--
-- Tot programul vizibil, într-un singur răspuns: alegerea unei săptămâni din
-- selector nu mai cere nimic de la server.
--
-- Array GOL, nu `null`, când nu e nimic vizibil — `jsonb_agg` pe zero rânduri dă
-- `null`, iar pagina ar fi trebuit să trateze două forme pentru aceeași situație.
--
-- Ascunderea NU renumerotează: cu Săptămâna 3 ascunsă, publicul vede 1, 2, 4.

create or replace function runlift.public_weekly_workouts()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    jsonb_agg(
      jsonb_build_object('numar', w.numar, 'titlu', w.titlu, 'corp', w.corp)
      order by w.numar
    ),
    '[]'::jsonb
  )
  from runlift.weekly_workout w
  where w.status = 'published' and w.vizibil;
$function$;

-- ---------------------------------------------------------------------------
-- 7. Drepturi
-- ---------------------------------------------------------------------------
--
-- `drop function` ia grant-urile cu el, deci fiecare funcție recreată are nevoie
-- din nou de `grant execute`. Fără asta, `anon` n-ar mai putea chema nimic.

revoke all on function runlift.admin_save_weekly_workout(uuid, uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_save_weekly_workout(uuid, uuid, text, text, boolean)
  to anon, authenticated, service_role;

revoke all on function runlift.admin_move_weekly_workout(uuid, uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_move_weekly_workout(uuid, uuid, int)
  to anon, authenticated, service_role;

revoke all on function runlift.admin_delete_weekly_workout(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_delete_weekly_workout(uuid, uuid)
  to anon, authenticated, service_role;

revoke all on function runlift.admin_list_weekly_workout(uuid)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_list_weekly_workout(uuid)
  to anon, authenticated, service_role;

revoke all on function runlift.admin_restore_weekly_workout(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_restore_weekly_workout(uuid, uuid)
  to anon, authenticated, service_role;

revoke all on function runlift.public_weekly_workouts()
  from public, anon, authenticated, service_role;
grant execute on function runlift.public_weekly_workouts()
  to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. Gata
-- ---------------------------------------------------------------------------
--
-- Dacă orice verificare de după aplicare pică ÎNAINTE de `commit`, un `rollback`
-- e complet și fără urme: nimic din migrare n-a fost vizibil altor sesiuni.

commit;

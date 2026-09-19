-- Antrenamentul săptămânii — tabelul, versiunile și cele patru RPC-uri.
--
-- De ce un tabel propriu și nu documentul ediției: cadența. Documentul ediției
-- se schimbă de câteva ori pe ediție; antrenamentul, în fiecare săptămână.
-- Ținut acolo, fiecare antrenament ar fi scris un rând nou de `event_config` și
-- ar fi îngropat istoricul real al ediției sub editări de antrenament. Pe
-- deasupra, ar fi legat o treabă de treizeci de secunde de fluxul ciornă →
-- previzualizare → publică, care e potrivit pentru o ediție întreagă.
--
-- Antrenamentul nu aparține niciunei ediții. Rămâne editabil și vizibil între
-- ediții — exact săptămânile în care are cel mai mult sens.
--
-- Două reguli stau AICI, nu în formular, pentru că formularul nu e singura cale
-- spre tabel:
--
--  1. `pornit și corp gol` se refuză. Altfel o scriere directă ar produce o
--     pagină publică goală la un URL pe care organizatorul tocmai l-a trimis.
--  2. Comutatorul peticește rândul publicat; doar titlul sau corpul schimbat
--     scrie o versiune nouă. Altfel o pornire-oprire dublă ar adăuga patru
--     rânduri identice, iar „Versiuni anterioare" — care există ca să repari o
--     suprascriere — ar deveni inutilizabil exact pentru asta.

-- ---------------------------------------------------------------------------
-- 1. Tabelul
-- ---------------------------------------------------------------------------

create table if not exists runlift.weekly_workout (
  id uuid primary key default gen_random_uuid(),
  status text not null check (status in ('published', 'superseded')),
  titlu text not null,
  corp text not null,
  -- Vizibil pe site. Separat de conținut, ca antrenamentul de săptămâna
  -- viitoare să poată fi scris din timp, cu pagina oprită.
  activ boolean not null default false,
  creat_la timestamptz not null default now()
);

-- Un singur rând publicat în tot tabelul, ca la `event_config`. `public_weekly_workout()`
-- se bazează pe asta ca să nu aibă nevoie de `order by`.
create unique index if not exists weekly_workout_un_singur_publicat
  on runlift.weekly_workout (status) where status = 'published';

-- Istoricul se citește invers cronologic.
create index if not exists weekly_workout_istoric
  on runlift.weekly_workout (creat_la desc);

-- RLS fără politici, ca la restul schemei: nimic nu se citește direct cu cheia
-- publică. Fără asta, `anon` ar putea citi rândurile `superseded` și
-- antrenamentul oprit — adică exact ce cele două funcții publice ascund.
revoke all on table runlift.weekly_workout from public, anon, authenticated, service_role;
alter table runlift.weekly_workout enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Salvarea
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_save_weekly_workout(
  p_token uuid,
  p_titlu text,
  p_corp text,
  p_activ boolean
)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_curent_id uuid;
  v_curent_titlu text;
  v_curent_corp text;
  v_nou_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  -- Regula 1. `btrim` cu setul explicit, nu `trim`: `trim` scoate DOAR spații,
  -- iar un corp de forma "   \n  " ar fi trecut drept scris. `coalesce`
  -- înaintea lui, fiindcă un corp `null` e tot gol.
  if coalesce(p_activ, false)
     and char_length(btrim(coalesce(p_corp, ''), E' \t\r\n')) = 0
  then
    raise exception 'workout_empty';
  end if;

  select w.id, w.titlu, w.corp into v_curent_id, v_curent_titlu, v_curent_corp
  from weekly_workout w where w.status = 'published';

  -- Regula 2. Conținut neschimbat → petic pe loc, același id, nicio versiune.
  if v_curent_id is not null
     and v_curent_titlu is not distinct from coalesce(p_titlu, '')
     and v_curent_corp is not distinct from coalesce(p_corp, '')
  then
    update weekly_workout set activ = coalesce(p_activ, false) where id = v_curent_id;
    return v_curent_id;
  end if;

  if v_curent_id is not null then
    update weekly_workout set status = 'superseded' where id = v_curent_id;
  end if;

  insert into weekly_workout (status, titlu, corp, activ)
  values ('published', coalesce(p_titlu, ''), coalesce(p_corp, ''), coalesce(p_activ, false))
  returning id into v_nou_id;

  insert into admin_events (tip, detaliu)
  values ('workout_save', jsonb_build_object('id', v_nou_id, 'activ', coalesce(p_activ, false)));

  return v_nou_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Istoricul și revenirea
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_list_weekly_workout(p_token uuid)
returns table (
  id uuid,
  status text,
  titlu text,
  corp text,
  activ boolean,
  creat_la timestamptz
)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  return query
    select w.id, w.status, w.titlu, w.corp, w.activ, w.creat_la
    from weekly_workout w
    order by w.creat_la desc;
end;
$function$;

create or replace function runlift.admin_restore_weekly_workout(p_token uuid, p_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare v_exista boolean;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select true into v_exista from weekly_workout where id = p_id;
  if v_exista is null then raise exception 'not_found'; end if;

  update weekly_workout set status = 'superseded'
    where status = 'published' and id <> p_id;
  update weekly_workout set status = 'published' where id = p_id;

  insert into admin_events (tip, detaliu)
  values ('workout_restore', jsonb_build_object('id', p_id));

  return p_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Ce vede publicul
-- ---------------------------------------------------------------------------
--
-- `null` acoperă trei situații pe care pagina le tratează la fel: nu s-a scris
-- încă nimic, antrenamentul e oprit, sau tot ce există e o versiune înlocuită.
-- Pagina spune „nu e nimic publicat acum" — nu dă eroare și nu redirectează,
-- fiindcă linkul trimis săptămâna trecută trebuie să rămână bun.

create or replace function runlift.public_weekly_workout()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object('titlu', w.titlu, 'corp', w.corp)
  from runlift.weekly_workout w
  where w.status = 'published' and w.activ
  limit 1;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Drepturi
-- ---------------------------------------------------------------------------
--
-- RPC-urile de admin sunt deschise rolului `anon` din acelaşi motiv ca toate
-- celelalte: /admin se autentifică prin `p_token`, nu printr-o sesiune
-- Postgres. Verificarea tokenului din corpul fiecăreia e apărarea reală.

revoke all on function runlift.admin_save_weekly_workout(uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_save_weekly_workout(uuid, text, text, boolean)
  to anon, authenticated, service_role;

revoke all on function runlift.admin_list_weekly_workout(uuid)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_list_weekly_workout(uuid)
  to anon, authenticated, service_role;

revoke all on function runlift.admin_restore_weekly_workout(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_restore_weekly_workout(uuid, uuid)
  to anon, authenticated, service_role;

revoke all on function runlift.public_weekly_workout()
  from public, anon, authenticated, service_role;
grant execute on function runlift.public_weekly_workout()
  to anon, authenticated, service_role;

-- Programarea privată a antrenamentelor, etapa 1.
-- Nicio tabelă și nicio funcție existentă nu își schimbă comportamentul.
-- Importul și răspunsurile sunt JSON v1; seturile sunt rânduri interogabile.
-- Datele de import aparțin operatorului și nu se păstrează în repository.

create table if not exists runlift.prog_sportiv (
  id bigint primary key references runlift.admin_users(id),
  nume text not null check (btrim(nume) <> ''),
  gen text not null check (gen in ('masculin', 'feminin')),
  unitate_greutate text not null default 'kg' check (unitate_greutate in ('kg', 'lbs')),
  unitate_distanta text not null default 'm' check (unitate_distanta in ('m', 'ft')),
  telegram_id text
);

create table if not exists runlift.prog_program (
  id uuid primary key default gen_random_uuid(),
  id_extern text not null unique check (btrim(id_extern) <> ''),
  nume text not null check (btrim(nume) <> ''),
  descriere text not null default '',
  saptamani integer not null check (saptamani > 0),
  zile_pe_saptamana integer not null check (zile_pe_saptamana between 1 and 7),
  sursa text not null,
  publicat boolean not null default true
);

create table if not exists runlift.prog_miscare (
  id uuid primary key default gen_random_uuid(),
  id_extern text not null unique check (btrim(id_extern) <> ''),
  nume text not null check (btrim(nume) <> ''),
  categorie text not null default '',
  masuratori text[] not null default '{}',
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  sursa text not null default ''
);

create table if not exists runlift.prog_zi (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references runlift.prog_program(id),
  id_extern text not null check (btrim(id_extern) <> ''),
  saptamana integer not null check (saptamana > 0),
  zi integer not null check (zi between 1 and 7),
  titlu text,
  vizibil boolean not null default true,
  unique (program_id, id_extern),
  unique (program_id, saptamana, zi)
);

create table if not exists runlift.prog_bloc (
  id uuid primary key default gen_random_uuid(),
  zi_id uuid not null references runlift.prog_zi(id),
  id_extern text not null check (btrim(id_extern) <> ''),
  ordine integer not null check (ordine > 0),
  tip text not null check (tip in (
    'strength', 'cardio', 'cardio_intervals', 'emom', 'for_time', 'amrap', 'generic', 'warm_up'
  )),
  nume text,
  instructiuni_inainte text,
  instructiuni_dupa text,
  note_sportiv text,
  note_antrenor text,
  text text,
  ascuns boolean not null default false,
  parametri jsonb not null default '{}' check (jsonb_typeof(parametri) = 'object'),
  vizibil boolean not null default true,
  unique (zi_id, id_extern)
);

create table if not exists runlift.prog_set (
  id uuid primary key default gen_random_uuid(),
  bloc_id uuid not null references runlift.prog_bloc(id),
  id_extern text not null check (btrim(id_extern) <> ''),
  -- Același număr grupează seturile unui exercițiu; 1,2,... formează A1,A2,...
  exercitiu integer not null check (exercitiu > 0),
  ordine integer not null check (ordine > 0),
  miscare_id uuid not null references runlift.prog_miscare(id),
  repetari text,
  incarcare numeric,
  unitate_incarcare text not null default 'kg' check (unitate_incarcare in ('kg', '%1rm')),
  distanta_m numeric,
  durata_sec numeric,
  calorii numeric,
  inaltime_cm numeric,
  putere_w numeric,
  tempo text,
  tinte_feminine jsonb not null default '{}' check (jsonb_typeof(tinte_feminine) = 'object'),
  tinte_text jsonb not null default '{}' check (jsonb_typeof(tinte_text) = 'object'),
  provenienta jsonb not null default '{}' check (jsonb_typeof(provenienta) = 'object'),
  pauza_tip text not null default 'fara' check (pauza_tip in ('fara', 'dupa_nevoie', 'fixa', 'interval', 'dupa_timp')),
  pauza_sec numeric,
  note text,
  vizibil boolean not null default true,
  unique (bloc_id, id_extern)
);

create table if not exists runlift.prog_atribuire (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references runlift.prog_program(id),
  sportiv_id bigint not null references runlift.prog_sportiv(id),
  data_start date not null
);

create index if not exists prog_bloc_zi on runlift.prog_bloc(zi_id, ordine);
create index if not exists prog_set_bloc on runlift.prog_set(bloc_id, exercitiu, ordine);
create index if not exists prog_atribuire_sportiv on runlift.prog_atribuire(sportiv_id, data_start);

-- Contract de citire: fiecare zi conține blocuri ordonate, fiecare bloc seturi
-- ordonate pe (exercitiu, ordine). Setul include mișcarea completă pentru video.
-- Coloanele de apartenență și de arhivare rămân interne.
create or replace function runlift._prog_zi_json(p_id uuid)
returns jsonb language sql stable set search_path to '' as $$
  select (to_jsonb(z) - 'program_id' - 'vizibil') || jsonb_build_object(
    'blocuri', coalesce((
      select jsonb_agg((to_jsonb(b) - 'zi_id' - 'vizibil') || jsonb_build_object(
        'seturi', coalesce((
          select jsonb_agg((to_jsonb(s) - 'bloc_id' - 'miscare_id' - 'vizibil') || jsonb_build_object(
            'miscare_id_extern', m.id_extern,
            'miscare', to_jsonb(m)
          ) order by s.exercitiu, s.ordine, s.id_extern)
          from runlift.prog_set s join runlift.prog_miscare m on m.id = s.miscare_id
          where s.bloc_id = b.id and s.vizibil
        ), '[]'::jsonb)
      ) order by b.ordine, b.id_extern)
      from runlift.prog_bloc b where b.zi_id = z.id and b.vizibil
    ), '[]'::jsonb)
  ) from runlift.prog_zi z where z.id = p_id;
$$;

create or replace function runlift._prog_atribuire_json(p_id uuid)
returns jsonb language sql stable set search_path to '' as $$
  select to_jsonb(a) || jsonb_build_object(
    'data_sfarsit', a.data_start + (p.saptamani - 1) * 7 + coalesce((
      select max(z.zi) - 1 from runlift.prog_zi z
      where z.program_id = p.id and z.vizibil and z.saptamana = p.saptamani
    ), 6),
    'sportiv_nume', s.nume
  ) from runlift.prog_atribuire a
  join runlift.prog_program p on p.id = a.program_id
  join runlift.prog_sportiv s on s.id = a.sportiv_id where a.id = p_id;
$$;

create or replace function runlift._prog_program_json(p_id uuid, p_complet boolean default true)
returns jsonb language sql stable set search_path to '' as $$
  select to_jsonb(p) || jsonb_build_object(
    'atribuiri', coalesce((
      select jsonb_agg(runlift._prog_atribuire_json(a.id) order by a.data_start, a.id)
      from runlift.prog_atribuire a where a.program_id = p.id
    ), '[]'::jsonb)
  ) || case when p_complet then jsonb_build_object('zile', coalesce((
    select jsonb_agg(runlift._prog_zi_json(z.id) order by z.saptamana, z.zi)
    from runlift.prog_zi z where z.program_id = p.id and z.vizibil
  ), '[]'::jsonb)) else '{}'::jsonb end
  from runlift.prog_program p where p.id = p_id;
$$;

create or replace function runlift.admin_prog_profil(p_token uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return (select to_jsonb(s) from runlift.prog_sportiv s
    join runlift.admin_sessions a on a.user_id = s.id where a.token = p_token);
end;
$$;

create or replace function runlift.admin_prog_profil_salveaza(
  p_token uuid, p_nume text, p_gen text,
  p_unitate_greutate text default 'kg', p_unitate_distanta text default 'm',
  p_telegram_id text default null
)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_user_id bigint;
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select user_id into v_user_id from runlift.admin_sessions where token = p_token;
  insert into runlift.prog_sportiv(id, nume, gen, unitate_greutate, unitate_distanta, telegram_id)
  values (v_user_id, btrim(p_nume), p_gen, p_unitate_greutate, p_unitate_distanta, nullif(btrim(p_telegram_id), ''))
  on conflict (id) do update set nume = excluded.nume, gen = excluded.gen,
    unitate_greutate = excluded.unitate_greutate, unitate_distanta = excluded.unitate_distanta,
    telegram_id = excluded.telegram_id;
  return runlift.admin_prog_profil(p_token);
end;
$$;

-- Document v1: {versiune:1,program:{id_extern,nume,descriere,saptamani,
-- zile_pe_saptamana,sursa},miscari:[{id_extern,nume,categorie,masuratori,
-- youtube_id,sursa}],zile:[{id_extern,saptamana,zi,titlu,blocuri:[{id_extern,
-- ordine,tip,nume,instructiuni_inainte,instructiuni_dupa,note_sportiv,
-- note_antrenor,text,ascuns,parametri,seturi:[{id_extern,exercitiu,ordine,
-- miscare_id_extern,repetari,incarcare,unitate_incarcare,distanta_m,durata_sec,
-- calorii,inaltime_cm,putere_w,tempo,tinte_feminine,tinte_text,provenienta,
-- pauza_tip,pauza_sec,note}]}]}]}.
-- parametri păstrează parametrii blocului: interval_sec,durata_sec,runde,
-- criteriu_scor,pauza_tip,pauza_sec,pauza_raport și metadatele sursei.
-- tinte_feminine este o suprascriere parțială a țintelor de mai sus.
-- Upsert-ul păstrează identificatorii locali. Rândurile lipsă devin ascunse,
-- ca viitoarele rezultate să își poată păstra cheile externe (KTD9).
create or replace function runlift.admin_prog_importa(p_token uuid, p_document jsonb)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  v_program jsonb := p_document -> 'program';
  v_program_id uuid;
  v_zi jsonb; v_bloc jsonb; v_set jsonb; v_miscare jsonb;
  v_zi_id uuid; v_bloc_id uuid; v_miscare_id uuid;
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_document ->> 'versiune' is distinct from '1'
     or jsonb_typeof(v_program) is distinct from 'object'
     or jsonb_typeof(p_document -> 'miscari') is distinct from 'array'
     or jsonb_typeof(p_document -> 'zile') is distinct from 'array' then
    raise exception 'import_invalid';
  end if;

  insert into runlift.prog_program(id_extern, nume, descriere, saptamani, zile_pe_saptamana, sursa)
  values (v_program ->> 'id_extern', v_program ->> 'nume', coalesce(v_program ->> 'descriere', ''),
    (v_program ->> 'saptamani')::integer, (v_program ->> 'zile_pe_saptamana')::integer,
    v_program ->> 'sursa')
  on conflict (id_extern) do update set nume = excluded.nume, descriere = excluded.descriere,
    saptamani = excluded.saptamani, zile_pe_saptamana = excluded.zile_pe_saptamana, sursa = excluded.sursa
  returning id into v_program_id;

  for v_miscare in select value from jsonb_array_elements(p_document -> 'miscari') loop
    insert into runlift.prog_miscare(id_extern, nume, categorie, masuratori, youtube_id, sursa)
    values (v_miscare ->> 'id_extern', v_miscare ->> 'nume', coalesce(v_miscare ->> 'categorie', ''),
      array(select jsonb_array_elements_text(coalesce(v_miscare -> 'masuratori', '[]'))),
      nullif(v_miscare ->> 'youtube_id', ''), coalesce(v_miscare ->> 'sursa', ''))
    on conflict (id_extern) do update set nume = excluded.nume, categorie = excluded.categorie,
      masuratori = excluded.masuratori, youtube_id = excluded.youtube_id, sursa = excluded.sursa;
  end loop;

  -- Nu se șterg rânduri folosite de atribuiri sau de rezultatele etapelor următoare.
  update runlift.prog_zi set vizibil = false where program_id = v_program_id;
  update runlift.prog_bloc set vizibil = false where zi_id in (
    select id from runlift.prog_zi where program_id = v_program_id);
  update runlift.prog_set set vizibil = false where bloc_id in (
    select b.id from runlift.prog_bloc b join runlift.prog_zi z on z.id = b.zi_id where z.program_id = v_program_id);

  for v_zi in select value from jsonb_array_elements(p_document -> 'zile') loop
    if (v_zi ->> 'saptamana')::integer > (v_program ->> 'saptamani')::integer then
      raise exception 'zi_in_afara_programului';
    end if;
    insert into runlift.prog_zi(program_id, id_extern, saptamana, zi, titlu)
    values (v_program_id, v_zi ->> 'id_extern', (v_zi ->> 'saptamana')::integer,
      (v_zi ->> 'zi')::integer, v_zi ->> 'titlu')
    on conflict (program_id, id_extern) do update set saptamana = excluded.saptamana,
      zi = excluded.zi, titlu = excluded.titlu, vizibil = true returning id into v_zi_id;

    for v_bloc in select value from jsonb_array_elements(v_zi -> 'blocuri') loop
      insert into runlift.prog_bloc(zi_id, id_extern, ordine, tip, nume, instructiuni_inainte,
        instructiuni_dupa, note_sportiv, note_antrenor, text, ascuns, parametri)
      values (v_zi_id, v_bloc ->> 'id_extern', (v_bloc ->> 'ordine')::integer, v_bloc ->> 'tip',
        v_bloc ->> 'nume', v_bloc ->> 'instructiuni_inainte', v_bloc ->> 'instructiuni_dupa',
        v_bloc ->> 'note_sportiv', v_bloc ->> 'note_antrenor', v_bloc ->> 'text',
        coalesce((v_bloc ->> 'ascuns')::boolean, false),
        coalesce(v_bloc -> 'parametri', '{}'))
      on conflict (zi_id, id_extern) do update set ordine = excluded.ordine, tip = excluded.tip,
        nume = excluded.nume, instructiuni_inainte = excluded.instructiuni_inainte,
        instructiuni_dupa = excluded.instructiuni_dupa, note_sportiv = excluded.note_sportiv,
        note_antrenor = excluded.note_antrenor, text = excluded.text, ascuns = excluded.ascuns,
        parametri = excluded.parametri,
        vizibil = true returning id into v_bloc_id;

      for v_set in select value from jsonb_array_elements(v_bloc -> 'seturi') loop
        select id into v_miscare_id from runlift.prog_miscare where id_extern = v_set ->> 'miscare_id_extern';
        insert into runlift.prog_set(bloc_id, id_extern, exercitiu, ordine, miscare_id,
          repetari, incarcare, unitate_incarcare, distanta_m, durata_sec, calorii, inaltime_cm,
          putere_w, tempo, tinte_feminine, tinte_text, provenienta, pauza_tip, pauza_sec, note)
        values (v_bloc_id, v_set ->> 'id_extern', (v_set ->> 'exercitiu')::integer,
          (v_set ->> 'ordine')::integer, v_miscare_id, v_set ->> 'repetari',
          (v_set ->> 'incarcare')::numeric, coalesce(v_set ->> 'unitate_incarcare', 'kg'),
          (v_set ->> 'distanta_m')::numeric, (v_set ->> 'durata_sec')::numeric,
          (v_set ->> 'calorii')::numeric, (v_set ->> 'inaltime_cm')::numeric,
          (v_set ->> 'putere_w')::numeric, v_set ->> 'tempo', coalesce(v_set -> 'tinte_feminine', '{}'),
          coalesce(v_set -> 'tinte_text', '{}'), coalesce(v_set -> 'provenienta', '{}'),
          coalesce(v_set ->> 'pauza_tip', 'fara'), (v_set ->> 'pauza_sec')::numeric, v_set ->> 'note')
        on conflict (bloc_id, id_extern) do update set exercitiu = excluded.exercitiu,
          ordine = excluded.ordine, miscare_id = excluded.miscare_id, repetari = excluded.repetari,
          incarcare = excluded.incarcare, unitate_incarcare = excluded.unitate_incarcare,
          distanta_m = excluded.distanta_m, durata_sec = excluded.durata_sec, calorii = excluded.calorii,
          inaltime_cm = excluded.inaltime_cm, putere_w = excluded.putere_w, tempo = excluded.tempo,
          tinte_feminine = excluded.tinte_feminine, tinte_text = excluded.tinte_text,
          provenienta = excluded.provenienta, pauza_tip = excluded.pauza_tip,
          pauza_sec = excluded.pauza_sec, note = excluded.note, vizibil = true;
      end loop;
    end loop;
  end loop;
  return runlift._prog_program_json(v_program_id);
end;
$$;

create or replace function runlift.admin_prog_programe(p_token uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return coalesce((select jsonb_agg(runlift._prog_program_json(p.id, false) order by p.nume, p.id)
    from runlift.prog_program p), '[]'::jsonb);
end;
$$;

create or replace function runlift.admin_prog_program(p_token uuid, p_program_id uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_program jsonb;
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  v_program := runlift._prog_program_json(p_program_id);
  if v_program is null then raise exception 'not_found'; end if;
  return v_program;
end;
$$;

create or replace function runlift.admin_prog_atribuie(p_token uuid, p_program_id uuid, p_data_start date)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_user_id bigint; v_id uuid;
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select user_id into v_user_id from runlift.admin_sessions where token = p_token;
  if not exists (select 1 from runlift.prog_sportiv where id = v_user_id) then
    raise exception 'profil_necesar';
  end if;
  if not exists (select 1 from runlift.prog_program where id = p_program_id and publicat) then
    raise exception 'program_nepublicat';
  end if;
  insert into runlift.prog_atribuire(program_id, sportiv_id, data_start)
    values (p_program_id, v_user_id, p_data_start) returning id into v_id;
  return runlift._prog_atribuire_json(v_id);
end;
$$;

create or replace function runlift.admin_prog_azi(p_token uuid, p_data date)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_user_id bigint;
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select user_id into v_user_id from runlift.admin_sessions where token = p_token;
  return jsonb_build_object('data', p_data, 'profil', runlift.admin_prog_profil(p_token),
    'antrenamente', coalesce((
      select jsonb_agg(jsonb_build_object(
        'atribuire', runlift._prog_atribuire_json(a.id),
        'program', runlift._prog_program_json(p.id, false),
        'zi', runlift._prog_zi_json(z.id)
      ) order by p.nume, a.data_start, a.id)
      from runlift.prog_atribuire a join runlift.prog_program p on p.id = a.program_id
      join runlift.prog_zi z on z.program_id = p.id and z.vizibil
      where a.sportiv_id = v_user_id
        and a.data_start + (z.saptamana - 1) * 7 + (z.zi - 1) = p_data
    ), '[]'::jsonb));
end;
$$;

-- Etapa 1 încă nu are rezultate. Totalurile și stările sunt explicite; etapa 2
-- va număra rezultatele, fără ca zero să pretindă că există date salvate.
create or replace function runlift.admin_prog_calendar(p_token uuid, p_atribuire_id uuid, p_azi date)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_atribuire jsonb;
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  v_atribuire := runlift._prog_atribuire_json(p_atribuire_id);
  if v_atribuire is null then raise exception 'not_found'; end if;
  return jsonb_build_object('atribuire', v_atribuire,
    'zile', coalesce((
      select jsonb_agg(runlift._prog_zi_json(z.id) || jsonb_build_object(
        'data', a.data_start + (z.saptamana - 1) * 7 + (z.zi - 1),
        'stare', case when a.data_start + (z.saptamana - 1) * 7 + (z.zi - 1) > p_azi
          then 'viitor' else 'nefăcut' end
      ) order by z.saptamana, z.zi)
      from runlift.prog_atribuire a join runlift.prog_zi z on z.program_id = a.program_id and z.vizibil
      where a.id = p_atribuire_id
    ), '[]'::jsonb),
    'totaluri', jsonb_build_object('zile_antrenament', (
      select count(*) from runlift.prog_atribuire a
      join runlift.prog_zi z on z.program_id = a.program_id and z.vizibil
      where a.id = p_atribuire_id
    ), 'rezultate', 0, 'pr', 0));
end;
$$;

-- PostgREST folosește anon + tokenul propriu al adminului. Nicio citire directă
-- nu e permisă, iar helper-ele nu pot ocoli verificarea tokenului prin RPC.
do $$
declare v_tabel text; v_functie record;
begin
  foreach v_tabel in array array[
    'prog_sportiv', 'prog_program', 'prog_miscare', 'prog_zi', 'prog_bloc', 'prog_set', 'prog_atribuire'
  ] loop
    execute format('alter table runlift.%I enable row level security', v_tabel);
    execute format('revoke all on table runlift.%I from public, anon, authenticated, service_role', v_tabel);
  end loop;
  for v_functie in select p.oid::regprocedure as semnatura, starts_with(p.proname, 'admin_prog_') as admin from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'runlift' and (starts_with(p.proname, 'admin_prog_') or starts_with(p.proname, '_prog_'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', v_functie.semnatura);
    if v_functie.admin then
      execute format('grant execute on function %s to anon, authenticated, service_role', v_functie.semnatura);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

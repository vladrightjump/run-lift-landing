-- ---------------------------------------------------------------------------
-- Clipurile de antrenament, ca listă proprie
-- ---------------------------------------------------------------------------
--
-- De ce un tabel propriu și nu documentul de ediție: clipurile de antrenament
-- NU aparțin niciunei ediții. Marțea și joia din parc nu se mută odată cu
-- cursa, iar o ediție nouă n-are de ce să moștenească sau să piardă banda.
-- Aceeași situație ca `weekly_workout`, rezolvată la fel.
--
-- FIȘIERELE nu stau aici. Clipul și poster-ul sunt fișiere proprii, servite de
-- pe aceeași origine ca pagina, produse cu `npm run reel` și adăugate printr-un
-- commit. Tabelul ăsta ține doar PREZENTAREA lor: ordinea, legenda, linkul spre
-- postare și dacă se văd. Alea sunt editările frecvente; adăugarea unui fișier
-- nou e rară și tot printr-un deploy intră.
--
-- Fără versionare (spre deosebire de `weekly_workout`): nu există ciornă și nici
-- „revino la versiunea trecută" pentru o legendă. Un istoric aici ar fi fost
-- ceremonie.

create table if not exists runlift.training_reels (
  id uuid primary key default gen_random_uuid(),
  -- Poziția în bandă. Organizatorul n-o tastează niciodată: se atribuie la
  -- adăugare și se schimbă doar prin „mută".
  numar int not null,
  -- Calea clipului, relativă la originea site-ului („/reels/marti.mp4").
  fisier text not null,
  -- Primul cadru. Gol e permis: cardul cade pe marcajul desenat.
  poster text not null default '',
  -- O linie sub card. NU e opțională: e ce citește un cititor de ecran, fiindcă
  -- elementul video e ascuns din arborele de accesibilitate.
  caption text not null,
  -- Postarea reală, pentru cine vrea clipul întreg.
  url text not null,
  vizibil boolean not null default true,
  creat_la timestamptz not null default now(),

  -- Aceleași forme ca gardele din client. Serverul rămâne autoritatea: o
  -- scriere directă în DB n-are voie să pună în pagină o cale arbitrară.
  constraint training_reels_fisier_ok check (fisier ~ '^/reels/[a-z0-9-]+\.mp4$'),
  constraint training_reels_poster_ok check (poster = '' or poster ~ '^/reels/[a-z0-9-]+\.jpg$'),
  constraint training_reels_caption_ok check (length(btrim(caption)) > 0),
  constraint training_reels_url_ok check (url ~ '^https://www\.instagram\.com/(reel|p)/[A-Za-z0-9_-]{5,32}/$')
);

-- Ordinea e o permutare, nu o sugestie: două clipuri pe același număr ar randa
-- nedeterminist. Mutarea trece prin negative tocmai ca să nu lovească indexul.
create unique index if not exists training_reels_un_numar
  on runlift.training_reels (numar);

-- Un fișier o singură dată: două carduri cu același clip sunt o greșeală de
-- lipit, nu o intenție.
create unique index if not exists training_reels_un_fisier
  on runlift.training_reels (fisier);

-- RLS fără politici, ca la restul schemei: nimic nu se citește direct cu cheia
-- publică. Fără asta, `anon` ar putea citi clipurile ascunse — adică exact ce
-- funcția publică ascunde.
revoke all on table runlift.training_reels from public, anon, authenticated, service_role;
alter table runlift.training_reels enable row level security;

-- ---------------------------------------------------------------------------
-- Lista publică
-- ---------------------------------------------------------------------------
--
-- Aceeași formă ca `public_weekly_workouts`: RPC stabil peste un tabel închis,
-- citit cu cheia publicabilă. `id` și `numar` nu ies: pagina randează în
-- ordinea primită și n-are ce face cu ele.

create or replace function runlift.public_training_reels()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'video', r.fisier,
        'poster', r.poster,
        'caption', r.caption,
        'url', r.url
      )
      order by r.numar
    ),
    '[]'::jsonb
  )
  from runlift.training_reels r
  where r.vizibil;
$$;

-- ---------------------------------------------------------------------------
-- Lista de admin
-- ---------------------------------------------------------------------------

create or replace function runlift.admin_list_training_reels(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'runlift'
as $$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  return coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'id', r.id,
         'numar', r.numar,
         'video', r.fisier,
         'poster', r.poster,
         'caption', r.caption,
         'url', r.url,
         'vizibil', r.vizibil
       )
       order by r.numar
     )
     from training_reels r),
    '[]'::jsonb
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Salvarea
-- ---------------------------------------------------------------------------
--
-- `p_id` null înseamnă „clip nou" și primește automat numărul următor:
-- organizatorul nu tastează și nu alege niciun număr. `p_id` dat înseamnă
-- „editez clipul ăsta" și păstrează numărul.

create or replace function runlift.admin_save_training_reel(
  p_token uuid,
  p_id uuid,
  p_video text,
  p_poster text,
  p_caption text,
  p_url text,
  p_vizibil boolean
)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare
  v_id uuid;
  v_numar int;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  if p_id is null then
    select coalesce(max(r.numar), 0) + 1 into v_numar from training_reels r;
    insert into training_reels (numar, fisier, poster, caption, url, vizibil)
    values (v_numar, p_video, coalesce(p_poster, ''), p_caption, p_url, coalesce(p_vizibil, true))
    returning id into v_id;

    insert into admin_events (tip, detaliu)
    values ('reel_add', jsonb_build_object('id', v_id, 'numar', v_numar, 'video', p_video));

    return v_id;
  end if;

  update training_reels
  set fisier = p_video,
      poster = coalesce(p_poster, ''),
      caption = p_caption,
      url = p_url,
      vizibil = coalesce(p_vizibil, true)
  where id = p_id
  returning id, numar into v_id, v_numar;

  if v_id is null then raise exception 'not_found'; end if;

  insert into admin_events (tip, detaliu)
  values ('reel_edit', jsonb_build_object('id', v_id, 'numar', v_numar, 'video', p_video));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mutarea
-- ---------------------------------------------------------------------------
--
-- Schimbul trece printr-un număr negativ temporar: un singur `update` care
-- încearcă să pună două rânduri pe același număr ar lovi indexul unic.

create or replace function runlift.admin_move_training_reel(
  p_token uuid,
  p_id uuid,
  p_directie int
)
returns int
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare
  v_numar int;
  v_vecin int;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_directie is null or p_directie not in (-1, 1) then
    raise exception 'directie_invalida';
  end if;

  select r.numar into v_numar from training_reels r where r.id = p_id;
  if v_numar is null then raise exception 'not_found'; end if;

  v_vecin := v_numar + p_directie;

  -- La capăt de bandă nu există vecin, iar asta nu e o eroare.
  if not exists (select 1 from training_reels r where r.numar = v_vecin) then
    return v_numar;
  end if;

  update training_reels set numar = 0 - v_numar where numar = v_numar;
  update training_reels set numar = v_numar where numar = v_vecin;
  update training_reels set numar = v_vecin where numar = 0 - v_numar;

  insert into admin_events (tip, detaliu)
  values ('reel_move', jsonb_build_object('id', p_id, 'din', v_numar, 'in', v_vecin));

  return v_vecin;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ștergerea
-- ---------------------------------------------------------------------------
--
-- Definitivă, și compactează numerele ca să nu rămână o gaură în ordine.
-- Fișierul de sub ea rămâne în repo: ștergerea din listă nu e o ștergere de pe
-- disc, iar un clip repus mai târziu nu trebuie re-encodat.

create or replace function runlift.admin_delete_training_reel(p_token uuid, p_id uuid)
returns int
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare
  v_numar int;
  v_video text;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  -- Fișierul se citește ÎNAINTE de ștergere: după compactare, `numar` arată deja
  -- spre alt clip și singur n-ar mai identifica nimic în jurnal.
  select r.numar, r.fisier into v_numar, v_video from training_reels r where r.id = p_id;
  if v_numar is null then raise exception 'not_found'; end if;

  delete from training_reels where id = p_id;

  update training_reels set numar = 0 - numar where numar > v_numar;
  update training_reels set numar = (0 - numar) - 1 where numar < 0;

  insert into admin_events (tip, detaliu)
  values ('reel_delete', jsonb_build_object('id', p_id, 'numar', v_numar, 'video', v_video));

  return v_numar;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drepturi
-- ---------------------------------------------------------------------------
--
-- Grant-ul pe funcție nu e autorizarea: `anon` poate CHEMA funcțiile de admin,
-- dar fără un token valid nu trece de prima linie. Verificarea tokenului din
-- corpul fiecăreia e apărarea reală.

revoke all on function runlift.public_training_reels()
  from public, anon, authenticated, service_role;
grant execute on function runlift.public_training_reels()
  to anon, authenticated, service_role;

revoke all on function runlift.admin_list_training_reels(uuid)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_list_training_reels(uuid)
  to anon, authenticated, service_role;

revoke all on function runlift.admin_save_training_reel(uuid, uuid, text, text, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_save_training_reel(uuid, uuid, text, text, text, text, boolean)
  to anon, authenticated, service_role;

revoke all on function runlift.admin_move_training_reel(uuid, uuid, int)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_move_training_reel(uuid, uuid, int)
  to anon, authenticated, service_role;

revoke all on function runlift.admin_delete_training_reel(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_delete_training_reel(uuid, uuid)
  to anon, authenticated, service_role;

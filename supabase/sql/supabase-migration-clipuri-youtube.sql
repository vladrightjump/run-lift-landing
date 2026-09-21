-- ---------------------------------------------------------------------------
-- Clipurile de antrenament trec de la fișiere proprii la YouTube
-- ---------------------------------------------------------------------------
--
-- Ce se schimbă și de ce: tabelul ținea o CALE de fișier, produsă pe laptop cu
-- `npm run reel` și adusă pe site printr-un commit. Pașii ăia sunt motivul
-- pentru care banda n-a avut niciodată conținut — se puteau face doar la birou,
-- nu după antrenament, de pe telefon. Acum ține un identificator YouTube, iar
-- adăugarea unui clip e o singură lipire în `/admin`.
--
-- `poster` dispare: YouTube nu oferă un poster vertical utilizabil (miniatura e
-- 16:9 și ar apărea cu bare sau tăiată într-un card 9:16), iar cardul liniștit
-- e deja desenat în pagină.
--
-- `url` NU se atinge. Linkul de sub card duce în continuare spre Instagram: un
-- clip nelistat de pe YouTube n-are unde să trimită pe cineva, publicul e pe
-- Instagram, iar YouTube e doar gazda fișierului.
--
-- Migrarea presupune tabelul gol. A fost verificat înainte de scriere
-- (`select count(*) from runlift.training_reels` → 0), deci redenumirea nu are
-- rânduri de convertit și constrângerea nouă n-are ce respinge.

-- ---------------------------------------------------------------------------
-- Coloanele
-- ---------------------------------------------------------------------------

alter table runlift.training_reels
  drop constraint if exists training_reels_fisier_ok,
  drop constraint if exists training_reels_poster_ok;

alter table runlift.training_reels
  rename column fisier to youtube_id;

alter table runlift.training_reels
  drop column if exists poster;

comment on column runlift.training_reels.youtube_id is
  'Identificatorul clipului pe YouTube (11 caractere), nu un link și nu o cale.';

-- Forma identificatorului YouTube: exact 11 caractere din alfabetul base64url.
-- Serverul rămâne autoritatea — ecranul de admin validează aceeași formă, dar o
-- scriere directă în DB n-are voie să pună în pagină un `src` arbitrar.
alter table runlift.training_reels
  add constraint training_reels_youtube_ok check (youtube_id ~ '^[A-Za-z0-9_-]{11}$');

-- Un clip o singură dată în bandă: două carduri cu același identificator sunt o
-- greșeală de lipit, nu o intenție.
alter index if exists runlift.training_reels_un_fisier
  rename to training_reels_un_youtube;

-- ---------------------------------------------------------------------------
-- Lista publică
-- ---------------------------------------------------------------------------
--
-- Cheia `video` devine `youtube`: ce trece prin ea nu mai e o cale pe care o
-- servește pagina, ci un identificator pe care îl primește gazda.

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
        'youtube', r.youtube_id,
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
         'youtube', r.youtube_id,
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
-- Semnătura pierde `p_poster`, deci `create or replace` ar lăsa DOUĂ funcții cu
-- același nume — supraîncărcarea veche ar rămâne apelabilă, cu grant-ul ei cu
-- tot. Se șterge explicit.

drop function if exists runlift.admin_save_training_reel(uuid, uuid, text, text, text, text, boolean);

create or replace function runlift.admin_save_training_reel(
  p_token uuid,
  p_id uuid,
  p_youtube text,
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
    insert into training_reels (numar, youtube_id, caption, url, vizibil)
    values (v_numar, p_youtube, p_caption, p_url, coalesce(p_vizibil, true))
    returning id into v_id;

    insert into admin_events (tip, detaliu)
    values ('reel_add', jsonb_build_object('id', v_id, 'numar', v_numar, 'youtube', p_youtube));

    return v_id;
  end if;

  update training_reels
  set youtube_id = p_youtube,
      caption = p_caption,
      url = p_url,
      vizibil = coalesce(p_vizibil, true)
  where id = p_id
  returning id, numar into v_id, v_numar;

  if v_id is null then raise exception 'not_found'; end if;

  insert into admin_events (tip, detaliu)
  values ('reel_edit', jsonb_build_object('id', v_id, 'numar', v_numar, 'youtube', p_youtube));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ștergerea
-- ---------------------------------------------------------------------------
--
-- Doar jurnalul se schimbă: ține identificatorul, nu calea. Fraza „fișierul
-- rămâne în repo" nu mai are obiect — nu mai există fișier.

create or replace function runlift.admin_delete_training_reel(p_token uuid, p_id uuid)
returns int
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare
  v_numar int;
  v_youtube text;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  -- Identificatorul se citește ÎNAINTE de ștergere: după compactare, `numar`
  -- arată deja spre alt clip și singur n-ar mai identifica nimic în jurnal.
  select r.numar, r.youtube_id into v_numar, v_youtube from training_reels r where r.id = p_id;
  if v_numar is null then raise exception 'not_found'; end if;

  delete from training_reels where id = p_id;

  update training_reels set numar = 0 - numar where numar > v_numar;
  update training_reels set numar = (0 - numar) - 1 where numar < 0;

  insert into admin_events (tip, detaliu)
  values ('reel_delete', jsonb_build_object('id', p_id, 'numar', v_numar, 'youtube', v_youtube));

  return v_numar;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drepturi
-- ---------------------------------------------------------------------------
--
-- Numai pentru semnătura NOUĂ a salvării. Restul funcțiilor și-au păstrat
-- semnătura, deci grant-urile lor au supraviețuit lui `create or replace`.

revoke all on function runlift.admin_save_training_reel(uuid, uuid, text, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function runlift.admin_save_training_reel(uuid, uuid, text, text, text, boolean)
  to anon, authenticated, service_role;

-- Migrare: giveaway-ul de pe Instagram — participări, extragere și încheiere.
--
-- Planul: docs/plans/2026-11-14-0736-feat-giveaway-instagram-plan.md
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- Ce aduce:
--
--  1. `runlift.giveaways` — un rând pe giveaway: identitatea (`slug`, `titlu`),
--     perioada și ce rămâne după el (copia câștigătorului, totalul). Textele
--     (premiu, sponsor, regulament) stau în cod, sub același `slug`.
--
--  2. `runlift.giveaway_entries` — participările. Scrie în el DOAR funcția Edge
--     `submit-form`, cu cheia de service, după verificările anti-bot.
--
--  3. Triggerul `giveaway_entries_guard` — serverul decide giveaway-ul și
--     perioada, niciodată clientul. E aceeași disciplină ca la `editie`
--     (`forteaza_editia_curenta`): orice ar trimite cererea, rândul ajunge în
--     giveaway-ul curent sau e refuzat cu `giveaway_neinceput`, `giveaway_inchis`
--     ori `fara_giveaway`.
--
--  4. Trei indexuri unice pe giveaway — o singură participare de persoană, după
--     telefon, email și contul de Instagram. PostgREST le întoarce ca HTTP 409.
--
--  5. `runlift.public_giveaway()` — ce citește pagina `/giveaway`, fără
--     autentificare: giveaway-ul curent, perioada și starea. Fără numere și
--     fără date personale.
--
--  6. Funcțiile `runlift.admin_giveaway_*` — citirea, ștergerea, extragerea,
--     confirmarea și încheierea. Ca restul backoffice-ului: token verificat în
--     funcție și urmă în `admin_events`. Urma NU poartă nume sau contacte:
--     altfel o ștergere ar lăsa datele în jurnal.
--
-- Se poate rula de mai multe ori.

-- ---------------------------------------------------------------------------
-- 1. Tabelele
-- ---------------------------------------------------------------------------
create table if not exists runlift.giveaways (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  titlu text not null check (char_length(titlu) between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Copia câștigătorului confirmat. Supraviețuiește ștergerii participării lui,
  -- deci și încheierii, când participantul n-a dat acordul de contact.
  castigator_nume text,
  castigator_instagram text,
  castigator_extras_la timestamptz,
  confirmat_la timestamptz,
  incheiat_la timestamptz,
  -- Câte participări erau la încheiere, înainte de ștergerea celor fără acord.
  total_participari integer,
  created_at timestamptz not null default now(),
  constraint giveaways_perioada check (ends_at > starts_at)
);

create table if not exists runlift.giveaway_entries (
  id uuid primary key default gen_random_uuid(),
  giveaway_id uuid not null references runlift.giveaways (id) on delete cascade,
  nume text not null check (char_length(nume) between 3 and 120),
  telefon text not null check (char_length(telefon) between 8 and 16),
  -- Telefonul în formă canonică, doar pentru unicitate (vezi `giveaway_cheie_telefon`).
  telefon_cheie text not null,
  email text not null check (char_length(email) between 5 and 254),
  -- Fără „@", cu litere mici. Forma o garantează triggerul.
  instagram text not null check (instagram ~ '^[a-z0-9._]{1,30}$'),
  acord_regulament boolean not null check (acord_regulament),
  acord_contact boolean not null default false,
  -- Extragerea: extrasă acum = `extrasa_la` pus, `inlocuita_la` gol.
  extrasa_la timestamptz,
  inlocuita_la timestamptz,
  created_at timestamptz not null default now()
);

-- O singură participare de persoană pe giveaway. Ștergerea e reală (DELETE),
-- deci indexurile n-au nevoie de varianta parțială: un rând șters nu mai
-- blochează reînscrierea.
create unique index if not exists giveaway_entries_telefon_uniq
  on runlift.giveaway_entries (giveaway_id, telefon_cheie);
create unique index if not exists giveaway_entries_email_uniq
  on runlift.giveaway_entries (giveaway_id, lower(email));
create unique index if not exists giveaway_entries_instagram_uniq
  on runlift.giveaway_entries (giveaway_id, instagram);

-- RLS pornit, fără politici: tabelele se ating doar prin funcțiile de mai jos și
-- prin cheia de service. `authenticated` nu primește nimic: proiectul Supabase e
-- împărțit cu altă aplicație, deci „autentificat" nu înseamnă „organizator".
alter table runlift.giveaways enable row level security;
alter table runlift.giveaway_entries enable row level security;
revoke all on table runlift.giveaways from public, anon, authenticated;
revoke all on table runlift.giveaway_entries from public, anon, authenticated;
-- Funcția Edge inserează cu `Prefer: return=minimal`, deci îi ajunge INSERT.
-- Dreptul e scris aici, nu lăsat pe seama drepturilor implicite ale schemei.
grant insert on table runlift.giveaway_entries to service_role;

-- ---------------------------------------------------------------------------
-- 2. Ajutoare interne
-- ---------------------------------------------------------------------------

-- `0XXXXXXXX`, `373XXXXXXXX` și `+373XXXXXXXX` sunt același număr.
create or replace function runlift.giveaway_cheie_telefon(p_telefon text)
returns text
language sql
immutable
set search_path to ''
as $function$
  select case
    when d ~ '^\+373\d{8}$' then d
    when d ~ '^373\d{8}$' then '+' || d
    when d ~ '^0\d{8}$' then '+373' || substr(d, 2)
    else d
  end
  from (select regexp_replace(coalesce(p_telefon, ''), '[\s().-]', '', 'g') as d) x;
$function$;

-- Giveaway-ul curent: cel deschis acum; altfel următorul programat, ca pagina
-- să-l poată anunța; altfel cel mai recent terminat.
create or replace function runlift.giveaway_curent()
returns uuid
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select g.id from runlift.giveaways g
      where g.starts_at <= now() and g.ends_at > now() order by g.starts_at desc limit 1),
    (select g.id from runlift.giveaways g where g.starts_at > now() order by g.starts_at asc limit 1),
    (select g.id from runlift.giveaways g order by g.ends_at desc limit 1)
  );
$function$;

-- Starea se deduce din câmpurile stocate, într-un singur loc.
create or replace function runlift.giveaway_stare(p_giveaway_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select case
    when g.incheiat_la is not null then 'incheiat'
    when now() < g.starts_at then 'programat'
    when now() < g.ends_at then 'deschis'
    when g.confirmat_la is not null then 'confirmat'
    when exists (
      select 1 from runlift.giveaway_entries e
       where e.giveaway_id = g.id and e.extrasa_la is not null and e.inlocuita_la is null
    ) then 'extras'
    else 'inchis'
  end
  from runlift.giveaways g
  where g.id = p_giveaway_id;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Garda de înscriere
-- ---------------------------------------------------------------------------
create or replace function runlift.giveaway_entries_guard()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_id    uuid;
  v_start timestamptz;
  v_end   timestamptz;
begin
  v_id := giveaway_curent();
  if v_id is null then raise exception 'fara_giveaway'; end if;

  select g.starts_at, g.ends_at into v_start, v_end from giveaways g where g.id = v_id;
  if now() < v_start then raise exception 'giveaway_neinceput'; end if;
  if now() >= v_end then raise exception 'giveaway_inchis'; end if;

  -- Giveaway-ul și urmele extragerii nu se acceptă niciodată din cerere.
  new.giveaway_id := v_id;
  new.extrasa_la := null;
  new.inlocuita_la := null;
  new.created_at := now();

  new.email := btrim(new.email);
  new.instagram := lower(regexp_replace(btrim(new.instagram), '^@', ''));
  new.telefon_cheie := giveaway_cheie_telefon(new.telefon);
  return new;
end;
$function$;

drop trigger if exists giveaway_entries_guard_trg on runlift.giveaway_entries;
create trigger giveaway_entries_guard_trg
  before insert on runlift.giveaway_entries
  for each row execute function runlift.giveaway_entries_guard();

-- ---------------------------------------------------------------------------
-- 4. Citirea publică
-- ---------------------------------------------------------------------------
create or replace function runlift.public_giveaway()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  -- Pagina vede doar trei stări: tot ce urmează după sfârșit îi apare `inchis`.
  select (
    select jsonb_build_object(
      'slug', g.slug,
      'starts_at', g.starts_at,
      'ends_at', g.ends_at,
      'stare', case
        when now() < g.starts_at then 'programat'
        when now() < g.ends_at then 'deschis'
        else 'inchis'
      end
    )
    from runlift.giveaways g
    where g.id = runlift.giveaway_curent()
  );
$function$;

-- ---------------------------------------------------------------------------
-- 5. Funcțiile adminului
-- ---------------------------------------------------------------------------

-- Lista giveaway-urilor și, pentru cel cerut (sau cel curent), starea și
-- participările. Acțiunile de mai jos primesc giveaway-ul ca parametru: se
-- aplică celui afișat, nu celui care e curent în clipa apăsării.
create or replace function runlift.admin_giveaway_date(p_token uuid, p_giveaway_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'runlift'
as $function$
declare
  v_id uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  v_id := coalesce(p_giveaway_id, giveaway_curent());

  return jsonb_build_object(
    'giveaways', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'slug', g.slug, 'titlu', g.titlu, 'stare', giveaway_stare(g.id)
      ) order by g.starts_at desc)
      from giveaways g
    ), '[]'::jsonb),
    'giveaway', (
      select jsonb_build_object(
        'id', g.id,
        'slug', g.slug,
        'titlu', g.titlu,
        'starts_at', g.starts_at,
        'ends_at', g.ends_at,
        'stare', giveaway_stare(g.id),
        'castigator', case when g.confirmat_la is null then null else jsonb_build_object(
          'nume', g.castigator_nume,
          'instagram', g.castigator_instagram,
          'extras_la', g.castigator_extras_la,
          'confirmat_la', g.confirmat_la
        ) end,
        'incheiat_la', g.incheiat_la,
        'total_participari', g.total_participari
      )
      from giveaways g where g.id = v_id
    ),
    'participari', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nume', e.nume,
        'telefon', e.telefon,
        'email', e.email,
        'instagram', e.instagram,
        'acord_contact', e.acord_contact,
        'created_at', e.created_at,
        'extrasa_la', e.extrasa_la,
        'inlocuita_la', e.inlocuita_la
      ) order by e.created_at, e.id)
      from giveaway_entries e where e.giveaway_id = v_id
    ), '[]'::jsonb)
  );
end;
$function$;

-- Ștergerea e definitivă și merge în orice stare: e și calea prin care o
-- persoană e scoasă la cerere.
create or replace function runlift.admin_giveaway_sterge(p_token uuid, p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_giveaway uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  delete from giveaway_entries where id = p_id returning giveaway_id into v_giveaway;
  if v_giveaway is null then raise exception 'participare_inexistenta'; end if;

  insert into admin_events (tip, detaliu)
  values ('giveaway_stergere', jsonb_build_object(
    'giveaway', (select g.slug from giveaways g where g.id = v_giveaway),
    'participare', p_id
  ));
end;
$function$;

-- Prima extragere și reextragerea. Rândul giveaway-ului e blocat, deci două
-- apăsări simultane nu pot produce doi extrași. Alegerea se face aici, cu o
-- sursă aleatoare criptografică, nu în pagina de admin.
create or replace function runlift.admin_giveaway_extrage(p_token uuid, p_giveaway_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_g        giveaways%rowtype;
  v_eligibile int;
  v_ales     uuid;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select * into v_g from giveaways where id = p_giveaway_id for update;
  if not found then raise exception 'giveaway_inexistent'; end if;
  if v_g.incheiat_la is not null then raise exception 'giveaway_incheiat'; end if;
  if now() < v_g.ends_at then raise exception 'giveaway_deschis'; end if;

  select count(*) into v_eligibile
    from giveaway_entries where giveaway_id = v_g.id and extrasa_la is null;
  -- Refuzul vine ÎNAINTE de orice scriere: persoana extrasă acum rămâne extrasă.
  if v_eligibile = 0 then raise exception 'fara_participari'; end if;

  -- Reextragere: cine era extras, confirmat sau nu, iese din joc și rămâne marcat.
  update giveaway_entries set inlocuita_la = now()
   where giveaway_id = v_g.id and extrasa_la is not null and inlocuita_la is null;
  update giveaways
     set confirmat_la = null, castigator_nume = null,
         castigator_instagram = null, castigator_extras_la = null
   where id = v_g.id;

  select id into v_ales
    from giveaway_entries
   where giveaway_id = v_g.id and extrasa_la is null
   order by gen_random_uuid()
   limit 1;
  update giveaway_entries set extrasa_la = now() where id = v_ales;

  insert into admin_events (tip, detaliu)
  values ('giveaway_extragere', jsonb_build_object(
    'giveaway', v_g.slug, 'participare', v_ales, 'din', v_eligibile
  ));
  return v_ales;
end;
$function$;

create or replace function runlift.admin_giveaway_confirma(p_token uuid, p_giveaway_id uuid)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_g     giveaways%rowtype;
  v_extras giveaway_entries%rowtype;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select * into v_g from giveaways where id = p_giveaway_id for update;
  if not found then raise exception 'giveaway_inexistent'; end if;
  if v_g.incheiat_la is not null then raise exception 'giveaway_incheiat'; end if;

  select * into v_extras from giveaway_entries
   where giveaway_id = v_g.id and extrasa_la is not null and inlocuita_la is null;
  if not found then raise exception 'fara_extras'; end if;
  -- A doua confirmare ar muta momentul confirmării și ar dubla urma.
  if v_g.confirmat_la is not null then raise exception 'deja_confirmat'; end if;

  update giveaways
     set confirmat_la = now(),
         castigator_nume = v_extras.nume,
         castigator_instagram = v_extras.instagram,
         castigator_extras_la = v_extras.extrasa_la
   where id = v_g.id;

  insert into admin_events (tip, detaliu)
  values ('giveaway_confirmare', jsonb_build_object('giveaway', v_g.slug, 'participare', v_extras.id));
end;
$function$;

-- Încheierea e ireversibilă: șterge participările fără acord de contact.
-- Întoarce câte a șters.
create or replace function runlift.admin_giveaway_incheie(p_token uuid, p_giveaway_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_g      giveaways%rowtype;
  v_total  int;
  v_sterse int;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select * into v_g from giveaways where id = p_giveaway_id for update;
  if not found then raise exception 'giveaway_inexistent'; end if;
  if v_g.incheiat_la is not null then raise exception 'giveaway_incheiat'; end if;
  if v_g.confirmat_la is null then raise exception 'fara_castigator'; end if;

  select count(*) into v_total from giveaway_entries where giveaway_id = v_g.id;
  delete from giveaway_entries where giveaway_id = v_g.id and not acord_contact;
  get diagnostics v_sterse = row_count;

  update giveaways set incheiat_la = now(), total_participari = v_total where id = v_g.id;

  insert into admin_events (tip, detaliu)
  values ('giveaway_incheiere', jsonb_build_object(
    'giveaway', v_g.slug, 'total', v_total, 'sterse', v_sterse
  ));
  return v_sterse;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Drepturile funcțiilor
-- ---------------------------------------------------------------------------

-- Ajutoarele și garda: doar pe server.
revoke all on function runlift.giveaway_cheie_telefon(text) from public, anon, authenticated;
revoke all on function runlift.giveaway_curent() from public, anon, authenticated;
revoke all on function runlift.giveaway_stare(uuid) from public, anon, authenticated;
revoke all on function runlift.giveaway_entries_guard() from public, anon, authenticated;

revoke all on function runlift.public_giveaway() from public, anon, authenticated, service_role;
grant execute on function runlift.public_giveaway() to anon, authenticated, service_role;

-- Același grant ca la celelalte RPC-uri de admin: cheia publică poate APELA
-- funcția, dar prima linie din ea cere un token de sesiune valid.
revoke all on function runlift.admin_giveaway_date(uuid, uuid) from public;
grant execute on function runlift.admin_giveaway_date(uuid, uuid) to anon, authenticated, service_role;
revoke all on function runlift.admin_giveaway_sterge(uuid, uuid) from public;
grant execute on function runlift.admin_giveaway_sterge(uuid, uuid) to anon, authenticated, service_role;
revoke all on function runlift.admin_giveaway_extrage(uuid, uuid) from public;
grant execute on function runlift.admin_giveaway_extrage(uuid, uuid) to anon, authenticated, service_role;
revoke all on function runlift.admin_giveaway_confirma(uuid, uuid) from public;
grant execute on function runlift.admin_giveaway_confirma(uuid, uuid) to anon, authenticated, service_role;
revoke all on function runlift.admin_giveaway_incheie(uuid, uuid) from public;
grant execute on function runlift.admin_giveaway_incheie(uuid, uuid) to anon, authenticated, service_role;

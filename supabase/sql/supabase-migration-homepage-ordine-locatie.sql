-- Migrare: ordinea de pe ecranul dintre ediții + locul antrenamentelor pentru site.
--
-- Planul: docs/plans/2026-10-11-1210-feat-homepage-ordine-si-locatie-configurabile-plan.md
--
-- Trei piese:
--
--  1. `runlift.homepage_settings` — un singur rând, `trial_first`. Tabel propriu,
--     nu cheie în documentul ediției (o publicare nouă l-ar înlocui) și nici
--     coloană în `trial_config` (acolo salvarea cere toate câmpurile probei).
--
--  2. `runlift.public_homepage()` — ce citește site-ul, fără autentificare:
--     ordinea și locul din `public.bot_config`, adică exact locul pe care îl
--     folosesc sondajele și botul de probă. Răspunde și când botul de probă e
--     oprit; `public_trial_config` tace atunci, deci n-ar putea purta ordinea.
--
--  3. `runlift.admin_set_homepage_order()` — maneta din tabul Coming Soon. Ca
--     `admin_set_coming_soon`: token verificat în funcție, efect imediat, urmă
--     în `admin_events`.
--
-- Se poate rula de mai multe ori. Nu atinge `public.bot_config`: locul se
-- editează din Sala → Bot, ca până acum.

create table if not exists runlift.homepage_settings (
  id smallint primary key default 1 check (id = 1),
  trial_first boolean not null default false,
  updated_at timestamptz not null default now()
);

-- RLS pornit, fără politici: tabelul se atinge doar prin funcțiile de mai jos.
alter table runlift.homepage_settings enable row level security;
revoke all on table runlift.homepage_settings from public, anon, authenticated;

insert into runlift.homepage_settings (id) values (1) on conflict (id) do nothing;

create or replace function runlift.public_homepage()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  -- Fără rând de setări sau fără configul botului, implicitele: antrenamentul
  -- primul și niciun loc (site-ul cade pe locul din cod).
  select jsonb_build_object(
    'trial_first', coalesce((select s.trial_first from runlift.homepage_settings s where s.id = 1), false),
    'training_location', (select c.location from public.bot_config c where c.id = 1)
  );
$function$;

revoke all on function runlift.public_homepage() from public, anon, authenticated, service_role;
grant execute on function runlift.public_homepage() to anon, authenticated, service_role;

create or replace function runlift.admin_set_homepage_order(p_token uuid, p_trial_first boolean)
returns void
language plpgsql
security definer
set search_path to 'runlift'
as $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_trial_first is null then raise exception 'config_invalid: ordinea lipsește'; end if;

  insert into homepage_settings (id, trial_first, updated_at)
  values (1, p_trial_first, now())
  on conflict (id) do update set trial_first = excluded.trial_first, updated_at = excluded.updated_at;

  insert into admin_events (tip, detaliu)
  values ('homepage_order_set', jsonb_build_object('trial_first', p_trial_first));
end;
$function$;

-- Același grant ca la celelalte RPC-uri de admin: cheia publică poate APELA
-- funcția, dar prima linie din ea cere un token de sesiune valid.
revoke all on function runlift.admin_set_homepage_order(uuid, boolean) from public;
grant execute on function runlift.admin_set_homepage_order(uuid, boolean)
  to anon, authenticated, service_role;

alter table runlift.homepage_settings
  add column if not exists giveaway_visible boolean not null default true;

create or replace function runlift.public_homepage()
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'trial_first', coalesce(s.trial_first, false),
    'training_location', (select c.location from public.bot_config c where c.id = 1),
    'giveaway_visible', coalesce(s.giveaway_visible, true)
  )
  from (values (1)) as homepage(id)
  left join runlift.homepage_settings s on s.id = homepage.id;
$function$;

revoke all on function runlift.public_homepage() from public, anon, authenticated, service_role;
grant execute on function runlift.public_homepage() to anon, authenticated, service_role;

create or replace function runlift.admin_set_homepage_giveaway(p_token uuid, p_visible boolean)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  if p_visible is null then raise exception 'config_invalid: vizibilitatea lipsește'; end if;

  insert into runlift.homepage_settings (id, giveaway_visible, updated_at)
  values (1, p_visible, now())
  on conflict (id) do update set giveaway_visible = excluded.giveaway_visible, updated_at = excluded.updated_at;

  insert into runlift.admin_events (tip, detaliu)
  values ('homepage_giveaway_set', jsonb_build_object('giveaway_visible', p_visible));
end;
$function$;

revoke all on function runlift.admin_set_homepage_giveaway(uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_set_homepage_giveaway(uuid, boolean) to anon, authenticated, service_role;

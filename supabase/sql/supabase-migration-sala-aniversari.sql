begin;

create or replace function public.telegram_birthday_date_valid(p_day integer, p_month integer)
returns boolean language sql immutable set search_path = ''
as $$
  select case when p_day is null or p_month is null then p_day is null and p_month is null
    else p_month between 1 and 12 and p_day between 1 and case
      when p_month = 2 then 29
      when p_month in (4, 6, 9, 11) then 30
      else 31 end
  end;
$$;

create table if not exists public.telegram_birthday_preferences (
  telegram_user_id bigint primary key,
  day integer,
  month integer,
  source text check (source in ('telegram', 'manual', 'legacy')),
  enabled boolean not null default false,
  import_blocked boolean not null default false,
  revision bigint not null default 0,
  check (public.telegram_birthday_date_valid(day, month)),
  check ((day is null) = (source is null))
);

create table if not exists public.telegram_birthday_deliveries (
  telegram_user_id bigint not null,
  greeting_year integer not null,
  outcome text not null default 'claimed' check (outcome in ('claimed', 'sent', 'rejected', 'uncertain')),
  primary key (telegram_user_id, greeting_year)
);

alter table public.telegram_birthday_preferences enable row level security;
alter table public.telegram_birthday_deliveries enable row level security;
revoke all on table public.telegram_birthday_preferences, public.telegram_birthday_deliveries
  from public, anon, authenticated, service_role;
grant select, insert, update on table public.telegram_birthday_preferences, public.telegram_birthday_deliveries to service_role;

insert into public.telegram_birthday_preferences (telegram_user_id, day, month, source, enabled)
select telegram_user_id, birth_day, birth_month, 'legacy', birthday_greeting
from public.telegram_member_profiles where birth_day is not null
on conflict (telegram_user_id) do nothing;

create or replace function public.telegram_save_training_profile(p_user_id bigint, p_name text, p_goal text)
returns void language plpgsql security invoker set search_path = ''
as $$
begin
  insert into public.telegram_member_profiles (telegram_user_id, display_name, training_goal)
  values (p_user_id, p_name, p_goal)
  on conflict (telegram_user_id) do update
  set display_name = excluded.display_name, training_goal = excluded.training_goal;

  if not exists (select 1 from public.members where telegram_user_id = p_user_id) then
    insert into public.telegram_unmatched (telegram_user_id)
    values (p_user_id) on conflict (telegram_user_id) do nothing;
  end if;
end;
$$;

create or replace function public.telegram_birthday_preference(p_user_id bigint)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(
    (select to_jsonb(p) - 'telegram_user_id' from public.telegram_birthday_preferences p
      where p.telegram_user_id = p_user_id),
    '{"day":null,"month":null,"source":null,"enabled":false,"import_blocked":false,"revision":0}'::jsonb
  );
$$;

create or replace function public.telegram_change_birthday(
  p_user_id bigint, p_action text, p_day integer, p_month integer, p_lookup_ok boolean, p_expected_revision bigint
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare
  v_pref public.telegram_birthday_preferences;
  v_use_lookup boolean;
begin
  if p_action is null or p_action not in ('enable', 'disable', 'clear', 'refresh') then
    raise exception 'birthday_action_invalid';
  end if;
  if not public.telegram_birthday_date_valid(p_day, p_month) then raise exception 'birthday_invalid'; end if;
  if p_action <> 'refresh' then
    insert into public.telegram_birthday_preferences (telegram_user_id)
    values (p_user_id) on conflict (telegram_user_id) do nothing;
  end if;
  select * into v_pref from public.telegram_birthday_preferences where telegram_user_id = p_user_id for update;
  if not found or (p_expected_revision is not null and v_pref.revision <> p_expected_revision) then
    return public.telegram_birthday_preference(p_user_id);
  end if;

  v_use_lookup := p_lookup_ok is true and (v_pref.source is null or v_pref.source = 'telegram');
  if p_action = 'refresh' and (not v_pref.enabled or v_pref.import_blocked or not v_use_lookup) then
    return to_jsonb(v_pref) - 'telegram_user_id';
  end if;
  if p_action = 'enable' or p_action = 'refresh' then
    update public.telegram_birthday_preferences set
      enabled = true,
      import_blocked = false,
      day = case when v_use_lookup then p_day else day end,
      month = case when v_use_lookup then p_month else month end,
      source = case when v_use_lookup then case when p_day is not null then 'telegram' end else source end,
      revision = revision + 1
    where telegram_user_id = p_user_id;
  elsif p_action = 'disable' then
    update public.telegram_birthday_preferences set enabled = false, revision = revision + 1
    where telegram_user_id = p_user_id;
  else
    update public.telegram_birthday_preferences set
      day = null, month = null, source = null, enabled = false, import_blocked = true, revision = revision + 1
    where telegram_user_id = p_user_id;
    update public.telegram_member_profiles set birth_day = null, birth_month = null, birthday_greeting = false
    where telegram_user_id = p_user_id;
  end if;
  return public.telegram_birthday_preference(p_user_id);
end;
$$;

create or replace function runlift.admin_sala_read_birthday(p_token uuid, p_membru uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare v_telegram_id bigint;
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select telegram_user_id into v_telegram_id from public.members where id = p_membru;
  if not found then raise exception 'membru_inexistent'; end if;
  if v_telegram_id is null then raise exception 'fara_telegram'; end if;
  return public.telegram_birthday_preference(v_telegram_id);
end;
$$;

create or replace function runlift.admin_sala_set_birthday(
  p_token uuid, p_membru uuid, p_telegram_id bigint, p_day integer, p_month integer
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_telegram_id bigint;
begin
  if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  select telegram_user_id into v_telegram_id from public.members where id = p_membru for update;
  if not found then raise exception 'membru_inexistent'; end if;
  if v_telegram_id is null then raise exception 'fara_telegram'; end if;
  if v_telegram_id is distinct from p_telegram_id then raise exception 'cont_telegram_schimbat'; end if;
  if not public.telegram_birthday_date_valid(p_day, p_month) then raise exception 'birthday_invalid'; end if;

  insert into public.telegram_birthday_preferences (telegram_user_id, day, month, source, import_blocked)
  values (v_telegram_id, p_day, p_month, case when p_day is not null then 'manual' end, p_day is null)
  on conflict (telegram_user_id) do update set
    day = excluded.day, month = excluded.month, source = excluded.source, import_blocked = excluded.import_blocked,
    revision = telegram_birthday_preferences.revision + 1;
  if p_day is null then
    update public.telegram_member_profiles set birth_day = null, birth_month = null, birthday_greeting = false
    where telegram_user_id = v_telegram_id;
  end if;
  return public.telegram_birthday_preference(v_telegram_id);
end;
$$;

create or replace function public.telegram_birthday_candidates(p_date date)
returns table (telegram_user_id bigint, source text, display_name text, revision bigint)
language sql stable security invoker set search_path = ''
as $$
  select p.telegram_user_id, p.source, coalesce(profile.display_name, m.full_name), p.revision
  from public.telegram_birthday_preferences p
  left join public.telegram_member_profiles profile on profile.telegram_user_id = p.telegram_user_id
  left join public.members m on m.telegram_user_id = p.telegram_user_id
  where p.enabled and p.day = extract(day from p_date) and p.month = extract(month from p_date)
    and not exists (
      select 1 from public.telegram_birthday_deliveries d
      where d.telegram_user_id = p.telegram_user_id and d.greeting_year = extract(year from p_date)
    )
  order by p.telegram_user_id;
$$;

create or replace function public.telegram_claim_birthday(p_user_id bigint, p_date date, p_revision bigint)
returns boolean language plpgsql security invoker set search_path = ''
as $$
begin
  perform 1 from public.telegram_birthday_preferences
  where telegram_user_id = p_user_id and revision = p_revision and enabled
    and day = extract(day from p_date) and month = extract(month from p_date)
  for update;
  if not found then return false; end if;

  insert into public.telegram_birthday_deliveries (telegram_user_id, greeting_year)
  values (p_user_id, extract(year from p_date)::integer)
  on conflict (telegram_user_id, greeting_year) do nothing;
  return found;
end;
$$;

create or replace function public.telegram_finish_birthday(p_user_id bigint, p_date date, p_outcome text)
returns void language sql security invoker set search_path = ''
as $$
  update public.telegram_birthday_deliveries set outcome = p_outcome
  where telegram_user_id = p_user_id and greeting_year = extract(year from p_date)
    and outcome = 'claimed' and p_outcome in ('sent', 'rejected', 'uncertain');
$$;

revoke all on function public.telegram_birthday_date_valid(integer, integer),
  public.telegram_save_training_profile(bigint, text, text), public.telegram_birthday_preference(bigint),
  public.telegram_change_birthday(bigint, text, integer, integer, boolean, bigint),
  public.telegram_birthday_candidates(date), public.telegram_claim_birthday(bigint, date, bigint),
  public.telegram_finish_birthday(bigint, date, text)
  from public, anon, authenticated, service_role;
grant execute on function public.telegram_birthday_date_valid(integer, integer),
  public.telegram_save_training_profile(bigint, text, text), public.telegram_birthday_preference(bigint),
  public.telegram_change_birthday(bigint, text, integer, integer, boolean, bigint),
  public.telegram_birthday_candidates(date), public.telegram_claim_birthday(bigint, date, bigint),
  public.telegram_finish_birthday(bigint, date, text) to service_role;

revoke all on function runlift.admin_sala_read_birthday(uuid, uuid),
  runlift.admin_sala_set_birthday(uuid, uuid, bigint, integer, integer) from public, anon, authenticated, service_role;
grant execute on function runlift.admin_sala_read_birthday(uuid, uuid),
  runlift.admin_sala_set_birthday(uuid, uuid, bigint, integer, integer) to anon, authenticated, service_role;

commit;

begin;

create table if not exists public.telegram_feedback (
  id uuid primary key,
  feeling integer not null check (feeling between 1 and 4),
  topics text[] not null check (
    cardinality(topics) between 1 and 6
    and array_position(topics, null) is null
    and topics <@ array['run', 'strength', 'technique', 'beginners', 'social', 'other']::text[]
  ),
  comment text check (char_length(btrim(comment)) between 1 and 600),
  submitted_on date not null default ((now() at time zone 'Europe/Chisinau')::date)
);

create table if not exists public.telegram_member_profiles (
  telegram_user_id bigint primary key,
  display_name text not null check (char_length(btrim(display_name)) between 2 and 80),
  birth_day integer,
  birth_month integer,
  birthday_greeting boolean not null default false,
  training_goal text check (char_length(btrim(training_goal)) between 1 and 500),
  check (
    (birth_day is null and birth_month is null and not birthday_greeting)
    or (
      birth_day is not null and birth_month is not null
      and birth_month between 1 and 12
      and birth_day between 1 and case
        when birth_month = 2 then 29
        when birth_month in (4, 6, 9, 11) then 30
        else 31 end
    )
  )
);

alter table public.telegram_feedback enable row level security;
alter table public.telegram_member_profiles enable row level security;
revoke all on table public.telegram_feedback, public.telegram_member_profiles from public, anon, authenticated, service_role;
grant select, insert on table public.telegram_feedback to service_role;
grant select, insert, update on table public.telegram_member_profiles to service_role;

create or replace function public.telegram_save_member_profile(
  p_user_id bigint, p_name text, p_day integer, p_month integer, p_greeting boolean, p_goal text
) returns void
language plpgsql security invoker set search_path = ''
as $$
begin
  insert into public.telegram_member_profiles
    (telegram_user_id, display_name, birth_day, birth_month, birthday_greeting, training_goal)
  values (p_user_id, p_name, p_day, p_month, p_greeting, p_goal)
  on conflict (telegram_user_id) do update set
    display_name = excluded.display_name,
    birth_day = excluded.birth_day,
    birth_month = excluded.birth_month,
    birthday_greeting = excluded.birthday_greeting,
    training_goal = excluded.training_goal;

  if not exists (select 1 from public.members where telegram_user_id = p_user_id) then
    -- Add the account to the existing linking queue without exposing form fields there.
    insert into public.telegram_unmatched (telegram_user_id)
    values (p_user_id) on conflict (telegram_user_id) do nothing;
  end if;
end;
$$;

create or replace function public.telegram_feedback_report(p_page integer) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with counts as (
    select
      count(*) as total,
      count(*) filter (where feeling = 1) as feeling_1,
      count(*) filter (where feeling = 2) as feeling_2,
      count(*) filter (where feeling = 3) as feeling_3,
      count(*) filter (where feeling = 4) as feeling_4,
      count(*) filter (where 'run' = any(topics)) as run,
      count(*) filter (where 'strength' = any(topics)) as strength,
      count(*) filter (where 'technique' = any(topics)) as technique,
      count(*) filter (where 'beginners' = any(topics)) as beginners,
      count(*) filter (where 'social' = any(topics)) as social,
      count(*) filter (where 'other' = any(topics)) as other,
      count(comment) as comment_count
    from public.telegram_feedback
  ), comment_page as (
    select comment, submitted_on, id from public.telegram_feedback where comment is not null
    order by submitted_on desc, id desc
    limit 5 offset ((greatest(p_page, 1)::bigint - 1) * 5)
  )
  select jsonb_build_object(
    'total', total,
    'feelings', jsonb_build_array(feeling_1, feeling_2, feeling_3, feeling_4),
    'topics', jsonb_build_array(run, strength, technique, beginners, social, other),
    'comment_count', comment_count,
    'comments', coalesce(
      (select jsonb_agg(comment order by submitted_on desc, id desc) from comment_page), '[]'::jsonb
    )
  ) from counts;
$$;

create or replace function public.telegram_profiles_report(p_page integer) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with profile_page as (
    select
      p.telegram_user_id, p.display_name, p.training_goal, (m.id is not null) as matched
    from public.telegram_member_profiles as p
    left join public.members as m on m.telegram_user_id = p.telegram_user_id
    order by matched, p.display_name, p.telegram_user_id
    limit 5 offset ((greatest(p_page, 1)::bigint - 1) * 5)
  )
  select jsonb_build_object(
    'total', (select count(*) from public.telegram_member_profiles),
    'profiles', coalesce(
      (select jsonb_agg(profile_page order by matched, display_name, telegram_user_id) from profile_page), '[]'::jsonb
    )
  );
$$;

revoke all on function public.telegram_save_member_profile(bigint, text, integer, integer, boolean, text),
  public.telegram_feedback_report(integer), public.telegram_profiles_report(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.telegram_save_member_profile(bigint, text, integer, integer, boolean, text),
  public.telegram_feedback_report(integer), public.telegram_profiles_report(integer) to service_role;

commit;

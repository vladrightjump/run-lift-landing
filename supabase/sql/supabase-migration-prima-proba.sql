begin;

-- Same 14 local dates and concrete-session precedence as trialSessions in the bot.
create or replace function runlift.public_trial_config() returns jsonb
language sql stable security definer set search_path = '' as $$
  with eligible as (
    select c.*, c.enabled and coalesce(c.permissions_verified_at > now() - interval '24 hours', false) as ready
    from public.trial_config c where c.id = 1
  ), days as (
    select (now() at time zone 'Europe/Chisinau')::date + n as day from generate_series(0, 13) n
  ), schedule as (
    select (d.day + coalesce(s.starts_at, b.training_time::time)) at time zone 'Europe/Chisinau' as starts_at,
           coalesce(s.location, b.location) as location
    from days d cross join public.bot_config b
    left join public.training_sessions s on s.session_date = d.day
    where b.id = 1 and (s.status = 'scheduled' or
      (s.id is null and ((extract(dow from d.day)::int + 6) % 7) = any(b.poll_days)))
  )
  select jsonb_build_object('enabled', ready, 'bot_username', bot_username, 'contact_text', contact_text)
    || case when ready then jsonb_build_object(
      'bring_text', bring_text, 'trial_price', trial_price,
      'next_session', (select jsonb_build_object('starts_at', starts_at, 'location', location)
        from schedule where starts_at > now() order by starts_at limit 1))
      else '{}'::jsonb end
  from eligible;
$$;

commit;

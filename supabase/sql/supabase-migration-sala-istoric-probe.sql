-- Istoricul pe persoană în ecranul Probe (planul
-- `docs/plans/2026-10-11-2142-feat-alerta-inactivitate-si-istoric-probe-plan.md`, U2).
--
-- Se aplică prin MCP `apply_migration` ca `sala_08_istoric_probe`.
--
-- Doar adaugă: tabelul `trial_events`, triggere AFTER pe tabelele `trial_*`,
-- două coloane nullabile pe `trial_prospects` (numele din profilul Telegram) și
-- cheia `events` în `runlift.admin_trial_data`. Botul vechi scrie la fel ca înainte;
-- triggerele doar adaugă rânduri. Se poate rula de mai multe ori.
--
-- Evenimentele se scriu în baza de date, nu în cod: prind orice drum — botul,
-- funcțiile `trial_*`, RPC-urile din admin. O reprogramare apare ca „anulat" urmat
-- de „a ales proba". Triggerele nu înghit erorile.
--
-- Persoanele de dinainte primesc un singur eveniment „a pornit botul" la data
-- lor, marcat `backfilled`: istoricul complet începe de la această migrare.
--
-- ÎNTOARCERE: `drop table public.trial_events cascade;`, `drop function` pentru
-- `public.trial_event_*` (triggerele cad odată cu ele), coloanele noi rămân
-- inofensive, iar `admin_trial_data` se reface din instantaneul anterior.

begin;

create table if not exists public.trial_events (
  id uuid primary key default gen_random_uuid(),
  -- Ordinea în aceeași tranzacție (now() e același pentru toate rândurile ei).
  seq bigint generated always as identity,
  prospect_id uuid not null references public.trial_prospects(id) on delete cascade,
  kind text not null,
  occurred_at timestamptz not null default clock_timestamp(),
  detail jsonb not null default '{}'::jsonb,
  backfilled boolean not null default false
);
create index if not exists trial_events_prospect on public.trial_events (prospect_id, occurred_at, seq);

alter table public.trial_events enable row level security;
revoke all on public.trial_events from public, anon, authenticated;

alter table public.trial_prospects add column if not exists telegram_first_name text;
alter table public.trial_prospects add column if not exists telegram_last_name text;

create or replace function public.trial_event_add(p_prospect uuid, p_kind text, p_detail jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.trial_events (prospect_id, kind, detail) values (p_prospect, p_kind, coalesce(p_detail, '{}'::jsonb));
$$;

-- Persoana: pornirea botului, numele, mesajele oprite/repornite, grupul, închiderea.
-- Schimbările doar de profil Telegram nu produc evenimente.
create or replace function public.trial_event_prospect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.trial_event_add(new.id, 'started', jsonb_build_object('source', new.source));
    if new.full_name is not null then
      perform public.trial_event_add(new.id, 'name_set', jsonb_build_object('name', new.full_name));
    end if;
    return null;
  end if;

  if new.full_name is not null and new.full_name is distinct from old.full_name then
    perform public.trial_event_add(new.id, 'name_set', jsonb_build_object('name', new.full_name));
  end if;
  if new.dm_enabled is distinct from old.dm_enabled then
    perform public.trial_event_add(new.id, case when new.dm_enabled then 'dm_on' else 'dm_off' end);
  end if;
  if new.stage is distinct from old.stage and new.stage in ('in_group', 'closed') then
    perform public.trial_event_add(new.id, case when new.stage = 'in_group' then 'joined_group' else 'closed' end);
  end if;
  return null;
end;
$$;

-- Proba: aleasă, mutată, anulată, prezența (și corectarea ei), continuarea.
create or replace function public.trial_event_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.trial_event_add(new.prospect_id, 'booked',
      jsonb_build_object('session_start', new.session_start, 'location', new.session_location));
    return null;
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    perform public.trial_event_add(new.prospect_id, 'cancelled',
      jsonb_build_object('session_start', old.session_start));
  elsif new.status <> 'cancelled'
    and (new.session_start is distinct from old.session_start or new.session_location is distinct from old.session_location) then
    perform public.trial_event_add(new.prospect_id, 'session_changed',
      jsonb_build_object('session_start', new.session_start, 'location', new.session_location));
  end if;

  if new.attendance_at is not null and new.attendance_at is distinct from old.attendance_at then
    perform public.trial_event_add(new.prospect_id,
      case when old.attendance_at is not null then 'attendance_corrected'
           when new.status = 'attended' then 'attended'
           else 'absent' end,
      jsonb_build_object('attended', new.status = 'attended', 'actor', new.attendance_actor));
  end if;

  if new.continuation is not null and new.continuation is distinct from old.continuation then
    perform public.trial_event_add(new.prospect_id,
      case when new.continuation = 'yes' then 'continuation_yes' else 'continuation_no' end);
  end if;
  return null;
end;
$$;

create or replace function public.trial_event_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.trial_event_add(new.prospect_id, 'question', jsonb_build_object('body', left(new.body, 200)));
  return null;
end;
$$;

-- Invitația în grup: contează doar livrarea confirmată.
create or replace function public.trial_event_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'invite' and new.status = 'sent' and old.status is distinct from 'sent' then
    perform public.trial_event_add(new.prospect_id, 'invite_sent');
  end if;
  return null;
end;
$$;

drop trigger if exists trial_events_prospect on public.trial_prospects;
create trigger trial_events_prospect after insert or update on public.trial_prospects
  for each row execute function public.trial_event_prospect();

drop trigger if exists trial_events_booking on public.trial_bookings;
create trigger trial_events_booking after insert or update on public.trial_bookings
  for each row execute function public.trial_event_booking();

drop trigger if exists trial_events_question on public.trial_questions;
create trigger trial_events_question after insert on public.trial_questions
  for each row execute function public.trial_event_question();

drop trigger if exists trial_events_message on public.trial_messages;
create trigger trial_events_message after update on public.trial_messages
  for each row execute function public.trial_event_message();

-- Persoanele de dinainte: doar pornirea botului, marcată reconstituită.
insert into public.trial_events (prospect_id, kind, occurred_at, detail, backfilled)
select p.id, 'started', p.created_at, jsonb_build_object('source', p.source), true
  from public.trial_prospects p
 where not exists (select 1 from public.trial_events e where e.prospect_id = p.id);

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'trial\_event\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

-- Ca înainte, plus `events`, în ordine cronologică.
CREATE OR REPLACE FUNCTION runlift.admin_trial_data(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if not runlift.admin_check_token(p_token) then raise exception 'invalid_token'; end if;
 return jsonb_build_object(
 'config',(select to_jsonb(c) from public.trial_config c where id=1),
 'prospects',coalesce((select jsonb_agg(p order by p.created_at desc) from public.trial_prospects p),'[]'),
 'bookings',coalesce((select jsonb_agg(b order by b.created_at desc) from public.trial_bookings b),'[]'),
 'questions',coalesce((select jsonb_agg(q order by q.created_at desc) from public.trial_questions q),'[]'),
 'messages',coalesce((select jsonb_agg(m order by m.created_at desc) from public.trial_messages m),'[]'),
 'invitations',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'booking_id',i.booking_id,'expires_at',i.expires_at,'revoked_at',i.revoked_at)) from public.trial_invitations i),'[]'),
 'organizers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'telegram_user_id',telegram_user_id)) from public.members where is_admin and telegram_user_id is not null),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'prospect_id',e.prospect_id,'kind',e.kind,'occurred_at',e.occurred_at,'detail',e.detail,'backfilled',e.backfilled) order by e.occurred_at, e.seq) from public.trial_events e),'[]'));
end $function$;

commit;

-- Alerta de inactivitate cu acțiuni (planul
-- `docs/plans/2026-10-11-2142-feat-alerta-inactivitate-si-istoric-probe-plan.md`, U1).
--
-- Se aplică prin MCP `apply_migration` ca `sala_07_inactivitate`.
--
-- Doar adaugă: un tabel și funcții noi. Nu schimbă nimic din ce folosește botul
-- vechi, deci poate fi aplicată înaintea botului nou. Se poate rula de mai multe ori.
--
-- Un ciclu de alertă = un rând în `inactivity_reviews`. Un membru are cel mult un
-- ciclu activ (deschis, amânat sau cu scoaterea în coadă). Botul îl deschide,
-- trimite mesajele cu butoane și le salvează pe rând; decizia o ia
-- `inactivity_decide`, atomic: prima decizie câștigă.
--
-- „Inactiv" = 3 săptămâni calendaristice (luni–duminică) cu cel puțin un
-- antrenament neanulat, trecut, fără niciun „Da". Numărătoarea pornește după
-- săptămâna referinței: ultimul „Da", intrarea în grup sau ultimul ciclu încheiat
-- (Nu scoate, scos, ieșit, refuzat) — cea mai recentă dintre ele.
--
-- ÎNTOARCERE: `drop table public.inactivity_reviews cascade;` și `drop function`
-- pentru funcțiile `public.inactivity_*`. Botul vechi nu le folosește.

begin;

create table if not exists public.inactivity_reviews (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  anchor_date date not null,
  weeks_missed integer not null,
  status text not null default 'open'
    check (status in ('open', 'postponed', 'kick_queued', 'kicked', 'kick_failed', 'kept', 'returned', 'left', 'refused')),
  snooze_until timestamptz,
  decided_by bigint,
  decided_by_name text,
  decided_at timestamptz,
  result text,
  bot_action_id uuid references public.bot_actions(id),
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists inactivity_reviews_active
  on public.inactivity_reviews (member_id)
  where status in ('open', 'postponed', 'kick_queued');

alter table public.inactivity_reviews enable row level security;
revoke all on public.inactivity_reviews from public, anon, authenticated;

-- Săptămânile cu antrenamente trecute de după săptămâna referinței.
create or replace function public.inactivity_weeks(p_anchor date, p_today date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct date_trunc('week', t.session_date))::integer
    from public.training_sessions t
   where t.status <> 'cancelled'
     and t.session_date < p_today
     and date_trunc('week', t.session_date) > date_trunc('week', p_anchor);
$$;

-- Referința unui membru: cea mai recentă dintre ultimul „Da", intrarea în grup
-- și ultimul ciclu încheiat cu o decizie sau o ieșire (Nu scoate, scos, ieșit,
-- refuzat) — ziua din Chișinău. Cine e scos și reinvitat pornește de la zero.
create or replace function public.inactivity_anchor(p_member uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(
    s.last_attended,
    s.join_date,
    (select max((coalesce(r.decided_at, r.updated_at) at time zone 'Europe/Chisinau')::date)
       from public.inactivity_reviews r
      where r.member_id = s.id and r.status in ('kept', 'kicked', 'left', 'refused'))
  )
  from public.member_attendance_stats s
  where s.id = p_member;
$$;

-- Ciclul, cu datele membrului de care are nevoie mesajul.
create or replace function public.inactivity_json(p_review uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(r) || jsonb_build_object(
    'full_name', s.full_name,
    'telegram_user_id', s.telegram_user_id,
    'telegram_username', s.telegram_username,
    'last_yes', s.last_attended,
    'join_date', s.join_date
  )
  from public.inactivity_reviews r
  join public.member_attendance_stats s on s.id = r.member_id
  where r.id = p_review;
$$;

-- Membrii de alertat azi: activi, în grup, fără ciclu activ, cu 3+ săptămâni.
-- Organizatorii din `TELEGRAM_ADMIN_CHAT_IDS` îi mai exclude botul.
create or replace function public.inactivity_candidates(p_today date)
returns table (
  member_id uuid,
  full_name text,
  telegram_user_id bigint,
  telegram_username text,
  last_yes date,
  join_date date,
  anchor_date date,
  weeks_missed integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.full_name, c.telegram_user_id, c.telegram_username, c.last_attended, c.join_date, c.anchor, w.weeks
    from (
      select s.*, public.inactivity_anchor(s.id) as anchor
        from public.telegram_training_stats s
       where not s.is_admin
         and not exists (
           select 1 from public.inactivity_reviews r
            where r.member_id = s.id and r.status in ('open', 'postponed', 'kick_queued'))
    ) c
    cross join lateral (select public.inactivity_weeks(c.anchor, p_today) as weeks) w
   where w.weeks >= 3
   order by c.full_name;
$$;

-- Deschide un ciclu. Un ciclu activ existent nu e eroare: întoarce null.
create or replace function public.inactivity_open(p_member uuid, p_anchor date, p_weeks integer)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.inactivity_reviews (member_id, anchor_date, weeks_missed)
  values (p_member, p_anchor, p_weeks)
  on conflict (member_id) where status in ('open', 'postponed', 'kick_queued') do nothing
  returning id;
$$;

-- Mesajele trimise organizatorilor: [{ chat_id, message_id }].
create or replace function public.inactivity_set_messages(p_review uuid, p_messages jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.inactivity_reviews
     set messages = p_messages, updated_at = now()
   where id = p_review;
$$;

-- Niciun mesaj n-a plecat: ciclul dispare și se reîncearcă la rularea următoare.
create or replace function public.inactivity_discard(p_review uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.inactivity_reviews
   where id = p_review and status = 'open' and messages = '[]'::jsonb;
$$;

-- Decizia unui organizator: `kick`, `postpone` sau `keep`. Prima câștigă.
-- Întoarce { outcome: decided | already | refused, review }.
create or replace function public.inactivity_decide(
  p_review uuid, p_action text, p_actor bigint, p_name text, p_chat_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.inactivity_reviews;
  v_last date;
  v_in_group boolean;
  v_action uuid;
begin
  if p_action not in ('kick', 'postpone', 'keep') then
    raise exception 'inactivity_bad_action';
  end if;

  select * into r from public.inactivity_reviews where id = p_review for update;
  if not found then raise exception 'inactivity_review_missing'; end if;

  if r.status <> 'open' then
    return jsonb_build_object('outcome', 'already', 'review', public.inactivity_json(r.id));
  end if;

  if p_action = 'kick' then
    select s.last_attended into v_last from public.member_attendance_stats s where s.id = r.member_id;
    v_in_group := exists (select 1 from public.telegram_training_stats s where s.id = r.member_id);

    if v_last is not null and v_last > r.anchor_date then
      update public.inactivity_reviews
         set status = 'refused', result = 'returned', decided_by = p_actor, decided_by_name = p_name,
             decided_at = now(), updated_at = now()
       where id = r.id;
      return jsonb_build_object('outcome', 'refused', 'review', public.inactivity_json(r.id));
    end if;

    if not v_in_group then
      update public.inactivity_reviews
         set status = 'refused', result = 'left', decided_by = p_actor, decided_by_name = p_name,
             decided_at = now(), updated_at = now()
       where id = r.id;
      return jsonb_build_object('outcome', 'refused', 'review', public.inactivity_json(r.id));
    end if;

    begin
      v_action := public.queue_telegram_kick(r.member_id, null, p_chat_id, p_actor, p_name);
    exception when raise_exception then
      -- membru_admin, fara_telegram, telegram_changed: o stare, nu o defecțiune.
      update public.inactivity_reviews
         set status = 'refused', result = sqlerrm, decided_by = p_actor, decided_by_name = p_name,
             decided_at = now(), updated_at = now()
       where id = r.id;
      return jsonb_build_object('outcome', 'refused', 'review', public.inactivity_json(r.id));
    end;
    update public.inactivity_reviews
       set status = 'kick_queued', bot_action_id = v_action, decided_by = p_actor, decided_by_name = p_name,
           decided_at = now(), updated_at = now()
     where id = r.id;
  elsif p_action = 'postpone' then
    update public.inactivity_reviews
       set status = 'postponed', snooze_until = now() + interval '7 days', decided_by = p_actor,
           decided_by_name = p_name, decided_at = now(), updated_at = now()
     where id = r.id;
  else
    update public.inactivity_reviews
       set status = 'kept', decided_by = p_actor, decided_by_name = p_name, decided_at = now(), updated_at = now()
     where id = r.id;
  end if;

  return jsonb_build_object('outcome', 'decided', 'review', public.inactivity_json(r.id));
end;
$$;

-- Întreținerea zilnică, înaintea candidaților:
--   • a revenit (un „Da" după referință) → `returned`;
--   • nu mai e în grup sau nu mai e activ → `left`;
--   • amânarea a expirat (ziua ei a venit), tot fără „Da" → redeschis, cu
--     săptămânile recalculate și fără mesajele vechi (botul trimite altele);
--   • scoaterea din coadă s-a încheiat fără să-și raporteze rezultatul →
--     `kicked` / `kick_failed` din rândul `bot_actions` (`settled`).
-- Întoarce [{ change: returned | left | reopened | settled, review }].
create or replace function public.inactivity_maintain(p_today date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.inactivity_reviews;
  v_last date;
  v_change text;
  v_out jsonb := '[]'::jsonb;
begin
  for r in
    select * from public.inactivity_reviews
     where status in ('open', 'postponed')
     order by created_at
       for update
  loop
    select s.last_attended into v_last from public.member_attendance_stats s where s.id = r.member_id;
    v_change := null;

    if v_last is not null and v_last > r.anchor_date then
      update public.inactivity_reviews set status = 'returned', updated_at = now() where id = r.id;
      v_change := 'returned';
    elsif not exists (select 1 from public.telegram_training_stats s where s.id = r.member_id) then
      update public.inactivity_reviews set status = 'left', updated_at = now() where id = r.id;
      v_change := 'left';
    elsif r.status = 'postponed' and (r.snooze_until at time zone 'Europe/Chisinau')::date <= p_today then
      update public.inactivity_reviews
         set status = 'open', snooze_until = null, weeks_missed = public.inactivity_weeks(r.anchor_date, p_today),
             decided_by = null, decided_by_name = null, decided_at = null, messages = '[]'::jsonb, updated_at = now()
       where id = r.id;
      v_change := 'reopened';
    end if;

    if v_change is not null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('change', v_change, 'review', public.inactivity_json(r.id)));
    end if;
  end loop;

  for r in
    update public.inactivity_reviews ir
       set status = case when a.status = 'done' then 'kicked' else 'kick_failed' end,
           result = coalesce(a.result, ir.result), updated_at = now()
      from public.bot_actions a
     where ir.status = 'kick_queued' and a.id = ir.bot_action_id and a.status <> 'pending'
    returning ir.*
  loop
    v_out := v_out || jsonb_build_array(jsonb_build_object('change', 'settled', 'review', public.inactivity_json(r.id)));
  end loop;
  return v_out;
end;
$$;

-- Rezultatul scoaterii din coadă, pentru ciclul care a cerut-o. Null dacă
-- acțiunea nu aparține unui ciclu (scoatere din admin sau prin /scoate).
create or replace function public.inactivity_kick_result(p_action uuid, p_ok boolean, p_result text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.inactivity_reviews
     set status = case when p_ok then 'kicked' else 'kick_failed' end, result = p_result, updated_at = now()
   where bot_action_id = p_action and status = 'kick_queued'
  returning id into v_id;
  if v_id is null then return null; end if;
  return public.inactivity_json(v_id);
end;
$$;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'inactivity\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

commit;

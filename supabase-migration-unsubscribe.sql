-- Faza C.2 — Dezabonare (unsubscribe) din emailurile în masă.
--
-- Context: emailurile de broadcast (reminder/anunț) nu aveau link de dezabonare —
-- problemă legală (consimțământ) și de deliverability (fără List-Unsubscribe, providerii
-- penalizează). Adăugăm un token per rând + un link public de dezabonare; RPC-urile de
-- recipients exclud dezabonații.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.

-- 1. Coloane pe ambele tabele-audiență. token_unsub e volatil (gen_random_uuid) → rândurile
--    existente primesc fiecare un UUID distinct la rewrite.
alter table runlift.registrations
  add column if not exists dezabonat_la timestamptz,
  add column if not exists token_unsub uuid not null default gen_random_uuid();

alter table runlift.launch_notifications
  add column if not exists dezabonat_la timestamptz,
  add column if not exists token_unsub uuid not null default gen_random_uuid();

-- 2. Recipients: adăugăm token_unsub în retur + excludem dezabonații.
--    (RETURNS TABLE își schimbă semnătura → drop + create.)
drop function if exists runlift.edition2_recipients();
create function runlift.edition2_recipients()
returns table(email text, nume text, token_unsub uuid)
language sql
set search_path to ''
as $$
  select email, nume, token_unsub
  from runlift.registrations
  where editie = (select value::smallint from runlift.app_config where key = 'current_event_edition')
    and dezabonat_la is null
  order by created_at;
$$;

drop function if exists runlift.waitlist_recipients();
create function runlift.waitlist_recipients()
returns table(email text, nume text, token_unsub uuid)
language sql
set search_path to ''
as $$
  select email, trim(coalesce(prenume,'') || ' ' || coalesce(nume,'')) as nume, token_unsub
  from runlift.launch_notifications
  where confirmat_la is not null
    and dezabonat_la is null
  order by created_at;
$$;

-- 3. RPC public de dezabonare — token-ul e secretul (UUID). Întoarce starea, nu date personale.
create or replace function runlift.unsubscribe(p_token uuid)
returns text
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare v_found int;
begin
  update registrations set dezabonat_la = now()
    where token_unsub = p_token and dezabonat_la is null;
  get diagnostics v_found = row_count;
  if v_found > 0 then return 'dezabonat'; end if;

  update launch_notifications set dezabonat_la = now()
    where token_unsub = p_token and dezabonat_la is null;
  get diagnostics v_found = row_count;
  if v_found > 0 then return 'dezabonat'; end if;

  if exists (select 1 from registrations where token_unsub = p_token)
     or exists (select 1 from launch_notifications where token_unsub = p_token) then
    return 'deja_dezabonat';
  end if;
  return 'invalid';
end;
$$;

grant execute on function runlift.unsubscribe(uuid) to anon, authenticated;

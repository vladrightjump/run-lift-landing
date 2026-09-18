-- Rejucarea unui anunț eșuat, doar pentru persoana respectivă.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
-- NU atinge schema `public` — e a gym-app + botul de Telegram (vezi MIGRATIONS.md).
--
-- ⚠️ PRECONDIȚIE: `supabase-migration-anunt-istoric.sql` aplicată înainte —
--    funcția de aici citește `anunt_recipients()`.
--
-- De ce o funcție separată și nu o ramură nouă în `admin_replay_lookup`:
--
-- `admin_replay_lookup` reconstruiește mesajul din ȘABLON. Pentru confirmări,
-- promovări și remindere e corect — acolo șablonul chiar e mesajul. Un anunț însă
-- e editat de operator în tabul „Emailuri" înainte de trimitere; rejucat din
-- șablon, ar pleca alt text decât cel pe care persoana trebuia să-l primească.
-- Aici sursa e rândul de jurnal: subiectul și textul efectiv trimise.
--
-- Separat mai e un motiv: `admin_replay_lookup` întoarce un tabel fără subiect și
-- text, iar adăugarea lor ar cere `drop function` + `create` pe o funcție pe care
-- se sprijină rejucările existente. Una nouă nu riscă nimic din ce merge deja.
--
-- Nu reia dezabonarea din jurnal: tokenul vine din `anunt_recipients()` DE ACUM.
-- Dacă persoana s-a dezabonat sau s-a înscris între timp la ediția curentă, nu
-- mai e în audiență și rejucarea e refuzată, cu motivul spus.

begin;

create or replace function runlift.admin_replay_anunt_lookup(p_token uuid, p_log_id uuid)
returns table (
  ok boolean, motiv text,
  email text, nume text, subiect text, text_email text,
  token_unsub uuid, editie smallint
)
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_log runlift.email_log;
  v_dest record;
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;

  select * into v_log from email_log where id = p_log_id;
  if v_log.id is null then
    return query select false, 'jurnal_lipsa', null::text, null::text, null::text,
                        null::text, null::uuid, null::smallint;
    return;
  end if;

  if v_log.mod <> 'anunt' then
    return query select false, 'mod_exclus', v_log.email, v_log.nume, null::text,
                        null::text, null::uuid, v_log.editie;
    return;
  end if;

  select * into v_dest
    from anunt_recipients('{}') a
   where lower(btrim(a.email)) = lower(btrim(v_log.email));

  -- `found`, nu `v_dest.email is null`: câmpurile unui `record` neatribuit nu se
  -- citesc sigur, iar o eroare aici ar fi arătat ca „rejucare eșuată".
  if not found then
    -- Două motive posibile, cu consecințe diferite pentru operator: dezabonarea
    -- e o cerere de respectat; înscrierea la ediția curentă e o veste bună.
    if exists (
      select 1 from registrations r
       where lower(btrim(r.email)) = lower(btrim(v_log.email)) and r.dezabonat_la is not null
      union all
      select 1 from launch_notifications l
       where lower(btrim(l.email)) = lower(btrim(v_log.email)) and l.dezabonat_la is not null
    ) then
      return query select false, 'dezabonat', v_log.email, v_log.nume, null::text,
                          null::text, null::uuid, v_log.editie;
    else
      return query select false, 'nu_mai_e_in_audienta', v_log.email, v_log.nume, null::text,
                          null::text, null::uuid, v_log.editie;
    end if;
    return;
  end if;

  return query select true, null::text, v_dest.email, v_dest.nume, v_log.subiect,
                      v_log.text_email, v_dest.token_unsub, v_log.editie;
end;
$function$;

-- O cheamă doar `send-email`, cu cheia de service. Întoarce tokenul de
-- dezabonare, deci nu are ce căuta în PostgREST cu cheia publică.
revoke execute on function runlift.admin_replay_anunt_lookup(uuid, uuid) from public, anon, authenticated;
grant execute on function runlift.admin_replay_anunt_lookup(uuid, uuid) to service_role;

commit;

-- --- VERIFICARE ---
--   select * from runlift.admin_replay_anunt_lookup('<token admin>', '<id rând anunt>');
--   -- ok = true, cu subiectul și textul din jurnal
--   select * from runlift.admin_replay_anunt_lookup('<token admin>', '<id rând confirm>');
--   -- ok = false, motiv = 'mod_exclus'

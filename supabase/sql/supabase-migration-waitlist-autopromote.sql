-- Auto-promovare din lista de așteptare când se eliberează un loc.
--
-- Context: până acum promovarea din `event_waitlist` era 100% manuală (butonul
-- „Promote" din /admin → `admin_promote_waitlist`). Ștergerea unui participant
-- (`admin_delete_registration`) doar făcea `delete`, fără să tragă pe nimeni de
-- pe lista de așteptare — deci un loc liber rămânea liber deși existau oameni în
-- așteptare. Migrarea de față adaugă un trigger care umple automat locul.
--
-- Proiect: ironworks-gym (whyndrjcezmtajbykeil), schema `runlift`.
--
-- Ce face:
--  1. `app_config.event_capacity` — capacitatea ediției în DB (până acum trăia
--     doar în frontend, `edition.ts` → TOTAL_SLOTS). Sursă de adevăr pentru trigger.
--  2. Trigger `AFTER DELETE` pe `registrations`: dacă ediția a scăzut sub
--     capacitate și există cineva în așteptare pe acea ediție, promovează
--     automat cel mai vechi (aceleași reguli ca `admin_promote_waitlist`).
--  3. Email automat către cel promovat (mod `promoted` în funcția edge
--     `send-email`), via `pg_net`. Best-effort — eșecul emailului nu rupe
--     ștergerea. Se trimite DOAR pentru ediția curentă (edițiile de test din
--     integrare, ex. 90111, nu declanșează email).

-- 1. Capacitatea în DB (fallback 20 = TOTAL_SLOTS din frontend).
insert into runlift.app_config (key, value)
values ('event_capacity', '20')
on conflict (key) do nothing;

-- 2. pg_net — ca triggerul să poată chema funcția edge de email.
create extension if not exists pg_net;

-- 3. Șablon editabil pentru emailul de promovare (fallback în cod dacă lipsește).
insert into runlift.email_templates (cheie, subiect, text_email)
values (
  'bulk_waitlist_promovare',
  'Ai loc confirmat — Run + Lift',
  'Salut, {prenume}!' || chr(10) || chr(10) ||
  'S-a eliberat un loc și ai fost mutat de pe lista de așteptare pe lista de ' ||
  'participanți. Locul tău la Run + Lift este acum confirmat!' || chr(10) || chr(10) ||
  'Îți trimitem detaliile în curând. Echipa Run + Lift'
)
on conflict (cheie) do nothing;

-- 4. Funcția de trigger.
create or replace function runlift.auto_promote_from_waitlist()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $$
declare
  v_cap int;
  v_w   runlift.event_waitlist;
  v_id  uuid;
begin
  -- Doar ediția curentă: nu reînviem waitlisteri într-o ediție încheiată (ștergerile
  -- de curățare pe ediții trecute nu trebuie să promoveze pe nimeni).
  if old.editie <> current_event_edition() then
    return old;
  end if;

  -- Capacitatea ediției (fallback 20 dacă lipsește din app_config).
  select coalesce((select value::int from app_config where key = 'event_capacity'), 20)
    into v_cap;

  -- Umple locul eliberat din lista de așteptare. Buclă doar ca să sară peste
  -- eventualii duplicați (rânduri de waitlist ale unui email deja înscris): la
  -- conflict îi scoatem din waitlist și încercăm următorul, ca locul chiar să se umple.
  -- `for update skip locked` împiedică două ștergeri concurente să tragă același
  -- rând (altfel un loc ar rămâne gol deși cineva așteaptă).
  loop
    -- Dacă ediția e tot la/peste capacitate, nu s-a eliberat loc real — stop.
    if (select count(*) from registrations where editie = old.editie) >= v_cap then
      exit;
    end if;

    select * into v_w
      from event_waitlist
     where editie = old.editie
     order by created_at asc
     for update skip locked
     limit 1;
    if v_w.id is null then
      exit;  -- nimeni (disponibil) în așteptare
    end if;

    -- Promovează (aceleași reguli ca `admin_promote_waitlist`).
    insert into registrations (nume, telefon, email, data_nasterii, acord, editie)
    values (trim(v_w.nume), trim(v_w.telefon), lower(trim(v_w.email)),
            v_w.data_nasterii, true, v_w.editie)
    on conflict (lower(email), editie) do nothing
    returning id into v_id;

    delete from event_waitlist where id = v_w.id;

    if v_id is not null then
      -- Email best-effort. Eșecul nu blochează ștergerea.
      begin
        perform net.http_post(
          url := 'https://whyndrjcezmtajbykeil.supabase.co/functions/v1/send-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', 'sb_publishable_SR4wCG4ZsSZYAqobBjUF_g_Xx4pRbHh'
          ),
          body := jsonb_build_object('mode', 'promoted', 'id', v_id::text)
        );
      exception when others then
        null;  -- emailul e opțional; nu blocăm ștergerea
      end;
      exit;  -- un loc eliberat → o promovare reușită. Gata.
    end if;
    -- v_id null = duplicat deja înscris: l-am scos din waitlist, încearcă următorul.
  end loop;

  return old;
end;
$$;

-- 5. Triggerul. AFTER DELETE, per rând (N locuri eliberate → N promovări, cât timp
--    e listă de așteptare și sub capacitate).
drop trigger if exists registrations_autopromote_trg on runlift.registrations;
create trigger registrations_autopromote_trg
  after delete on runlift.registrations
  for each row
  execute function runlift.auto_promote_from_waitlist();

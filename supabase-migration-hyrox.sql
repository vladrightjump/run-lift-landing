-- Migrare Hyrox / Ediția a doua — de aplicat la publicare.
-- Adaugă separarea pe ediții (coloana `editie`) + `data_nasterii`.
-- Ediția curentă = 2 (vezi CURRENT_EDITION din src/lib/config.ts).
-- Validată în tranzacție cu ROLLBACK înainte de aplicare.

-- 1. registrations: editie (vechile înscrieri -> ediția 1, noile default 2)
alter table public.registrations add column if not exists editie smallint;
update public.registrations set editie = 1 where editie is null;
alter table public.registrations alter column editie set default 2;
alter table public.registrations alter column editie set not null;

-- 2. registrations: data_nasterii
alter table public.registrations add column if not exists data_nasterii date;

-- 3. registrations_backup: aceleași coloane
alter table public.registrations_backup add column if not exists editie smallint;
update public.registrations_backup set editie = 1 where editie is null;
alter table public.registrations_backup add column if not exists data_nasterii date;

-- 4. trigger de backup: copiază și editie + data_nasterii
create or replace function public.registrations_backup_sync()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if tg_op = 'INSERT' then
    insert into registrations_backup (id, created_at, nume, telefon, email, echipa, acord, editie, data_nasterii)
    values (new.id, new.created_at, new.nume, new.telefon, new.email, new.echipa, new.acord, new.editie, new.data_nasterii)
    on conflict (id) do update
      set nume = excluded.nume, telefon = excluded.telefon, email = excluded.email,
          echipa = excluded.echipa, acord = excluded.acord, editie = excluded.editie,
          data_nasterii = excluded.data_nasterii, backed_up_at = now(), deleted_at = null;
    return new;
  elsif tg_op = 'UPDATE' then
    update registrations_backup
      set created_at = new.created_at, nume = new.nume, telefon = new.telefon,
          email = new.email, echipa = new.echipa, acord = new.acord, editie = new.editie,
          data_nasterii = new.data_nasterii, backed_up_at = now()
      where id = new.id;
    return new;
  elsif tg_op = 'DELETE' then
    update registrations_backup set deleted_at = now() where id = old.id;
    return old;
  end if;
  return null;
end;
$function$;

-- 5. public_stats: doar ediția curentă (2)
create or replace function public.public_stats()
returns json language sql stable security definer set search_path to '' as $function$
  select json_build_object(
    'count', count(*),
    'participants', coalesce(
      json_agg(json_build_object('nume', r.public_name, 'echipa', r.echipa) order by r.created_at),
      '[]'::json)
  )
  from (
    select created_at, echipa,
      case when array_length(regexp_split_to_array(trim(nume), '\s+'), 1) > 1
        then (regexp_split_to_array(trim(nume), '\s+'))[1] || ' ' ||
             upper(left((regexp_split_to_array(trim(nume), '\s+'))[array_length(regexp_split_to_array(trim(nume), '\s+'), 1)], 1)) || '.'
        else trim(nume) end as public_name
    from public.registrations
    where editie = 2
  ) r;
$function$;

-- 6. admin_list_registrations: doar ediția curentă (2)
create or replace function public.admin_list_registrations(p_token uuid)
returns table(id uuid, created_at timestamptz, nume text, telefon text, email text, echipa text)
language plpgsql security definer set search_path to 'public' as $function$
begin
  if not admin_check_token(p_token) then raise exception 'invalid_token'; end if;
  return query
    select r.id, r.created_at, r.nume, r.telefon, r.email, r.echipa
    from registrations r where r.editie = 2 order by r.created_at asc;
end;
$function$;

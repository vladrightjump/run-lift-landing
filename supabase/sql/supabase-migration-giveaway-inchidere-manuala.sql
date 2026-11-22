-- Un giveaway cu ends_at = 'infinity' rămâne deschis până când îl oprește
-- organizatorul. Data reală a închiderii devine apoi termenul de înscriere.
begin;

create or replace function runlift.giveaway_entries_guard()
returns trigger
language plpgsql
security definer
set search_path to 'runlift'
as $function$
declare
  v_id    uuid;
  v_start timestamptz;
  v_end   timestamptz;
  v_acum  timestamptz;
begin
  v_id := giveaway_curent();
  if v_id is null then raise exception 'fara_giveaway'; end if;

  -- Înscrierile pot rula în paralel. Închiderea așteaptă cele acceptate,
  -- iar o înscriere care prinde închiderea vede termenul actualizat.
  select g.starts_at, g.ends_at into v_start, v_end
    from giveaways g where g.id = v_id for share;
  if not found then raise exception 'fara_giveaway'; end if;

  v_acum := clock_timestamp();
  if v_acum < v_start then raise exception 'giveaway_neinceput'; end if;
  if v_acum >= v_end then raise exception 'giveaway_inchis'; end if;

  new.giveaway_id := v_id;
  new.extrasa_la := null;
  new.inlocuita_la := null;
  new.created_at := v_acum;
  new.email := btrim(new.email);
  new.instagram := lower(regexp_replace(btrim(new.instagram), '^@', ''));
  new.telefon_cheie := giveaway_cheie_telefon(new.telefon);
  return new;
end;
$function$;

create or replace function runlift.admin_giveaway_opreste_inscrierile(p_token uuid, p_giveaway_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_g runlift.giveaways%rowtype;
  v_acum timestamptz;
begin
  if runlift.admin_check_token(p_token) is not true then raise exception 'invalid_token'; end if;

  select * into v_g from runlift.giveaways where id = p_giveaway_id for update;
  if not found then raise exception 'giveaway_inexistent'; end if;

  v_acum := clock_timestamp();
  if v_g.ends_at <= v_acum then return; end if;
  if v_g.ends_at <> 'infinity' then raise exception 'giveaway_cu_termen'; end if;
  if v_acum <= v_g.starts_at then raise exception 'giveaway_neinceput'; end if;

  update runlift.giveaways set ends_at = v_acum where id = v_g.id;
  insert into runlift.admin_events (tip, detaliu)
  values ('giveaway_inscrieri_oprite', jsonb_build_object('giveaway', v_g.slug));
end;
$function$;

revoke all on function runlift.admin_giveaway_opreste_inscrierile(uuid, uuid) from public;
grant execute on function runlift.admin_giveaway_opreste_inscrierile(uuid, uuid) to anon, authenticated, service_role;
notify pgrst, 'reload schema';

commit;

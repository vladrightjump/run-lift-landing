-- Migrare email (Resend) — de aplicat împreună cu deploy-ul funcției `send-email`.
-- RPC folosit de funcția Edge în modul "confirm": întoarce email + nume DOAR
-- pentru o înscriere recentă din ediția curentă, identificată prin UUID.
-- Astfel, endpointul de confirmare nu poate fi folosit ca releu de spam:
-- trimite doar către cineva care tocmai s-a înscris (id neghicibil).

create or replace function public.confirm_lookup(p_id uuid)
returns table(email text, nume text)
language sql
security definer
set search_path to ''
as $function$
  select email, nume
  from public.registrations
  where id = p_id
    and editie = 2
    and created_at > now() - interval '15 minutes';
$function$;

revoke all on function public.confirm_lookup(uuid) from public;
grant execute on function public.confirm_lookup(uuid) to anon;

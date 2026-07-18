# Audit de securitate — Run + Lift (parktraining.fit)

*18 iulie 2026 · Acoperă: baza de date (Supabase), edge function-ul de email,
autentificarea admin, clientul React, headerele Vercel, dependențele npm,
datele personale și starea repo-ului. Verificările pe baza de date au fost
rulate efectiv (ca rol `anon` și `service_role`), nu doar citite din cod.*

Notă: audit tehnic făcut de un asistent AI — util ca inventar de probleme,
dar nu înlocuiește un audit profesionist dacă proiectul crește.

---

## 🔴 CRITIC — de rezolvat înainte de anunțul din 22 iulie

### C1. ✅ REZOLVAT — Login-ul de admin nu avea protecție la brute force
`admin_login` e apelabilă de oricine cu cheia publică din bundle, prin
`/rest/v1/rpc/admin_login`, de un număr nelimitat de ori. Parolele sunt
hash-uite corect (bcrypt via pgcrypto), dar nimic nu încetinește ghicitul:
fără lockout, fără delay, fără limită de încercări. Un script poate încerca
mii de parole pe minut. Dacă parola vreunui admin e slabă, backoffice-ul
(toate datele personale + ștergere) cade.

**Fix (rulează în SQL Editor):**
```sql
create table if not exists public.admin_login_attempts (
  username text primary key,
  failed_count int not null default 0,
  locked_until timestamptz
);
alter table public.admin_login_attempts enable row level security;

create or replace function public.admin_login(p_username text, p_password text)
returns uuid
language plpgsql security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_user_id bigint;
  v_token uuid;
  v_locked timestamptz;
begin
  delete from admin_sessions where expires_at < now();

  select locked_until into v_locked from admin_login_attempts where username = p_username;
  if v_locked is not null and v_locked > now() then
    perform pg_sleep(1);
    return null;  -- cont blocat temporar
  end if;

  select id into v_user_id from admin_users
  where username = p_username
    and password_hash = crypt(p_password, password_hash);

  if v_user_id is null then
    perform pg_sleep(1);  -- încetinește fiecare încercare eșuată
    insert into admin_login_attempts as a (username, failed_count)
    values (p_username, 1)
    on conflict (username) do update
      set failed_count = a.failed_count + 1,
          locked_until = case when a.failed_count + 1 >= 5
                              then now() + interval '15 minutes' end;
    return null;
  end if;

  delete from admin_login_attempts where username = p_username;
  insert into admin_sessions (user_id) values (v_user_id) returning token into v_token;
  return v_token;
end;
$$;
```
5 eșecuri → blocat 15 minute; fiecare eșec costă minim 1 secundă.
Verifică după aceea că te poți loga normal în /admin.

### C2. ✅ ANALIZAT — Vulnerabilitățile npm sunt doar în devDependencies
`npm install` a raportat `5 vulnerabilities (3 moderate, 1 high, 1 critical)`
dar nu știm care sunt. Versiunile directe arată în regulă (vite 7.3.6,
react 19.2.7, vitest 2.1.9) — probabil sunt în dependențe tranzitive și
posibil doar în devDependencies (caz în care nu ajung în producție), dar
trebuie confirmat.

**Analiză (18 iulie):** toate cele 5 sunt în lanțul vitest 2.x → vite-node →
vite ≤6.4.2 → esbuild ≤0.24.2 (GHSA-67mh-4wv8-2f99, dev server). Producția e
construită cu vite 7.3.6, curat — bundle-ul live NU e afectat. Expunerea reală:
doar mașina de dezvoltare, doar cât rulează dev server-ul intern al vitest.

**Fix aplicat:** vitest ridicat la ^4.1.10 în package.json (upgrade controlat,
nu `--force`). De rulat: `npm install && npm run test` — dacă vreun test pică
pe API-ul vitest 4, se repară punctual.

---

## 🟠 IMPORTANT

### I1. ⚙️ PARȚIAL — Rate limiting (cooldown ✅ aplicat; captcha rămâne)
Cu cheia publică, oricine poate: (a) insera înscrieri false în masă
(nume/emailuri aleatorii — poluează lista și statisticile), și (b) apela
`send-email` cu `mode:"info"` repetat pentru un email abia înscris,
retrimițând emailul de confirmare la nesfârșit în fereastra de 15 minute
(spam către victimă + arderea cotei Resend).

**Mitigări recomandate, în ordinea efortului:**
1. Cooldown în edge function: coloană `ultimul_email_la` + refuz sub 10 min
   între retrimiteri pentru același email (~15 linii de cod).
2. Cloudflare Turnstile (captcha invizibil) pe ambele formulare — oprește
   boții de insert. Gratuit, ~1h de integrare.

### I2. CORS deschis pe edge function — ✅ reparat în cod, cere deploy
Era `Access-Control-Allow-Origin: *` — orice site putea apela funcția din
browserul vizitatorilor. Am restrâns la `https://parktraining.fit`.
**Activ după:** `npx supabase functions deploy send-email --project-ref iattqvakxcgepjiecgpf`

### I3. ✅ REZOLVAT — Funcțiile cu ediția 2 hardcodată
`edition2_recipients()` (destinatarii broadcast-ului „participanti") și
`confirm_lookup()` (emailul de confirmare a înscrierii la eveniment) au
`editie = 2` scris în SQL. Nu e o gaură de securitate, dar la ediția 3:
broadcast-ul pleacă spre lista veche, iar confirmările pentru înscrierile noi
nu se mai trimit. **Fix:** înlocuiește `editie = 2` cu
`editie = public.current_launch_edition()` în ambele (pot face eu asta când
deschizi înscrierile — spune-mi).

### I4. ✅ REZOLVAT — Secretul de broadcast, rotit fără afișare
A fost rotit corect după ce fusese expus public, dar noua valoare mi-a fost
trimisă în conversație, care e stocată. **Fix:** mai rotește-l o dată
(UPDATE-ul din `supabase-roteste-secretul.sql`) și de data asta nu trimite
valoarea nimănui.

---

## 🟡 MINOR / ACCEPTAT CONȘTIENT

- **M1. Token-ul admin stă în localStorage** — vulnerabil doar la XSS, iar
  CSP-ul strict (`script-src 'self'`, fără inline) face XSS-ul improbabil.
  Acceptabil. Alternativa (sessionStorage) ar cere re-login la fiecare tab.
- **M2. Enumerare de emailuri prin 409** — răspunsul „ești deja pe listă"
  confirmă că un email e înscris. Compromis standard de UX; de acceptat.
- **M3. Sesiuni admin de 7 zile, fără rotire** — rezonabil pentru 2 utilizatori.
- **M4. Fișiere care nu au ce căuta în git sunt STAGED**: `.claude/settings.local.json`
  și 5 fișiere `.playwright-mcp/*.yml`. Fix:
  ```bash
  git restore --staged .claude .playwright-mcp maps_embed_check.png
  printf '.claude/\n.playwright-mcp/\n*.png\n' >> .gitignore
  ```
- **M5. ~6 zile de lucru necommitat** — producția rulează cod care nu există
  în git. Dacă se pierde discul, se pierde tot. Fix: commit + push azi.
- **M6. Performanță (Supabase INFO):** FK neindexat pe `admin_sessions.user_id`,
  backup-ul fără primary key, două indexuri încă nefolosite (normale, sunt noi).
  Nimic presant la volumele actuale.

---

## ✅ Ce e deja bine (verificat, nu presupus)

- RLS activ pe toate tabelele; `anon` nu poate citi nimic: liste de înscrieri,
  șabloane, config, backup-uri — toate testate ca `anon`, toate 0 rânduri.
- Scurgerea gravă găsită azi (funcțiile SECURITY DEFINER care expuneau
  20 de participanți + secretul de broadcast) — **închisă și verificată**.
- Ediția și sursa înscrierilor sunt fixate server-side; falsificarea din
  client e respinsă de politica RLS (testat cu valori inventate).
- Parole admin hash-uite cu bcrypt; token de sesiune opac, cu expirare.
- Token-ul de confirmare email: UUID unic, validat ca format în client
  înainte de request; RPC-ul întoarce doar starea, zero date personale.
- CSP strict pe tot site-ul: `script-src 'self'`, `connect-src` limitat la
  Supabase, `frame-ancestors 'none'`, plus nosniff/XFO/COOP/CORP.
- Cheia din bundle e cea publicabilă (`sb_publishable_`), nu service_role.
- `participante.md` (30 de persoane cu email + telefon) e corect ținut în
  `.gitignore` — nu a ajuns niciodată în repo. Șterge-l când nu-ți mai trebuie.
- Datele istorice: backup-uri automate pentru registrations, backup manual
  al listei de notificări, nimic șters vreodată din datele reale.
- 51 de teste unitare + 36 e2e, inclusiv guard-uri care blochează regresiile
  care chiar s-au întâmplat (rewrite lipsă → 404, editie trimisă din client).

---

## Stare după fixuri (18 iulie, seara)

Aplicat și verificat direct pe producție (9/9 verificări trec):

- **C1** — lockout: 5 eșecuri → 15 min blocat, 1s delay/eșec, tabela invizibilă pentru anon
- **I1.1** — cooldown: max un email de confirmare la 10 min/adresă (partea DB e live; partea de cod cere deploy-ul funcției)
- **I3** — ediția evenimentului citită din `app_config.current_event_edition` (azi 2, comportament identic; la ediția nouă: un UPDATE, fără redeploy)
- **I4** — secret regenerat direct în DB, fără să fie afișat nicăieri
- **M4** — git curățat (`.claude/`, `.playwright-mcp/` scoase din stage + gitignore); era și un `index.lock` orfan din 16 iulie, șters
- **M6** — index pe `admin_sessions.user_id`

Rămase:

| # | Acțiune | Cine |
|---|---------|------|
| 1 | `npm audit` → trimite output-ul (C2) | tu |
| 2 | `npx supabase functions deploy send-email --project-ref iattqvakxcgepjiecgpf` — activează CORS restrâns + cooldown + diagnostic Resend | tu |
| 3 | `vercel --prod` — codul client curent | tu |
| 4 | Commit + push (M5) | tu |
| 5 | Turnstile pe formulare (I1.2) | eu, la cerere |

## Ordinea recomandată (istoric — vezi starea de mai sus)

| # | Acțiune | Efort | Cine |
|---|---------|-------|------|
| 1 | `npm audit` și trimite-mi output-ul | 1 min | tu |
| 2 | SQL-ul de la C1 (brute force pe login) | 2 min | tu (SQL Editor) |
| 3 | Deploy edge function (activează CORS-ul reparat) | 2 min | tu |
| 4 | Re-rotește secretul de broadcast, fără să-l trimiți | 1 min | tu |
| 5 | Curăță git-ul (M4) + commit tot (M5) | 10 min | tu |
| 6 | Cooldown pe retrimiterea emailului (I1.1) | ~30 min | eu, la cerere |
| 7 | Turnstile pe formulare (I1.2) | ~1h | eu, la cerere |
| 8 | De-hardcodat ediția 2 (I3) — înainte de 22 iulie | 10 min | eu, la cerere |

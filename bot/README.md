# Botul de Telegram al grupului din parc

Botul de prezențe al grupului de antrenament din parc: postează sondajul „vii mâine?" în
grupul de Telegram, scrie fiecare vot în Supabase, trimite adminilor rezumatul de dimineață
și execută comenzile cerute din adminul Run + Lift (sondaj acum, reminder, mesaj în grup,
scoatere din grup).

Rulează pe **Railway**, ca serviciu permanent (webhook + un tic pe minut). Datele stau în
proiectul Supabase `ironworks-gym`, în tabelele grupului din schema `public` — aceleași pe
care le citește și le scrie adminul Run + Lift prin funcțiile `runlift.admin_sala_*`.

```
Adminul Run + Lift ──RPC cu token──▶ runlift.admin_sala_* ──▶ tabelele grupului (public)
                                                                  ▲
Telegram ◀──webhook / sondaje / mesaje──▶ botul (Railway, cheie de service)
```

## De unde vine codul

Mutat **neschimbat** din repo-ul `vladrightjump/parkgym-telegram-bot`, de la commitul
`3c26eb686fa6161a196f1e17956b78371358492d` (23 iulie 2026, „comanda send_message"), cel
deployat atunci pe Railway. Istoria dinainte rămâne în repo-ul acela, care se arhivează la
oprirea gym-app. Planul mutării: `docs/plans/2026-10-03-1107-feat-botul-si-prezentele-in-admin-plan.md`
(U9, KTD4, KTD5).

## Ce face, singur

Un tic pe minut (`node-cron`, la Chișinău) citește setările din `public.bot_config` — editabile
din admin → „Botul de Telegram" — și:

- trimite sondajul în zilele și la ora din setări, pentru antrenamentul de a doua zi;
- trimite rezumatul de dimineață adminilor, în privat;
- trimite reminderul automat cu două ore înainte de antrenament, dacă au confirmat mai puțini
  decât pragul;
- trimite lunea la 09:00 lista celor inactivi și verifică webhook-ul la 09:05;
- golește coada de comenzi (`public.bot_actions`) venite din admin.

Reminderul automat și rezumatul urmează antrenamentul zilei (ora lui, chiar mutat; și un extra),
nu orarul global. Coada primește și `cancel_session` / `reactivate_session` puse de admin: botul
anunță grupul dacă sondajul zilei e în grup și ziua e încă în starea aceea.

Webhook-ul (`POST /telegram/webhook`, verificat cu secretul) înregistrează voturile — un cont
necunoscut care votează devine membru pe loc, cu numele din Telegram; un vot pe un antrenament
anulat e refuzat —, pune în `telegram_unmatched` pe cine intră în grup fără să fie legat de un
membru și răspunde la `/start`.

## Ce face, la cererea organizatorilor

În conversația privată cu botul, organizatorii (conturile din `TELEGRAM_ADMIN_CHAT_IDS`) conduc ziua
de antrenament: cardul (`/antrenament`), cine vine, anularea, reactivarea, mutarea, antrenamentul
extra, sondajul și reminderul. Fiecare schimbare arată o previzualizare și pleacă după „Confirmă";
rezultatul ajunge în grup, iar acțiunea rămâne în `bot_actions` cu organizatorul. Ghidul de folosire:
`GHID-GRUPUL-DIN-PARC.md`, „Din Telegram". Planul: `docs/plans/2026-10-06-2353-feat-ziua-de-antrenament-din-telegram-plan.md`.

```
chat privat ──▶ webhook ──▶ control.ts (card, întrebări, ciornă) ──▶ day-actions.ts (decizia, pură)
                                                                          │
/admin ──RPC──▶ bot_actions (pending) ──tic──▶ process-commands ──┐       ▼
                                                                  └──▶ day-ops.ts (executorul)
                                                                          ├─▶ training_sessions
                                                                          ├─▶ grupul: sondaj, anunț
                                                                          └─▶ bot_actions (jurnal)
```

**O singură replică.** Previzualizările neconfirmate (ciornele) stau în memoria procesului, 15
minute. Un deploy le pierde (organizatorul apasă din nou); o a doua replică le-ar împărți între
procese și ar cere ciorne în bază.

**Meniul de comenzi** se înregistrează la pornire pentru fiecare organizator și la `/start`-ul lui.
Un organizator nou: id-ul lui intră în `TELEGRAM_ADMIN_CHAT_IDS` pe Railway, apoi apasă `/start`.

## Deploy (Railway)

Merge-ul în `main` e deploy-ul, ca la site — dar doar dacă trec verificările. Serviciul e
descris în cod, în **`.railway/railway.ts`** (Infrastructure as Code, la rădăcina repo-ului):

- serviciul `bot` din proiectul Railway `parkgym-telegram-bot` construiește din
  `vladrightjump/run-lift-landing`, branch `main`, **directorul rădăcină** `/bot`;
- **calea urmărită** `/bot/**`: un commit care atinge doar site-ul nu repornește botul;
- **Wait for CI** (`checkSuites`): deploy-ul așteaptă toate job-urile din
  `.github/workflows/ci-deploy.yml` — pentru bot: teste, build, o pornire reală a `dist/` care
  trebuie să răspundă pe `/health` și compilarea lui `.railway/`;
- builderul `RAILPACK`, cu Node din `engines` (`24.x`, LTS-ul din `.nvmrc`);
- **verificarea de sănătate** `/health`: un deploy care nu pornește nu-l înlocuiește pe cel care merge.

Fișierul NU e citit la deploy: îl aplică CLI-ul Railway, explicit. Orice schimbare în el
trece prin `railway config plan` (doar citește și arată diferențele) și apoi
`railway config apply`. „Config as Code" (`railway.json`) nu mai e folosit: Railway nu-l mai
citește după 1 decembrie 2026, iar un serviciu nu poate fi condus de ambele.

**Mutarea (U9) e făcută pe 7 octombrie 2026**, cu botul oprit din admin (nicio sarcină programată
nu pleca), prin `railway config apply`. Pașii, pentru o refacere:

**Mutarea (U9), într-o fereastră fără sondaj (vineri–duminică):**

```bash
brew install railway          # CLI ≥ 5.42.1 (motorul IaC e în CLI)
railway login                 # o dată, în browser
railway link                  # proiectul parkgym-telegram-bot, mediul production
railway config plan           # din rădăcina repo-ului
```

Planul trebuie să arate doar schimbările de mai sus pe `service.bot`: sursa (repo, `/bot`,
`checkSuites`), builderul, comenzile, calea urmărită și `/health`. **Nicio ștergere** — nici de
serviciu, nici de variabilă (toate nouă sînt `preserve()`). Dacă CLI-ul spune că serviciul e încă
condus de `railway.json` (repo-ul vechi îl are la rădăcină), schimbă întâi sursa din panou
(Settings → Source: acest repo, `main`, rădăcina `/bot`, câmpul „Railway Config File" gol),
apoi rulează din nou `plan`. Când planul e curat: `railway config apply`, apoi verifică
`/health`, jurnalele (planificatorul pornit) și webhook-ul (`getWebhookInfo`). În detaliile
deploy-ului: builder Railpack, Node 24.

Variabile de mediu (pe serviciu, nu în repo): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`TELEGRAM_GROUP_CHAT_ID`, `TELEGRAM_ADMIN_CHAT_IDS`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `TZ=Europe/Chisinau`, `PUBLIC_URL`. `NIXPACKS_NODE_VERSION` nu mai
e citit de Railpack, dar rămâne până la U11: întoarcerea pe repo-ul vechi (al cărui
`railway.json` cere NIXPACKS) are nevoie de el.

**Întoarcere:** sursa serviciului se repune pe `vladrightjump/parkgym-telegram-bot`, `main`,
rădăcina goală (din panou). Domeniul, variabilele și webhook-ul sînt ale serviciului, deci rămân.

**Token nou:** după schimbarea `TELEGRAM_BOT_TOKEN`, webhook-ul se reînregistrează o dată
(`npm run set-webhook`, cu `.env` completat), apoi se verifică cu `getWebhookInfo`.

## Lansarea zilei de antrenament din Telegram (după U9)

Codul e în `main`, dar pleacă împreună cu migrarea `sala_06_ziua_din_telegram`
(`supabase/sql/supabase-migration-sala-ziua-din-telegram.sql`). Aplicată înaintea botului nou,
fiecare anulare din admin ar pune în coadă o comandă pe care botul vechi o raportează ca eșuată.

1. U9 făcut: serviciul construiește din acest repo, iar un ciclu de sondaj a trecut pe el.
2. Repetiția, înaintea merge-ului: botul pornit local cu un token de test, un grup de test și
   `BOT_SCHEDULER=off` (fără planificator și fără coadă: altfel ar goli coada producției), expus
   printr-un tunel HTTPS temporar cu webhook-ul botului de test pe el. Doar pe o dată din 2027:
   cardul, Extra, Mută, Anulează, Reactivează, Renunță. Rândul de test din `training_sessions` se
   șterge apoi, cu acordul lui Vlad.
3. Merge, deploy pe Railway după CI verde, `/health`, `getWebhookInfo`. Adminul nou ajunge pe
   Vercel odată cu merge-ul.
4. **Imediat după**, migrarea prin MCP `apply_migration`, `get_advisors`, instantaneele regenerate,
   migrarea scoasă din `MIGRARI_NEAPLICATE` (`tests/unit/sql/db.ts`) și mutată în tabelul din
   `MIGRATIONS.md` (un PR mic). Între 3 și 4 nu anula nimic din `/admin`: o anulare cu motiv e
   refuzată (funcția live n-are încă `p_motiv`), iar jurnalul acțiunilor din Telegram nu se scrie
   (constrângerea veche; botul doar loghează). În ordinea inversă, botul vechi ar marca eșuat
   fiecare anunț de anulare pus în coadă.
5. Id-ul lui Roma în `TELEGRAM_ADMIN_CHAT_IDS`; Roma apasă `/start`.
6. În producție, fără să atingi grupul: cardul, `/maine`, o previzualizare cu „Renunță", un cont
   care nu e organizator e ignorat; a doua zi, rezumatul are butoane.

## Local

Cu Node 24, din `.nvmrc` (`fnm use` / `nvm use` la rădăcina repo-ului). Pe Node 20, testul
`smoke.test.ts` pică exact cum ar pica botul pe Railway.

```bash
cd bot
npm ci
npm test          # node:test
npm run build     # tsc -> dist/
npm run dev       # tsx watch: webhook pe :3000 + planificatorul
```

Pe baza reală, pornește-l doar cu `BOT_SCHEDULER=off` (vezi „Lansarea", pasul 2).

## Apartenența la grup și scoaterea din chatul privat

`/scoate Nume` caută contul și cere alegere + confirmare, numai organizatorilor.
Observațiile `chat_member` și verificările periodice `getChatMember` alimentează filtrele
„În grup / Ieșiți / Neverificați” din dashboard. Ghidul și ordinea obligatorie de activare
(migrare, bot, UI, webhook): [`docs/features/telegram-membri-reali.md`](../docs/features/telegram-membri-reali.md).

## Antrenamente de probă — activare separată

Fluxul nou rămâne dezactivat implicit. `/start trial_home`, `/start trial_share` și
`/start trial_instagram` deschid conversația privată; persoanele noi sunt salvate în
`trial_prospects`, nu în `members`. `/stop` oprește automatizările pentru prospect,
iar `/start` le reia. Accesul în grup cere **prezență confirmată + răspuns explicit
„Da, vreau să continui”**; numele, rezervarea și confirmarea condițiilor nu acordă acces.

Ordine de livrare (fără activare automată la deploy):

1. Aplică în ordine migrările `sala-probe`, `trial-messages` și `trial-review-fixes` din `supabase/sql/supabase-migration-*.sql` și păstrează `enabled=false`. Aplicate în producție pe 8 octombrie 2026.
2. Livrează botul și adminul. Reînregistrează webhook-ul cu `npm --prefix bot run set-webhook`;
   lista include acum `chat_join_request`, `chat_member`, `message`, `callback_query`.
3. Configurează în admin username-ul real, costul și condițiile reale, ce trebuie adus,
   durata, contactul și un organizator cu `members.is_admin=true` și Telegram ID asociat.
   Acesta trebuie să fi pornit conversația privată cu botul. Comenzile istorice ale
   organizatorilor continuă să folosească `TELEGRAM_ADMIN_CHAT_IDS`.
4. Botul trebuie să fie administrator în `TELEGRAM_GROUP_CHAT_ID`, cu `can_invite_users`.
   Workerul verifică username-ul și drepturile la cel mult cinci minute, inclusiv când
   proba este oprită; adminul nu poate activa fără o verificare recentă. `BOT_SCHEDULER=off`
   oprește și această verificare, și livrarea outbox-ului.
5. Pe **bot/grup/bază de test**, verifică alegere → reminder → prezență → continuare →
   cerere de aderare și apartenență confirmată. Verifică și anularea, o persoană exclusă,
   un link redirecționat și lipsa răspunsului. Activează public numai după această probă.

Workerul citește outbox-ul la minut. Telegram nu garantează livrarea exact o dată:
lease-urile expirate, timeout-urile și mesajele livrate parțial rămân „ambigue” pentru
verificare în admin, fără retrimitere automată. Erorile explicite temporare Telegram
au maximum trei încercări; blocarea botului oprește mesajele participantului.
Corecțiile de prezență invalidează invitațiile în baza de date, iar fiecare cerere de
aderare verifică identitatea, versiunea și eligibilitatea actuale. Botul nu deblochează
niciodată un cont exclus. Dezactivarea oprește automatizările și CTA-ul, păstrând istoricul.

## Mesaje și sondaje libere din privat

Organizatorii autorizați în `TELEGRAM_ADMIN_CHAT_IDS` pot scrie:

- `/mesaj Salut! Ne vedem la antrenament.` — text simplu, maximum 3500 de caractere; păstrează rândurile, fără interpretare HTML/Markdown.
- `/poll Ce preferați? | Alergare | Forță` — sondaj Telegram anonim, un singur răspuns, 2–12 variante distincte. Întrebare: maximum 300 de caractere; variantă: maximum 100. Separatorul `|` delimitează variantele.

Botul afișează grupul configurat și conținutul exact înainte de „Trimite în grup” / „Renunță”. O comandă nouă înlocuiește previzualizarea anterioară pentru aceste două comenzi. Confirmarea este legată de organizator, expiră după 15 minute și nu poate fi folosită de două ori. Ciornele sunt în memorie, pe replica unică; un restart le invalidează. La timeout se raportează livrare neconfirmată: verifică grupul înainte de a repeta comanda.

Sondajele `/poll` nu folosesc tabelele de prezență, iar `/sondaj` rămâne comanda antrenamentului. Publicările se verifică în grup și prin confirmarea privată; nu apar în istoricul acțiunilor din admin. Meniul și `/ajutor` includ comenzile; `/start` reînregistrează meniul organizatorului. Limitele sondajelor respectă [Telegram Bot API](https://core.telegram.org/bots/api#sendpoll).

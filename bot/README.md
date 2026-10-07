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

Webhook-ul (`POST /telegram/webhook`, verificat cu secretul) înregistrează voturile — un cont
necunoscut care votează devine membru pe loc, cu numele din Telegram —, pune în
`telegram_unmatched` pe cine intră în grup fără să fie legat de un membru și răspunde la `/start`.

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

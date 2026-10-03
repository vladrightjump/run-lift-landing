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

Merge-ul în `main` e deploy-ul, ca la site — dar doar dacă trec verificările:

- serviciul `bot` din proiectul Railway `parkgym-telegram-bot` construiește din
  `vladrightjump/run-lift-landing`, branch `main`;
- **directorul rădăcină** `/bot`, **calea urmărită** `/bot/**` (un commit care atinge doar
  site-ul nu repornește botul);
- **calea fișierului de configurare** `/bot/railway.json` — Railway nu-l caută singur în
  directorul rădăcină al serviciului;
- **Wait for CI** pornit: deploy-ul așteaptă job-ul `bot` din `.github/workflows/ci-deploy.yml`
  (Node 22: teste, build și o pornire reală a `dist/` care trebuie să răspundă pe `/health`).

`railway.json` ține în cod și calea urmărită (`/bot/**`) și verificarea de sănătate
(`/health`): un deploy care nu pornește nu-l înlocuiește pe cel care merge.

**De verificat la mutare (U9):**

- `railway.json` cere builderul `NIXPACKS`, copiat din repo-ul vechi, dar serviciul arată
  `RAILPACK` în setări (3 octombrie 2026). În detaliile primului deploy din acest repo,
  verifică ce builder a folosit Railway și că versiunea de Node e 22. Dacă nu e, scoate
  `builder` din `railway.json`, ca să rămână cel din setări.
- **Railway a declarat „Config as Code" (`railway.json`) învechit:** fișierele merg pentru
  serviciile existente doar până pe **1 decembrie 2026**. Până atunci, setările din fișier
  (calea urmărită, `/health`, comenzile) trebuie mutate în setările serviciului sau în
  „Infrastructure as Code" — altfel dispar fără niciun semn.

Variabile de mediu (pe serviciu, nu în repo): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`TELEGRAM_GROUP_CHAT_ID`, `TELEGRAM_ADMIN_CHAT_IDS`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `TZ=Europe/Chisinau`, `PUBLIC_URL`. Node ≥ 22 vine din
`engines` în `package.json` (cu Node 20, `supabase-js` cade la rulare).

**Întoarcere:** sursa serviciului se repune pe `vladrightjump/parkgym-telegram-bot`, `main`,
rădăcina goală. Domeniul, variabilele și webhook-ul sînt ale serviciului, deci rămân.

**Token nou:** după schimbarea `TELEGRAM_BOT_TOKEN`, webhook-ul se reînregistrează o dată
(`npm run set-webhook`, cu `.env` completat), apoi se verifică cu `getWebhookInfo`.

## Local

Cu Node 22 (`engines` din `package.json`): pe Node 20, testul `smoke.test.ts` pică exact cum
ar pica botul pe Railway.

```bash
cd bot
npm ci
npm test          # node:test
npm run build     # tsc -> dist/
npm run dev       # tsx watch: webhook pe :3000 + planificatorul
```

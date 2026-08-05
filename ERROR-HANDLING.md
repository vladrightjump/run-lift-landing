# Error handling & monitoring

Cum tratăm erorile în client, cum le facem vizibile și cum împiedicăm regresia
care a blocat înscrierile. Scop: la următorul incident să înțelegem rapid *ce*
și *unde* a picat.

## Incidentul care a generat asta (4–5 aug 2026)

Înscrierile pe `parktraining.fit` eșuau cu „Ceva n-a mers", deși backendul nou
(Supabase) funcționa perfect. Cauza reală: producția rula un build vechi al cărui
CSP `connect-src` (din `vercel.json`) permitea doar proiectul Supabase **vechi**.
Browserul bloca **prin CSP** toate cererile spre backendul nou.

**De ce a fost greu de găsit:** un blocaj CSP face `fetch` să arunce
`TypeError: Failed to fetch` — identic cu „nu ai net". Iar în `catch` eroarea
devenea direct un toast generic, **fără să fie logată nicăieri**. Zero urmă.

Cele două lecții au produs cele două apărări de mai jos: **monitoring** (ca
eșecurile să lase urmă) și **gardă la build** (ca driftul CSP să nu mai poată fi
deployat).

## 1. Clasificarea erorilor (`src/lib/supabase.ts`)

Toate cererile trec prin `fetch`. Erorile se clasifică prin type-guards, ca UI-ul
să dea mesajul potrivit și logging-ul să distingă cauzele:

| Guard | Ce înseamnă | Mesaj către user |
|---|---|---|
| `SubmitHttpError` (`.status`) | Răspuns HTTP de eroare de la PostgREST | depinde de status |
| `isDuplicateError` | HTTP 409 — email deja înscris | „Există deja o înscriere cu acest email." |
| `isWaitlistFullError` | trigger `waitlist_full` | „Lista de așteptare tocmai s-a umplut." |
| `isTimeoutError` | AbortController a expirat (15s) | „Serverul răspunde greu. Încearcă din nou." |
| `isAbortError` | abort la unmount / refresh — **normal, nu se logează** | — |
| `isNetworkOrCspError` | `TypeError: Failed to fetch` — **rețea SAU blocaj CSP** | „Conexiune blocată sau indisponibilă. Reîncearcă." |

`isNetworkOrCspError` e cheia lecției din incident: acum cazul „fetch a picat de
tot" e distinct de un răspuns HTTP de eroare și primește mesaj propriu.

## 2. Monitoring (`src/lib/monitoring.ts`)

Fără backend/serviciu extern — doar `console.error` structurat + listenere globale.

### `logClientError(context, err, meta?)`
Log structurat cu prefix `[runlift:<context>]`. Extrage automat `name`/`message`,
`status` (dacă e `SubmitHttpError`), și adaugă `editie`, `url`, timestamp.

Apelat în **toate** `catch`-urile care înainte înghițeau eroarea:

| Context | Locul |
|---|---|
| `registration` / `waitlist` | `Edition3Landing.tsx` (handleSubmit) |
| `launch-notification:coming-soon` | `ComingSoon.tsx` |
| `launch-notification:despre-noi` | `DespreNoi.tsx` |
| `fetch-stats` | `hooks/useStats.ts` (mai puțin abort, care e normal) |
| `send-confirmation-email` / `send-info-email` | `supabase.ts` (best-effort) |

### `installGlobalMonitoring()`
Instalat o singură dată în `src/main.tsx`, înainte de render. Prinde ce scapă:

- **`securitypolicyviolation`** → logează `blockedURI` + `violatedDirective`.
  **Exact semnalul care lipsea în 4 aug.** Dacă `connect-src` e desincronizat,
  aici apare clar ce URL a fost blocat, cu un hint explicit.
- **`window.onerror`** și **`unhandledrejection`** → `logClientError`.

## 3. Gardă la build (`scripts/check-deploy-config.ts`)

Regula: CSP `connect-src` din `vercel.json` **trebuie** să conțină originul din
`SUPABASE.url` (`src/lib/backend.ts`) și nicio referință la alt proiect Supabase.

Logica e în `src/lib/deployConfig.ts` (partajată cu testul). Scriptul rulează în
`npm run build` **înainte** de `vite build`:

```json
"build": "tsx scripts/check-deploy-config.ts && tsc -b && vite build"
```

Deci un drift CSP↔config **face build-ul (și deployul Vercel) să pice** cu mesaj
clar. Testat: cu `connect-src` greșit → `exit 1`; corect → `exit 0`. Vezi și
`tests/unit/deploy-config.test.ts`.

> Legat: la schimbarea backendului Supabase actualizezi **și** `src/lib/backend.ts`
> **și** `vercel.json` (connect-src). Garda prinde dacă uiți unul.

## Cum debughezi un incident viitor

1. Deschide **DevTools → Console** pe pagina live. Caută linii `[runlift:…]`.
   - `[runlift:csp-violation]` → CSP blochează un URL. Compară `blockedURI` cu
     `SUPABASE.url`; probabil `vercel.json` connect-src e desincronizat.
   - `[runlift:registration]` cu `status` → e răspuns HTTP (RLS/constraint/backend).
     Fără `status`, cu „Failed to fetch" → rețea sau CSP.
2. Reproduce apelul direct (fără browser) ca să separi frontend de backend:
   `curl -X POST "$SUPABASE_URL/rest/v1/registrations" -H "apikey: …" -H "Content-Profile: runlift" …`
   → 201 înseamnă backend OK, deci problema e în client/CSP/deploy.
3. Verifică ce e **live**: `curl -sI https://parktraining.fit | grep -i content-security-policy`
   și confirmă `connect-src` == `SUPABASE.url`.
4. Verifică ce **commit** rulează producția (Vercel dashboard / `vercel inspect`).
   Dacă e un build vechi → redeploy (`vercel --prod`). Push-ul pe GitHub **nu
   declanșează mereu** build automat.

## Fișiere

- `src/lib/monitoring.ts` — logging + listenere globale
- `src/lib/supabase.ts` — cereri + type-guards de eroare
- `src/lib/deployConfig.ts` + `scripts/check-deploy-config.ts` — gardă CSP↔config
- `src/main.tsx` — instalează monitoringul global
- `tests/unit/monitoring.test.ts`, `tests/unit/deploy-config.test.ts` — teste

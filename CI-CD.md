# CI/CD — testare + deploy verificat pe live

Pipeline care, la fiecare push în `main`, rulează toate verificările și — doar dacă
trec — declanșează deploy-ul Vercel și confirmă pe LIVE că build-ul nou e chiar
sus. Născut din incidentul din 4–5 aug 2026, când un push nu a declanșat build și
producția a rămas pe un commit vechi (înscrierile picau) fără ca nimeni să știe.

Workflow: `.github/workflows/ci-deploy.yml`.

## Fluxul

```
push main
   │
   ├─ job „test" ─ npm ci → typecheck (app+teste) → teste unitare
   │               → build → teste e2e (Playwright, PE build)
   │                  └─ garda CSP↔config + ștampila de versiune
   │   (dacă PICĂ ceva → STOP, nu se deployează)
   ▼
   └─ job „deploy" (doar dacă „test" e verde)
        1. POST la Vercel Deploy Hook  →  Vercel face build + deploy
        2. poll pe https://parktraining.fit/version.json
             până commit == SHA-ul push-ului  (timeout 4 min → roșu)
        3. verifică CSP-ul live permite originul Supabase din vercel.json
             (exact regresia din 4 aug → roșu dacă e greșit)
```

Dacă build-ul nou nu apare live sau CSP-ul e desincronizat, pipeline-ul e **roșu** —
ai semnalul imediat, nu afli de la utilizatori.

### De ce build-ul e ÎNAINTEA testelor e2e

Testele rulează pe `dist/`, servit de `vite preview`, nu pe dev server. Pe aceleași
două worker-e ale runner-ului, 2m01s → 58s: dev server-ul transformă modulele la
fiecare cerere, iar suita încarcă pagina de sute de ori. În plus, ce se verifică e
chiar bundle-ul care se deployează.

Local, `npm run test:e2e` rămâne pe dev server (cu HMR și reutilizarea unui server
deja pornit) — acolo vrei feedback rapid, nu fidelitate. `npm run verify` rulează
varianta de CI, deci reproduce exact ce se întâmplă în pipeline.

Comanda pe build e `npm run test:e2e:preview` și cere un `dist/` proaspăt: servește
ce găsește, deci construiește întâi.

## Cum știe că „build-ul nou e live"

La build, `scripts/write-version.mjs` scrie `dist/version.json`:

```json
{ "commit": "<sha>", "builtAt": "<iso>" }
```

SHA-ul vine din `VERCEL_GIT_COMMIT_SHA` (env-ul de build Vercel). După deploy, CI
face poll pe `/version.json` și așteaptă până `commit` == commit-ul pe care tocmai
l-a push-uit. Așa distingem „chiar s-a deployat noul cod" de „a rămas build-ul vechi".

Verificarea live: `scripts/check-live-deploy.mjs` (Node pur, fără toolchain).

## Deploy DOAR via CI

Auto-deploy-ul git al Vercel e **dezactivat** din `vercel.json`:

```json
"git": { "deploymentEnabled": { "main": false } }
```

Astfel CI-ul e singura cale spre producție — fără dublu-deploy și fără cursele
care au ascuns incidentul. Deploy Hook-ul funcționează chiar cu auto-deploy-ul git
dezactivat.

## ⚙️ Setup (o singură dată — TU, în dashboard)

Pipeline-ul e **roșu până faci astea două**:

1. **Creează Deploy Hook în Vercel:**
   Vercel → proiectul `run-lift-landing` → Settings → Git → **Deploy Hooks** →
   creează unul: nume `ci-main`, branch `main`. Copiază URL-ul (formă
   `https://api.vercel.com/v1/integrations/deploy/prj_…/…`).

2. **Adaugă secretul în GitHub:**
   GitHub → repo `run-lift-landing` → Settings → Secrets and variables → Actions →
   **New repository secret**: nume `VERCEL_DEPLOY_HOOK_URL`, valoare = URL-ul de mai sus.

Gata. Următorul push în `main` (sau „Re-run" pe workflow) rulează tot lanțul.

## Dacă ai nevoie de un deploy manual (fallback)

Auto-deploy-ul git e oprit, deci un push singur nu mai publică. Pentru un deploy
manual de urgență (CLI autentificat, director linkat via `.vercel/`):

```bash
vercel --prod --yes
```

## Cum citești un pipeline roșu

- **job „test" roșu** → o verificare a picat (typecheck / test / e2e / garda CSP la
  build). Logul spune exact care. Nu s-a deployat nimic.
- **„Declanșează deploy-ul" roșu** → lipsește `VERCEL_DEPLOY_HOOK_URL` (vezi Setup).
- **„Verifică pe live" roșu, „Build-ul nou NU e live"** → Vercel n-a terminat/n-a
  reușit build-ul în 4 min. Verifică deploy-ul în dashboard-ul Vercel (build logs).
- **„Verifică pe live" roșu, „CSP live nu permite …"** → `vercel.json` connect-src e
  desincronizat cu `SUPABASE.url` (vezi `ERROR-HANDLING.md`).

## Pragurile automate (linter, cod mort, acoperire)

De la 5 septembrie 2026, pipeline-ul rulează trei verificări în plus, toate
înaintea build-ului și a browserului, ca o încălcare să se vadă în câteva
secunde, nu după cinci minute.

| Comandă | Ce păzește | Cum e calibrată |
|---|---|---|
| `npm run lint` | `oxlint` — greșeli de React și de corectitudine | clichet: `--max-warnings=25` |
| `npm run deadcode` | `knip` — fișiere, exporturi și dependențe nefolosite | zero toleranță |
| `npm run test:coverage` | acoperirea testelor unitare | praguri în `vitest.config.ts` |

**Toate trei sunt CLICHETE: se urcă, nu se coboară.**

### De ce `--max-warnings=25` și nu zero

Când `oxlint` a intrat în repo, a găsit 25 de semnalări preexistente — 14 dintre
ele reale (`set-state-in-effect`, `refs` citite în timpul randării,
`exhaustive-deps`), notate în `BACKLOG.md`. Nu sunt regresii și niciuna nu se
vede ruptă azi, dar repararea lor înseamnă schimbări de comportament, iar
refactor-ul care a adus linterul avea contractul opus.

Deci pragul e numărul de azi: **o încălcare NOUĂ pică pipeline-ul**, cele vechi
sunt tolerate până le repară cineva. Când repari una, coboară numărul. Nu-l urca.

### Pragurile de acoperire

Măsurate pe arborele din 5 septembrie 2026 și fixate cu un punct sub valoarea
reală — destul de sus cât să prindă ștergerea unei suite, destul de jos cât să
nu pice pentru zgomot. Au fost urcate o dată chiar în aceeași zi, după ce
împărțirea taburilor de admin a adus încă 21 de teste pe ajutoarele devenite
testabile — exact mișcarea pe care o cere regula de mai jos:

| | măsurat | prag |
|---|---|---|
| linii | 68,87% | 68 |
| instrucțiuni | 67,71% | 67 |
| funcții | 62,46% | 61 |
| ramuri | 60,44% | 59 |

Verificate că mușcă: ștergerea suitei `useRegistration.test.tsx` pică pragul de
linii și pe cel de funcții.

Când adaugi teste și acoperirea urcă, **urcă și pragurile** — altfel clichetul
nu se strânge. Când un PR le pică, răspunsul implicit e „scrie testul", nu
„coboară pragul".

Punctele de intrare (`main.tsx`, `admin-preview.tsx`) sunt excluse: montează
arborele și n-au logică proprie. `supabase/functions/` e exclus din toate trei —
e cod Deno, în afara lui `tsconfig.json`.

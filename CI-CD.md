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
   │               → teste e2e (Playwright) → build
   │                                            └─ garda CSP↔config + ștampila de versiune
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

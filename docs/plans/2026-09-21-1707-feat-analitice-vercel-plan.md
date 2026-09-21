---
title: Analitice de trafic prin Vercel Web Analytics - Plan
type: feat
date: 2026-09-21
topic: analitice-vercel
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
---

# Analitice de trafic prin Vercel Web Analytics - Plan

## Goal Capsule

- **Obiectiv:** Să se vadă câți oameni intră pe site, pe ce pagini și de unde vin — fără cookie-uri, fără bannere de consimțământ și fără să plece vreun token de participant spre Vercel.
- **Mijloc:** `@vercel/analytics`, pornit imperativ din `main.tsx` ca `installGlobalMonitoring()`, dar numai când `__VERCEL_ENV__ === 'production'`, cu un `beforeSend` care rescrie URL-ul după o listă albă de parametri.
- **Autoritate de produs:** Planul deține pornirea analiticelor în client și curățarea URL-urilor trimise. Nu atinge niciun ecran, niciun flux de înscriere, niciun RPC.
- **Profil de execuție:** Cinci unități. U1 e o acțiune de operator în dashboard-ul Vercel și trebuie făcută ÎNAINTE de deploy; U2–U5 sunt cod și documentație într-un singur PR.
- **Condiții de oprire:** Oprește-te și întreabă dacă echipa Vercel se dovedește a fi pe Pro (atunci evenimentele custom devin posibile și scopul merită redeschis), sau dacă după deploy dashboard-ul rămâne gol peste 24 h.
- **Coada:** `ce-work` duce până la PR deschis. Activarea din dashboard (U1) și verificarea în producție după merge rămân la operator.
- **Blocante deschise:** Niciunul. Planul verificat: Web Analytics NU e activat azi pe proiect — API-ul Vercel răspunde `Web Analytics not found`.

---

## Product Contract

### Summary

Site-ul rulează de la începutul lui august fără nicio măsurătoare de trafic. Nu se știe câți oameni ajung pe landing, câți deschid formularul, de pe ce rețea vin și ce pagini contează. `BACKLOG.md:36` urmărește exact asta din start, iar cele două shell-uri HTML au deja blocurile de script comentate, scoase pe vremea când Analytics nu era activat pe proiect și `/_vercel/insights/script.js` returna 404 la fiecare vizită.

Planul pornește Web Analytics ca lumea: activat întâi pe proiect, montat prin pachetul oficial (nu prin scriptul din HTML), pornit doar în producție și cu URL-urile curățate înainte de trimitere.

### Problem Frame

Trei lucruri fac ca „decomentează scripturile" din backlog să fie un răspuns greșit azi.

**Unu — tokenuri în query string.** Trei pagini primesc capabilități secrete prin URL: `/confirmare?token=…` (confirmă înscrierea), `/unsubscribe?token=…` (dezabonează), `/renunt?token=…` (eliberează locul). Sunt generate per participant în `supabase/functions/send-email/index.ts` și trimise prin email. Vercel Web Analytics colectează implicit URL-ul și parametrii de query — [documentația de confidențialitate](https://vercel.com/docs/analytics/privacy-policy) listează explicit „URL" și „Query Params (Filtered)" printre valorile stocate. Fără redactare, fiecare click pe un link de dezabonare ar duce tokenul respectiv în magazia de analitice a Vercel și l-ar afișa în panoul de URL-uri al dashboard-ului. E scurgere de capabilități, nu doar zgomot.

**Doi — 404-ul care a scos scripturile prima dată.** Comentariul din `index.html` spune de ce au fost scoase: Analytics nu era activat, deci scriptul returna 404 și lăsa două erori în consolă la fiecare vizită. Aceeași capcană există în sens invers: dacă scriptul se încarcă local, în `vite preview` sau în testele e2e — unde nu există niciun `/_vercel/insights/*` — 404-ul se întoarce. Ordinea contează, iar poarta de mediu contează.

**Trei — planul Hobby nu are evenimente custom.** [Tabelul de prețuri](https://vercel.com/docs/analytics/limits-and-pricing) dă pe Hobby 50.000 de evenimente/lună, fereastră de raportare de o lună, și „-" la Custom Events. Orice plan care presupune „urmărim trimiterea formularului ca eveniment" ar depinde de un upgrade la Pro. Nu e nevoie: suprapunerea fericită e că overlay-ul de înscriere face deja `history.pushState(…, '/inscriere')` (`src/components/landing/RegistrationOverlay.tsx:37`), iar scriptul urmărește automat tranzițiile de client. Deschiderea formularului se numără ca vizualizare de pagină `/inscriere`, gratuit, fără evenimente custom.

### Actors

- A1. Organizatorul — se uită în dashboard-ul Vercel ca să vadă traficul.
- A2. Vizitatorul — intră pe site și nu trebuie să observe absolut nimic.
- A3. Participantul cu link din email — ajunge pe `/confirmare`, `/unsubscribe` sau `/renunt` cu un token în URL.

### Key Decisions

- KD1. **Doar Web Analytics, fără Speed Insights.** (session-settled: user-directed — ales dintre trei variante.) Speed Insights ar fi adus un al doilea script și un plafon separat, mai strâns (10.000 evenimente/30 zile pe echipă, cu ingestia oprită 14 zile la depășire), pentru o întrebare pe care nimeni n-a pus-o. Governs R1, SB1.
- KD2. **Pachetul `@vercel/analytics`, nu `<script>` în HTML.** Varianta HTML n-are `beforeSend` tipat, ar cere duplicare în două shell-uri și ar readuce exact blocul scos deja o dată. Pachetul ține redactarea în TypeScript, unde poate fi testată. Governs R3, R5.
- KD3. **Pornit prin `inject()` din `main.tsx`, nu prin `<Analytics />` în arbore.** `main.tsx` alege pagina după `pathname`, fără router: un component ar trebui pus pe toate cele opt ramuri sau ar cere un wrapper nou. `inject()` e un efect secundar la pornire, exact idiomul lui `installGlobalMonitoring()` de deasupra. Documentația notează că varianta React „n-are route support" — irelevant aici: route support înseamnă gruparea căilor dinamice (`/blog/[slug]`), iar site-ul n-are nicio cale dinamică. Governs R5.
- KD4. **Poarta e `__VERCEL_ENV__ === 'production'`, nu `import.meta.env.PROD`.** `__VERCEL_ENV__` e deja ștampilat în bundle de `vite.config.ts` și e deja folosit ca poartă de mediu în `src/lib/canonicalHost.ts`. `import.meta.env.PROD` e adevărat și în `vite preview`, adică exact acolo unde rulează testele e2e și unde `/_vercel/insights/*` nu există — poarta greșită ar readuce 404-ul. Governs R6, R7.
- KD5. **Listă albă de parametri, nu listă neagră.** O listă neagră care scoate `token` ar rata următorul parametru secret adăugat. Lista albă lasă să treacă `utm_*` și `ref`; restul cad, inclusiv `token`. Governs R3.

### Requirements

**Ce se măsoară**

- R1. Vizualizările de pagină ajung în dashboard-ul Vercel pentru `parktraining.fit`: pagini, referreri, țări, tip de dispozitiv, browser.
- R2. Deschiderea overlay-ului de înscriere apare ca vizualizare a `/inscriere`, fiindcă overlay-ul schimbă deja URL-ul prin `pushState`. Nu se adaugă cod pentru asta.

**Ce NU pleacă spre Vercel**

- R3. Niciun URL trimis nu conține parametrul `token`, pe nicio cale. Se păstrează doar parametrii din lista albă (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `ref`).
- R4. Vizitele pe `/admin` nu se trimit deloc. E backoffice, nu trafic public, iar numărătoarea lui ar strica panourile.
- R5. Fragmentul (`#s2`, pus de `Antrenament.tsx` la derulare) se taie din URL, iar două evenimente consecutive cu URL identic se reduc la unul.

**Unde rulează**

- R6. În producție (`__VERCEL_ENV__ === 'production'`) scriptul se încarcă și trimite.
- R7. În dev local, în `vite preview`, în testele unitare și în cele e2e nu se încarcă niciun script de analitice și nu pleacă nicio cerere spre `/_vercel/insights/*` sau spre `va.vercel-scripts.com`. Zero erori noi în consolă.

**Confidențialitate**

- R8. Nu se adaugă niciun banner de consimțământ și niciun cookie. Vercel Web Analytics identifică vizitatorii printr-un hash derivat din cerere, aruncat după 24 h, fără cookie-uri terțe — de aceea R3 și R4 sunt tot ce lipsește ca să fie curat.

### Key Flows

1. **Vizitator obișnuit** → deschide `parktraining.fit` → scriptul se încarcă de pe același origin → pleacă o vizualizare pentru `/` → dacă deschide formularul, `pushState` duce URL-ul la `/inscriere` și pleacă a doua vizualizare → dacă închide overlay-ul, `replaceState` întoarce URL-ul și pleacă a treia.
2. **Participant cu link de dezabonare** → deschide `/unsubscribe?token=abc123` → `beforeSend` rescrie URL-ul la `/unsubscribe` → pleacă o vizualizare fără token.
3. **Organizator pe `/admin`** → `beforeSend` întoarce `null` → nu pleacă nimic.
4. **Dezvoltator pe `localhost:5173` sau pe `vite preview`** → `__VERCEL_ENV__` e `'development'` → `inject()` nu se apelează → nu se încarcă niciun script.

### Acceptance Examples

| # | Intrare | Ieșire așteptată |
|---|---|---|
| AE1 | `https://parktraining.fit/unsubscribe?token=abc123` | `/unsubscribe` |
| AE2 | `https://parktraining.fit/confirmare?token=X&utm_source=email` | `/confirmare?utm_source=email` |
| AE3 | `https://parktraining.fit/renunt?token=X#sectiune` | `/renunt` |
| AE4 | `https://parktraining.fit/admin` | `null` (evenimentul cade) |
| AE5 | `https://parktraining.fit/admin/orice` | `null` (evenimentul cade) |
| AE6 | `https://parktraining.fit/?preview=landing` | `/` (parametru din afara listei albe) |
| AE7 | `https://parktraining.fit/antrenament#s2`, apoi `…#s3` | primul dă `/antrenament`; al doilea cade ca duplicat consecutiv |
| AE8 | `/` → `/inscriere` → `/` | toate trei trec: niciunul nu repetă imediat precedentul |
| AE9 | `pornesteAnalitice('preview')` sau `('development')` | `inject()` nu se apelează |

### Success Criteria

- SC1. La 24 h după merge în `main`, dashboard-ul Vercel → Analytics arată vizualizări nenule pentru `parktraining.fit`.
- SC2. Panoul de URL-uri nu conține niciun `token=`.
- SC3. `npm run verify` trece, inclusiv pragurile de acoperire.

### Scope Boundaries

- SB1. **În afara scopului:** Speed Insights (KD1), evenimente custom (cer Pro), Web Analytics Plus, drains, banner de cookie-uri.
- SB2. **În afara scopului:** orice schimbare de ecran, de flux de înscriere, de RPC sau de funcție Edge.
- SB3. **În afara scopului:** analitice pe deploy-urile de preview. Sunt protejate SSO și Vercel raportează oricum doar producția.

### Dependencies / Assumptions

- DA1. Echipa Vercel e `muv's projects` (`team_fJF3WSoJeMLf5Ohzc1jnEpUb`), proiectul e `run-lift-landing` (`prj_ChASmmSjf0guIUlvbMF4RHG5LVeU`), domeniul de producție e `parktraining.fit`. **Verificat prin API.**
- DA2. Web Analytics NU e activat azi. **Verificat:** `count_pageviews` răspunde `404 Web Analytics not found`.
- DA3. Se presupune planul **Hobby** (50.000 evenimente/lună, fereastră de o lună, fără evenimente custom). API-ul nu expune planul echipei, deci rămâne de confirmat în dashboard. Dacă echipa e pe Pro, nimic din plan nu se strică — doar se deblochează opțiuni pe care planul le-a lăsat deliberat afară.
- DA4. Traficul actual e cu mult sub 50.000 de evenimente/lună. Chiar cu cele 2–3 evenimente suplimentare per sesiune din overlay, plafonul nu e o îngrijorare reală.
- DA5. Deploy-ul se face prin merge în `main`, care declanșează CI-ul și abia apoi deploy hook-ul. `vercel deploy` / `vercel --prod` din quickstart-ul Vercel **ocolește pipeline-ul** și nu se folosește aici (`vercel.json` are `git.deploymentEnabled.main = false` tocmai ca să existe o singură cale).

### Outstanding Questions

- OQ1. Fragmentul din `/antrenament` declanșează sau nu un eveniment la fiecare `replaceState`? Scriptul compară de obicei `pathname`, deci probabil nu. R5 acoperă ambele cazuri, deci răspunsul nu blochează nimic — se verifică în dashboard după o săptămână, uitându-te dacă `/antrenament` are un număr absurd de vizualizări.
- OQ2. **Tokenul poate ocoli `beforeSend` prin câmpul Referrer.** `beforeSend` rescrie `event.url`, dar Vercel stochează și un câmp `Referrer` (vezi tabelul din documentația de confidențialitate). `Referrer-Policy` e `strict-origin-when-cross-origin`, care pe navigări **same-origin** trimite URL-ul COMPLET. Iar `/confirmare` are un `<a class="cs-logo" href="/">` în antet: cine ajunge cu `?token=X` și dă click pe logo generează o vizualizare a lui `/` al cărei referrer e `https://parktraining.fit/confirmare?token=X`. Aceeași formă există pe `/unsubscribe` și `/renunt`. Tokenurile sunt de unică folosință și expiră, iar panourile de referreri ascund de regulă traficul intern — deci nu e blocant — dar intenția lui R3 nu e complet acoperită de redactarea URL-ului. Două remedii posibile, ambele în afara scopului de azi: (a) `history.replaceState` care scoate tokenul din URL imediat după ce e citit, în cele trei componente; (b) `Referrer-Policy: same-origin` sau `strict-origin` în `vercel.json`. Decizia aparține operatorului.

### Sources / Research

- [Web Analytics quickstart](https://vercel.com/docs/analytics/quickstart) — ordinea „activează întâi, deployează după"; nota că varianta React n-are route support.
- [`@vercel/analytics` package](https://vercel.com/docs/analytics/package) — API-ul `inject({ mode, beforeSend, debug })`, `BeforeSendEvent`, configurarea dinamică v2.
- [Privacy and Compliance](https://vercel.com/docs/analytics/privacy-policy) — ce se stochează per punct de date (inclusiv URL și query params), hash-ul de 24 h fără cookie-uri, Resilient Intake în v2.
- [Limits and Pricing](https://vercel.com/docs/analytics/limits-and-pricing) — Hobby: 50.000 evenimente/lună, fereastră 1 lună, fără evenimente custom.
- [Troubleshooting](https://vercel.com/docs/analytics/troubleshooting) — dashboard gol / 404 pe `script.js` = cod deployat înainte de activare.
- Cod local: `src/main.tsx`, `src/lib/monitoring.ts`, `src/lib/canonicalHost.ts`, `vite.config.ts` (`__VERCEL_ENV__`), `src/components/landing/RegistrationOverlay.tsx:37`, `src/components/Antrenament.tsx:80`, `index.html` / `antrenament.html` (blocurile comentate), `BACKLOG.md:36`.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **`src/lib/analytics.ts` expune două lucruri: o funcție pură și un pornitor.** `curataEveniment(url)` întoarce `string | null` și n-are nicio stare; `pornesteAnalitice(env)` ține poarta de mediu, dedublarea și apelul `inject()`. Aceeași separare ca `deployConfig.ts` ↔ `check-deploy-config.ts`: logica se testează fără browser, efectul secundar rămâne subțire.
- KTD5. **Mediul se PRIMEȘTE ca parametru, nu se citește din global.** `pornesteAnalitice(env: string)`, apelat ca `pornesteAnalitice(__VERCEL_ENV__)` din `main.tsx` — exact forma lui `redirectCanonic({ env, href })`, și din exact același motiv: `__VERCEL_ENV__` e un `define` din `vite.config.ts`, iar `vitest.config.ts` e un config separat, **fără `define`**. Un modul care ar citi globalul direct ar arunca `ReferenceError` în testele unitare, și AE9 n-ar avea cum să fie verificat fără să bagi un `define` în configul de test. Governs R6, R7, AE9.
- KTD2. **Redactarea se face reconstruind URL-ul, nu cu regex.** `new URL(url, 'https://parktraining.fit')` acceptă și absolut și relativ; se reține `pathname`, se filtrează `searchParams` prin lista albă, se aruncă `hash`. Un regex peste query string ar fi ratat forme ca `?a=1&token=2`.
- KTD3. **Dedublarea consecutivă trăiește în `pornesteAnalitice()`, într-o variabilă de modul.** Trei linii, și e singurul lucru care ține în frâu `replaceState`-ul cu fragment din `/antrenament` indiferent de răspunsul la OQ1. Nu e memorie de sesiune: reține doar ultimul URL emis.
- KTD4. **Blocurile comentate din `index.html` și `antrenament.html` se șterg, nu se decomentează.** Două mecanisme pentru același script ar însemna două încărcări și două numărători. Un test le ține șterse.

### High-Level Technical Design

```
vite.config.ts  ──define──▶  __VERCEL_ENV__  (build stamp: 'production' | 'preview' | 'development')
                                   │
                                   ▼
main.tsx ──▶ redirectCanonic()           (deja acolo)
         ──▶ installGlobalMonitoring()   (deja acolo)
         ──▶ pornesteAnalitice(__VERCEL_ENV__)  ◀── NOU, ultimul efect de pornire
                    │
                    ├─ __VERCEL_ENV__ !== 'production'  →  return  (fără script, fără 404)
                    │
                    └─ inject({ mode: 'production', beforeSend })
                                                          │
                                        ┌─────────────────┘
                                        ▼
                         beforeSend(event)
                              │
                              ├─ curataEveniment(event.url) → null   →  return null  (/admin)
                              ├─ url === ultimulUrl                  →  return null  (duplicat)
                              └─ altfel  → ultimulUrl = url; return { ...event, url }
```

`curataEveniment` — funcție pură, singura parte testată exhaustiv:

```
curataEveniment(url):
  u = new URL(url, 'https://parktraining.fit')
  dacă u.pathname === '/admin' sau începe cu '/admin/'  →  null
  păstrate = u.searchParams filtrat prin PARAMETRI_PERMISI
  →  u.pathname + (păstrate.length ? '?' + păstrate : '')      // fără hash
```

Nu se atinge `vercel.json`. Scriptul și intake-ul sunt pe același origin (`/_vercel/insights/*` sau calea unică generată de Resilient Intake în v2), deci `script-src 'self'` și `connect-src 'self'` le acoperă deja pe amândouă. **Asta e verificat prin lectura documentației, nu prin rulare** — dacă totuși apare o violare CSP în producție, `installGlobalMonitoring()` o loghează explicit cu `blockedURI`, adică diagnosticul e deja instrumentat.

### Assumptions

- A1. `inject()` din `@vercel/analytics` primește `beforeSend` și îl aplică și vizualizărilor, nu doar evenimentelor custom. Documentația de redactare a datelor sensibile arată exact acest tipar pentru „orice framework".
- A2. `event.url` e URL absolut. `new URL(url, bază)` face presupunerea inofensivă: merge în ambele cazuri.

### Risks & Dependencies

- RD1. **Ordinea greșită readuce 404-ul.** Dacă U2–U5 ajung în `main` înainte ca U1 să fie făcut, producția încarcă un script inexistent. Mitigare: U1 e prima unitate și e explicit o precondiție de merge, nu de PR.
- RD2. **Poarta de mediu ratată.** Dacă cineva schimbă poarta pe `import.meta.env.PROD`, testele e2e încep să ceară `/_vercel/insights/script.js` de pe `vite preview`. Mitigare: U4 adaugă exact garda e2e care prinde asta.
- RD3. **Redactarea ocolită.** Un parametru secret nou adăugat mai târziu ar trece doar dacă cineva îl bagă în lista albă — adică printr-o schimbare vizibilă la review. Riscul rezidual e mic și deliberat (KD5).

### System-Wide Impact

Un singur apel nou în `main.tsx`, deci toate cele opt pagini îl primesc uniform, inclusiv shell-ul `antrenament.html` (încarcă același `/src/main.tsx`). O dependență nouă de producție, prima în afara lui React. `knip` n-o va marca: e importată din `src/lib/analytics.ts`. Pragurile de acoperire urcă, nu coboară: `analytics.ts` e logică pură, bine acoperită de U4.

---

## Implementation Units

### U1. Activarea Web Analytics pe proiect

**Acțiune de operator, nu cod. Se face ÎNAINTE de merge-ul în `main`.**

Dashboard Vercel → proiectul `run-lift-landing` → **Analytics** în bara laterală → **Enable**. Alternativ, din terminal: `vercel project web-analytics run-lift-landing`.

Activarea adaugă rutele `/_vercel/insights/*` și `/<cale-unică>/*` **începând cu deploy-ul următor** — de aceea ordinea e fixă.

- **Fișiere:** niciunul.
- **Gata când:** `count_pageviews` pentru proiect nu mai răspunde `404 Web Analytics not found` (poate întoarce zero vizualizări — e în regulă). Confirmă totodată planul echipei (DA3).

### U2. Stratul de analitice

Adaugă dependența și scrie modulul.

```
npm i @vercel/analytics
```

`src/lib/analytics.ts`, nou:
- `PARAMETRI_PERMISI` — `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `ref`.
- `curataEveniment(url: string): string | null` — pură, conform KTD2.
- `pornesteAnalitice(env: string): void` — poarta `env !== 'production' → return` (KTD5), idempotentă ca `installGlobalMonitoring()`, dedublare consecutivă (KTD3), apoi `inject({ mode: 'production', beforeSend })`.

Comentariu de antet în stilul casei: de ce poarta e `__VERCEL_ENV__` și nu `import.meta.env.PROD` (KD4), și de ce lista e albă (KD5). Ambele sunt exact genul de decizie care se pierde la următoarea atingere.

- **Fișiere:** `src/lib/analytics.ts` (nou), `package.json`, `package-lock.json`.
- **Gata când:** `npm run typecheck` și `npm run lint` trec.

### U3. Montarea și curățenia din shell-uri

În `src/main.tsx`, după `installGlobalMonitoring()`, apelează `pornesteAnalitice(__VERCEL_ENV__)` — globalul se citește aici, ca la `redirectCanonic` de mai sus (KTD5). Comentariu scurt: numărătoarea de trafic, tăcută în afara producției.

Șterge blocul comentat `<!-- Vercel Analytics + Speed Insights … -->` cu tot cu scripturile din interior, din **ambele** shell-uri (KTD4).

- **Fișiere:** `src/main.tsx`, `index.html`, `antrenament.html`.
- **Gata când:** `npm run build` trece (inclusiv garda CSP↔config, neatinsă).

### U4. Testele

`tests/unit/analytics.test.ts`, nou — tabelul AE1–AE9 pe `curataEveniment`, plus dedublarea consecutivă și poarta de mediu.

`tests/unit/deploy-config.test.ts` — un bloc nou: niciunul dintre cele două shell-uri nu mai conține `_vercel/insights`. Păzește KTD4 împotriva unei reveniri prin copy-paste.

E2E — garda de mediu, în stilul celei din `tests/reels.spec.ts`: pe `vite preview` (unde `__VERCEL_ENV__` e `'development'`), zero cereri spre `/_vercel/insights/*` și zero spre `va.vercel-scripts.com` la încărcarea landing-ului. E inversul exact al bug-ului de la care a pornit tot (RD2), și se vede direct în rețea.

- **Fișiere:** `tests/unit/analytics.test.ts` (nou), `tests/unit/deploy-config.test.ts`, un spec e2e existent (`tests/landing.spec.ts` e locul firesc).
- **Gata când:** `npm run test:coverage` și `npm run test:e2e:preview` trec. Dacă acoperirea a urcat, urcă și pragurile din `vitest.config.ts` — clichetul urcă, nu coboară.

### U5. Documentația

`README.md` → „Decizii de arhitectură": un paragraf despre de ce analiticele sunt tăcute în afara producției și de ce URL-urile se curăță înainte de trimitere (tokenurile din `/confirmare`, `/unsubscribe`, `/renunt`).

`BACKLOG.md:36` → bifează intrarea „Vercel Analytics" și corectează-i textul: nu se mai decomentează nimic din `index.html`.

- **Fișiere:** `README.md`, `BACKLOG.md`.
- **Gata când:** niciun document din repo nu mai trimite cititorul spre blocurile comentate.

---

## Verification Contract

| # | Cum se verifică | Unde |
|---|---|---|
| V1 | `curataEveniment` satisface AE1–AE9 | `tests/unit/analytics.test.ts` |
| V2 | Shell-urile nu mai conțin `_vercel/insights` | `tests/unit/deploy-config.test.ts` |
| V3 | Zero cereri de analitice pe `vite preview` | e2e, `tests/landing.spec.ts` |
| V4 | Pachetul complet de verificări | `npm run verify` |
| V5 | Dashboard-ul arată vizualizări la 24 h după merge | Vercel → Analytics (manual, SC1) |
| V6 | Niciun `token=` în panoul de URL-uri | Vercel → Analytics (manual, SC2) |
| V7 | Zero erori noi în consolă pe `parktraining.fit` | DevTools în producție, după deploy |

## Definition of Done

- [ ] U1 făcut **înainte** de merge; Web Analytics activat pe proiect și planul echipei confirmat.
- [ ] `pornesteAnalitice(__VERCEL_ENV__)` apelat din `main.tsx`, tăcut în orice mediu în afară de producție.
- [ ] Niciun URL cu `token` și nicio vizită pe `/admin` nu pleacă spre Vercel.
- [ ] Blocurile comentate șterse din ambele shell-uri.
- [ ] `npm run verify` trece; pragurile de acoperire urcate dacă e cazul.
- [ ] `README.md` și `BACKLOG.md` actualizate.
- [ ] După merge în `main`: CI verde, deploy sus, V5–V7 verificate manual.

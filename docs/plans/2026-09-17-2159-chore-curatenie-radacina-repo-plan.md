---
title: Curățenia rădăcinii repo-ului - Plan
type: chore
date: 2026-09-17
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Curățenia rădăcinii repo-ului - Plan

## Goal Capsule

- **Objective:** rădăcina repo-ului se citește dintr-o privire — rămân doar fișierele de configurare și documentele vii, iar restul stă în dosare cu nume care spun ce conțin.
- **Means:** cele 29 de fișiere SQL se mută în `supabase/sql/` cu `git mv`, referințele care se rup se actualizează, iar resturile locale negitite se șterg (KTD1).
- **Authority:** planul ăsta. Scopul a fost confirmat în sesiune: se arhivează, nu se șterge.
- **Execution profile:** mutări de fișiere + actualizări de text. Nicio schimbare de comportament, nicio migrare aplicată, niciun deploy.
- **Stop conditions:** oprește-te și întreabă dacă (a) `npm run verify` pică din alt motiv decât o cale de fișier neactualizată; (b) mutarea ar cere redenumirea vreunui fișier SQL; (c) curățenia ar atinge `.vercel/`, `.claude/` sau `participante.md`.
- **Tail ownership:** implementarea și verificarea locală. Merge-ul în `main` (adică deploy-ul frontendului) rămâne al operatorului.

---

## Product Contract

### Summary

Curățenia mută cele 29 de fișiere SQL din rădăcină într-un dosar propriu, șterge resturile locale care nu sunt în git, aduce documentul de handoff rămas la ediția 4 la starea curentă și adaugă în `scripts/check-deploy-config.ts` o gardă care pică build-ul dacă un fișier SQL reapare în rădăcină. Codul din `src/` și `tests/` nu se restructurează — se ating doar calea de încărcare din `tests/unit/sqlAnunt.test.ts` și comentariile care numesc migrarea sursă. Nimic nu se pierde: fișierele se mută cu istoric, iar documentele care le indexează se actualizează în aceeași trecere.

### Problem Frame

Rădăcina are 52 de fișiere urmărite de git, dintre care 29 sunt SQL: fiecare migrare aplicată vreodată, plus două scripturi de operare. S-au adunat una câte una, de la prima ediție încoace, fiindcă `MIGRATIONS.md` le indexează după nume și nimeni n-a avut motiv să le mute. Efectul e că un fișier de configurare — `vite.config.ts`, `vercel.json`, `package.json` — se caută printre 29 de fișiere SQL care nu se mai deschid niciodată după ce migrarea a fost aplicată.

Peste asta stau resturile locale: 11 MB de `dist/`, rapoarte de acoperire, capturi de ecran din sesiuni de test, două fișiere `.DS_Store`. Sunt deja în `.gitignore`, deci nu ajung în git, dar apar la fiecare `ls` și la fiecare căutare prin repo.

Iar un document a rămas în urmă de tot: descrie „Ediția 4" și e actualizat ultima dată pe 4 august, în timp ce proiectul e la ediția 7.

### Requirements

**Mutarea fișierelor SQL**

- R1. Cele 29 de fișiere `*.sql` din rădăcină trăiesc într-un singur dosar, `supabase/sql/`.
- R2. Fiecare fișier își păstrează numele și istoricul din git — se mută, nu se rescrie.
- R3. Cele două citiri la rulare din teste arată spre locul nou; suita rămâne verde fără alte modificări.
- R4. Mențiunile din documentele vii (`MIGRATIONS.md`, `ANTI-BOT.md`, `GHID-EDITIE-NOUA.md`, `IDEI.md`) și din comentariile din cod arată spre locul nou.

**Resturile locale**

- R5. Resturile negitite dispar din rădăcină: build-uri, rapoarte de acoperire, rezultate de test, capturi de ecran, fișiere temporare.
- R6. `.vercel/`, `.claude/`, `node_modules/` și exportul cu date personale rămân neatinse.

**Documentele**

- R7. Documentul de handoff rămas la ediția 4 descrie din nou starea reală, fără să repete ce spun deja `README.md`, `MIGRATIONS.md` sau `ANTI-BOT.md`.
- R8. Planurile din `docs/plans/` rămân neatinse, inclusiv mențiunile lor către fișiere SQL — sunt înregistrări istorice, nu documentație vie.

### Key Decisions

- **Se arhivează, nu se șterge.** *Governs R1, R2.* Migrările sunt istoricul bazei de date și două dintre ele se citesc efectiv la rularea testelor. (session-settled: user-directed — chosen over ștergerea celor deja aplicate: istoricul și testele au nevoie de fișiere, nu doar de intrări în `MIGRATIONS.md`.)

### Success Criteria

- `ls *.sql` în rădăcină nu întoarce nimic.
- `npm run verify` trece, fără modificări în afara celor din plan.
- `git log --follow supabase/sql/<oricare fișier>` arată istoricul dinainte de mutare.
- Rădăcina urmărită de git scade de la 52 la ~23 de fișiere.

### Scope Boundaries

- Codul din `src/` (107 fișiere) și `tests/` (79) nu se restructurează. E viu, acoperit de teste și nu contribuie la aglomerarea din rădăcină. Singurele atingeri sunt calea de încărcare din `tests/unit/sqlAnunt.test.ts` și cele patru comentarii care numesc migrarea sursă — nicio schimbare de comportament.
- Media din `public/` rămâne (`fpv.mp4`, 8,4 MB, e folosit de pagină).
- Baza de date nu se atinge: tabelele de backup (`registrations_backup`, `launch_notifications_backup_20260718`) sunt altă discuție.
- Istoricul git nu se rescrie. Cei 26 MB din `.git` sunt costul de a avea istoric.

#### Deferred to Follow-Up Work

- `public/og.svg` nu e referit de niciun fișier sursă — probabil sursa de desen pentru `og.png`. Are 2,5 KB; de decis separat dacă merge într-un dosar de surse de design sau dispare.
- `public/og.png` e încă imaginea ediției a cincea (22 august). Regenerarea ei e o sarcină de conținut, nu de curățenie.
- Împărțirea `supabase/sql/` în subdosare (migrări vs. operațiuni) dacă numărul de fișiere crește peste ce se citește dintr-o privire.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Dosarul e `supabase/sql/`, nu `supabase/migrations/`.** *Governs R1.* `supabase/migrations/` e rezervat de CLI-ul Supabase: `db push` și `db reset` tratează ce e acolo ca migrări de aplicat, cu o convenție de nume bazată pe timestamp. Migrările astea se aplică prin MCP `apply_migration`, iar numele lor nu respectă convenția CLI-ului — puse acolo, ar fi o capcană pentru prima rulare de `supabase db …`. `supabase/` conține deja `functions/` și `schema/`, deci `sql/` stă lângă ele fără să inventeze un dosar nou în rădăcină.
- KTD2. **`git mv`, nu ștergere plus creare.** *Governs R2.* Păstrează detecția de redenumire, deci `git log --follow` și `git blame` continuă să funcționeze pe fișierele mutate.
- KTD3. **Numele fișierelor rămân neschimbate.** *Governs R2, R4.* `MIGRATIONS.md` le indexează după nume, iar planurile istorice le citează de 22 de ori. Redenumirea (de exemplu, prefixarea cu dată) ar rupe toate acele citate fără să câștige nimic.
- KTD4. **Cele două citiri la rulare se actualizează în aceeași schimbare cu mutarea.** *Governs R3.* `tests/unit/sqlAnunt.test.ts` încarcă două fișiere de migrare de pe disc; orice altă ordine lasă suita roșie între două commit-uri.
- KTD5. **Documentele istorice nu se rescriu.** *Governs R8.* Un plan din august descrie realitatea din august. Actualizarea căilor din el ar fi o falsificare a înregistrării, nu o corectură.

### Assumptions

- Cele două scripturi care nu sunt migrări (`supabase-cron-reminder-ARM.sql`, `supabase-roteste-secretul.sql`) merg în același dosar. Sunt tot SQL rulat manual, iar un al doilea dosar pentru două fișiere ar muta problema, nu ar rezolva-o.

### High-Level Technical Design

Rădăcina, înainte și după:

```text
înainte                                după
├── supabase-migration-*.sql (27)      ├── supabase/
├── supabase-cron-reminder-ARM.sql     │   ├── functions/
├── supabase-roteste-secretul.sql      │   ├── schema/runlift.sql
├── MIGRATIONS.md  ← indexul lor       │   └── sql/            ← cele 29, cu numele lor
├── README.md, ANTI-BOT.md, …          ├── MIGRATIONS.md  ← indexul, cu căile noi
└── vite.config.ts, package.json, …    ├── README.md, ANTI-BOT.md, …
                                       └── vite.config.ts, package.json, …
```

Ce se rupe la mutare, în ordinea în care doare:

| Referință | Unde | Tip | Se rupe? |
|---|---|---|---|
| Încărcarea celor două migrări ale anunțului | `tests/unit/sqlAnunt.test.ts` | citire de pe disc, la rulare | Da — suita pică |
| Indexul migrărilor (29 de mențiuni) | `MIGRATIONS.md` | text | Nu, dar devine greșit |
| Runbook-ul anti-bot (2 mențiuni) | `ANTI-BOT.md` | text | Nu, dar devine greșit |
| Armarea cron-ului, singurul pas manual al unei ediții noi | `GHID-EDITIE-NOUA.md` | text | Nu, dar devine greșit |
| O mențiune de context | `IDEI.md` | text | Nu, dar devine greșit |
| Comentarii care numesc migrarea sursă | `src/admin/anunt.ts`, `tests/unit/sql/drepturi.test.ts`, `tests/unit/sql/business.test.ts`, `tests/integration/backend.live.test.ts`, `supabase/functions/submit-form/index.ts` | comentariu | Nu, dar devine greșit |
| 22 de nume de migrări | `docs/plans/*.md` | înregistrare istorică | Nu — se lasă în pace (KTD5) |

### Sequencing

```text
U1 (mutarea + citirile la rulare) ──► U2 (referințele din documente și comentarii)
U3 (documentul rămas în urmă)  ─┐
U4 (resturile locale)          ─┴──► independente, se pot face oricând
U5 (garda împotriva recidivei) ──► după U1
```

---

## Implementation Units

### U1. Mutarea fișierelor SQL în `supabase/sql/`

- **Goal:** rădăcina rămâne fără fișiere SQL, iar suita rămâne verde.
- **Requirements:** R1, R2, R3.
- **Dependencies:** niciuna.
- **Files:**
  - `supabase/sql/` (dosar nou, 29 de fișiere mutate din rădăcină)
  - `tests/unit/sqlAnunt.test.ts` (helperul care rezolvă calea celor două migrări)
- **Approach:**
  1. Creează `supabase/sql/` și mută acolo toate cele 29 de fișiere `*.sql` din rădăcină cu `git mv`, păstrând numele (KTD2, KTD3).
  2. Actualizează în `tests/unit/sqlAnunt.test.ts` calea de la care se încarcă cele două migrări ale anunțului — helperul rezolvă azi fișierele față de rădăcina repo-ului (KTD4).
  3. Verifică faptul că nicio altă cale de fișier nu mai arată spre rădăcină: `tests/unit/sql/db.ts` încarcă `supabase/schema/runlift.sql`, care NU se mută.
- **Patterns to follow:** `tests/unit/sql/db.ts` rezolvă deja o cale din `supabase/` cu `resolve(__dirname, …)` — aceeași formă, alt dosar.
- **Test scenarios:**
  - Suita SQL a anunțului trece neschimbată: migrările se încarcă de la calea nouă, iar cele 38 de teste ale ei rămân verzi.
  - Suita SQL care rulează pe instantaneul schemei (`tests/unit/sql/`) trece neatinsă — dovedește că `supabase/schema/runlift.sql` n-a fost prins din greșeală în mutare.
  - `git log --follow` pe un fișier mutat arată commit-uri dinaintea mutării.
- **Verification:** `npm test` trece integral; `ls *.sql` în rădăcină nu întoarce nimic.

### U2. Referințele din documente și comentarii

- **Goal:** documentele vii spun unde sunt fișierele acum.
- **Requirements:** R4, R8.
- **Dependencies:** U1.
- **Files:**
  - `MIGRATIONS.md` (mențiunile migrărilor, plus rândul și titlul de secțiune ale celor două scripturi de operare)
  - `ANTI-BOT.md` (2 mențiuni)
  - `GHID-EDITIE-NOUA.md` (armarea cron-ului: `supabase-cron-reminder-ARM.sql`)
  - `IDEI.md` (1 mențiune)
  - `src/admin/anunt.ts`, `tests/unit/sql/drepturi.test.ts`, `tests/unit/sql/business.test.ts`, `tests/integration/backend.live.test.ts`, `supabase/functions/submit-form/index.ts` (câte un comentariu care numește migrarea sursă)
  - `README.md` (harta documentelor, dacă menționează locul fișierelor SQL)
- **Approach:**
  1. Înlocuiește mențiunile de forma `supabase-*.sql` cu calea nouă, `supabase/sql/supabase-*.sql`. Tiparul e `supabase-`, nu `supabase-migration-`: cele două scripturi de operare (`supabase-cron-reminder-ARM.sql`, `supabase-roteste-secretul.sql`) n-au prefixul de migrare și sunt exact cele rulate manual, deci cele pentru care calea contează cel mai mult.
  2. Adaugă în capul tabelului din `MIGRATIONS.md` o linie care spune unde stau fișierele și că numele rămân cheia de căutare.
  3. NU atinge `docs/plans/*.md` (KTD5).
- **Test scenarios:**
  - Test expectation: none — schimbare de text. Verificarea e că o căutare după `supabase-` (nu doar `supabase-migration-`, care ratează numele cu majuscule ca `ARM`) în afara `docs/plans/` nu mai întoarce nicio cale din rădăcină.
- **Verification:** nicio mențiune rămasă fără dosar în documentele vii; `npm run verify` trece (documentele nu intră în build, dar `MIGRATIONS.md` e citit de oameni la fiecare migrare).

### U3. Documentul de handoff rămas la ediția 4

- **Goal:** documentul descrie starea reală sau dispare, în loc să contrazică tăcut restul documentației.
- **Requirements:** R7.
- **Dependencies:** niciuna.
- **Files:** `TASK-FOR-CLAUDE.md`, `README.md` (linia care îl indexează).
- **Approach:**
  1. Citește documentul în întregime și separă ce e încă adevărat (decizii de arhitectură, capcane care s-au repetat) de ce a fost depășit (starea ediției 4, linkuri și numere vechi).
  2. Taie tot ce e acoperit azi de `README.md`, `MIGRATIONS.md`, `ANTI-BOT.md`, `CI-CD.md` sau `GHID-EDITIE-NOUA.md` — documentul ăsta n-are voie să fie a doua sursă pentru aceleași lucruri.
  3. Rescrie ce rămâne pe starea curentă (ediția 7) și pune data actualizării.
  4. Dacă după tăiere rămâne sub o pagină, comaseaz-o în `README.md` și scoate fișierul, actualizând linia din `README.md` care îl indexa.
- **Test scenarios:**
  - Test expectation: none — document. Verificarea e de conținut: nicio afirmație despre ediție, locație sau plafon nu contrazice configul publicat.
- **Verification:** documentul (sau secțiunea care l-a înlocuit) nu mai conține „Ediția 4"; linia din `README.md` duce undeva care există.

### U4. Resturile locale

- **Goal:** `ls` în rădăcină arată doar fișiere care contează.
- **Requirements:** R5, R6.
- **Dependencies:** niciuna.
- **Files:** niciunul urmărit de git — sunt toate în `.gitignore`.
- **Approach:**
  1. Șterge: `dist/` (11 MB), `coverage/`, `test-results/`, `.playwright-mcp/`, `tsconfig.tsbuildinfo`, `.DS_Store` și `src/.DS_Store`, plus capturile `form-320.png`, `form-375-fixed.png`, `maps_embed_check.png`.
  2. NU atinge: `.vercel/` (leagă repo-ul de proiectul Vercel), `.claude/`, `node_modules/`, `supabase/.temp/` și `participante.md` (export cu date personale, ținut deliberat în afara git-ului).
  3. Verifică faptul că `.gitignore` acoperă deja fiecare tipar șters — dacă apare ceva neacoperit, adaugă tiparul, nu excepția.
- **Test scenarios:**
  - Test expectation: none — nu se atinge niciun fișier urmărit. Verificarea e că `git status --short` rămâne curat după ștergere.
- **Verification:** `git status` curat; `npm run build` reface `dist/` fără eroare; `.vercel/` și `participante.md` încă există.

### U5. Garda împotriva recidivei

- **Goal:** următorul fișier SQL nu mai aterizează în rădăcină.
- **Requirements:** R1.
- **Dependencies:** U1.
- **Files:** `scripts/check-deploy-config.ts` (rulează deja la fiecare `npm run build`).
- **Approach:** adaugă o verificare care pică build-ul dacă apare un fișier `*.sql` în rădăcina repo-ului, cu un mesaj care spune unde e locul lui. Verificarea e o simplă citire de director — nu deschide fișierele.
- **Patterns to follow:** gărzile existente din `scripts/check-deploy-config.ts`, care pică build-ul cu un mesaj explicit când configurarea de deploy e incompletă.
- **Test scenarios:**
  - Un fișier `*.sql` pus temporar în rădăcină face `npm run build` să pice, cu mesajul care numește `supabase/sql/`.
  - Cu rădăcina curată, build-ul trece neschimbat.
- **Verification:** `npm run build` trece pe repo-ul curat și pică pe unul murdar.

---

## Verification Contract

| Comandă | Ce dovedește | Când |
|---|---|---|
| `npm test` | cele două citiri la rulare arată spre locul nou; nicio suită nu s-a rupt | după U1 |
| `npm run verify` | lint, tipuri, acoperire, build și e2e, tot lanțul | după U2 și U5 |
| `ls *.sql` | rădăcina nu mai are fișiere SQL | după U1 |
| `git status --short` | curățenia locală n-a atins niciun fișier urmărit | după U4 |
| `git log --follow supabase/sql/supabase-migration-anunt-istoric.sql` | istoricul a supraviețuit mutării | după U1 |

---

## Definition of Done

- Rădăcina nu mai conține fișiere `*.sql`, iar `supabase/sql/` le conține pe toate 29, cu numele neschimbate.
- `npm run verify` trece.
- Nicio mențiune din documentele vii nu mai trimite spre o cale din rădăcină; `docs/plans/` a rămas neatins.
- Documentul de handoff descrie ediția curentă sau a fost comasat, iar `README.md` e de acord cu realitatea.
- Resturile locale au dispărut, iar `.vercel/`, `.claude/` și exportul cu date personale există încă.
- Build-ul pică dacă un fișier SQL reapare în rădăcină.
- Nu rămâne cod sau fișier intermediar din încercările care n-au ținut.

---
title: Câmpuri, liste derulante și butoane unificate în admin - Plan
type: fix
date: 2026-10-07
topic: admin-controale-unificate
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Câmpuri, liste derulante și butoane unificate în admin - Plan

## Goal Capsule

- **Obiectiv:** În `/admin`, un câmp, o listă derulantă sau un buton arată și răspunde la fel pe orice ecran. Marginile se văd, focusul se vede, iar stările de eroare, atenție și dezactivat au un singur aspect. Pagina publică nu se schimbă.
- **Mijloc:** Un strat de bază doar în CSS, peste clasele existente, pe jetoanele temei Panoul (KTD1, KTD2).
- **Autoritate de produs:** Planul deține aspectul și stările controalelor din admin. Nu deține comportamentul lor, structura ecranelor, controalele proprii din U3/U4 ale planului Panoul sau pagina publică.
- **Autoritate tehnică:** Pe comportament câștigă R-urile. Pe mecanism câștigă KTD-urile. Unitățile nu le suprascriu.
- **Profil de execuție:** U1 întâi. U2, U3 și U4 depind doar de U1 și pot merge în orice ordine. U5 la final. Fiecare unitate lasă adminul funcțional.
- **Condiții de oprire:** Oprește-te și întreabă dacă:
  - o schimbare cere modificarea unui fișier `.tsx`;
  - o regulă nouă schimbă aspectul paginii publice;
  - înălțimea nouă a controalelor rupe un rând sau crește antetul lipit pe telefon;
  - commitul `ebc21d4` de pe `claude/sweet-franklin-obzrqv` ajunge pe GitHub înainte de U1 (vezi KTD7).
- **Coada:** Lucrul se face pe branch-ul nou `fix/admin-controale-unificate`, pornit din `origin/main`. Push și PR doar cu acordul utilizatorului. Merge-ul în `main` e deploy-ul (CI → Vercel). Fără migrări.
- **Blocante deschise:** Niciunul.

---

## Product Contract

### Summary

Adminul primește un singur limbaj pentru controale: o scară de înălțimi, o margine vizibilă, un focus, un set de stări și cinci roluri de buton. Listele derulante native primesc aspect propriu, identic pe toate sistemele. Selectoarele native de dată și oră trec pe schema luminoasă. Totul se face în `src/index.css`, fără schimbări de markup.

### Problem Frame

Tema Panoul (PR #55) a schimbat culorile, dar fiecare ecran și-a păstrat regulile proprii pentru câmpuri și butoane. În `src/index.css` sunt 42 de reguli separate pentru `input`/`select`/`textarea` în admin și șase variante de buton cu dimensiuni diferite. Măsurat pe `origin/main`:

- Marginea câmpurilor (`--pa-line` pe alb) are contrast 1,43:1. Pragul pentru marginea unui control e 3:1. Jetonul potrivit, `--pa-line-control` (3,62:1), există, dar nu e folosit de niciun câmp.
- Marginea butonului de ștergere (`--pa-danger-soft` pe fundal) are 1,01:1, deci nu se vede. La hover, textul închis pe roșu are 3,26:1.
- Câmpurile de dată și oră din editorul evenimentului și din ecranele grupului au `color-scheme: dark`, rămas din tema întunecată. Pe tema luminoasă, calendarul nativ se deschide întunecat.
- Nicio listă derulantă nu are `appearance` setat, deci arată diferit pe macOS, Windows și Android.
- Focusul are trei forme: contur de 2 px, margine colorată sau inel moale. Unele câmpuri le au pe două deodată, altele doar marginea.
- Înălțimile variază între ~28 px (Promovează, Șterge), ~38 px și 42 px. Auditul din 4 octombrie 2026 cere ~44 px pentru controalele frecvente (`docs/reviews/2026-10-04-admin-ui-audit.md`).

### Requirements

**Câmpuri**

- R1. Toate câmpurile de text din admin au aceeași înălțime, umplutură, font, margine, rază și fundal: text, căutare, număr, parolă, dată, oră, dată-și-oră și zona de text.
- R2. Marginea oricărui câmp și a oricărei liste derulante are contrast de cel puțin 3:1 față de fundalul câmpului.
- R3. Câmpurile și listele derulante au un singur tratament de focus, vizibil de la tastatură și la clic, fără să miște conținutul.
- R4. Stările invalid, atenție, dezactivat și doar-citire arată la fel pe toate ecranele. Mesajele text existente rămân, deci eroarea nu e semnalată doar prin culoare.
- R5. Selectoarele native de dată și oră și listele native se desenează în schema luminoasă.
- R6. Pe telefon (sub 760 px), câmpurile și listele au font de cel puțin 16 px, ca iOS să nu facă zoom la focus.

**Liste derulante**

- R7. O listă derulantă arată ca un câmp din aceeași familie: aceeași înălțime, aceeași margine, săgeată proprie, identică între browsere.

**Butoane**

- R8. Butoanele din admin au cinci roluri, fiecare cu un singur aspect: principal, secundar, terțiar, pericol și link.
- R9. Controalele frecvente au cel puțin 44 px înălțime. Acțiunile compacte din rândurile de tabel au cel puțin 36 px.
- R10. Butoanele răspund la hover, apăsare și focus cu tranziții din jetoanele de mișcare. Cu `prefers-reduced-motion`, răspunsul e instantaneu.
- R11. Starea dezactivat e aceeași pentru toate rolurile și rămâne lizibilă.

**Limite**

- R12. Pagina publică arată exact ca înainte.
- R13. Niciun control nu își schimbă comportamentul, eticheta sau ordinea de focus.

### Success Criteria

- La 375 px și la 1280 px, în `admin-preview.html`, niciun ecran nu are un câmp sau un buton care iese din familie.
- Testul nou din U5 trece pe toate ecranele pe care le parcurge.

### Scope Boundaries

- Căsuțele și butoanele radio rămân native. Primesc doar culoarea de accent și mărimea comună.
- Nu se adaugă stări noi, cum ar fi „modificat” sau „se salvează”. Acestea sunt în U4 din planul Panoul.

#### Deferred to Follow-Up Work

- Înlocuirea listelor native cu `ListaDerulanta` proprie, plus controalele noi (U3 din `docs/plans/2026-10-06-1331-feat-redesign-admin-panoul-plan.md`).
- Câmpul liniștit, semnul de modificare și bara de salvare (U4 din același plan).
- O clasă comună de câmp sau de buton în markup, dacă stratul de bază se dovedește greu de întreținut.

### Sources / Research

- `src/index.css`: blocul temei Panoul (`.admin-pagina, .admin-app`), primitivele `.admin-control-*`, `.admin-camp-*` și regulile de ecran listate în U2.
- `docs/reviews/2026-10-04-admin-ui-audit.md`: ținte tactile de ~34 px și contrast redus la textele auxiliare.
- `docs/plans/2026-10-06-1331-feat-redesign-admin-panoul-plan.md`: KTD2 (jetoane doar pe rădăcina adminului), KTD7 (mișcare din jetoane), U3/U4.
- `tests/mobil.spec.ts` și `tests/miscare.spec.ts`: tiparul de test pe `getComputedStyle`.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Doar CSS, peste clasele existente.** Regulile noi selectează clasele și elementele de azi. Niciun `.tsx` nu se schimbă. Diff-ul rămâne mic și nu atinge cele ~29 de fișiere cu controale. (session-settled: user-approved — chosen over o clasă comună adăugată în markup: diff mic acum, iar markup-ul se rescrie oricum în U3/U4 ale planului Panoul.) Implementează R12, R13.
- KTD2. **Un strat de bază cu specificitate zero, apoi regulile de ecran slăbite.** Aspectul controalelor stă o singură dată, în `.admin-app :where(...)`, imediat după blocul de jetoane. `:where` nu adaugă specificitate, deci un ecran poate încă seta lățimea sau așezarea. Regulile de ecran pierd declarațiile de aspect (fundal, margine, umplutură, font, focus) și le păstrează doar pe cele de așezare. Fără pasul al doilea, regulile vechi, mai specifice, ar câștiga peste bază. Implementează R1, R4, R8.
- KTD3. **Jetoane noi doar pentru dimensiuni.** Blocul Panoul primește înălțimea controlului (44 px), înălțimea compactă (36 px), umplutura orizontală și mărimea fontului. Marginea câmpurilor trece pe `--pa-line-control`, care există deja. Nu apar culori noi. Implementează R2, R9.
- KTD4. **Focusul câmpurilor înseamnă marginea în `--pa-accent-text` plus inelul `--pa-focus-soft`, desenat cu `box-shadow`.** Câmpurile renunță la conturul global `:focus-visible`, ca să nu existe două indicatoare. Butoanele și linkurile păstrează conturul global. `box-shadow` nu mută conținutul. `--pa-accent-text` are peste 7:1 pe alb. Implementează R3.
- KTD5. **Lista derulantă: `appearance: none` și săgeata ca imagine SVG în CSS.** Un `select` nu acceptă `::after`, iar fără markup nou nu există un înveliș. Imaginea de fundal e singura cale doar-CSS. Culoarea săgeții e scrisă în SVG (`--pa-muted`), cu un comentariu că o temă întunecată trebuie să o redefinească. Opțiunile păstrează culorile explicite, pentru Windows în modul întunecat. Implementează R5, R7.
- KTD6. **`color-scheme: light` pe rădăcina adminului.** Cele două `color-scheme: dark` din regulile adminului se șterg: `.admin-config-camp input[type="datetime-local"], input[type="time"]` și blocul de câmpuri `.admin-sala`. Regula publică `.field input[type="date"]` rămâne neatinsă. Implementează R5, R12.
- KTD7. **Commitul nepublicat `ebc21d4` nu e o sursă.** Planul pornește din `origin/main`. Dacă `claude/sweet-franklin-obzrqv` ajunge pe GitHub, se compară cu planul ca listă de verificare. Nu se aplică amândouă.
- KTD8. **Gardă e2e pe stilurile calculate, fără dependențe noi.** Un spec Playwright deschide adminul cu răspunsurile simulate din `tests/admin.spec.ts` și citește `getComputedStyle` pe controalele vizibile, ca `tests/mobil.spec.ts`. Proiectul nu are axe, iar adăugarea lui nu e în scop. Implementează R2, R6, R9.

### High-Level Technical Design

Rolurile de buton și sursa lor:

| Rol | Clase de azi | Umplere | Margine | Text | Hover |
| --- | --- | --- | --- | --- | --- |
| Principal | `.admin-btn-accent`, `.btn-submit` | `--pa-accent` | fără | `--pa-accent-ink` | `--pa-accent-hover` |
| Secundar | `.admin-btn-outline`, `.admin-btn-promote` | transparent | `--pa-line-control` | `--pa-accent-text` | umplere `--pa-accent-soft` |
| Terțiar | `.admin-btn-ghost` | transparent | `--pa-line` | `--pa-text-2` | margine și text `--pa-accent-text` |
| Pericol | `.admin-btn-delete` | transparent | `--pa-danger` | `--pa-danger` | umplere `--pa-danger-solid`, text alb |
| Link | `.admin-btn-link` | fără | fără | `--pa-accent-text` | subliniat |

Stările comune pentru câmpuri și liste:

| Stare | Selectori de azi | Aspect |
| --- | --- | --- |
| Repaus | elementul | margine `--pa-line-control`, fundal `--pa-input` |
| Hover | `:hover:not(:disabled)` | margine `--pa-line-strong` → `--pa-text-2` |
| Focus | `:focus` | KTD4 |
| Invalid | `[aria-invalid='true']`, `.invalid` pe părinte | margine `--pa-danger`, inel `--pa-danger-soft` |
| Atenție | `.atentie` pe părinte | margine `--pa-graph-warn` |
| Dezactivat | `:disabled` | fundal `--pa-surface-2`, text `--pa-muted-2`, cursor interzis |
| Doar-citire | `[readonly]` | fundal `--pa-surface-2`, margine `--pa-line` |

Compactul (36 px) se aplică în contextele de rând de azi: `.admin-config-mutare`, acțiunile din rândurile de tabel și selectorul de poziție din `.admin-ordonabila-pozitie`.

### Assumptions

- Hover-ul din tabelul de mai sus e o direcție. Valorile exacte se reglează vizual în `admin-preview.html`.
- Antetul lipit pe telefon nu crește, pentru că controalele din el folosesc deja `min-height: 44px` sau varianta compactă.

### System-Wide Impact

- **Pagina publică:** Toate regulile noi stau sub `.admin-app` sau `.admin-pagina`. Clasele publice `.btn-submit` și `.field` se ating doar prin prefixul `.admin-app`, ca acum.
- **Planul Panoul:** U3/U4 vor construi controale proprii. Ele trebuie să citească aceleași jetoane din KTD3, ca stratul de azi să devină aspectul lor de repaus. Testul din U14 al acelui plan va interzice controalele native. Garda din U5 se actualizează atunci, nu se șterge.

### Risks & Dependencies

| Risc | Atenuare |
| --- | --- |
| O regulă de ecran mai specifică câștigă peste bază și controlul rămâne vechi | U2 parcurge lista completă. Garda din U5 citește stilul calculat, nu clasa. |
| 44 px în loc de ~38 px rupe rânduri înguste (adăugare participant, mutare în listă, bara de unelte) | Contextele de rând primesc compactul. Trecerea vizuală din U5 la 375 px le verifică. |
| Săgeata SVG are culoarea scrisă în cod | Comentariu lângă regulă (KTD5). Tema întunecată nu e în scop. |
| `appearance: none` ascunde săgeata și la `select multiple` | Nu există `select multiple` în `src/admin` azi. Baza îl exclude explicit. |

---

## Implementation Units

### U1. Jetoanele și baza câmpurilor

**Goal:** Un singur aspect pentru câmpurile de text, cu toate stările, pe rădăcina adminului.

**Requirements:** R1, R2, R3, R4, R5, R6, R12. KTD2, KTD3, KTD4, KTD6.

**Dependencies:** —

**Files:**
- Modify: `src/index.css` (blocul `.admin-pagina, .admin-app` și un bloc nou „Controalele, baza” imediat după el)

**Approach:**
1. Adaugă jetoanele de dimensiune din KTD3 în blocul Panoul.
2. Pune `color-scheme: light` pe `.admin-app`.
3. Scrie regula de bază `.admin-app :where(input:not([type=checkbox], [type=radio], [type=hidden], [type=file]), textarea)` cu aspectul din tabelul de stări.
4. Zona de text are aceeași margine și umplutură, cu înălțime minimă, nu fixă.
5. Sub 760 px, fontul bazei devine 16 px.
6. Căsuțele și butoanele radio primesc un singur `accent-color` (`--pa-accent-text`) și mărimea de 18 px.

**Patterns to follow:** `.admin-config-camp input` (înălțime fixă pentru tipurile de dată), `.admin-sala-formular` (16 px pe telefon), `:where` deja folosit pentru raze.

**Test scenarios:** Acoperite de U5. `Test expectation: none -- strat de stil, garda vine în U5.`

**Verification:** Câmpurile care nu au reguli de ecran (de exemplu `.admin-reels-campuri input`) arată deja noul aspect. Pagina publică e neschimbată în `npm run dev`.

### U2. Regulile de ecran fără aspect propriu

**Goal:** Regulile de ecran păstrează doar așezarea, deci baza din U1 se vede peste tot.

**Requirements:** R1, R3, R4, R5. KTD2, KTD6.

**Dependencies:** U1.

**Files:**
- Modify: `src/index.css` — regulile `.admin-auth .field input[type="password"]`, `.admin-add-field input`, `.admin-config-camp input/select` (inclusiv `.invalid` și `.atentie`), `.admin-search`, `.admin-email-field input/textarea`, `.admin-tpl-field input/textarea`, `.admin-sala …` (căutare, dată, select, zona de text, formular)

**Approach:**
1. În fiecare regulă, șterge fundalul, marginea, umplutura, fontul, tranziția și focusul. Păstrează lățimea, `flex`, `min-width` și `resize`.
2. Mută stările `.invalid` și `.atentie` de pe `.admin-config-camp` în baza din U1, cu selectorul de părinte.
3. Șterge cele două `color-scheme: dark` din admin (KTD6).
4. Păstrează `padding-right` de la `.admin-password-wrap input`, pentru butonul de afișare a parolei.

**Execution note:** Verifică fiecare ecran în `admin-preview.html` după fiecare grup de reguli șterse, nu la final.

**Test scenarios:** Acoperite de U5. `Test expectation: none -- curățare de stil, garda vine în U5.`

**Verification:** În secțiunea adminului nu mai există `color-scheme: dark`, iar `outline: none` rămâne doar pe suprafețele cu focus programatic (`.admin-main:focus`, `.admin-supr`), nu pe controale. Editorul evenimentului, emailul, șabloanele și ecranele grupului arată câmpuri identice.

### U3. Listele derulante

**Goal:** Listele native arată ca un câmp din aceeași familie, cu săgeată proprie.

**Requirements:** R2, R3, R5, R6, R7, R9. KTD4, KTD5.

**Dependencies:** U1.

**Files:**
- Modify: `src/index.css` — baza din U1 (adaugă `select:not([multiple])`), `.admin-control-select`, `.admin-editions-select`, `.admin-ordonabila-pozitie select`, `.admin-sala-cont select`

**Approach:**
1. Extinde baza la `select:not([multiple])`: `appearance: none`, săgeata SVG din KTD5, `padding-right` pentru săgeată.
2. Păstrează culorile explicite pe `option` din `.admin-editions-select` și mută-le în bază.
3. `.admin-control-select` și `.admin-editions-select` păstrează doar `min-width` și greutatea fontului.
4. Selectorul de poziție din lista ordonabilă folosește înălțimea compactă.

**Patterns to follow:** `ListaDerulanta` (`src/admin/controale/ListaDerulanta.tsx`) pentru `aria-invalid`, care rămâne neschimbat.

**Test scenarios:** Acoperite de U5. `Test expectation: none -- strat de stil, garda vine în U5.`

**Verification:** Comutatorul de ediție, listele din editorul evenimentului și cele din grup arată la fel în Chrome și Safari. Lista dezactivată nu se deschide și arată starea dezactivat.

### U4. Butoanele

**Goal:** Cinci roluri de buton cu dimensiuni, tranziții și stări comune.

**Requirements:** R8, R9, R10, R11. KTD3.

**Dependencies:** U1.

**Files:**
- Modify: `src/index.css` — `.admin-btn-accent`, `.admin-btn-outline`, `.admin-btn-ghost`, `.admin-btn-delete`, `.admin-btn-promote`, `.admin-btn-link`, `.admin-app .btn-submit`, `.admin-config-mutare .admin-btn-*`, `.admin-email-actions .admin-btn-accent`

**Approach:**
1. O regulă comună pentru `.admin-btn-accent`, `-outline`, `-ghost`, `-delete` și `-promote`: `inline-flex`, înălțime minimă de 44 px, font de 14 px și greutate 600, tranziții pe `--pa-dur-fast` și `--pa-ease`.
2. Fiecare rol primește doar culorile din tabelul de roluri.
3. `.admin-btn-promote` devine rolul secundar în varianta compactă. `.admin-btn-delete` folosește compactul în rândurile de tabel.
4. Hover-ul fără ridicare: se scot `translateY(-2px)` și `scale(0.96)`. Apăsarea folosește `translateY(1px)`, deja global.
5. O singură stare dezactivat pentru toate rolurile: fundal `--pa-surface-3`, text `--pa-muted-2`, margine `--pa-line`.
6. `.admin-email-actions` și `.admin-config-mutare` păstrează doar diferența de mărime, prin jetoane.

**Patterns to follow:** `min-height: 44px` deja folosit în bara de jos și în ecranele grupului.

**Test scenarios:** Acoperite de U5. `Test expectation: none -- strat de stil, garda vine în U5.`

**Verification:** Butoanele Promovează și Șterge din tabelul de participanți au 36 px și se văd în repaus. Butonul principal din fiecare ecran are 44 px.

### U5. Garda e2e și trecerea vizuală

**Goal:** Un test care prinde întoarcerea la stilurile vechi, plus o verificare vizuală pe ecranele reale.

**Requirements:** R2, R5, R6, R9, R11, R12. KTD8.

**Dependencies:** U2, U3, U4.

**Files:**
- Create: `tests/admin-controale.spec.ts`
- Modify: `tests/mobil.spec.ts` doar dacă helperii se pot refolosi fără duplicare

**Approach:**
1. Refolosește deschiderea cu răspunsuri simulate din `tests/admin.spec.ts`. Dacă e nevoie, extrage-o într-un helper comun.
2. Parcurge ecranele care au câmpuri: evenimentul, emailul, șabloanele, clipurile, programul și grupul.
3. Pe fiecare ecran, citește stilul calculat al controalelor vizibile.

**Test scenarios:**
- Pe fiecare ecran parcurs, fiecare `input` de text, `select` și `textarea` vizibil are culoarea marginii egală cu `--pa-line-control`.
- Niciun câmp sau listă din admin nu are `color-scheme` care conține `dark`.
- La 375 px, fiecare câmp și listă vizibilă are font de cel puțin 16 px.
- Fiecare `.admin-btn-accent` vizibil are cel puțin 44 px înălțime. Fiecare `.admin-btn-delete` și `.admin-btn-promote` are cel puțin 36 px.
- Un câmp cu `aria-invalid="true"` are marginea `--pa-danger`.
- La focus pe un câmp, `box-shadow` nu e `none`, iar poziția câmpului nu se schimbă.
- Un buton dezactivat are aceeași culoare de fundal în toate rolurile.
- Pagina publică `/` are aceleași stiluri calculate ca înainte pe `.btn-submit` și pe un `.field input`.

**Verification:** Specul trece local și în CI. Trecerea vizuală în `admin-preview.html` la 375 px și la 1280 px nu găsește controale din afara familiei și nici rânduri rupte.

---

## Verification Contract

- `npm run verify` trece: lint, cod mort, tipuri, teste unitare cu acoperire, build și e2e pe build.
- `tests/admin-controale.spec.ts` rulează în `npm run test:e2e:preview`.
- Testele existente `tests/mobil.spec.ts`, `tests/sala.spec.ts` și `tests/miscare.spec.ts` trec neschimbate.
- Trecerea vizuală se face cu `npm run dev` pe `/admin-preview.html`, la 375 px și la 1280 px, pe toate zonele.

## Definition of Done

- R1–R13 sunt adevărate în `admin-preview.html` și în specul din U5.
- Niciun fișier `.tsx` nu e modificat.
- În secțiunea adminului din `src/index.css` nu mai există `color-scheme: dark`, iar declarațiile de aspect ale controalelor apar o singură dată.
- Regulile încercate și abandonate sunt șterse din diff.
- Dacă `ebc21d4` a apărut între timp, diferențele față de el sunt notate în PR (KTD7).

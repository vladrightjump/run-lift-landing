---
title: Secțiunea Instagram pe landing + panou Coming Soon în admin - Plan
type: feat
date: 2026-08-27
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Secțiunea Instagram pe landing + panou Coming Soon în admin - Plan

## Goal Capsule

**Objective:** Două lucruri, independente între ele, cerute în aceeași sesiune.
(1) Landing-ul capătă o secțiune nouă, configurabilă ca oricare alta, în care
clipurile de pe `@we_run_and_lift` se văd ca o bandă de carduri portret pe fundal
propriu, iar clicul pornește clipul real de pe Instagram. (2) Adminul capătă un
panou dedicat pentru Coming Soon: comutatorul și ținta numărătorii într-un
singur loc, cu efect imediat pe site, fără să treacă prin ciorna de ediție.

**Means:** Secțiunea intră în `SECTION_KEYS` și în documentul de config, deci
moștenește gratis ordonarea, ascunderea și numerotarea automată (KTD1). Clipurile
sunt façade: cardul e al nostru (poster + caption + buton), iframe-ul Instagram se
montează doar la click, unul singur odată (KTD2). Panoul Coming Soon primește un
RPC propriu care petice ȘI DOAR cele trei chei din documentul publicat
(`showComingSoon`, `launchAt`, `nextEditionAt`), fără să atingă `app_config` —
niciunul din cele cinci scalare nu depinde de ele (KTD5).

**Authority hierarchy:** Cerințele (R-IDs) bat pe comportament. KTD-urile bat pe
mecanism. Unitățile nu bat nimic.

**Stop conditions:**
- Oprește-te dacă `event_config_validate` din DB respinge documentul cu cheia
  `reels`. Serverul e autoritatea; U2 trebuie să meargă înaintea oricărei
  publicări cu secțiunea nouă, altfel adminul salvează ciorne care nu se pot
  publica.
- Oprește-te înainte de prima apăsare pe „Aplică acum" din panoul Coming Soon
  cât timp ediția 5 e în fereastra ei de înscriere. Efectul e imediat și public.
- Oprește-te dacă o migrare ar atinge schema `public`. Aparține gym-app și
  botului de Telegram (`MIGRATIONS.md`).
- Oprește-te dacă `npm run verify` pică dintr-un motiv care nu e numit aici.

**Execution profile:** Cele două jumătăți nu se ating. U1-U4 sunt secțiunea
Instagram, U5 e panoul Coming Soon, U6 e coada. U5 se poate livra primul dacă
panoul e mai urgent decât secțiunea; nu depinde de nimic din U1-U4.

---

## Design Read

> Reading this as: **redesign-preserve**, o secțiune adăugată unui landing de
> eveniment sportiv pentru alergători locali, cu limbaj dark sport-editorial,
> mergând pe sistemul existent (CSS nativ + Anton/Archivo + accent lime).

**Dials** (citite din pagina existentă, nu din baseline):
`DESIGN_VARIANCE: 7` (grila „Formatul" e deja în trepte, cifrele-fantomă există),
`MOTION_INTENSITY: 6` (scroll-reveal + spotlight + magnetic, deja livrate),
`VISUAL_DENSITY: 4`. Redesign-preserve → potrivim, nu urcăm.

**Sistem de design:** niciunul nou. Proiectul are 2 dependențe de runtime (react,
react-dom) și un sistem propriu de tokenuri `--e3-*`. Nu se instalează Tailwind,
Motion, GSAP sau o bibliotecă de iconuri pentru o secțiune.

### Ce se preia din referință și ce nu

Screenshot-ul (SHEE) contribuie **compoziția**, nu paleta:

| Din referință | Verdict | De ce |
|---|---|---|
| Bandă full-bleed, cu fundal propriu față de restul paginii | **Se preia** | Rupe ritmul paginii exact cum face deja `VenueSection` cu `--e3-bg-deep` |
| Carduri portret decalate pe verticală | **Se preia** | Vocabular deja existent (`.e3-format-grid`) |
| Tipografie uriașă fantomă în spatele cardurilor | **Se preia** | Vocabular deja existent (`.e3-step-idx`, opacity .045) |
| Bloc de text pe dreapta, aliniat la mijloc | **Se preia** | Rupe alinierea stânga a secțiunilor vecine |
| **Banda roșie** | **NU se preia** | Roșul e brandul SHEE. Aici ar sparge un ecran dark+lime la mijlocul scroll-ului. Vezi Q1 |
| **Trei cuvinte-fantomă suprapuse** (BODY / NEW COLOR / SHEE) | **NU se preia** | Trei devine zgomot decorativ. Rămâne unul |
| Fotografie uriașă estompată în fundalul dreptei | **NU se preia** | Cere un asset de brand pe care nu-l avem și îngroapă contrastul textului |

**Culoarea benzii:** `--e3-bg-deep` (`#0C0E0A`), cuvântul-fantomă în
`--e3-accent` la opacitate 0.055, un singur element lime viu (numărul secțiunii
+ linkul spre profil). Motivul e mecanic, nu de gust: pagina are UN accent
(lime) și O temă (dark). O bandă roșie ar încălca și blocarea temei, și blocarea
accentului, iar vizitatorul ar simți că a nimerit pe alt site la mijlocul
paginii. Varianta „bandă lime inversată" rămâne deschisă în Q1.

### Anti-coliziune cu „Formatul"

`FormatSection` folosește deja trei carduri în trepte pe orizontală. Dacă
secțiunea Instagram ar fi tot trei carduri în trepte, ar citi ca un reskin al
aceleiași secțiuni. Diferențierea e structurală, nu cosmetică:

- Formatul: grilă statică cu lățimi inegale (`4.5fr 4fr 3.5fr`), rampă în trei
  trepte crescătoare, fără scroll.
- Instagram: **șină cu scroll-snap orizontal**, carduri de lățime egală, decalaj
  în două timpi (`nth-child(2n)`), coloană de text sticky lângă ea.

Șina rezolvă și numărul variabil de clipuri: adminul poate pune 6 fără să spargă
o grilă calibrată pe 3, iar pe mobil e gestul nativ al platformei de unde vin
clipurile.

### Specificația secțiunii

**Desktop (≥1024px)**

```
┌──────────────────────────────────────────── bandă full-bleed, --e3-bg-deep ──┐
│  @WE_RUN_AND_LIFT   ← Anton, clamp(90px,16vw,220px), lime @ 5.5%, aria-hidden│
│                                                                              │
│   ┌────┐  ┌────┐  ┌────┐  →                    03                            │
│   │    │  │    │▼ │    │                       INSTAGRAM                     │
│   │ 9  │  │ 9  │  │ 9  │                                                     │
│   │ :  │  │ :  │  │ :  │                       Antrenamentele, cursele și    │
│   │ 16 │  │ 16 │  │ 16 │                       oamenii, filmate pe teren.    │
│   └────┘  └────┘  └────┘                                                     │
│   caption  caption caption                     ↗ @we_run_and_lift            │
└──────────────────────────────────────────────────────────────────────────────┘
     ↑ decalaj pe 2n            ↑ coloana e sticky, top: 96px
```

- Bandă: `padding: clamp(72px, 10vw, 120px) clamp(20px, 5vw, 40px)`,
  `border-bottom: 1px solid var(--e3-border)`, `background: var(--e3-bg-deep)`,
  `position: relative; overflow: hidden` (ca fantoma să nu împingă scroll
  orizontal pe `<body>`).
- Grilă: `grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr)`,
  `gap: clamp(40px, 6vw, 88px)`, `align-items: center`, `max-width: 1200px`.
- Șină: `display: flex; gap: clamp(14px, 2vw, 22px); overflow-x: auto;`
  `scroll-snap-type: x mandatory; scrollbar-width: none;` + `::-webkit-scrollbar
  { display: none }`. Card: `flex: 0 0 clamp(180px, 20vw, 236px)`,
  `scroll-snap-align: start`. Decalaj: `.e3-reel-item:nth-child(2n) { margin-top:
  clamp(20px, 4vw, 52px) }`.
- Coloana de text: numărul + titlul folosesc `sectionNum` / `sectionTitle` din
  `landing/shared.ts`, deci secțiunea arată ca o secțiune a paginii, nu ca un
  widget lipit. `position: sticky; top: 96px` doar ≥1024px.

**Cardul (façade)**

- `<button class="e3-card e3-reel">`, `aspect-ratio: 9 / 16`, `overflow: hidden`,
  **rază 0** (pagina e integral colțuri drepte; blocarea formei se respectă).
- Poster: `<img>` cu `object-fit: cover`, `loading="lazy"`, dimensiuni intrinseci
  declarate (CLS), `filter: saturate(0.9) brightness(0.82)` ca fotografia să
  intre în paletă. La hover: `filter: none; transform: scale(1.03)` (pe `<img>`,
  nu pe card — cardul are deja translate din `.e3-card:hover`).
- Butonul de play: disc lime `44x44` (țintă minimă de atingere),
  `background: var(--e3-accent); color: var(--e3-bg)`, centrat.
- Caption: **sub** card, în afara lui. Nu peste imagine — etichetele suprapuse pe
  fotografii sunt exact tell-ul pe care îl evităm, iar contrastul peste o
  fotografie necontrolată nu se poate garanta.
- Fără „01 / 4" și fără badge-uri de numerotare pe carduri. Cine vede trei
  carduri știe că sunt trei.
- **Fallback fără poster:** cardul cade pe `--e3-surface` + cifra-fantomă a
  indexului (același limbaj ca `.e3-step-idx`) + caption. Niciodată o casetă
  gri goală.

**Redarea**

- Click → façade-ul e înlocuit **în același card** de
  `<iframe src="https://www.instagram.com/reel/<code>/embed/" loading="lazy">`.
- **Un singur iframe montat odată.** Click pe alt card îl demontează pe
  precedentul. Trei iframe-uri Instagram simultan ar aduce câțiva MB și zeci de
  cereri pe o pagină al cărei hero e deja un video.
- Cardul e `<button>`, deci Enter/Space merg din oficiu, iar inelul de focus vine
  din regula globală `:focus-visible`.
- Sub card rămâne mereu un link „Deschide pe Instagram" spre
  `https://www.instagram.com/reel/<code>/`. Dacă iframe-ul e blocat (extensie,
  rețea de firmă, clip șters), conținutul rămâne accesibil.

**Mobil (<768px)**

- O coloană, **textul primul**, șina a doua. O secțiune care începe cu imagini
  fără titlu nu se citește.
- Card: `flex: 0 0 72vw`. Decalajul dispare (`margin-top: 0`) — cu un card și
  jumătate în ecran, o treaptă arată ca un bug de layout, nu ca ritm.
- `position: sticky` se scoate. Fantoma coboară la `clamp(56px, 18vw, 90px)` și
  opacitate 0.045, ca să nu intre în textul statement-ului.

**Mișcare** (fără bibliotecă nouă)

- **`data-reveal` merge pe ȘINĂ, nu pe fiecare card.** Motivul e o capcană reală:
  `useScrollReveal` pune `el.style.opacity = '0'` pe fiecare element observat și
  îl readuce doar când `IntersectionObserver` îl vede. Cardurile a patra și mai
  departe sunt tăiate orizontal de `overflow-x: auto`, deci **nu intersectează
  viewport-ul** și ar rămâne la opacitate 0 până când vizitatorul derulează șina
  — adică ar apărea goale exact în momentul în care le caută. Un singur
  `data-reveal` pe containerul șinei aduce toată banda odată și nu are cum să
  lase carduri invizibile. Justificarea mișcării într-o frază: banda intră ca un
  bloc, semnalând că e o zonă nouă a paginii, nu un card rătăcit.
- Hover: tranzițiile `.e3-card` existente.
- `prefers-reduced-motion: reduce` → fără scale și fără filtru pe poster;
  comportamentul la click rămâne identic. `useScrollReveal` iese deja singur.
- **Fără marquee.** Pagina are deja unul (`Marquee.tsx`); al doilea ar fi umplutură.

**Copy** (fără em-dash nicăieri în stringurile livrate)

- Titlu: `Instagram`
- Statement: „Antrenamentele, cursele și oamenii, filmate pe teren. Dacă vrei să
  vezi cum arată un Run + Lift înainte să vii, aici e." (24 de cuvinte)
- CTA: aceeași etichetă ca linkul din `Footer.tsx`, ca să nu existe două intenții
  identice cu două formulări pe aceeași pagină.

---

## Requirements

**R1.** Secțiunea apare pe landing ca secțiune numerotată, poate fi ascunsă și
reordonată din admin ca oricare alta, iar numerotarea rămâne fără goluri.

**R2.** Când nu are niciun clip configurat, secțiunea nu se randează ȘI nu
consumă un număr de secțiune.

**R3.** Nimic de pe Instagram nu se încarcă până când vizitatorul nu apasă pe un
card. Pagina se încarcă fără nicio cerere spre `instagram.com`.

**R4.** Un clip inaccesibil prin iframe rămâne deschizibil printr-un link direct.

**R5.** Organizatorul adaugă un clip lipind URL-ul din Instagram în admin. Nu i se
cere să extragă manual codul.

**R6.** Un document de config cu o intrare `reels` malformată se randează, fără
intrarea aia. Nu cade pe instantaneu și nu golește pagina.

**R7.** Panoul Coming Soon arată într-o propoziție ce vede vizitatorul ACUM și
până când numără ceasul.

**R8.** Comutatorul Coming Soon/Landing și ținta numărătorii se aplică pe site
imediat, într-un pas, cu o confirmare înainte.

**R9.** O modificare aplicată din panou rămâne reversibilă din „Versiuni
anterioare".

**R10.** Dacă există o ciornă deschisă, panoul avertizează că publicarea ei
ulterioară va suprascrie cele două câmpuri.

---

## Key Technical Decisions

**KTD1 — `reels` devine cheie de secțiune, nu componentă lipită.**
`SECTION_KEYS` capătă `'reels'`. Alternativa (o secțiune fixă randată direct în
`Landing.tsx`) ar fi fost cu 20 de linii mai scurtă și ar fi costat ordonarea,
ascunderea și numerotarea — exact lucrurile pentru care există `layout`.

**KTD2 — façade + iframe la cerere, nu `embed.js`.**
Scriptul oficial Instagram ar cere `script-src https://www.instagram.com` într-un
CSP care azi e `script-src 'self'`, ar rula cod terț pe pagină, și ar randa
cardul alb propriu al Instagramului, imposibil de stilat în compoziția cerută.
Iframe-ul simplu `/embed/` are nevoie doar de `frame-src`. Façade-ul păstrează
designul, ține pagina rapidă, și amână orice cookie Instagram până la o acțiune
explicită a vizitatorului — ceea ce contează și pentru punctul GDPR din
`BACKLOG.md`.
*Costul acceptat:* după click, interiorul cardului e chrome-ul Instagram (fundal
alb, header cu handle). Nu se poate stiliza. E cross-origin.

**KTD3 — posterele sunt assets locale în `/public/reels/`, calea vine din config.**
Miniaturile de pe CDN-ul Instagram (`scontent.*`) expiră și ar cere lărgirea lui
`img-src`. Câmpul `poster` acceptă o cale locală; un clip nou fără poster
funcționează pe fallback-ul desenat, deci adăugarea unui clip **nu** e blocată de
un deploy. Doar posterul lui e.

**KTD4 — `reels` se parsează tolerant, ca `layout`.**
O intrare fără `code` valid cade; documentul rămâne valid. Regula fișierului
`eventConfig.ts` e „`null` la orice document care nu se poate randa", și un clip
stricat nu e un document care nu se poate randa.

**KTD5 — panoul Coming Soon primește RPC propriu, care petice documentul publicat.**
`admin_set_coming_soon(p_token, p_show, p_launch_at, p_next_edition_at)`:
`jsonb_set` pe cele trei chei ale rândului `published` curent, revalidare prin
`event_config_validate`, scriere ca rând `published` nou cu cel vechi trecut pe
`superseded`. **Nu atinge `app_config`** — cele cinci scalare sunt
`current_event_edition`, `current_launch_edition`, `event_capacity`,
`registration_deadline`, `event_start`, verificate în
`supabase-migration-event-config.sql:180-189`. Niciunul nu derivă din
`showComingSoon` sau `launchAt`, deci peticul nu poate desincroniza guard-urile.
Scrierea ca rând nou, nu `update` pe loc, e ce face R9 gratuit.

**KTD6 — CSP capătă `frame-src` pentru Instagram, iar `Permissions-Policy` capătă
fullscreen delegat.**
`frame-src` devine
`https://maps.google.com https://www.google.com https://www.instagram.com`.
`fullscreen=(self)` devine `fullscreen=(self "https://www.instagram.com")`,
altfel butonul de fullscreen din embed e mort. `connect-src` NU se schimbă, deci
garda din `scripts/check-deploy-config.ts` rămâne verde fără atingeri.

---

## Puncte de integrare, verificate în cod

Patru lucruri pe care implementatorul altfel le descoperă pe parcurs. Toate
citite din sursă, nu presupuse:

1. **`ETICHETE_SECTIUNI` e `Record<SectionKey, string>`**
   (`AdminEventTab.tsx:36`). Adăugarea lui `'reels'` în `SECTION_KEYS` **rupe
   typecheck-ul** până când se adaugă eticheta. E comportamentul dorit, nu o
   surpriză: compilatorul cere să numim secțiunea în admin înainte să existe pe
   pagină. Etichetă propusă: `Instagram`.

2. **`layoutComplet` adaugă secțiunile lipsă la FINAL, vizibile**
   (`eventConfigForm.ts:164-168`). Deci la prima ciornă deschisă după livrare,
   `reels` apare automat ultima în listă și vizibilă. Combinat cu R2 (fără
   clipuri → nu se randează), efectul e invizibil până când organizatorul adaugă
   primul clip — moment în care secțiunea aterizează **jos de tot** pe pagină.
   Nu e un bug, dar trebuie spus în `GHID-EDITIE-NOUA.md`: după primul clip,
   mut-o unde vrei cu ↑.

3. **`campuriVechiInBuild` NU se atinge de `reels`**
   (`buildFingerprint.ts:78-93` compară doar `eventName`, `start`, `venue.name`,
   `venue.city`). Adăugarea cheii nu produce alarmă falsă de „share preview
   învechit", și nici clipurile nu cer deploy pentru meta. Nimic de făcut aici.

4. **Pe modul `leaderboard`, secțiunea NU apare.** `Landing.tsx:119-132` randează
   în ziua cursei o listă fixă (participanți, format, locație) și ignoră complet
   `layout`, deliberat — comentariul din cod spune de ce. Reels-ul moștenește
   decizia asta: în dimineața cursei pagina răspunde la o singură întrebare.
   **Nu se schimbă în acest plan.** E menționat ca să nu fie raportat ca bug.

---

## Implementation Units

### U1 — Contractul de config pentru `reels`

**Fișiere:** `src/content/eventConfig.ts`, `src/content/edition.ts`,
`tests/unit/` (test nou)

- `SECTION_KEYS` capătă `'reels'`. Typecheck-ul va cere imediat eticheta din
  `ETICHETE_SECTIUNI` (punctul 1 de mai sus) — adaug-o în același commit.
- Tipuri noi: `ReelEntry { code, kind: 'reel' | 'p', poster, caption }`,
  `ReelsConfig { headline, body, items }`; `EventConfig.reels: ReelsConfig`.
- `SNAPSHOT_CONFIG.reels` pornește de la `EDITION.reels` (listă goală + textele
  implicite din specificație), ca instantaneul să aibă exact forma documentelor
  din DB.
- `parseEventConfig`: `reels` lipsă → implicit gol; `items` filtrat pe
  `code` string nevid + `kind` din mulțime + `poster`/`caption` stringuri;
  plafon 12 intrări. Un `reels` malformat NU întoarce `null` (KTD4).
- Test: document fără `reels` → implicit; document cu o intrare bună și una
  stricată → rămâne una; `layout` cu `reels` necunoscut într-un document vechi →
  ignorat, ca orice cheie necunoscută.

**Verificare:** `npm run test`.

### U2 — Migrare DB: validare `reels` + RPC Coming Soon

**Fișiere:** `supabase-migration-reels-si-coming-soon.sql` (nou), `MIGRATIONS.md`

- `event_config_validate` acceptă `reels` și îl validează: `items` e array,
  ≤ 12 elemente, fiecare cu `code ~ '^[A-Za-z0-9_-]{5,32}$'` și
  `kind in ('reel','p')`. `search_path` pinuit și apeluri `jsonb` calificate
  `pg_catalog`, ca restul funcțiilor din schemă.
- `SECTION_KEYS` din validare (dacă lista e duplicată server-side) capătă `reels`.
- `admin_set_coming_soon(p_token text, p_show boolean, p_launch_at text,
  p_next_edition_at text)` — `SECURITY DEFINER`, verifică sesiunea ca celelalte
  RPC-uri de admin, petice documentul publicat, revalidează, scrie rând nou
  `published` și trece precedentul pe `superseded`. Fără scriere în `app_config`.
- Rând nou în tabelul din `MIGRATIONS.md`.

**Verificare:** aplicată pe o ramură Supabase înainte de producție; un document
cu `reels` valid trece, unul cu `kind: 'video'` e respins.

**⚠️ U2 merge înaintea lui U4.** Altfel adminul salvează ciorne care pică la
publicare.

### U3 — Secțiunea pe landing

**Fișiere:** `src/components/landing/ReelsSection.tsx` (nou),
`src/edition3.css`, `src/components/Landing.tsx`, `vercel.json`

- `ReelsSection` după specificația de design de mai sus. Un singur `useState`
  pentru codul clipului activ (`string | null`), nimic altceva.
- Clasele noi în `edition3.css`: `.e3-reels-band`, `.e3-reels-ghost`,
  `.e3-reel-rail`, `.e3-reel-item`, `.e3-reel`, `.e3-reel-play`,
  `.e3-reel-caption`, `.e3-reel-fallback`. Media query `<768px` explicită în
  același bloc, lângă regulile desktop.
- `Landing.tsx`: `case 'reels'` în switch, ȘI — important — filtrul
  `sectiuniVizibile` exclude `reels` când `config.reels.items.length === 0`.
  Numerotarea derivă din poziția în lista filtrată, deci o secțiune care se
  randează `null` ar lăsa un gol în numerotare (R2). Filtrul e locul unde se
  repară, nu componenta.
- `vercel.json`: `frame-src` + `Permissions-Policy` după KTD6.

**Verificare:** `npm run dev`, secțiunea la 1440px / 768px / 375px, cu 1, 3 și 7
clipuri, cu și fără poster, cu `prefers-reduced-motion` forțat.

### U4 — Editorul de clipuri în admin

**Fișiere:** `src/admin/eventConfigForm.ts`, `src/admin/AdminEventTab.tsx`,
`tests/unit/`

- Funcții pure în `eventConfigForm.ts` (testabile fără randare, ca restul
  fișierului): `parseInstagramUrl(url) → { code, kind } | null` (acceptă
  `/reel/<code>/`, `/reels/<code>/`, `/p/<code>/`, cu sau fără query string),
  `mutaReel(items, i, dir)`, `stergeReel(items, i)`, `adaugaReel(items)`.
- `validateEventConfig` capătă regulile clientului pentru `reels`, oglindind
  U2. Serverul rămâne autoritatea; aici doar nu-l lăsăm pe organizator să afle
  la „Publică".
- `Grup titlu="Instagram"` nou în `AdminEventTab`: câmpurile de titlu și text ale
  secțiunii, apoi lista de clipuri. Fiecare rând: câmp de lipit link (cu ecou
  „cod: ABC123 · reel" sub el, ca `descrieMoment` la date), cale poster, caption,
  ↑ ↓ Șterge. Plus „+ Adaugă clip".
- Avertisment nou în `avertismenteEventConfig`: un clip fără poster se va randa pe
  fallback. Nu blochează publicarea.

**Verificare:** `npm run test`, apoi lipit un URL real de reel în admin →
previzualizare cu `/?config=draft`.

### U5 — Panoul Coming Soon

**Fișiere:** `src/admin/AdminComingSoonTab.tsx` (nou), `src/lib/adminApi.ts`,
`src/admin/AdminDashboard.tsx`, `src/admin/eventConfigFields.ts`

*Independent de U1-U4. Poate merge primul.*

- `setComingSoon(token, show, launchAt, nextEditionAt)` în `adminApi.ts`, pe
  tiparul lui `publishEventConfig`.
- Tab nou în dashboard. Conținut, în ordine:
  1. **Starea acum**, o propoziție: „Pagina arată **Coming Soon**, cu
     numărătoarea spre sâmbătă, 19 august 2026, ora 12:00 · peste 3 zile."
     Reutilizează `descrieMoment` din `eventConfigFields.ts`.
  2. **Comutator** Coming Soon / Landing — două butoane, nu `<select>`. Un click.
  3. **Ținta anunțului** — `datetime-local` prin
     `laDatetimeLocal` / `dinDatetimeLocal`, cu ecoul `descrieMoment` sub el.
  4. **Presetări:** „+1 zi", „+1 săptămână", „Mâine la 12:00".
  5. **Ținta de după cursă** (`nextEditionAt`), secundar. E același ecran pentru
     vizitator (`ComingSoon variant="next-session"`), deci aparține aceluiași
     panou.
  6. Link de previzualizare: `/?preview=soon`.
  7. Buton „Aplică acum", cu dialog de confirmare pe tiparul
     `admin-confirm-overlay` existent: „Site-ul public trece pe **Coming Soon**
     ACUM. Versiunea curentă rămâne salvată, deci poți reveni la ea."
- **Avertisment de ciornă (R10):** dacă `listEventConfig` întoarce o ciornă
  deschisă, banner: publicarea ei ulterioară va suprascrie `showComingSoon`,
  `launchAt` și `nextEditionAt` cu valorile din ciornă. E footgun-ul real dintre
  peticul imediat și fluxul ciornă→publică, și trebuie să fie la vedere.

**Verificare:** comutare pe Coming Soon, homepage-ul se schimbă la reîncărcare
fără deploy; „Versiuni anterioare" arată rândul precedent și „Revino la asta"
îl întoarce.

### U6 — Teste e2e și documentație

**Fișiere:** `tests/reels.spec.ts` (nou), `tests/unit/deploy-config.test.ts`,
`README.md`, `GHID-EDITIE-NOUA.md`

- E2e: secțiunea apare cu config mock; **zero cereri spre `instagram.com` la
  load** (via `page.route`); click → apare iframe-ul; click pe al doilea →
  primul e demontat; linkul de fallback e prezent și corect.
- Test unitar: CSP-ul din `vercel.json` conține `https://www.instagram.com` în
  `frame-src`, iar `Permissions-Policy` deleagă fullscreen.
- README: secțiunea nouă în lista de secțiuni; tabul Coming Soon în descrierea
  backoffice-ului. `GHID-EDITIE-NOUA.md`: cum se adaugă un clip și cum se
  comută Coming Soon fără ciornă.

**Verificare:** `npm run verify`.

---

## Risks

| Risc | Impact | Tratament |
|---|---|---|
| Instagram schimbă sau retrage endpointul `/embed/` | Cardurile se deschid, iframe-ul rămâne gol | Linkul de fallback (R4) e mereu prezent; e2e-ul prinde regresia doar local, nu ruperea la ei. Acceptat conștient |
| Un clip e șters de pe Instagram | Card cu iframe gol | Posterul și caption-ul rămân ale noastre; organizatorul șterge rândul din admin. Fără deploy |
| Peticul imediat și ciorna se calcă reciproc | Organizatorul comută pe Coming Soon, publică o ciornă veche, revine pe Landing | R10 — bannerul din U5. Nu se poate preveni tehnic fără a bloca publicarea |
| Iframe-ul Instagram încarcă mult pe conexiuni slabe | INP prost după click | Un singur iframe montat odată (KTD2); nimic la load (R3) |
| `overflow: hidden` pe bandă + fantomă lată | Scroll orizontal pe `<body>` dacă lipsește | Regula e explicită în U3 și intră în verificarea la 375px |
| `data-reveal` pus din reflex pe fiecare card | Cardurile tăiate de șină rămân la `opacity: 0` până se derulează șina | `data-reveal` pe containerul șinei (vezi Mișcare). Scenariul 15 îl păzește |
| Fotografii verticale necontrolate ca postere | Contrast slab, secțiunea iese din paletă | `filter: saturate(0.9) brightness(0.82)`, caption în afara imaginii |

---

## Test Scenarios

1. Config fără `reels` → landing identic cu azi, numerotare neschimbată.
2. `reels.items` gol, `layout` cu `reels` vizibil → secțiunea lipsește ȘI
   numerotarea celorlalte e continuă (R2).
3. Un item valid + unul fără `code` → se randează unul (R6).
4. Load al paginii cu network log → nicio cerere spre `instagram.com` (R3).
5. Click pe cardul 1, apoi pe cardul 3 → un singur iframe în DOM.
6. Tab până la un card, Enter → iframe montat, focus vizibil.
7. `prefers-reduced-motion: reduce` → fără reveal, fără scale; clicul merge.
8. 375px → text înaintea șinei, carduri la 72vw, fără decalaj, fără scroll
   orizontal pe body.
9. Admin: lipit `https://www.instagram.com/reel/ABC12345/?igsh=xyz` → cod extras
   `ABC12345`, kind `reel` (R5).
10. Panou: comutare pe Coming Soon → homepage-ul se schimbă la reîncărcare (R8).
11. Panou: după aplicare, „Revino la asta" pe rândul precedent restaurează
    starea (R9).
12. Panou cu ciornă deschisă → bannerul de avertisment e vizibil (R10).
13. `admin_set_coming_soon` cu `launchAt` malformat → respins de validare,
    documentul publicat neatins.
14. După aplicare din panou, cele cinci scalare `app_config` sunt neschimbate.
15. Șapte clipuri, fereastră 1440px, derulare a șinei până la capăt → **niciun
    card cu `opacity: 0`**. Păzește capcana `data-reveal` din Risks.

---

## Open Questions

**Q1 — Culoarea benzii.** Planul merge pe `--e3-bg-deep` cu fantomă lime la
5.5%, din motivele din Design Read. Varianta B ar fi o bandă **lime plină cu
text închis pe ea**, ca bloc de culoare unic pe pagină — cel mai aproape de
energia referinței. Costul: concurează direct cu CTA-ul de înscriere, care e
singurul lucru lime de pe pagină azi, și e o decizie de brand, nu de
implementare. Se decide la U3, se schimbă în ~15 linii de CSS.

**Q2 — Câte clipuri la prima livrare?** Compoziția e calibrată pe 3 vizibile pe
desktop. Șina suportă mai multe, dar sub 3 secțiunea arată subțire. Trei URL-uri
de reel + trei postere sunt suficiente ca să pornim.

**Q3 — Posterele.** KTD3 le pune în `/public/reels/`, deci un poster nou cere
deploy (clipul, nu). Dacă asta devine sâcâitor după câteva ediții, upgrade-ul
natural e Supabase Storage + `img-src` lărgit. Nu acum.

**Q4 — Și pe `/despre-noi`?** Pagina de brand ar fi al doilea loc firesc pentru
aceeași secțiune. Nu e în plan; componenta e scrisă ca să poată fi randată și
acolo cu un `config` dat.

# Ghid: cum lansezi o ediție nouă

De la refactor-ul SSOT (4 aug 2026), o ediție nouă = **editezi un singur fișier**, rulezi un
script, dai push. Fără vânătoare de string-uri prin componente.

Sunt **două faze** (pot fi făcute separat sau împreună):
- **Faza A — Anunț (Coming Soon):** strângi „Anunță-mă la lansare" pentru ediția care urmează.
- **Faza B — Înscrieri deschise (landing):** oamenii se înscriu efectiv.

> **Sursa de adevăr:** `src/content/edition.ts` (obiectul `EDITION`). Restul — `config.ts`,
> landing, meta din `index.html`, testele — derivă din el. Backend-ul (`app_config`) se
> aliniază cu `npm run sync-edition`. Textul emailurilor stă în DB (editabil din `/admin`).

---

## Pași (majoritatea edițiilor: doar asta)

### 1. Editezi `src/content/edition.ts`
Câmpurile uzuale de schimbat:
- `number` / `launchNumber` — numărul ediției (+ `ordinalOverride` doar dacă vrei altă formulare).
- `eventName`, `concept` — branding (ex. „Hyrox Trial", „Outdoor Adaptive").
- `start`, `checkinFrom`, `durationHours`, `registrationDeadline`, `launchAt` — **local, fără
  offset** (se compun cu `tz`).
- `showComingSoon` — `true` (Faza A) / `false` (Faza B).
- `venue` — dacă se schimbă locația (nume, oraș, `mapQuery` din Google Maps).
- `slots` — dacă se schimbă capacitatea.
- `ogImageVersion` — **incrementează** (altfel share-preview-ul vine din cache).

Din aceste câmpuri se derivă automat: „Ediția a patra", „8 august 2026", „06:30", kicker-ul,
mesajul de succes, badge-ul, meta de share (title/description/OG). Nu le mai scrii de mână.

### 2. Sincronizezi backend-ul
```bash
npm run sync-edition
```
Îți printează SQL-ul pentru `app_config`. **Îl revezi** și-l rulezi în Supabase (SQL Editor sau
MCP). Doar `app_config` (numerele de ediție) — nimic altceva.

### 3. (Opțional) Textul emailurilor
Emailurile (confirmare/reminder/anunț + badge) sunt în DB, editabile din **`/admin` → „Șabloane
de email"**. Le ajustezi acolo dacă vrei alt text; NU se ating din cod.

### 4. Cover-ul de share `public/og.png`
Regenerează imaginea (1200×630) cu noua ediție/dată (design: fundal `#121410`, accent lime
`#C9F24B`, font Anton). Versiunea (`?v=`) o gestionează `ogImageVersion` din `EDITION` — doar
înlocuiește fișierul `public/og.png`.

### 5. Verifici + deploy
```bash
npm run verify        # typecheck + teste + build + e2e
git add -A && git commit -m "Ediția <N>" && git push
```
Vercel publică automat. Preview înainte: `parktraining.fit/?preview=soon` (Coming Soon) sau
`?preview=landing` (landing).

---

## Ce prind testele (nu trebuie editate per ediție)

- `edition-derivation.test.ts` — `config.ts` derivă corect din `EDITION`.
- `meta.test.ts` — meta de share reflectă `EDITION` + `index.html` folosește placeholder-e.
- `backend-contract.test.ts` — cererile merg spre schema `runlift`, cu `editie` corectă.
- `deploy-config.test.ts` — CSP-ul (`vercel.json`) permite originul Supabase.
- e2e (landing/inscriere/coming-soon) — importă din `content/`, deci NU driftează.
- `npm run test:integration` (opt-in) — `app_config` din DB == `EDITION.number` (anti-drift).

---

## Capcane (verifică dacă ceva pică)

1. **Schema `runlift` neexpusă** în Supabase → API → Exposed schemas → toate cererile pică.
2. **CSP** (`vercel.json` `connect-src`) rămas pe alt proiect Supabase → înscrieri blocate.
3. **`app_config` desincronizat** de `EDITION` → rulează `npm run sync-edition`.
4. **NU atinge schema `public`** — e a gym-app + botul de Telegram (altă aplicație). Vezi
   `MIGRATIONS.md`.
5. **`og.png` necache-bust** → incrementează `ogImageVersion` în `EDITION`.

---

## Ce NU mai faci (vs. fluxul vechi)

- ~~Editezi `config.ts` manual~~ → derivă din `EDITION`.
- ~~Cauți „a treia" prin ComingSoon/Confirmare/AdminDashboard~~ → derivat din `ordinal()`.
- ~~Editezi meta în `index.html`~~ → injectată din `content/meta.ts` la build.
- ~~Editezi textele din funcția edge `send-email`~~ → sunt în DB, din `/admin`.
- ~~Actualizezi string-uri în teste~~ → testele importă din `content/`.

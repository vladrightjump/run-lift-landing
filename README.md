# Run + Lift — Landing page

Pagină de înscriere pentru evenimentul **Run + Lift** (11 iulie 2026, Stadionul Dinamo, Chișinău).
React 19 + Vite + TypeScript, cu **Supabase** ca backend de înscrieri (tabel Postgres + endpoint public de statistici). Fără server propriu.

## Structura proiectului

```
run-lift-landing/
├── index.html            # Vite root: meta tags + fonts + analytics
├── vercel.json           # headere de securitate (CSP etc.)
├── public/               # favicon, og.png, apple-touch-icon
├── src/
│   ├── components/       # TopBar, Hero, Format, Venue, Registration, Participants, Footer, Toast
│   ├── hooks/            # useCountdown, useScrollReveal, useToast, useOnlineStatus, useNow, useStats
│   ├── lib/
│   │   ├── config.ts     # ⚙️ EVENT_DATE, SUPABASE — aici configurezi
│   │   ├── validation.ts
│   │   └── supabase.ts   # submit înscriere + fetch statistici publice
│   └── index.css
└── README.md
```

## Rulare locală

```bash
npm install
npm run dev        # dev server pe http://localhost:5173
npm run build      # build de producție în dist/
npm run preview    # servește build-ul local
```

---

## Backend (Supabase)

Proiectul Supabase: **run-lift** (`iattqvakxcgepjiecgpf`, regiunea `eu-central-1`, free tier).

### Cum funcționează

- **Tabelul `registrations`** — nume, telefon, email, echipă, acord. Emailul e unic
  (case-insensitive): a doua înscriere cu același email primește ecranul "Ești deja înscris(ă)".
- **RLS (Row Level Security)** — cheia publică din client poate doar să **insereze**
  (și doar cu `acord = true`). Nu poate citi, modifica sau șterge nimic: datele personale
  sunt vizibile exclusiv din dashboard.
- **RPC `public_stats`** — endpoint public GET
  `https://iattqvakxcgepjiecgpf.supabase.co/rest/v1/rpc/public_stats` care returnează doar
  date ne-personale: `{ count, participants: [{ nume: "Vlad F.", echipa }] }` (prenume +
  inițială, niciodată email/telefon). Din el se alimentează bara "Locuri rămase" și viitoarea
  secțiune cu echipe.

### Unde vezi înscrierile

[Dashboard → Table Editor → registrations](https://supabase.com/dashboard/project/iattqvakxcgepjiecgpf/editor) — fiecare rând e o înscriere, cu toate datele.

### Configurare client

`src/lib/config.ts` → obiectul `SUPABASE` (URL + publishable key). Cheia e publică prin
design — protecția vine din RLS, nu din secretul cheii.

> **Notă free tier:** proiectele Supabase gratuite se pun pe pauză după ~1 săptămână fără
> trafic. Pentru un eveniment punctual nu contează; dacă pagina trebuie reînviată mai târziu,
> dai "Restore" din dashboard.

---

## Dezvoltare

### Fără Supabase configurat

Dacă `SUPABASE.url` / `publishableKey` sunt goale:

- **În development** (`npm run dev`): submit-ul sare peste apelul de rețea și simulează ecranul de confirmare. Verifică consola: apare `[Run+Lift] Supabase nu e configurat...`.
- **În producție**: NU se simulează succes (înscrierea s-ar pierde) — utilizatorul vede un ecran de eroare cu datele de contact ale organizatorilor.

### Validări

Toate validările rulează în `src/lib/validation.ts` **înainte** de trimitere:

| Câmp    | Regulă                                                              | Mesaj                                              |
|---------|---------------------------------------------------------------------|----------------------------------------------------|
| Nume    | Minimum 3 caractere                                                 | Completează numele complet.                        |
| Telefon | `/^\+?\d{8,15}$/` după eliminarea spațiilor/parantezelor/liniuțelor | Numărul de telefon nu e valid.                     |
| Email   | `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`                                    | Adresa de email nu e validă.                       |
| Acord   | Bifat                                                               | Trebuie să accepți regulamentul ca să te înscrii.  |

Erori: contur roșu pe câmp + mesaj sub el + toast la sus centrat (3.5s).

### Stări formular

Mașina de stări din `RegistrationSection.tsx`:

- `form` — starea inițială, formularul e vizibil
- `loading` — spinner + text "Se trimite înscrierea…" (min. 700ms)
- `success` — cerc verde cu SVG check animat + "Te-ai înregistrat, {nume}!"
- `error` — cerc roșu cu X + titlu diferențiat (rețea / timeout / config / duplicat / necunoscut) + "Încearcă din nou"

Plus ecrane de overlay care înlocuiesc formularul: `sold-out` (0 locuri libere), `reg-closed`
(după 10 iulie), `event-ended` (după start + 6h) și un banner offline când dispare conexiunea.

### Bară "Locuri rămase"

Deasupra formularului există o bară cu 30 de sloturi (verzi = ocupate, gri = libere, pe 2
rânduri) și un contor "X / 30" care devine roșu când mai sunt ≤ 3 locuri. Capacitatea se
schimbă dintr-un singur loc: `TOTAL_SLOTS` în `src/lib/config.ts` (copy-ul o interpolează).

Numărul ocupat vine **live** din Supabase (`useStats` → RPC `public_stats`): refresh la 15s,
imediat după fiecare înscriere reușită și de fiecare dată când tab-ul redevine vizibil.
`OCCUPIED_SLOTS` din `src/lib/config.ts` e doar fallback static pentru cazul în care API-ul
nu răspunde.

### Countdown timer

În topbar există un contor live către `EVENT_DATE` (11 iulie 2026, 06:30). Se actualizează la fiecare secundă. Când data trece, arată „Evenimentul a început".

Pentru alt eveniment, modifică în `src/lib/config.ts` (cu offset de fus orar explicit, ca
vizitatorii din alte fusuri să vadă același moment):

```ts
export const EVENT_DATE = new Date('2026-07-11T06:30:00+03:00');
export const REGISTRATION_DEADLINE = new Date('2026-07-11T00:00:00+03:00');
```

### Animații

- **Hero**: cele 3 rânduri ale titlului + subtitle + CTA apar cu `fade-up` staggered la load. CTA hero pulsează după 1.5s (`glow-pulse`).
- **Scroll reveal**: heading-urile secțiunilor (01/02/03) și cardurile de echipament apar cu fade-up la intrare în viewport (IntersectionObserver).
- **Success screen**: SVG check desenat + `pop-in` pe cerc + 3 puls-ring-uri.

### Design tokens

- Fundal: `#121410`, suprafață: `#1A1D17`, contur: `#2A2E25`
- Text: `#F1EFE6`, muted: `#C9CCBE`, dim: `#9BA08F`
- Accent: `#C9F24B` (verde-volt), hover: `#DDFF66`, eroare: `#F26D6D`
- Fonturi: **Anton** (display), **Archivo** (text) — de pe Google Fonts

### Harta

Google Maps embed centrat pe **Stadionul Dinamo, Str. Alexei Șciusev 106A, Chișinău** (`47.0265979, 28.8192078`). Fără API key. Butonul "Deschide în Google Maps" pornește direct rutarea către stadion.

---

## Deploy pe Vercel *(recomandat)*

Vercel detectează automat proiectul Vite (build `npm run build`, output `dist/`) — publish în ~30 de secunde, cu HTTPS automat, CDN global și custom domain gratuit.

### Opțiunea A — CLI (cel mai rapid)

```bash
cd /Users/vladfilip/Workspace/run-lift-landing
npx vercel
```

Prima dată îți cere să te loghezi (email sau GitHub). Apoi:

```
? Set up and deploy?                   Y
? Which scope?                         (contul tău)
? Link to existing project?            N
? What's your project's name?          run-lift-landing
? In which directory is your code?     ./
? Want to modify these settings?       N
```

Primești imediat URL live: `https://run-lift-landing.vercel.app`

Pentru deploy-uri ulterioare (după modificări), rulează:

```bash
npx vercel --prod
```

### Opțiunea B — Prin dashboard (fără CLI)

1. Fă un repo GitHub cu proiectul.
2. Mergi pe [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → alege repo-ul.
3. Framework Preset: **Vite** (detectat automat).
4. Root Directory: `./`
5. Click **Deploy**. În 30s primești URL-ul.

Fiecare push pe `main` face redeploy automat. Fiecare branch primește un preview URL propriu (util pentru testare înainte de production).

### Custom domain (`runlift.md` sau similar)

1. Cumperi domeniul (ex: [molddata.md](https://molddata.md) pentru `.md`, sau [namecheap.com](https://namecheap.com) pentru `.com`/`.run`).
2. În Vercel dashboard → proiectul tău → **Settings** → **Domains** → adaugă domeniul.
3. Vercel îți dă 2 DNS records (A + CNAME) — le pui la registrarul unde ai cumpărat domeniul.
4. HTTPS se activează automat în ~5 minute după propagarea DNS.

Vercel Hobby (free) permite unlimited custom domains gratuit.

### De ce Vercel pentru tine

- Evenimentul e **gratuit** → nicio restricție a ToS-ului Hobby
- 100 GB bandwidth/lună gratuit — mult mai mult decât o să folosești
- Analytics gratuit (vezi câți vizitatori vin, de unde, ce browser)
- Rollback instant dacă strici ceva
- UX foarte plăcut

### Alternative

Dacă vrei ceva și mai simplu (fără cont/CLI/repo):

- **[Netlify Drop](https://app.netlify.com/drop)** — literalmente drag & drop folderul → primești URL în 30s
- **Cloudflare Pages** — CDN mai rapid pentru zona MD/RO, tot gratuit

---

## De completat / pași următori

- [x] Backend Supabase (tabel + RLS + endpoint public de statistici)
- [ ] Testează un flux complet: submit → rând nou în Table Editor → contorul de locuri scade
- [ ] Deploy pe Vercel
- [x] Secțiunea "04 · Cine vine" (listă participanți live, badge "Nou" pentru înscrierile de pe dispozitivul curent)

## Contact

Pentru întrebări legate de eveniment: `contact@runlift.md` (placeholder — de înlocuit).

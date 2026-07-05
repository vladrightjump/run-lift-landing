# Run + Lift — Landing page

Pagină de înscriere pentru evenimentul **Run + Lift** (11 iulie 2026, Stadionul Dinamo, Chișinău).
Un singur fișier HTML, fără build, fără backend — datele merg într-un Google Form, iar confirmarea pleacă din Gmail-ul tău printr-un Google Apps Script.

## Structura proiectului

```
run-lift-landing/
├── index.html            # landing page (self-contained: HTML + CSS + JS)
├── apps-script/
│   └── Code.gs           # Google Apps Script pentru email de confirmare
└── README.md
```

## Rulare locală

Deschide `index.html` direct în browser:

```bash
open index.html
```

Nu are nevoie de server. Google Fonts și Google Maps se încarcă de pe CDN.

---

## 1) Google Form (colectarea înscrierilor)

### 1.1 Creează Form-ul

1. Mergi pe [forms.google.com](https://forms.google.com) → **Blank form**
2. Titlu: **Run + Lift — Înscriere**
3. Adaugă exact aceste întrebări (titlurile trebuie să fie **EXACT** cum apar mai jos — sunt folosite de Apps Script):

   | Titlul întrebării           | Tip                | Obligatoriu |
   |-----------------------------|--------------------|-------------|
   | Nume complet                | Short answer       | Da          |
   | Telefon                     | Short answer       | Da          |
   | Email                       | Short answer       | Da          |
   | Nume echipă / partener      | Short answer       | Nu          |
   | Acord medical               | Checkbox (o opțiune: **Da**) | Da |

   > Pentru "Acord medical" bifează **Checkbox** (nu "Checkboxes grid"), adaugă o singură opțiune numită exact `Da`, și marchează întrebarea ca obligatorie.

4. Sus dreapta ⚙ → tab **Responses** → activează **"Collect email addresses"** dacă vrei ca Google să salveze și emailul contului (opțional; noi trimitem oricum câmpul "Email").

### 1.2 Obține `formId`

Click **Send** (sus dreapta) → tab **🔗 Link** → copiază URL-ul.

Arată așa:

```
https://docs.google.com/forms/d/e/1FAIpQLSf...abc123.../viewform
                              ↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑↑
                              acesta e FORM_ID
```

### 1.3 Obține `entry` ID-urile

1. Click ⋮ (trei puncte, sus dreapta în Form) → **Get pre-filled link**
2. Completează fiecare câmp cu o valoare de test (ex: `Ana Popescu`, `0700000000`, `test@email.com`, `Echipa X`, bifează `Da`)
3. Click **Get link** → **Copy link**
4. Link-ul arată așa:

   ```
   https://docs.google.com/forms/d/e/1FAIpQLSf.../viewform?
     entry.1234567890=Ana+Popescu&
     entry.2345678901=0700000000&
     entry.3456789012=test%40email.com&
     entry.4567890123=Echipa+X&
     entry.5678901234=Da
   ```

5. Din fiecare `entry.NNNN=valoare` extrage `NNNN`. Astea sunt entry ID-urile.

### 1.4 Conectează landing page-ul

Deschide `index.html` și găsește obiectul `GOOGLE_FORM` (la începutul `<script>`, spre finalul fișierului). Înlocuiește placeholder-ele:

```js
var GOOGLE_FORM = {
  formId: '1FAIpQLSf...abc123...',       // de la pasul 1.2
  entries: {
    nume:    '1234567890',                // entry ID pentru "Nume complet"
    telefon: '2345678901',                // entry ID pentru "Telefon"
    email:   '3456789012',                // entry ID pentru "Email"
    echipa:  '4567890123',                // entry ID pentru "Nume echipă / partener"
    acord:   '5678901234'                 // entry ID pentru "Acord medical"
  },
  acordValue: 'Da'                        // textul EXACT al opțiunii bifate
};
```

Salvează și reîncarcă pagina. Fă un submit de test → verifică că apare în tab-ul **Responses** al Form-ului.

> **Notă:** Cererea se face cu `mode: 'no-cors'`, ceea ce înseamnă că browser-ul nu poate citi răspunsul Google. Dacă entry ID-urile sau formId sunt greșite, Google acceptă cererea dar nu apare în răspunsuri. Confirmă întotdeauna cu un test real.

---

## 2) Email de confirmare (Google Apps Script)

Când cineva se înscrie, vrem să primească automat un email de confirmare din Gmail-ul tău.

### 2.1 Instalează scriptul

1. Deschide Google Form-ul creat mai sus.
2. Sus dreapta ⋮ → **Script editor** (se deschide Apps Script într-un tab nou).
3. Șterge tot conținutul din `Code.gs`.
4. Lipește conținutul din `apps-script/Code.gs` (din acest repo).
5. Modifică obiectul `CONFIG` din vârful fișierului:

   ```js
   const CONFIG = {
     subject:  'Ești înscris(ă) la Run + Lift · 11 iulie 2026',
     fromName: 'Run + Lift',
     replyTo:  'contact@runlift.md',  // înlocuiește cu emailul tău real
     bccMe:    ''                      // opțional: primești și tu o copie
   };
   ```

6. Salvează (💾 sau `Cmd+S`).

### 2.2 Configurează trigger-ul

1. În Apps Script, în meniul din stânga → 🕒 **Triggers** → **+ Add Trigger** (dreapta jos).
2. Setează:
   - **Choose which function to run**: `onFormSubmit`
   - **Choose which deployment should run**: `Head`
   - **Select event source**: `From form`
   - **Select event type**: `On form submit`
3. Click **Save**. Google îți cere să autorizezi accesul — acceptă cu contul tău.
4. La avertismentul "Google hasn't verified this app" → **Advanced** → **Go to (project name) (unsafe)** → **Allow**. E scriptul tău, nu e un warning real.

### 2.3 Testează

Completează Form-ul cu emailul tău. În ~30 secunde ar trebui să primești confirmarea.

Dacă nu vine:
- Vezi tab-ul **Executions** din Apps Script — arată dacă scriptul a rulat și cu ce erori.
- Verifică că **titlurile întrebărilor** din Form sunt exact cum apar în `CONFIG.fieldTitles` (case-sensitive, cu spații).

### 2.4 Limite

- **Gmail personal**: 100 emailuri/zi trimise din Apps Script.
- **Google Workspace**: 1500 emailuri/zi.

Pentru un eveniment de 100–200 participanți e mai mult decât suficient.

---

## Dezvoltare

### Fără Google Form configurat

Dacă `GOOGLE_FORM.formId` conține încă `REPLACE_WITH_FORM_ID`, submit-ul sare peste apelul de rețea și arată doar ecranul de confirmare local. Util pentru development.

Verifică consola: apare `[Run+Lift] Google Form nu e configurat...`.

### Validări

Toate validările rulează în `index.html` **înainte** de trimitere:

| Câmp    | Regulă                                                    | Mesaj                                              |
|---------|-----------------------------------------------------------|----------------------------------------------------|
| Nume    | Minimum 3 caractere                                       | Completează numele complet.                        |
| Telefon | `/^\+?[0-9][0-9 ()\-]{6,14}$/`                            | Numărul de telefon nu e valid.                     |
| Email   | `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`                          | Adresa de email nu e validă.                       |
| Acord   | Bifat                                                     | Trebuie să accepți regulamentul ca să te înscrii.  |

Erori: contur roșu pe câmp + mesaj sub el + toast la sus centrat (3.5s).

### Design tokens

- Fundal: `#121410`, suprafață: `#1A1D17`, contur: `#2A2E25`
- Text: `#F1EFE6`, muted: `#C9CCBE`, dim: `#9BA08F`
- Accent: `#C9F24B` (verde-volt), hover: `#DDFF66`, eroare: `#F26D6D`
- Fonturi: **Anton** (display), **Archivo** (text) — de pe Google Fonts

### Harta

Google Maps embed centrat pe **Stadionul Dinamo, Str. Alexei Șciusev 106A, Chișinău** (`47.0265979, 28.8192078`). Fără API key. Butonul "Deschide în Google Maps" pornește direct rutarea către stadion.

---

## Deploy pe Vercel *(recomandat)*

Pagina e un singur fișier static — Vercel o publică în ~30 de secunde, cu HTTPS automat, CDN global și custom domain gratuit.

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

1. Fă un repo GitHub cu fișierele (`index.html` + `apps-script/` + `README.md`).
2. Mergi pe [vercel.com/new](https://vercel.com/new) → **Import Git Repository** → alege repo-ul.
3. Framework Preset: **Other** (Vercel detectează automat că e static).
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

- [ ] Creează Google Form-ul și înlocuiește `GOOGLE_FORM` în `index.html`
- [ ] Instalează Apps Script-ul și trigger-ul
- [ ] Înlocuiește `contact@runlift.md` cu emailul real (în `Code.gs` și în footerul din `index.html`)
- [ ] Testează un flux complet: submit → înregistrare în Form → email de confirmare primit
- [ ] Deploy pe hosting

## Contact

Pentru întrebări legate de eveniment: `contact@runlift.md` (placeholder — de înlocuit).

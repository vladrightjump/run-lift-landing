# Ghid: cum lansezi o ediție nouă

O ediție nouă se face **din `/admin`**, din tabul **Eveniment**. Fără editări în cod, fără SQL
generat, fără deploy.

> **Sursa de adevăr:** rândul `published` din `runlift.event_config`. Pagina publică îl citește la
> runtime (`public_config()`), iar publicarea scrie în ACEEAȘI tranzacție cele cinci valori din
> `app_config` pe care le citesc guard-urile din DB. Nu mai există „desincronizare" de aliniat manual.
>
> `src/content/edition.ts` a rămas **instantaneul de build**: randează primul cadru și acoperă cazul
> în care backendul nu răspunde. **Nu-l edita ca să schimbi ediția.**

---

## Pașii (majoritatea edițiilor: doar atât)

### 1. Deschide ciorna
`/admin` → **Eveniment** → „**+ Ciornă pentru ediția N+1**".

Pornește de la ediția publicată, cu numărul incrementat. Editează ce se schimbă:

- **Ediția evenimentului** — numărul ediției.
- **Ediția de lansare** — de regulă egală; vezi capcana de mai jos.
- **Numele evenimentului / Concept** — branding („Hyrox Trial", „Outdoor Adaptive").
- **Start / Deadline înscriere / Momentul lansării / Următorul antrenament** — local, **fără fus**
  (`2026-08-22T07:00:00`); se compun cu câmpul *Fus orar*.
- **Check-in de la**, **Durata (ore)**, **„Cine vine" cu (ore) înainte**.
- **Locul** — nume, oraș/zonă și **coordonate `lat,lng`** (punct exact, nu text căutat pe hartă).
- **Locuri** și **Lista de așteptare** — capacitatea.
- **Homepage-ul arată** — Landing (înscrieri) sau Coming Soon.
- **Secțiunile paginii** — ordinea și ce se ascunde. Numerele (01, 02…) se recalculează singure.

Formularul nu te lasă să publici un config imposibil (deadline după start, următorul antrenament
înainte de finalul cursei, capacitate zero, coordonate scrise ca text). Aceleași reguli sunt
aplicate și pe server — formularul doar ți le spune mai devreme.

### 2. Previzualizează
Butonul „**Previzualizează**" deschide `/?config=draft` — pagina reală, randată din ciornă. Doar tu
o vezi: preview-ul folosește sesiunea ta de admin, iar un vizitator care ghicește parametrul vede
tot configul publicat.

Se compune cu fazele zilei: `/?config=draft&preview=leaderboard` și `?preview=next` îți arată cum
arată ciorna în dimineața cursei și după. **Verifică-le seara dinainte** — sunt singurele ecrane
care apar când nu ești la laptop.

### 3. Publică
Butonul „**Publică**", cu confirmare. Confirmarea îți spune ce va vedea vizitatorul: Coming Soon
sau landing-ul cu înscrieri.

Din acel moment site-ul public servește configul nou. Un tab deja deschis îl prinde la următorul
poll, fără reload.

Versiunea publicată anterior rămâne salvată: dacă ceva e greșit, „**Revino la asta**" din
*Versiuni anterioare* o readuce, tot într-o singură tranzacție.

### 4. (Opțional) Textul emailurilor
Emailurile (confirmare/reminder/anunț + badge) sunt în DB, editabile din **`/admin` → „Șabloane de
email"**. NU se ating din cod.

---

## Banda „Instagram"

Din **`/admin` → „Eveniment" → „Clipurile din bandă"**, în ciornă ca orice altceva.

1. Pe telefon: **Copiază linkul** la clipul dorit.
2. „+ Adaugă clip" → lipești linkul în „Linkul clipului". Sub câmp apare ecoul
   („cod: ABC12345 · reel") — dacă apare, l-am înțeles.
3. Textul de sub card e opțional, dar e singurul lucru care spune ce se vede în clip.
4. Posterul e opțional. Fără el, cardul se randează cu cifra lui mare — arată intenționat, nu
   stricat. **Cu** poster: pui fișierul în `public/reels/` și scrii calea (`/reels/marti.jpg`).
   Asta cere deploy; clipul în sine, nu.

**Prima dată când adaugi un clip**, secțiunea apare **jos de tot**: layout-ul completează
secțiunile noi la final. Mut-o unde vrei cu ↑ din „Secțiunile paginii".

Cât timp n-are niciun clip, secțiunea nu apare pe pagină, oricât ar fi de „vizibilă" în listă.
Nu e un bug și nu strică numerotarea celorlalte.

---

## Comutarea pe Coming Soon (fără ciornă)

**`/admin` → tabul „Coming Soon"**. Singurul loc din admin cu efect **imediat**.

Îți spune într-o linie ce vede vizitatorul ACUM, apoi: comutatorul Coming Soon / Landing, ținta
anunțului (cu presetări), și ținta numărătorii de după cursă. „Aplică acum" cere o confirmare,
apoi site-ul e schimbat.

Se poate întoarce: peticul scrie o versiune nouă, deci apare în „Versiuni anterioare" din tabul
„Eveniment", cu „Revino la asta".

**Atenție la combinație:** dacă ai o ciornă deschisă care poartă alte valori pentru aceleași
câmpuri, publicarea ei ulterioară le suprascrie. Panoul te avertizează când e cazul.

---

## Ce mai cere deploy

**Doar share preview-ul** (cardul de WhatsApp/Facebook) și imaginea lui.

Meta (title/description/Open Graph) se injectează în `index.html` la BUILD, pentru că scraper-ele de
share citesc HTML-ul static, fără să ruleze JS. Deci după o publicare care schimbă data, numele
evenimentului sau locul, cardul de share rămâne pe datele build-ului.

Tabul **Eveniment** îți spune când se întâmplă asta, numind câmpurile rămase în urmă. Ca să-l aduci
la zi:

1. Aliniază `src/content/edition.ts` cu ediția publicată (asta e singura ocazie în care îl atingi).
2. Regenerează `public/og.png` (1200×630) și **incrementează `ogImageVersion`** — altfel preview-ul
   vine din cache.
3. `npm run verify`, apoi commit + push.
4. Vercel nu pornește mereu build la push — finalizează cu `vercel --prod`.

Site-ul funcționează perfect și fără pasul ăsta; doar cardul de share e vechi.

---

## Ziua evenimentului (automat, fără redeploy)

Homepage-ul își schimbă singur forma de două ori, pe ceas, din reperele configului publicat:

| Moment | Ce arată „/" | Ce arată `/inscriere` |
|---|---|---|
| până la `start` − `„cine vine" cu (ore) înainte` | landing normal, înscrieri deschise | formularul |
| de acolo până la `start` + `durata` | landing fără formular și fără CTA, „cine vine" sub hero | formularul, până la deadline |
| după `start` + `durata` | countdown spre următorul antrenament | redirect spre „/" |

Le vezi înainte de ora lor cu `?preview=leaderboard` și `?preview=next`.

Aranjarea din fereastra „cine vine" **nu** e configurabilă, deliberat: atunci pagina răspunde la o
singură întrebare.

### După ce se termină cursa

Bumpează **Ediția de lansare** la ediția următoare și publică.

**NU o bumpa înainte de cursă:** alimentează „Ediția a N-a" de pe `/confirmare` și `/unsubscribe`,
adică exact paginile deschise din email de cei înscriși la ediția în curs. Formularul te
avertizează dacă o faci, dar nu te oprește — sunt situații în care e intenționat.

---

## Ce prind testele

- `eventConfig.test.ts` — instantaneul transcrie `EDITION`; documentele nerandabile sunt respinse.
- `formatCharacterization.test.ts` — string-urile derivate nu s-au schimbat la mutarea pe config.
- `eventConfigForm.test.ts` — regulile formularului (aceleași ca pe server).
- `sectionLayout.test.tsx` — ordinea, vizibilitatea și renumerotarea secțiunilor.
- `adminEventTab.test.tsx` — nimic nu ajunge pe site fără „Publică".
- `buildFingerprint.test.ts` — când se anunță că share preview-ul e vechi.
- `meta.test.ts` — meta de share reflectă instantaneul + `index.html` folosește placeholder-e.
- `deploy-config.test.ts` — CSP-ul (`vercel.json`) permite originul Supabase.
- e2e (landing/inscriere/coming-soon/faze) — derivă din instantaneu, deci NU driftează.
- `npm run test:integration` (opt-in) — scalarele din `app_config` urmează documentul publicat.

---

## Capcane

1. **Schema `runlift` neexpusă** în Supabase → API → Exposed schemas → toate cererile pică.
2. **CSP** (`vercel.json` `connect-src`) rămas pe alt proiect Supabase → înscrieri blocate.
3. **NU atinge schema `public`** — e a gym-app + botul de Telegram. Vezi `MIGRATIONS.md`.
4. **`og.png` necache-bust** → incrementează `ogImageVersion` când regenerezi imaginea.
5. **Ediția de lansare bumpată prea devreme** → vezi „După ce se termină cursa".
6. **CSP** (`vercel.json` `frame-src`) fără `https://www.instagram.com` → clipurile se deschid
   într-un iframe gol. Nu se vede în dev (antetele se aplică doar în producție); există test.
7. **Comutatorul „Coming Soon" pornit, dar ora anunțului deja trecută** → site-ul arată landing-ul,
   nu Coming Soon. Panoul ți-o spune; mută ținta în viitor, nu apăsa comutatorul.

---

## Ce NU mai faci (vs. fluxul vechi)

- ~~Editezi `src/content/edition.ts` la fiecare ediție~~ → publici din admin.
- ~~Rulezi `npm run sync-edition` și copiezi SQL în Supabase~~ → publicarea scrie ea scalarele,
  atomic. Scriptul a fost șters.
- ~~Aștepți un redeploy ca site-ul să arate ediția nouă~~ → e live la publicare.
- ~~Urmărești bannerul roșu de desincronizare~~ → nu mai există stare în care să apară.

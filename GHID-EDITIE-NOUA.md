# Ghid: cum lansezi o ediție nouă

O ediție nouă se face **din `/admin`**, din tabul **Eveniment**. Fără editări în cod, fără SQL
generat, fără deploy.

> **Sursa de adevăr:** rândul `published` din `runlift.event_config`. Pagina publică îl citește la
> runtime (`public_config()`), iar publicarea scrie în ACEEAȘI tranzacție cele șase valori din
> `app_config` pe care le citesc guard-urile din DB și cron-ul de remindere. Nu mai există
> „desincronizare" de aliniat manual.
>
> `src/content/edition.ts` a rămas **instantaneul de build**: randează primul cadru și acoperă cazul
> în care backendul nu răspunde. **Nu-l edita ca să schimbi ediția.**

---

## Pașii (majoritatea edițiilor: doar atât)

### 1. Deschide ciorna
`/admin` → ultimul nod al **liniei de timp** → „**Pornește ediția următoare**".

Linia de timp e primul lucru de pe ecran, iar nodul ediției următoare stă la capătul ei — acolo
unde te uiți oricum după ce cursa s-a consumat. Deschide același dialog de trei câmpuri ca butonul
din tabul **Eveniment** („**+ Ciornă pentru ediția N+1**"), care rămâne unde era.

Pornește de la ediția publicată, cu numărul incrementat. Editează ce se schimbă:

- **Ediția evenimentului** — numărul ediției.
- **Ediția de lansare** — de regulă egală; vezi capcana de mai jos.
- **Numele evenimentului / Concept** — branding („Hyrox Trial", „Outdoor Adaptive").
- **Start / Deadline înscriere / Momentul lansării / Următorul antrenament** — se aleg din calendar;
  se compun cu câmpul *Fus orar*.
- **Check-in de la**, **Durata (ore)**, **„Cine vine" cu (ore) înainte**.
- **Locul** — nume, oraș/zonă, **coordonate `lat,lng`** (punct exact, nu text căutat pe hartă) și
  zoom-ul hărții.
- **Locuri**, **Lista de așteptare** și **Ocupate (valoare de rezervă)** — capacitatea, plus
  numărul pe care pagina îl arată dacă statisticile nu răspund (zero e răspunsul normal; o ciornă
  de ediție nouă pornește de la zero).
- **Homepage-ul arată** — Landing (înscrieri) sau Coming Soon.
- **Secțiunile paginii** — ordinea și ce se ascunde. Numerele (01, 02…) se recalculează singure.

Formularul nu te lasă să publici un config imposibil (deadline după start, următorul antrenament
înainte de finalul cursei, capacitate zero, coordonate scrise ca text). Aceleași reguli sunt
aplicate și pe server — formularul doar ți le spune mai devreme.

#### Grupul „Când" — startul e ancora, restul atârnă de el

Practic, o ediție nouă înseamnă **o singură decizie**: când e cursa. Celelalte patru momente sunt
derivate din ea — înscrierile se închid cu o oră înainte, check-inul cu un sfert, anunțul cu câteva
zile, antrenamentul următor peste o săptămână. Grupul le tratează ca atare:

- Sus stă **cronologia**: cele șase repere în ordinea în care se întâmplă, cu distanța față de start
  scrisă cu litere. Include și „se termină cursa" (`start + durata`), reperul care comută homepage-ul
  pe countdown și care nu are câmp propriu. Un reper căzut din ordine se vede pentru că **sare din
  locul lui**, nu pentru că o regulă spune că a sărit.
- Sub *Startul cursei* sunt presetările **„Sâmbăta viitoare"** și **„Peste două sâmbete"**, la ora
  cursei curente.
- Când muți startul, formularul **oferă** să mute la fel și ce atârnă de el („Startul s-a mutat cu 7
  zile mai târziu. Mut la fel și…"). Oferit, nu aplicat — dar un singur click ține toată ediția
  coerentă. Check-inul păstrează **avansul** față de start, nu ora: o cursă mutată la 09:00 are
  check-in la 08:45.
- *Check-in de la* se alege ca avans („06:45 · cu 15 min înainte"), nu ca oră ruptă de context.

Semnalele **chihlimbar** ▲ sunt lucruri corecte formal, cu urmări pe care altfel le-ai afla din
reclamații — nu blochează publicarea. Cel mai important: **anunțul rămas în urmă.** Ciorna ediției
următoare pornește de la cea publicată, deci moștenește momentul de anunț al ediției TRECUTE. Un
moment deja consumat înseamnă că homepage-ul nu va sta pe Coming Soon, oricât ai apăsa comutatorul.

#### Grupul „Unde"

Sub titlu sunt **locurile folosite până acum**, dintr-un click — coordonatele nu se pot verifica
citindu-le, iar cursele se întorc în aceleași două-trei parcuri. Câmpurile rămân editabile după.
Pentru un loc nou: Google Maps → click dreapta pe punct → prima linie din meniu copiază `lat,lng`,
apoi verifică-l cu linkul de sub câmp.

### 2. Previzualizează
Butonul „**Previzualizează**" deschide `/?config=draft` — pagina reală, randată din ciornă. Doar tu
o vezi: preview-ul folosește sesiunea ta de admin, iar un vizitator care ghicește parametrul vede
tot configul publicat.

Previzualizarea randează ciorna **de pe server**, nu câmpurile de pe ecran — de asta, cât timp ai
modificări nesalvate, butonul scrie „**Salvează și previzualizează**" și le salvează întâi. Ce se
deschide e întotdeauna ce ai pe ecran.

Se compune cu fazele zilei: `/?config=draft&preview=leaderboard` și `?preview=next` îți arată cum
arată ciorna în dimineața cursei și după. **Verifică-le seara dinainte** — sunt singurele ecrane
care apar când nu ești la laptop.

### 3. Publică
Butonul „**Publică**", cu confirmare. Confirmarea îți spune ce va vedea vizitatorul (Coming Soon
sau landing-ul cu înscrieri) și, sub asta, **ce se schimbă față de ce e publicat acum** — câmp cu
câmp, cu valoarea veche și cea nouă. Un câmp neschimbat nu apare. Dacă ciorna e a altei ediții
decât cea publicată, scrie „prima publicare": n-are cu ce să compare.

Din acel moment site-ul public servește configul nou. Un tab deja deschis îl prinde la următorul
poll, fără reload.

Versiunea publicată anterior rămâne salvată: dacă ceva e greșit, „**Revino la asta**" din
*Versiuni anterioare* o readuce, tot într-o singură tranzacție.

### Ce te apără între timp

- **Ciorna nesalvată nu dispare tăcut.** Cât timp ai modificări nesalvate, bara de jos scrie
  „Nesalvat", iar „Renunță", schimbarea tabului și închiderea paginii întreabă întâi. Salvarea sau
  publicarea sting semnalul.
- **Numărul câmpurilor stricate e un buton.** „3 câmpuri de reparat" te duce la primul dintre ele,
  deschide grupul în care stă și îl focusează.
- **Ștergerile se pot anula.** Un clip sau un reminder șters din greșeală se întoarce din toast.
- **Două ciorne se văd ca două ciorne.** Dacă schimbi „Numărul ediției", salvarea creează o ciornă
  SEPARATĂ (ciornele sînt cheiate pe ediție), iar cea veche rămâne pe server. Câmpul ți-o spune
  înainte, iar un banner de sus le enumeră și le poate deschide pe oricare.

### 4. (Opțional) Textul emailurilor
Emailurile (confirmare/reminder/anunț + badge) sunt în DB, editabile din **`/admin` → „Șabloane de
email"**. NU se ating din cod.

---

## Reminderele automate

Din **`/admin` → „Eveniment" → „Remindere"**, în ciornă ca orice altceva. Fiecare rând e un email
care pleacă **singur**, cu atâtea ore înainte de start câte scrii, **o singură dată**. Cel mult
cinci per ediție.

Fiecare rând îți spune și când pleacă („pleacă joi, 6 august · 07:00 · peste 2 zile"), iar rezumatul
cardului spune care e următorul. Textul îl alegi dintre două șabloane — „mâine alergăm" și „azi
alergăm" — editabile din „Șabloane de email".

**Un reminder pleacă la ora lui sau deloc.** Fereastra e de două ore după scadență; dacă a trecut,
rândul se marchează `a trecut — nu mai pleacă` și chiar nu mai pleacă. Asta e intenționat: un
reminder „mâine alergăm" primit în drum spre cursă e mai rău decât niciunul. Dacă ai ratat unul și
tot vrei să iasă ceva, micșorează avansul (ex. 24 → 6) și publică.

Reminderele se schimbă **fără SQL**. Singurul pas manual e armarea cron-ului, o dată pe proiect —
`supabase/sql/supabase-cron-reminder-ARM.sql`; dacă nu l-ai rulat niciodată, nu pleacă nimic, oricât de frumos
ar arăta orarul.

## Linkul „nu mai pot veni"

Pune `{link_renunt}` într-un șablon de email către participanți. Cine apasă ajunge pe `/renunt`,
confirmă cu încă un click, iar locul lui trece **imediat** la primul om de pe lista de așteptare,
care primește emailul de promovare. Vezi renunțarea în feed-ul „Activitate recentă", iar dacă a
fost o greșeală o poți anula cu „Undo" din lista de participanți.

Al doilea click nu e o formalitate: fără el, scanerele de linkuri ale Gmail/Apple — care deschid
URL-urile din emailuri ca să le verifice — ar fi eliberat locuri fără ca omul să atingă nimic.

Variabila e per persoană: la destinatarii care n-au un loc (listele de așteptare/lansare) cade tot
paragraful în care e scrisă, ca să nu plece o frază care trimite spre nimic.

---

## Banda cu clipuri de antrenament

Două locuri, împărțite după cine face ce: **fișierul** se produce pe calculatorul
tău, **restul** se administrează din `/admin` → „Clipuri".

Motivul împărțirii e practic. Un reel exportat din Instagram are 150-250 MB la
28-30 Mbps, iar un formular din browser n-are cum să-l transforme în ceva ce
poate servi o pagină. Compresia stă unde poate rula; ordinea și legendele stau
unde le schimbi des.

### O dată per clip nou (cere deploy)

1. Exportă masterul din Instagram, sau ia-l de pe telefon.
2. Rulează, dintr-un checkout al proiectului:

   ```bash
   npm run reel -- ~/Downloads/master.mp4 marti-in-parc
   ```

   Scrie `public/reels/marti-in-parc.mp4` și `public/reels/marti-in-parc.jpg`, și
   îți spune cât cântărește. Peste 6 MB se oprește cu eroare — scurtează bucla
   (`npm run reel -- <master> <slug> 10`) și încearcă din nou.
3. Commit + merge în `main`, ca fișierele să ajungă pe site.

### De fiecare dată după (fără deploy)

Din **`/admin` → „Clipuri"**: lipești calea (`/reels/marti-in-parc.mp4`),
posterul, legenda și linkul postării. Linkul poate fi lipit direct din Instagram
— coada („?igsh=…") se taie singură.

Tot de acolo: reordonare cu ↑/↓, editarea legendei, și comutatorul „se vede pe
pagină" pentru un clip pe care vrei să-l scoți temporar. Toate au efect imediat.

„Scoate" îl elimină din bandă, dar **nu** șterge fișierul din repo — un clip
repus mai târziu nu trebuie re-encodat.

### Ce e de reținut

- **Legenda nu e opțională.** Elementul video e ascuns din arborele de
  accesibilitate (un clip mut în buclă n-are ce anunța), deci legenda e tot ce
  primește cineva care folosește un cititor de ecran.
- Cât timp banda e goală, secțiunea nu apare — **nici pe landing, nici pe
  „Despre noi"** — și nu strică numerotarea celorlalte. Nu e un bug.
- Aceeași listă hrănește ambele pagini. Nu există „clipurile de pe landing" și
  „clipurile de pe Despre noi".
- Titlul și textul de lângă bandă rămân în `/admin` → „Evenimentul" → grupul
  „Instagram": alea țin de ediție.

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
- `reperele.test.ts` — cronologia ediției, semnalele chihlimbar și mutarea în bloc a reperelor.
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

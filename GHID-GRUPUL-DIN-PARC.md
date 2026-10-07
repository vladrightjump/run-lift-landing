# Ghid: grupul din parc, din `/admin`

Grupul de antrenament din parc — sondajul „vii mâine?" din Telegram, cine vine, membrii și botul —
se conduce din adminul Run + Lift, grupul **„Grupul din parc"** din meniu. Fiecare organizator
intră cu contul lui și vede tot, inclusiv ecranele edițiilor.

> **Datele sînt cele de până acum.** Ecranele citesc și scriu direct tabelele pe care le folosea
> gym-app (parkgym.fit) și pe care le scrie botul. Nimic nu s-a copiat sau mutat, deci o prezență
> marcată în gym-app apare și aici, și invers.
>
> **Starea de azi (7 octombrie 2026).** Ecranele sînt gata. Botul rulează încă din repo-ul vechi,
> până la mutarea pe Railway (pasul U9 din plan). Textul editabil al sondajului și conducerea zilei
> de antrenament din Telegram (secțiunea „Din Telegram") pleacă împreună, după mutare. gym-app
> rămâne pornit o săptămână ca rezervă, apoi se oprește (U11). Planurile:
> `docs/plans/2026-10-03-1107-feat-botul-si-prezentele-in-admin-plan.md` și
> `docs/plans/2026-10-06-2353-feat-ziua-de-antrenament-din-telegram-plan.md`.

---

## Privirea de săptămână

Pe ecranul de pornire, lângă blocul „În fiecare săptămână", stă cardul **Grupul din parc**: o
propoziție despre antrenamentul următor, fără să intri în vreun ecran.

| Cardul spune | Înseamnă |
|---|---|
| „Joi, 8 oct, 06:30" · „12 vin · 3 nu" | Sondajul a plecat; cifrele cresc pe măsură ce votează lumea |
| „Următorul: Joi, 8 oct" · „Sondajul pleacă miercuri la 12:00." | Sondajul pentru antrenamentul următor n-a plecat încă |
| „… — anulat" | Antrenamentul următor e anulat; botul nu trimite sondaj pentru el. O zi anulată din timp, mai departe decât antrenamentul pe care orarul îl întreabă înainte, nu ia locul acestuia |
| „Botul e oprit" | Sondajele programate nu pleacă (vezi „Botul de Telegram") |
| „Niciun sondaj programat" | Nu e aleasă nicio zi de sondaj |

Butonul **Prezențe** de pe card deschide ecranul cu numele.

---

## Prezențe — „câți vin la antrenamentul următor?"

**Antrenamentul următor** e primul neanulat de azi încolo (ziua de la Chișinău). O zi reactivată
departe, fără sondaj, nu trece înaintea zilei pentru care orarul trimite sondajul mai devreme:
atunci ecranul arată ziua din orar și când pleacă sondajul ei. Sus: data, ora, locul și dacă
sondajul a plecat. Dedesubt, trei cifre mari și trei liste:

- **vin** și **nu vin** — cine a răspuns la sondaj (sau a fost marcat de mână);
- **n-au răspuns** — doar membrii activi cu cont de Telegram, adică cei care chiar au primit
  sondajul. Un membru în pauză sau fără Telegram nu „lipsește".

Ecranul se reîmprospătează singur la 15 secunde: voturile din grup apar fără reîncărcare.

**Corectura de mână.** Lângă fiecare nume: **Vine**, **Nu** și **×** (șterge răspunsul). Pentru cine
a venit fără să apese în Telegram. Fiecare corectură rămâne în jurnal, cu numele organizatorului.

**Cine nu primește sondajul** (fără Telegram, sau în pauză) nu apare în liste până nu-l marchezi:
alege-l din **Fără sondaj** și apasă **Marchează că vine** (la antrenamentele trecute, **Marchează
că a venit**). Apoi trece la „vin", cu aceleași corecturi ca ceilalți.

**Anularea unei zile.**

- **Anulează antrenamentul**, sub antrenamentul următor, cere confirmare. Dacă sondajul a plecat
  deja, botul îl marchează „ANULAT", îi scoate butoanele și **anunță grupul** în cel mult un minut,
  pomenindu-i pe cei care au spus „Vin". Confirmarea spune pe câți pomenește și are un câmp
  opțional **Motiv** (de exemplu „ploaie"), care apare în anunț. Fără sondaj în grup, nu pleacă
  nimic.
- **Anulează o zi** anulează din timp o zi pentru care sondajul n-a plecat încă: botul nu va
  trimite sondaj pentru ea. Rândul nou ia ora și locul din setările botului. Dacă alegi o zi al cărei
  sondaj e deja în grup, trece prin aceeași confirmare ca mai sus.
- **Zile anulate** le arată pe toate cele viitoare, fiecare cu **Reactivează**. Când sondajul zilei
  plecase, reactivarea cere confirmare: sondajul își recapătă butoanele și voturile, iar botul
  anunță grupul.

Același lucru se face și din Telegram, cu aceleași reguli (vezi „Din Telegram").

**Antrenamentele trecute** stau dedesubt, cel mai nou primul, câte șase („Arată mai multe" aduce
restul). Fiecare se deschide cu aceleași liste și aceleași corecturi.

---

## Membrii grupului

**Conturi de Telegram nelegate** (apare sus doar când există): oameni intrați în grup pe care botul
nu-i știe încă. Cine votează devine membru de la sine, cu numele din Telegram; restul îi:

- **leagă** de un membru existent (de exemplu, cineva înscris de mână, fără Telegram), sau
- faci din cont un **Membru nou**.

Un cont pe care botul l-a legat singur (după `@utilizator`) sau al cărui id l-ai scris la un membru
din **Editează** nu mai apare aici, chiar dacă rândul lui a rămas în bază.

**Lista.** Caută după nume sau `@utilizator`; filtrează **Activi / În pauză / Ieșiți / Toți**. Pe
fiecare rând: contul de Telegram, starea, ultima prezență și, dacă a fost cerută, starea scoaterii
din grup.

**Editează** schimbă numele (2–80 de caractere), id-ul și utilizatorul de Telegram, starea și „admin
în grup".

**Scoate din grup** cere confirmare. Membrul trece pe „ieșit" pe loc, iar botul îl scoate din grupul
de Telegram în cel mult un minut. Istoricul de prezențe rămâne. Butonul e blocat, cu motivul scris:

- pentru **adminii grupului** (scoate-le întâi bifa „admin");
- pentru membrii **fără cont de Telegram** (botul n-are pe cine scoate);
- pentru cine **e deja ieșit**.

Dacă Telegram refuză scoaterea, membrul apare sus, la **Scoateri eșuate**, cu motivul, oricâte
comenzi au venit după ea. Cel mai des, botul nu (mai) e admin în grup. Rezolvă cauza, apoi
**Reîncearcă scoaterea**.

**Unește doi membri (duplicat)**, pentru aceeași persoană înregistrată de două ori. Alegi pe cine
**păstrezi** și **duplicatul**; răspunsurile duplicatului trec pe cel păstrat, contul de Telegram
la fel (dacă păstratul n-are), iar duplicatul dispare.

**Ștergerea definitivă nu există.** Ar șterge și istoricul de prezențe. Starea „ieșit", scoaterea
din grup și unirea duplicatelor acoperă aceleași nevoi.

---

## Analiza prezențelor

Tot ce arăta „Analiză" din gym-app:

- **Perioada:** Luna, 3 luni, An.
- **Cifrele:** prezența medie (cu tendința față de perioada dinainte), numărul de antrenamente,
  recordul (cu data) și câți n-au răspuns, în medie.
- **Fiecare antrenament** ca bară vin / nu / tăcere, cu detaliul celui ales, și curba procentului
  „vin"; **Pe zile** (media pe zilele săptămânii); **Toate răspunsurile**.
- **Membrii:** prezențe din total, cu starea — **activ**, **inactiv 2+ săpt.** (ultima prezență mai
  veche de 14 zile) sau **n-a venit**. Filtre pe stare, sortare după prezențe sau alfabetic.
- **Istoric** pe membru: ultimele 20 de antrenamente, procentul și tendința.
- **Scoate din grup**, cu același dialog și aceleași reguli ca pe „Membrii grupului".

---

## Botul de Telegram

### Starea, sus

| Scrie | Înseamnă | Ce faci |
|---|---|---|
| **Botul e pornit** · „Nicio comandă blocată. Ultima executată de bot: …" | Nicio comandă nu așteaptă | Nimic. Vrei o dovadă că rulează acum? **Trimite rezumatul acum** (pleacă doar la admini) |
| **Botul nu răspunde** · „O comandă așteaptă de N minute" | O comandă stă în coadă peste 3 minute; botul le golește la fiecare minut, deci nu rulează | Verifică serviciul `bot` pe Railway (jurnale, redeploy) |
| **Botul e oprit** | Comutatorul e pe oprit | Sondajele programate nu pleacă; comenzile „acum" merg în continuare |

Starea se citește din coada de comenzi, fără un semnal din bot. Cu coada goală, „pornit" înseamnă
„nimic blocat", nu „sigur rulează".

### Oprește / Pornește botul

Se aplică pe loc și nu atinge orarul. Nu e o setare de salvat: formularul de mai jos nu-l poate
schimba înapoi.

### Setările

- **Sondajul:** zilele și ora. Botul întreabă „vii mâine?", deci sondajul pleacă **în ziua de
  dinaintea** antrenamentului. Plus ora antrenamentului și locul, care apar în sondaj.
- **Textul sondajului:** titlul (până la 80 de caractere) și cele două butoane (până la 32), cu
  previzualizarea mesajului așa cum apare în Telegram. Gol = textul de azi. O schimbare ajunge la
  sondajul următor, iar unul deja în grup își păstrează textul. Titlul e pentru sondajul din ziua
  dinainte; sondajul unui antrenament extra postat mai devreme spune „Antrenament — Sâmbătă, 10 oct",
  iar unul postat în aceeași zi „Antrenament azi".
- **Rezumatul de dimineață** (în privat, la admini): zilele și ora.
- **Reminderul automat** pleacă în grup cu două ore înainte de ora antrenamentului din ziua aceea
  (și a unuia mutat sau extra), doar dacă au confirmat mai puțini decât **pragul**, și o singură
  dată pe antrenament.
- Rezumatul pleacă și în ziua unui antrenament **extra**, la ora lui obișnuită, chiar dacă ziua nu e
  printre zilele rezumatului. Cu zilele rezumatului goale, nu pleacă deloc.

**Salvează setările** le aplică; botul le citește la fiecare minut, deci intră în vigoare în cel mult
un minut. **Renunță la modificări** revine la cele salvate. Cu modificări nesalvate, ieșirea din
ecran (sau închiderea paginii) cere confirmare. Formularul îți spune ce nu e bine înainte să apeși.

Dacă doi organizatori salvează setările în același timp, **ultima salvare câștigă** pe toate
câmpurile. În săptămâna paralelă, setările se schimbă doar de aici, nu și din gym-app.

### Acum

- **Trimite sondajul acum** — pentru antrenamentul de mâine, cu confirmare. Dacă sondajul de mâine e
  deja în grup, confirmarea te avertizează: botul postează unul **nou**, iar cel vechi rămâne.
- **Trimite reminderul acum** — îi pomenește în grup pe membrii activi care n-au răspuns la sondajul
  de mâine, cu confirmare.
- **Trimite rezumatul acum** — doar la admini, în privat, fără confirmare.

Cât o comandă așteaptă, butonul ei e blocat („… e în așteptare…"). Sondajul și reminderul sînt
refuzate când antrenamentul de mâine e anulat.

### Mesaj în grup

Text liber, cu mențiuni: alege un membru din listă și în text apare „@Nume", care în Telegram devine
o mențiune care îl anunță. Limita Telegram (4096 de caractere, cu tot cu mențiuni) se verifică
înainte; trimiterea cere confirmare.

### Ultimele comenzi

Ultimele 30 de comenzi, cu ora (Chișinău) și starea: în așteptare, făcută sau eșuată, cu motivul
eșecului. Cele despre un antrenament spun și ziua („Antrenament mutat — Joi, 8 oct"), iar cele date
din Telegram spun cine („din Telegram, Vlad").

---

## Din Telegram

Organizatorii conduc ziua de antrenament din **conversația privată cu botul**, fără `/admin`. În grup
nu se scrie nicio comandă; acolo apar doar rezultatele.

**Cine poate.** Doar conturile de Telegram din lista organizatorilor (variabila
`TELEGRAM_ADMIN_CHAT_IDS` a serviciului de pe Railway, aceeași care primește rezumatul de
dimineață). Oricine altcineva care scrie comenzile e ignorat. Un organizator nou intră în listă,
apoi apasă `/start` în chatul cu botul ca să-i apară meniul de comenzi.

**Cardul.** `/antrenament` arată antrenamentul următor (ziua, ora, locul, dacă e anulat, câți vin,
câți nu, câți n-au răspuns), cu butoanele **Cine vine**, **Anulează** (sau **Reactivează**),
**Mută**, **Extra**, **Sondaj** și **Reamintește**. Butoanele întreabă ce lipsește (motivul, ora,
locul, ziua) și arată la sfârșit ce se va întâmpla.

**Scurtăturile** fac același lucru, mai repede; ce scrii după comandă sare peste întrebări:

| Scrii | Face |
|---|---|
| `/maine` · `/maine joi` | Cine vine, cine nu, cine n-a răspuns |
| `/anuleaza ploaie` · `/anuleaza joi ploaie` | Anulează, cu motivul în anunț |
| `/reactiveaza` · `/reactiveaza joi` | Reactivează un antrenament anulat |
| `/muta 07:30` · `/muta joi 07:30 Parcul Valea Morilor` | Mută ora, locul sau amândouă |
| `/extra sâmbătă 08:00` · `/extra 15.10 07:00 Parcul X` | Adaugă un antrenament și trimite imediat sondajul |
| `/sondaj` · `/reaminteste` | Ca butoanele „Acum" din admin, pentru antrenamentul următor |
| `/ajutor` | Lista comenzilor |

Zilele se scriu `azi`, `mâine`, numele zilei (cu sau fără diacritice) sau `15.10` / `15 oct`; ora
`7:30` sau `07.30`.

**Previzualizarea și „Confirmă".** Orice schimbare îți arată întâi ce se întâmplă și pe cine
pomenește, și pleacă abia după **Confirmă**; **Renunță** nu schimbă nimic. O previzualizare
neconfirmată expiră după 15 minute (și la un deploy al botului): apasă din nou. Dacă între timp
celălalt organizator a schimbat ceva, primești previzualizarea nouă în loc de acțiune.

**Ce vede grupul.**

- **Anulare** după sondaj: sondajul devine „ANULAT", fără butoane, iar anunțul îi pomenește pe cei
  care au spus „Vin". Voturile pe un antrenament anulat nu mai sînt primite, nici dintr-o copie
  mai veche a sondajului. Înainte de sondaj: nimic, iar sondajul nu mai pleacă.
- **Reactivare** după sondaj: sondajul își recapătă butoanele și voturile, iar anunțul îi pomenește
  pe cei care votaseră „Vin".
- **Mutare**: voturile rămân, sondajul arată noua oră și noul loc, iar anunțul îi pomenește pe cei
  care au spus „Vin" („dacă nu mai puteți, apăsați ❌"). Înainte de sondaj: nimic; sondajul pleacă
  la ora lui, cu datele noi.
- **Extra**: sondajul pleacă imediat. Nu se poate pune un extra într-o zi care are deja antrenament;
  botul îți propune Mută sau Reactivează.

**Rezumatul de la 06:00** are butoanele **Cine vine**, **Anulează** și **Mută** pentru antrenamentul
zilei (sau **Reactivează**, dacă e anulat): o anulare pe ploaie e o apăsare.

Dacă Telegram refuză o postare, botul îți spune în privat ce n-a mers. Antrenamentul rămâne cum l-ai
schimbat, iar comanda apare „eșuată" în „Ultimele comenzi" și pe ecranul **Acum**.

---

## Când ceva nu merge

| Vezi | Înseamnă | Ce faci |
|---|---|---|
| „Botul nu răspunde" | Botul nu rulează | Railway → serviciul `bot` → jurnale; redeploy. Pașii și întoarcerea: `bot/README.md` |
| O scoatere eșuată cu „not enough rights" | Botul nu e admin în grupul de Telegram | Fă botul admin în grup, apoi **Reîncearcă scoaterea** |
| Toast „Nu știm dacă a ajuns" | Legătura cu serverul s-a rupt la scriere | Verifică pe ecran sau în „Ultimele comenzi" **înainte** să reîncerci, ca o comandă să nu plece de două ori |
| Refuz „Antrenamentul de mâine e anulat" | Ai cerut sondaj sau reminder pentru o zi anulată | Reactivează ziua din „Prezențe", dacă chiar e antrenament |
| Cardul spune după ora sondajului că acesta n-a plecat | Botul n-a trimis sondajul programat | Verifică starea botului; la nevoie, **Trimite sondajul acum** |
| Ți-a dispărut o setare salvată | Celălalt organizator a salvat după tine | Salvează din nou; ultima salvare câștigă |

---

## Ce nu face (încă)

- **Semnalul de viață al botului** (că rulează, nu doar că nimic nu e blocat): încă nu există.
- **Mutarea și antrenamentul extra din `/admin`**: doar din Telegram; `/admin` le arată în „Prezențe".
- **Două antrenamente în aceeași zi**: nu se poate.
- **Plățile** nu au ecran și nici export. Rândurile vechi rămân neatinse în bază.
- **Ștergerea definitivă a unui membru** nu există, intenționat (vezi mai sus).
- **Membrii grupului și participanții la edițiile Run + Lift** sînt liste separate.

---

## Pentru cine schimbă codul

- Fluxurile, funcțiile din bază și unde stă codul: **`docs/FLUXURI.md`**, secțiunea 4.11.
- Botul ca serviciu (deploy, Railway, întoarcere, token nou): **`bot/README.md`**.
- Migrările `sala_01`–`sala_04` și granița cu `public`: **`MIGRATIONS.md`**.

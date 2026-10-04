# Ghid: grupul din parc, din `/admin`

Grupul de antrenament din parc — sondajul „vii mâine?" din Telegram, cine vine, membrii și botul —
se conduce din adminul Run + Lift, grupul **„Grupul din parc"** din meniu. Fiecare organizator
intră cu contul lui și vede tot, inclusiv ecranele edițiilor.

> **Datele sînt cele de până acum.** Ecranele citesc și scriu direct tabelele pe care le folosea
> gym-app (parkgym.fit) și pe care le scrie botul. Nimic nu s-a copiat sau mutat, deci o prezență
> marcată în gym-app apare și aici, și invers.
>
> **Starea de azi (3 octombrie 2026).** Ecranele sînt gata. Botul rulează încă din repo-ul vechi,
> până la mutarea pe Railway (pasul U9 din plan). Textul editabil al sondajului intră în sondaje
> abia după actualizarea botului (U10). gym-app rămâne pornit o săptămână ca rezervă, apoi se
> oprește (U11). Planul întreg: `docs/plans/2026-10-03-1107-feat-botul-si-prezentele-in-admin-plan.md`.

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
  deja, anularea **nu anunță pe nimeni** — trimite un mesaj din „Botul de Telegram".
- **Anulează o zi** anulează din timp o zi pentru care sondajul n-a plecat încă: botul nu va
  trimite sondaj pentru ea. Rândul nou ia ora și locul din setările botului.
- **Zile anulate** le arată pe toate cele viitoare, fiecare cu **Reactivează**.

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
„nimic blocat", nu „sigur rulează". Semnalul de viață vine odată cu actualizarea botului (U10).

### Oprește / Pornește botul

Se aplică pe loc și nu atinge orarul. Nu e o setare de salvat: formularul de mai jos nu-l poate
schimba înapoi.

### Setările

- **Sondajul:** zilele și ora. Botul întreabă „vii mâine?", deci sondajul pleacă **în ziua de
  dinaintea** antrenamentului. Plus ora antrenamentului și locul, care apar în sondaj.
- **Textul sondajului:** titlul (până la 80 de caractere) și cele două butoane (până la 32), cu
  previzualizarea mesajului așa cum apare în Telegram. Gol = textul de azi.
  **Atenție:** botul de acum trimite încă textul fix; cel de aici intră în sondaj abia după
  actualizarea botului (U10). De atunci, o schimbare ajunge la sondajul următor, iar unul deja în
  grup își păstrează textul.
- **Rezumatul de dimineață** (în privat, la admini): zilele și ora.
- **Reminderul automat** pleacă în grup cu două ore înainte de antrenament, doar dacă au confirmat
  mai puțini decât **pragul**.

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

Ultimele 30 de comenzi din admin, cu ora (Chișinău) și starea: în așteptare, făcută sau eșuată, cu
motivul eșecului.

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

- **Textul editabil al sondajului** ajunge în sondaje abia după actualizarea botului (U10).
- **Semnalul de viață al botului** (că rulează, nu doar că nimic nu e blocat): tot U10.
- **Plățile** nu au ecran și nici export. Rândurile vechi rămân neatinse în bază.
- **Ștergerea definitivă a unui membru** nu există, intenționat (vezi mai sus).
- **Membrii grupului și participanții la edițiile Run + Lift** sînt liste separate.

---

## Pentru cine schimbă codul

- Fluxurile, funcțiile din bază și unde stă codul: **`docs/FLUXURI.md`**, secțiunea 4.11.
- Botul ca serviciu (deploy, Railway, întoarcere, token nou): **`bot/README.md`**.
- Migrările `sala_01`–`sala_04` și granița cu `public`: **`MIGRATIONS.md`**.

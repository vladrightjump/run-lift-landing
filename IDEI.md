# IDEI — produs + admin (Run + Lift)

Idei de dezvoltare, cu descriere și temei. Diferă de `BACKLOG.md`: acolo stau lucrurile
decise și de făcut; aici stau direcțiile alese, cu argumentul din cod care le susține și cu
compromisul pe care îl cer. Fiecare are un temei verificat în repo, nu o presupunere.

Sursă: rulare de ideație din 6 septembrie 2026 — 41 de idei brute din șase lentile, comasate
în 15 candidate, filtrate de un verificator care a citit codul, rămase 7. Documentul complet,
cu diagrame: [`docs/ideation/2026-09-06-produs-si-admin-ideation.html`](docs/ideation/2026-09-06-produs-si-admin-ideation.html).

Ultima actualizare: 6 septembrie 2026.

---

## 1. Reminderele care chiar pleacă

- [ ] **Pornește ceasul.** `maybe_send_reminder()` e construit complet și corect — idempotent pe
      (ediție, avans), cu fereastră de declanșare `[scadență, scadență + 2h]`, alimentat dintr-un
      `reminder_schedule` editabil din admin. Nu i-a lipsit niciodată decât ceasul.
      **Decizia de luat:** instalezi `pg_cron` în proiectul Supabase, sau muți declanșatorul pe
      Vercel Cron (Vercel e deja ținta de deploy), sau pe o acțiune GitHub.
- [ ] **Nu mai afirma „programat”** pentru ce nu rulează. Starea afișată să se deducă din jurnalul
      de livrare, nu din intenție.
- [ ] **Întrebarea binară la 72 de ore: „vin” / „nu mai vin”.** Cel mai valoros conținut de pus pe
      ceas odată pornit. Renunțarea e azi un act pur altruist, fără niciun moment în care sistemul
      să întrebe. `decline_spot` și trigger-ul de auto-promovare sunt deja livrate — asta e doar un
      șablon nou plus un rând de program.
- [ ] Aceeași mașinărie livrează apoi și emailul de după eveniment și reînscrierea prioritară,
      fără infrastructură nouă.

**Temei (verificat):** `MIGRATIONS.md`, notă datată 4 sept. 2026 — pg_cron `installed_version: null`,
„*maybe_send_reminder() n-a rulat niciodată*”, nicio cheie `once_reminder_*` scrisă vreodată în
`app_config`. În paralel, `GrupRemindere.tsx` afișează „N active · următorul în X zile”.

**De ce contează:** nu e o funcționalitate lipsă, e una pe care o crezi pornită și care nu e.
Interfața afirmă activ o stare falsă. Toate reminderele trimise până acum au fost difuzări manuale.

**Compromis:** `pg_cron` se instalează într-un proiect Supabase **partajat** cu gym-app și cu botul
de Telegram — nu e o decizie izolată. Vercel Cron evită asta, dar mută logica de scadență în afara
bazei, unde garanțiile de idempotență sunt deja scrise în SQL. Și dacă pornești ceasul fără să
scoți întâi difuzarea manuală, primul risc real e ca oamenii să primească reminderul de două ori.

---

## 2. Prezența, timpul și persoana

- [ ] **Trei coloane pe `registrations`:** `prezent`, `numar`, `timp_final`. Transformă exportul CSV
      dintr-o listă statică într-un catalog de check-in și dau paginii `/rezultate` ce să afișeze.
- [ ] **O vedere `persoane`,** cheiată pe emailul normalizat (telefonul ca rezervă). Un simplu
      `group by` peste rânduri care există deja — nicio colectare nouă de date. De aici încolo
      sistemul știe că omul din fața ta e la a treia ediție.
- [ ] **Cine apasă butonul — bifurcație de decis:** operatorul bifează 30 de nume pe telefon exact
      în minutele în care n-are niciun minut, **sau** fiecare participant deschide linkul lui la
      sosire și operatorul se uită doar la un contor. A doua variantă costă zero efort de operator
      și refolosește tiparul de token care există deja de două ori în cod.

**Temei (verificat):** `src/lib/adminApi.ts:12-31` — `AdminRegistration` n-are niciun câmp de
prezență, număr sau timp (are un `echipa` nefolosit). Exportul CSV e `Nr, Nume, Telefon, Email,
Data înscrierii`. Nu există rută `/rezultate` în `src/main.tsx`.
`docs/plans/2026-08-21-faze-zi-eveniment.md:158-165` a scos explicit rezultatele din scop.
Singurele date între ediții care există azi sunt agregate — numărători, niciodată identități.

**De ce contează:** patru elemente din `BACKLOG.md` — pagina de rezultate, emailul de după
eveniment, istoricul personal și reînscrierea prioritară — sunt toate blocate pe aceleași coloane
lipsă. Aterizarea schemei o dată, chiar înainte de orice interfață, le deblochează independent.
`BACKLOG.md` numește el însuși `/rezultate` „motivul nr. 1 de revenire la HYROX”.

**Compromis:** cheia pe email normalizat greșește în ambele sensuri — doi frați cu un singur email
devin o persoană, iar cine își schimbă emailul între ediții devine două. La 30 de locuri poți
corecta manual, dar regula trebuie scrisă undeva, nu dedusă. Și o schemă adăugată acum și lăsată
necompletată la prima ediție e mai rea decât una absentă.

---

## 3. Un link de stare pentru fiecare înscris

- [ ] **Al treilea token.** Sistemul modelează deja participantul ca pe cineva care poate acționa
      asupra propriei înscrieri, dar numai în negativ: `token_unsub` oprește emailurile,
      `token_renunt` eliberează locul. Un token în direcția pozitivă dă o pagină cu: confirmat sau
      pe listă **și pe ce poziție**, ora de check-in, „adaugă în calendar”, corectarea unui telefon
      sau email tastat greșit.
- [ ] Se refolosește ad-litteram garda anti-scanere din `Renunt.tsx:7-19` — nicio scriere nu se
      declanșează pe GET.
- [ ] **Felia minimă, dacă vrei rezultat înainte de pagină:** atașează `.ics`-ul la emailul de
      promovare de pe lista de așteptare.

**Temei (verificat):** `registrationStates.tsx:250-253` — butoanele de calendar și distribuire sunt
închise pentru lista de așteptare („n-ai ce pune în calendar până nu se eliberează un loc”), corect
ca principiu — dar momentul în care devine adevărat e chiar emailul de promovare, iar
`send-email/index.ts:407-449` (`mode="promoted"`) nu duce niciun atașament. Promovarea automată
trimite „best-effort” prin `pg_net` și un eșec nu blochează ștergerea
(`supabase-migration-waitlist-autopromote.sql:95-107`) — deci cineva poate fi promovat în tăcere.
Confirmarea inițială e „fire-and-forget” (`useRegistration.ts:206-207`): un email tastat greșit e
azi invizibil și nerecuperabil.

**De ce contează:** o singură pagină închide patru găuri deodată — promovarea tăcută, lipsa
calendarului pentru cei promovați, imposibilitatea de a-ți corecta datele, invizibilitatea poziției
pe listă. Și deviază canalul de suport care e azi „îi scrii organizatorului pe WhatsApp”.

**Compromis:** trei tokenuri pe înscriere e o suprafață reală de întreținut, și fiecare e un URL
care circulă prin inboxuri la nesfârșit, inclusiv după ce ediția s-a încheiat. Dacă pagina capătă
acțiuni de scriere, ai nevoie de expirare. Varianta doar-citire în v1 evită asta, dar atunci nu
rezolvă corectarea emailului, care e jumătate din motiv.

---

## 4. Regulamentul, politica de confidențialitate și faptele pe care pagina nu le spune

- [ ] **`/regulament`** — pentru că oamenii bifează azi că îl acceptă.
- [ ] **Politică de confidențialitate** — se colectează nume, telefon și dată de naștere, de la
      participanți care pot avea 14 ani.
- [ ] **Fișa cu fapte:** preț, ce primești, cât durează, unde parchezi, dacă pot veni spectatori,
      ce se întâmplă dacă plouă. Niciunul nu apare azi nicăieri pe pagină.
- [ ] **Rata de finalizare publicată.** Modelul din camerele de evadare: felul în care vinzi o
      experiență fizică necunoscută unor străini e o fișă standardizată al cărei element portant e
      rata de reușită publicată. Numărul care sună a descurajare e cel mai puternic instrument de
      conversie — schimbă întrebarea din „o să mă fac de râs?” într-o așteptare calibrată.
      Depinde de idea 2: rata nu poate exista până nu înregistrezi cine a terminat.
- [ ] **De corectat la pachet:** `VenueSection.tsx:69` spune „vino cu 30 de minute înainte”, iar
      `edition.ts` setează `checkinFrom: '06:45'` pentru un start la 07:00 — adică 15. Cineva ajunge
      târziu la o cursă care începe la fix din cauza asta.

**Temei (verificat):** `registrationStates.tsx:30-31` — `TEXT_ACORD` îi pune să confirme că sunt
„apt din punct de vedere medical pentru efort fizic intens” și că acceptă „regulamentul
evenimentului”; nu există nicio rută `/regulament` în `src/main.tsx`. Caseta de acord nu poate
însemna nimic: nimeni nu poate atesta că e apt pentru un efort a cărui formă nu i-a fost arătată.

**De ce contează:** singura idee din set cu expunere legală, nu doar cu cost de oportunitate — și
purtată de un operator singur, personal. În același timp e și cea mai mare gaură de conversie.

**Compromis:** un regulament scris de mână va devia de la configul ediției exact cum a deviat deja
ora de check-in — dar generarea lui din `event_config` presupune modelarea unor câmpuri care azi nu
există (politica de anulare, vârsta minimă). Textul legal e singurul lucru din listă care cere o
decizie omenească despre ce te angajezi.

---

## 5. Ediție nouă în 60 de secunde

- [ ] **Calea rapidă devine calea principală:** un dialog cu data, ora și numărul de locuri, tot
      restul moștenit din ediția publicată, și **fiecare reper recalculat față de noul start**, nu
      copiat. Formularul complet rămâne ca „editează tot”, nu ca ușă de intrare.
- [ ] **Un rezumat al ce s-a moștenit** — altfel muți capcana de la `launchAt` la orice alt câmp.

**Temei (verificat):** `src/admin/reperele.ts:14-18`, cuvânt cu cuvânt: „Ciorna ediției următoare
pornește de la cea publicată […] deci moștenește momentul de anunț al ediției TRECUTE — un moment
deja consumat. Nimic nu-l semnala: validarea nu-l leagă de nimic, iar consecința […] se descoperă
abia pe site.” Funcția pură `mutaReperele` există deja și mută întregul grup odată cu startul.
`AdminEventTab.tsx` are exact 855 de linii.

**De ce contează:** cel mai prost bug cunoscut din configurarea unei ediții e un bug de *copiere*,
iar funcția care îl repară e deja scrisă. Făcând din calea rapidă comportamentul implicit, bug-ul
devine structural inaccesibil, nu doar documentat într-un comentariu. Cea mai ieftină idee din set
raportat la ce elimină.

**Compromis:** moștenirea tăcută rămâne moștenire tăcută. Dacă locația sau prețul s-au schimbat și
dialogul nu le arată, le vei publica greșit cu și mai multă încredere decât azi, fiindcă ai avut
senzația că ai verificat.

---

## 6. Niciun email fără previzualizare reală

- [ ] **Expune `renderHtml()` ca endpoint de previzualizare.** E deja centralizată și toate cele
      patru moduri de trimitere trec prin ea — o expui o dată și acoperi permanent fiecare șablon
      existent și viitor din `email_templates`.
- [ ] Previzualizarea să fie **HTML-ul chiar așa cum pleacă**, cu variabilele completate pentru un
      destinatar real — nu textul brut cu `{prenume}` în el.
- [ ] **Reîncercare pe moduri.** Azi merge doar pentru trimiterile în mod `admin`. Celelalte patru
      sunt excluse din motive bune, scrise în cod: o reîncercare oarbă ar sări peste filtrele de
      dezabonare sau ar omite linkuri pe care modul original le adaugă. Soluția nu e reîncercarea
      oarbă, ci rejucarea prin funcția reală a fiecărui mod.

**Temei (verificat):** `supabase/functions/send-email/index.ts` definește `renderHtml()` ca funcție
unică folosită de confirm / promoted / info / broadcast. `AdminDeliveryTab.tsx:87-99` restrânge
reîncercarea la modul `admin`, cu motivul în comentariu: celelalte „se re-declanșează din fluxul
lor, nu de aici”. Nicio căutare după `dry-run` sau `preview.*email` nu returnează ceva în repo.

**De ce contează:** un operator singur n-are a doua pereche de ochi. Jurnalul de livrare
demonstrează deja că poate *afla* ce a eșuat — matricea de acoperire e muncă bună, deja în loc —
dar nu poate repara trei din patru tipuri de eșec din același ecran.

**Compromis:** o previzualizare de *text* există deja; gaura reală e mai îngustă decât pare — HTML-ul
randat nu e arătat. Asta reduce câștigul fără să-l anuleze, fiindcă exact acolo se strică lucrurile
(linkuri rupte, variabile necompletate). O fereastră de anulare cu numărătoare inversă, tentantă pe
hârtie, e mașinărie grea pentru trimiteri către 30 de destinatari deja păzite de o confirmare cu
numărătoare și de o gardă anti-dublare.

---

## 7. Erorile ajung la operator

- [ ] **Trimite semnalul undeva.** `monitoring.ts` prinde deja erorile de client și violările de CSP,
      cu ediția și URL-ul atașate — și le scrie în consola browserului vizitatorului, unde nu le vede
      nimeni niciodată.
- [ ] Cel mai ieftin drum trece prin infrastructura Resend deja desfășurată: un email către operator
      **la anomalii** — un email de confirmare eșuat, o promovare de pe listă, locurile epuizate.
- [ ] **Îngust, nu larg:** doar anomaliile de flux, nu toate erorile de JS.

**Temei (verificat):** `src/lib/monitoring.ts:33-50` — `logClientError` loghează ediția, url-ul și
marca de timp în `console`; `:60-70` ascultă `securitypolicyviolation` și loghează `blockedURI` cu
sugestia „connect-src pare desincronizat”. Nimic nu părăsește clientul.

**De ce contează:** un produs cu un singur operator, în care toată observabilitatea stă în spatele
unui login vizitat ocazional, n-are în practică observabilitate. Semnalul e deja capturat și
structurat — lipsește doar ultimul pas.

**Compromis:** un rezumat zilnic pe care nu-l citește nimeni e mai rău decât nimic, iar pragul de
escaladare e singurul lucru care decide valoarea ideii — mai greu de nimerit decât de construit.
Erorile de client vin și de la extensii de browser și de la roboți; fără filtrare îl antrenezi pe
operator să ignore exact canalul pe care l-ai construit.

---

## Idei respinse — păstrate ca să nu fie repropuse

Trei dintre ele au picat pentru că **premisa lor nu mai e adevărată**: codul a avansat dincolo de ce
mai descrie `BACKLOG.md`. Merită citite ca informație în sine.

| Idee | Motivul respingerii |
|---|---|
| Renunță la ștergere — stare + motiv, o primitivă reversibilă | **Premisă demontată.** Ștergerea unei înscrieri e deja soft-delete cu undo de fidelitate completă (`deleteRegistration`/`undeleteRegistration`, migrarea `runlift_soft_delete_registrations`). Ce rămâne e paritatea pentru lista de așteptare — vezi mai jos. |
| Publicare atomică într-un singur RPC | **Premisă demontată.** Comentariul din `AdminEventTab.tsx:301-304` continuă dincolo de fraza despre tranzacție și argumentează că starea parțială e „o stare din care poți relua”. Autorul a adjudecat deja întrebarea. |
| Numărul de telefon: folosește-l sau scoate-l | **Premisă demontată.** `telefon` are deja linkuri `tel:` în patru vederi de admin și e variabilă activă de șablon. Canalul de reparație „lipsă” există. |
| Consola ca linie de timp (caietul de regie) | Faptele sunt corecte, dar e absorbită de ideile 1 și 5 la o fracțiune din cost — nu trebuie rearhitecturat formularul ca să dispară „programat”-ul mincinos și capcana `launchAt`. |
| Landing care știe că te-ai mai înscris (precompletare) | Argument pur inferențial, fără nicio durere citată din cod; infrastructură de token semnat, disproporționată pentru un eveniment ocazional de 30 de locuri. |
| Ritm, nu stoc — semnalul de raritate („11 înscrieri în ultimele 48h”) | Cere și o modificare de RPC (`public_stats` nu expune `created_at`), pentru un câștig marginal la o raritate deja autentică la 30 de locuri. |
| Check-in cu scanare de coduri QR | Prea scump raportat la valoare la scara asta: 30 de oameni nu justifică echipament nou când un link personal atinge același semnal. |
| Regulament versionat, editabil din DB, cu ștampilă de consimțământ | Restrâns în idea 4. Mașinăria de versionare e disproporționată pentru un document editat de câteva ori pe an. |

### Rămășițe mici, adevărate

- [ ] **Paritate de undo pentru lista de așteptare.** `AdminDashboard.tsx:368-399` (ștergere înscriere)
      are toast cu `undo`; `:355-365` (ștergere din listă) n-are. Tiparul există o funcție mai sus.
      Presupune un RPC `undeleteWaitlist` — nu e doar UI.
- [ ] **Dezactivează butoanele în zbor.** Butoanele de editare/ștergere se randează fără `disabled`
      cât timp acțiunea e în curs, deci dublu-clicurile ajung.

---

## Corecții la `BACKLOG.md`

Verificarea a găsit `BACKLOG.md` depășit în câteva locuri. De aliniat când se atinge fișierul:

- `durationHours: 1` **nu** e nefolosit — alimentează `EVENT_END_DATE`, citit de `stareCurenta.ts`,
  `usePagePhase`, `useRegistration` și `calendar.ts`.
- „Adaugă în calendar (.ics / Google)” e **livrat**: `lib/calendar.ts` generează `.ics` și e legat în
  `ActiuniSucces` — doar că nu pentru lista de așteptare (vezi idea 3).
- „Share după înscriere” e **livrat** în același `ActiuniSucces`, cu aceeași limitare.
- „Reminder automat (cron programat) în loc de broadcast manual” e mai rău decât „de făcut”:
  programul există și e afișat ca activ, dar ceasul nu există (vezi idea 1).

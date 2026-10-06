# Run + Lift — analiza adminului și direcții de redesign

Data: 4 octombrie 2026. Branch: `docs/redesign-run-lift`.

Versiunea analizată: commit [`8bb98b8`](https://github.com/vladrightjump/run-lift-landing/tree/8bb98b8). Referințele la cod și măsurătorile descriu această versiune. Modificările ulterioare din `main`, inclusiv cele ale ecranelor grupului, nu au fost reevaluate; constatările trebuie reverificate înainte de implementare.

**Stare:** audit finalizat; explorarea continuă cu stilul vizual și componente adaptate fiecărui ecran. A, B și C nu au fost aprobate. Acesta este un document de analiză, nu un plan de implementare aprobat.

## 1. Obiectivul

Organizatorul trebuie să găsească rapid următoarea activitate, oamenii implicați și acțiunea necesară. Prioritatea este folosirea comodă de pe telefon la antrenament și gestionarea evenimentelor cu o echipă mică.

Context declarat de proprietar: 12–20 persoane pe sesiune, aproximativ 90% plătesc, echipament existent de 8 wallballs, 6 sandbags și aproximativ 10 kettlebells; investiție avută în vedere de aproximativ 2.000 EUR și posibilă sală HYROX în 2027. Acestea explică nevoia de administrare simplă; nu sunt indicatori calculați din baza de date.

Ipoteza de lucru: antrenamentul recurent este o sarcină suficient de frecventă pentru a avea prioritate în pagina de început. Frecvența exactă a operațiunilor și dificultățile relatate direct de organizator încă trebuie validate.

## 2. Ce am verificat

- Registrul tuturor celor 14 ecrane, cadrul comun, selecția ediției și rutele cu hash.
- Codul pentru participanți, livrare email, editarea evenimentului, programul public, răspunsurile grupului și Telegram.
- Previzualizarea locală cu date demonstrative: cinci ecrane pe desktop și telefon, plus dialogul de prezență și editorul evenimentului.
- Două evaluări independente: revizuire vizuală și de fluxuri, respectiv detector Impeccable și măsurători în browser.
- Reproduceri fără salvare: pierderea textului la navigare și transferul incomplet al contextului unei persoane către livrarea emailurilor.

Browserul a blocat cererile externe. Nu au fost trimise mesaje, salvate date sau executate comenzi reale. Cifrele și persoanele din previzualizare sunt fictive. Comportamentul backendului în producție, livrarea reală, fonturile încărcate în producție și utilizarea cu cititor de ecran nu au fost validate prin acest audit.

### Instrumentele instalate și aplicate

Instalările sunt locale mediului de lucru; pachetele și executabilele instrumentelor nu fac parte din această propunere de documentație.

- Impeccable, instalat pentru Codex la nivelul acestui proiect, fără hooks. CLI 4.1.0 a necesitat Node compatibil; instalarea a fost rulată prin Node 24.
- Taste: `design-taste-frontend` și `redesign-existing-projects`, instalate pentru Codex în `.agents/skills/`.
- `compound-engineering:ce-brainstorm`: structurarea opțiunilor și schițe orientative în browser.

Taste își limitează stilul principal la pagini de prezentare, nu la dashboarduri și tabele. Pentru admin am aplicat auditul proiectului existent și principiile de lizibilitate, ierarhie și feedback; nu propunem transferarea stilului unui landing page peste interfața operațională.

Scanarea statică Impeccable pe `src/admin` a întors zero constatări. CSS-ul comun este în afara acelui director; acest rezultat nu infirmă problemele măsurate în browser. Detectorul în browser a raportat 47 de observații repetate între ecrane și dimensiuni, nu 47 de defecte distincte. Am exclus din prioritizare contrastul butoanelor dezactivate, etichetele detectorului care se detectau pe ele însele și preferințele estetice fără efect demonstrat asupra utilizării.

## 3. Inventarul funcțional și propunerea de organizare B

Varianta B are patru intrări: **Acum, Antrenamente, Evenimente, Site**. Tabelul este o propunere de amplasare, nu o schimbare deja realizată.

| Ecran actual | Funcția existentă | Destinație propusă |
| --- | --- | --- |
| Desfășurarea ediției | Reperele evenimentului și scurtături | Acum: rezumat; Evenimente → Rezumat: desfășurarea completă |
| Participanți | Înscriși, așteptare, editare, prezență, export | Evenimente → Participanți |
| Abonați la anunț | Persoane care cer anunțul lansării | Evenimente → Abonați la lansare |
| Trimite emailuri | Mesaje către audiențele evenimentului | Evenimente → Mesaje → Compune |
| Livrare | Istoric, acoperire și reluarea trimiterilor | Evenimente → Mesaje → Istoric și probleme |
| Șabloane | Texte reutilizabile pentru emailuri | Evenimente → Mesaje → Șabloane comune, cu etichetă explicită că nu aparțin doar ediției selectate |
| Evenimentul | Date, capacitate, conținut, ciornă, publicare | Evenimente → Detalii și publicare |
| Clipuri | Ordine, legende, vizibilitate | Site → Clipuri |
| Antrenamente | Conținutul programului săptămânal public | Site → Program pe site |
| Coming Soon | Pagina dinaintea lansării | Site → Pagina de prelansare |
| Prezențe grup | Răspunsuri la sondaje, sesiuni și anulări | Antrenamente → Următorul și Istoric |
| Membrii grupului | Conturi, asociere, status și acces Telegram | Antrenamente → Membri |
| Analiza prezențelor | Analiza participării declarate | Antrenamente → Istoric → Analiză răspunsuri |
| Botul de Telegram | Configurație, comenzi, mesaj manual, jurnal | Antrenamente → Mesaje; Antrenamente → Setări Telegram |

**Reguli de context:**

- Selectorul ediției se afișează numai unde datele depind de ediție. Nu filtrează grupul recurent, programul public sau clipurile.
- Șabloanele comune își păstrează domeniul global și îl explică vizibil, chiar dacă sunt accesate din zona Evenimente.
- Edițiile arhivate își păstrează restricțiile existente de modificare.
- Participanții evenimentelor și membrii Telegram rămân identități distincte. Nu presupunem că există deja un profil unic de client.
- Mesajele sunt accesate în contextul audienței: email în Evenimente, Telegram în Antrenamente. Nu introducem un inbox omnichannel.

## 4. Probleme verificate și efectul lor

| Prioritate | Constatare | Dovadă | Efect și direcție |
| --- | --- | --- | --- |
| Mare | Evenimentul domină pagina de început; operațiunile grupului recurent apar mai jos | `src/admin/EcranPornire.tsx`; inspectare desktop și mobil | Afișăm următoarea activitate și excepțiile care cer intervenție; reperele complete ale ediției rămân în contextul evenimentului |
| Mare | Lista participanților pe telefon este împinsă sub statistici | La 390 px, cele cinci statistici ocupă circa 526 px; primul rând începe aproximativ la y=1298 în fixture | Rezumat compact, apoi căutare și listă |
| Mare | Tabelul de 1000 px stă într-un container de circa 348 px | `src/index.css:817`, `src/index.css:909`; măsurat în browser | Pe telefon: nume, stare și acțiune principală vizibile împreună; detaliile secundare se deschid la cerere |
| Mare | Acțiunile rândului se suprapun peste starea ultimului email pe desktop | `src/admin/AdminDashboard.tsx:829`; suprapunere vizuală și geometrică | Dimensionare corectă a coloanelor și reducerea acțiunilor simultan vizibile |
| Mare | Prezența unui participant la eveniment nu este vizibilă direct în listă | `src/admin/AdminDashboard.tsx`, `src/admin/DialogPrezenta.tsx` | Stare vizibilă și control direct pentru prezență; corectarea rămâne posibilă |
| Mare | Răspunsurile istorice la sondaj sunt prezentate ca participare efectivă | `src/admin/sala/EcranPrezente.tsx` | Etichete precise: participare declarată. Prezența verificată separat necesită o decizie funcțională nouă |
| Mare | Textul nesalvat din editorul programului se pierde la schimbarea ecranului | Reproducere locală: editare titlu → Acum → revenire → titlu gol; `src/admin/AdminAntrenamentTab.tsx`, montare în `AdminDashboard.tsx:702` | Același contract de protecție a ciornelor pentru toate editoarele; protecția existentă la schimbarea săptămânii nu acoperă această ieșire |
| Mare | Mesajul Telegram netrimis se pierde la navigare | Reproducere locală: text introdus → Prezențe → Telegram → text gol; `src/admin/sala/EcranBot.tsx` | Păstrarea ciornei cu audiență și context, fără trimitere automată |
| Mare | Dialogul de prezență nu primește focus și nu răspunde la Escape | Browser și `src/admin/DialogPrezenta.tsx` | Refolosirea comportamentului dialogului comun existent |
| Medie | Din ultimul email al unei persoane se deschide livrarea generală, fără filtru | `src/admin/AdminDashboard.tsx:859`; căutare goală după navigare | Deschidere filtrată pentru persoana și ediția de origine |
| Medie | Mesajul Telegram este sub formularul lung de configurare | Titlul compunerii este aproximativ la y=2179 pe telefon în fixture | Separarea Mesaje de Setări Telegram |
| Medie | Cadrul fix ocupă aproximativ 209 px pe telefon | `src/admin/AdminCadru.tsx`; măsurat la 390 px | Antet compact: titlu și navigație; context și alerte relevante în pagină |
| Medie | Unele ținte tactile sunt mici și textele auxiliare au contrast redus | Controale de răspuns de circa 34 px; unele descrieri ~2,75:1 | Controale frecvente de circa 44 px, contrast lizibil, spațiu între acțiuni |

Valorile geometrice descriu previzualizarea locală, nu toate dispozitivele. Prioritățile sunt judecăți de expert, nu rezultate ale unui studiu cu utilizatori.

## 5. Ce funcționează și trebuie păstrat

- Navigarea cu adrese directe și Back, selectorul grupat și accesul către conținutul principal din tastatură.
- Distincția ciornă/publicat, validarea, previzualizarea și confirmarea publicării evenimentului.
- Istoricul versiunilor și posibilitatea de restaurare acolo unde există.
- Căutarea participanților, arhivele, lista de așteptare și regulile existente pentru promovare.
- Diferențierea comenzilor Telegram în așteptare, finalizate și eșuate.
- Regulile de trimitere și retry care țin cont de tipul mesajului și destinatarii eligibili.
- Identitatea Run + Lift; problema principală este ierarhia informației, nu lipsa unui stil vizual.

## 6. Cele trei variante comparate

### A — Simplificarea ecranelor existente

Păstrăm selectorul și cele 14 ecrane; schimbăm ordinea paginii de început, denumirile, densitatea și legăturile dintre pagini. Este potrivită pentru un buget foarte mic sau pentru o îmbunătățire imediată cu puțină reînvățare.

Avantaj: cea mai mică schimbare de organizare. Limită: activitatea zilnică rămâne împărțită între multe destinații. Risc: corectăm aspectul fără să eliminăm suficient căutarea dintre ecrane.

### B — Zone de lucru după activitate

Acum / Antrenamente / Evenimente / Site, cu file locale pentru oameni, mesaje și configurare. Refolosește majoritatea capacităților existente și schimbă modul în care sunt găsite și conectate.

Avantaj: o activitate ține laolaltă persoanele și comunicarea. Limită: destinațiile familiare se mută; șabloanele globale trebuie marcate clar. Risc: o reorganizare fără transferul contextului ar rămâne superficială.

**Recomandare:** B, deoarece răspunde nevoii de administrare mai ușoară fără extinderea majoră cerută de o agendă nouă. A rămâne alternativa cu cel mai mic efort.

### C — Agenda activităților

Pornim de la ziua și activitatea aleasă. Oamenii, mesajele și detaliile se deschid în contextul acelei activități, similar unei agende de organizare.

Avantaj: poate scala către mai multe activități și locații. Limită: cere o agendă comună și reguli pentru tipuri diferite de activități. Risc: tratează greșit un eveniment cu ediții ca pe o sesiune recurentă sau introduce prea multă complexitate pentru operațiunea actuală. Este o alternativă de evoluție, nu o condiție pentru îmbunătățirea adminului acum.

## 7. Fluxuri propuse pentru varianta B

### Înainte de antrenament

Acum → antrenamentul următor → răspunsuri: au confirmat / nu vin / fără răspuns. Titlul arată data și locul. Organizatorul poate filtra persoanele fără răspuns fără să parcurgă lista completă.

Mesajul către grup pornește cu contextul activității vizibil. Organizatorul verifică audiența și textul înainte de trimitere. Dacă pleacă pentru a verifica o persoană, textul nu dispare. Succesul unei comenzi nu se confundă cu citirea mesajului de către membri.

### La intrarea într-un eveniment

Evenimente → ediție → Participanți → căutare sau listă. Numele și prezența apar împreună. Acțiunea principală marchează prezența; există și corectare. Numărul de concurs, timpul, contactul și ștergerea se află în detalii sau acțiuni secundare.

Acesta extinde prezentarea unei capacități deja existente pentru evenimente. Nu presupune automat prezență verificată pentru antrenamentele din parc.

### Un participant nu primește emailul

Participant → starea emailului → istoricul persoanei în ediția curentă. UI explică diferența dintre pus în coadă, acceptat de furnizor și livrat, în limita datelor disponibile. Retry se oferă numai când regulile existente permit. Revenirea păstrează filtrul și poziția listei.

### Anularea unui antrenament

Activitate → anulare → confirmare → rezultat → opțiune de pregătire a unui mesaj. Anularea și trimiterea sunt acțiuni distincte. Mesajul este editabil și se trimite explicit; eșecul trimiterii nu trebuie prezentat ca eșec al anulării.

Capacitatea mesajelor pentru date arbitrare trebuie verificată înainte de implementare: comenzile existente au reguli pentru azi/mâine. Schița nu promite suport general pentru orice dată.

### Actualizarea site-ului

Site → Program pe site sau Clipuri; Evenimente → Detalii și publicare pentru pagina ediției. Păstrăm separarea dintre salvarea ciornei și publicare, previzualizarea, validările și versiunile. Navigarea cu modificări nesalvate are același comportament pe toate suprafețele editabile.

## 8. Componente și stări

| Element | Direcție propusă |
| --- | --- |
| Navigație desktop | Patru intrări stabile, file locale, titlu clar și context vizibil |
| Navigație mobilă | Antet scurt și meniu compact; activitatea curentă rămâne identificabilă |
| Rezumat | Doar cifre utile acțiunii curente; fără duplicarea ocupării în mai multe blocuri |
| Listă participanți | Tabel semantic pe desktop; structură compactă pe telefon, cu acțiunea principală accesibilă |
| Detalii persoană | Context păstrat la deschidere/închidere; etichete explicite, acțiuni destructive secundare |
| Formulare | Grupuri coerente, spațiere, validare lângă câmp, rezumat ciornă/publicat |
| Dialoguri | Focus inițial și reținut în dialog, Escape unde este potrivit, revenirea focusului la declanșator |
| Încărcare și lipsa datelor | Încărcarea nu apare ca zero; starea goală explică următorul pas |
| Erori | Explicație în română și cale de recuperare; detaliul tehnic rămâne secundar |
| Automatizări Telegram | Etichetă despre automatizările programate, nu afirmația că întregul bot este pornit/oprit |
| Stare bot | Coada goală nu dovedește că serviciul este online; incertitudinea trebuie păstrată |

Nu alegem acum o nouă bibliotecă UI, o temă finală sau un stil de animație. Acestea nu rezolvă decizia de organizare.

## 9. Limita primei etape propuse

Prima etapă: navigație și denumiri clare; pagina Acum; liste utilizabile pe telefon; protecția ciornelor; transferul contextului la comunicare; dialoguri și stări coerente. Ordinea exactă depinde de varianta aleasă.

De decis separat: prezență efectivă pentru grupul recurent, profil unic de client, plăți și abonamente, programe digitale vândute, agendă cu mai multe locații. Planul pentru o sală în 2027 justifică păstrarea posibilității de extindere, nu construirea acum a unui sistem complet de management al sălii.

## 10. Cum evaluăm direcția

Pe un telefon, organizatorul trebuie să poată identifica următorul antrenament și persoanele fără răspuns, fără să caute în setările botului. Într-un eveniment, trebuie să găsească un participant, să-i vadă starea și să corecteze prezența fără derulare laterală. Un mesaj netrimis și o ciornă trebuie să supraviețuiască unei întreruperi prin navigare sau ieșirea trebuie protejată explicit.

Comparăm aceleași sarcini în adminul actual și în propunere: timp, navigări greșite, pierderi de context și intervenții necesare. Stabilim baza înainte să promitem reduceri procentuale. Verificăm separat tastatura și telefonul în condiții reale la antrenament.

## 11. Schițe și decizia rămasă

Au fost evaluate local schițe pentru A, B, C și un detaliu al listei de participanți pe telefon, cu date fictive și fără salvări sau trimiteri. Schițele și dovezile brute au fost păstrate temporar în mediul de lucru și nu sunt incluse în acest PR. Concluziile importante sunt consemnate în acest document; adresele serverelor locale nu sunt necesare pentru citirea lui.

Feedbackul utilizatorului după schițe: „vreau să lucrăm la stilistică și elementele acestea […] ceva mai dinamic […] putem avea diferite funcționalități pe diferite ecrane”. Aceasta mută explorarea către un prototip vizual mai finisat; nu reprezintă alegerea variantei B.

Următoarea explorare compară un spațiu sportiv întunecat axat pe sesiunea curentă, un panou luminos de organizare și o interfață compactă cu listă și detalii. Suprafețele relevante sunt antrenamentul, participanții unui eveniment și comunicarea. Componentele și densitatea diferă după sarcină, iar direcțiile trebuie judecate în browser înainte de a fi tratate drept cerințe stabilite.

După alegere, sintetizăm limitele primei versiuni pentru confirmare, apoi redactăm planul de cerințe. Alegerea de a vedea un prototip nu reprezintă aprobarea unei direcții sau autorizarea implementării în adminul real.

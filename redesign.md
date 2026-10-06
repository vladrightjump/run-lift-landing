# Run + Lift — direcția de redesign

Data: 4 octombrie 2026

Branch: `docs/redesign-run-lift`

Scop: direcție de produs, structură, conținut și experiență pentru website. Documentul pregătește redesignul; nu reprezintă o implementare sau oferte deja lansate.

## 1. Obiectiv

Website-ul trebuie să transforme interesul pentru Run + Lift într-o participare plătită și apoi într-un motiv de revenire.

Vizitatorul trebuie să înțeleagă rapid:

1. Ce este Run + Lift și dacă i se potrivește.
2. Cum poate începe, unde și când.
3. Cât costă și ce primește.
4. Cum poate continua după prima experiență.

Direcția centrală:

**Descoperă echipa → participă → urmează un program → continuă antrenamentele → vezi progresul.**

Evenimentele atrag oameni noi. Programele oferă structură. Antrenamentele recurente susțin relația cu membrii. Materialele digitale extind accesul la persoanele care nu pot veni fizic.

## 2. Contextul real

### Confirmat în conversație

| Resursă | Situație |
| --- | --- |
| Participare | 12–20 persoane la o sesiune |
| Participanți care plătesc | Aproximativ 90%, conform organizatorului |
| Echipament | 8 wall balls, 6 sandbags, aproximativ 10 kettlebells |
| Investiție luată în calcul | Aproximativ 2.000 EUR pentru echipament și dezvoltarea experienței |
| Direcții de interes | Evenimente mai mari, programe online, active digitale |
| Posibilă extindere | Sală pentru antrenamente de tip HYROX în 2027 |

Aceste cifre sunt context intern. Participarea la o sesiune nu reprezintă numărul de membri unici și nici o cifră care trebuie afișată automat ca dovadă socială pe website.

### Ce există în proiect

- Pagina publică este legată de ediția evenimentului și de fazele acestuia: [src/App.tsx](src/App.tsx).
- Hero-ul actual prezintă „Hyrox Trial”: [Hero.tsx](src/components/landing/Hero.tsx).
- Există înscriere, capacitate, listă de așteptare și fluxuri de confirmare.
- Pagina cu antrenamente afișează săptămâni ordonate: [Antrenament.tsx](src/components/Antrenament.tsx).
- Există o prezentare a comunității și conținut video: [DespreNoi.tsx](src/components/DespreNoi.tsx).
- Identitatea vizuală folosește Anton, Archivo, lime și fundaluri închise: [src/public.css](src/public.css).

### Ce trebuie stabilit înainte de vânzare

Prețurile curente, numărul de clienți unici, costurile de livrare, timpul antrenorilor, greutățile echipamentelor, spațiul disponibil, transportul și depozitarea. Pentru online: programa, demonstrațiile, accesul și limitele suportului.

Prețurile de 399 MDL pentru un program individual și 899 MDL pentru o variantă ghidată au fost exemple de test în discuție. Nu sunt prețuri aprobate pentru publicare.

## 3. Poziționare și mesaj

**Run + Lift este o comunitate de alergare și forță în care începi la nivelul tău, te antrenezi cu o echipă și îți urmărești progresul.**

Diferențierea propusă trebuie să se vadă în experiență:

- Prima participare are explicații clare și opțiuni pentru începători.
- Participantul cunoaște antrenorul și oamenii cu care se antrenează.
- Fiecare ofertă are un început și un pas următor ușor de înțeles.
- Progresul personal este vizibil prin comparații relevante.
- Evenimentele permit participarea cu un prieten.

HYROX poate fi o direcție de pregătire. Brandul principal rămâne Run + Lift. Denumirile și prezentarea evenimentelor trebuie să reflecte afilierea reală; nu afișăm statut oficial neverificat.

### Propunere de text pentru primul ecran

> **Aleargă. Ridică. Progresează împreună.**
>
> Antrenamente de alergare și forță în Chișinău, adaptate nivelului tău. Începe cu echipa și urmărește-ți progresul.

Acțiune principală: **Vino la un antrenament**.

Acțiune secundară: **Vezi următorul eveniment**, atunci când există o ediție anunțată.

Textele sunt propuneri editoriale. Programul și prețul afișate trebuie să provină din oferta reală disponibilă.

## 4. Produsele și rolul lor pe website

| Produs propus | Pentru cine | Venit sau rol | Prioritate |
| --- | --- | --- | --- |
| Run + Lift Challenge | Cine vrea o experiență de echipă și o provocare adaptată | Înscrieri la evenimente și intrare în comunitate | Prima etapă |
| Run + Lift Start | Începători care vor un început organizat | Program plătit de șase săptămâni | Prima etapă, după definirea ofertei |
| Run + Lift Club | Participanți care vor să continue | Pachet lunar cu servicii și participări definite | Clarificarea ofertei existente |
| Run + Lift Anywhere | Persoane care se antrenează independent | Program digital cu calendar, demonstrații și jurnal | După testarea materialelor |
| Progresul meu | Membri și participanți la provocări | Revenire și recomandări; beneficiu inclus | După validarea comparațiilor |
| Run + Lift Teams | Companii și grupuri private | Experiență de grup cu ofertă calculată | După validarea formatului public |
| Run + Lift Indoors | Participanți locali interesați de antrenamente în sală | Sesiuni pilot plătite într-un spațiu existent | Test pentru eventuala sală din 2027 |

Prima versiune comercială promovează ofertele care pot fi livrate. Ideile viitoare nu devin butoane de cumpărare înainte să existe produsul, prețul și capacitatea.

## 5. Arhitectura informației

Rutele de mai jos sunt propuneri de structură, nu rute deja implementate.

| Pagină | Rol | Conținut principal | Acțiune |
| --- | --- | --- | --- |
| `/` | Prezentarea permanentă Run + Lift | Promisiune, următoarea sesiune, oferte, echipă, experiențe reale | Vino la un antrenament |
| `/antrenamente` | Participare locală | Nivel, orar, locație, antrenor, preț, ce aduci | Alege o sesiune |
| `/evenimente` | Descoperirea evenimentelor | Următoarea ediție și ediții anterioare | Vezi evenimentul |
| `/evenimente/:editie` | Înscriere la o ediție concretă | Format, adaptări, oră, loc, preț, disponibilitate | Rezervă-ți locul |
| `/programe` | Compararea programelor disponibile | Start și, când este pregătit, Anywhere | Vezi programul |
| `/programe/start` | Oferta ghidată | Rezultat urmărit, șase săptămâni, calendar, servicii incluse, preț | Înscrie-te în următoarea grupă |
| `/programe/anywhere` | Oferta digitală | Exemplu, echipament necesar, acces, suport, preț | Cumpără programul |
| `/despre-noi` | Încredere și apartenență | Antrenori, poveste, abordare, imagini reale | Vino să ne cunoști |
| `/antrenament` | Resursă publică existentă | Antrenamentul săptămânii și săptămânile publicate | Vezi opțiunile de antrenament |

Navigație inițială: **Antrenamente · Evenimente · Despre noi**, plus acțiunea principală. Adăugăm **Programe** când există o ofertă definită.

Rezultatele pot începe ca secțiune a ediției. Teams și interesul pentru indoor pot avea pagini discrete mai târziu; nu este nevoie ca toate ideile să intre simultan în meniul principal.

## 6. Structura homepage-ului

### 1. Primul ecran

Titlu clar, descriere scurtă, oameni reali la antrenament și acțiunea principală. Video-ul poate susține atmosfera, cu imagine de rezervă și controlul mișcării. Textul și înscrierea trebuie să fie utilizabile înainte ca video-ul să se încarce.

### 2. Următorul antrenament

Data completă, ora, locația, nivelul, durata, prețul și disponibilitatea, dacă aceasta este cunoscută. Harta duce la punctul exact de întâlnire. Programul curent din conținutul proiectului este marți și joi la 06:30, în zona Parcului Râșcani; acesta trebuie verificat înainte de publicare.

Data se calculează și se afișează în `Europe/Chisinau`. O sesiune anulată sau trecută nu rămâne prezentată ca următoarea disponibilă.

### 3. Cum începi

Trei pași scurți: alegi o sesiune, primești detaliile de participare, te întâlnești cu echipa. Explicăm adaptarea pentru începători și ce trebuie adus.

### 4. Alege experiența

Ofertele disponibile: antrenamente regulate, următorul Challenge și programul Start. Oferta online intră aici când poate fi cumpărată și livrată.

### 5. Oamenii și progresul

Fotografii și povești reale, cu acord: punctul de pornire, experiența și evoluția persoanei. Evităm cifrele decorative, mărturiile inventate și transformările garantate.

### 6. Următorul eveniment

O prezentare vizuală energică, cu data, formatul și prețul. Dacă nu există o ediție anunțată, pagina continuă să vândă antrenamentele disponibile.

### 7. Antrenorul și întrebările frecvente

Experiență și calificări verificate, abordare și răspunsuri despre nivel, echipament, vreme, plată și anulare. Politicile afișate trebuie să fie cele stabilite de organizator.

### 8. Invitația finală

Repetăm acțiunea principală, legată de oferta reală. Footer-ul păstrează contactul, Instagram și informațiile necesare participării.

## 7. Direcția vizuală

Păstrăm identitatea sportivă existentă: lime, fundaluri închise, contrast puternic, Anton pentru titluri și Archivo pentru text. Păstrăm caracterul geometric și colțurile drepte ale direcției actuale.

Schimbarea importantă este ierarhia: marca, antrenamentele și posibilitatea de a începe trebuie să fie vizibile permanent.

| Element | Direcție |
| --- | --- |
| Titluri | Puternice și scurte; dimensiunea permite citirea ofertei și acțiunii pe telefon |
| Text | Clar, concret, cu spațiere suficientă și contrast verificat |
| Lime | Accent pentru acțiunea principală și stări relevante |
| Fotografii | Oameni din comunitate, execuții, ajutorul antrenorului, momente de echipă |
| Video | Secvențe utile atmosferei, fără sunet automat; încărcare care nu blochează conținutul |
| Componente de ofertă | Preț, durată, nivel și servicii incluse ușor de comparat |
| Mișcare | Feedback discret la interacțiune; respectă `prefers-reduced-motion` |
| Telefon | O coloană clară, ținte de atingere generoase, formular scurt, fără scroll orizontal |

Pagina unui Challenge poate fi mai intensă vizual. Pagina unui program pune accent pe structură, încredere și explicații. Ambele aparțin aceleiași identități.

## 8. Experiențele esențiale

### Primul antrenament

Instagram sau recomandare → pagina antrenamentelor → sesiune concretă → înscriere → confirmare cu oră, hartă, echipament și modalitatea de plată.

Rezervarea și plata sunt stări distincte. Dacă plata se face la fața locului sau printr-un link, mesajul explică acest lucru. Nu se afișează „plătit” doar pentru că formularul a fost trimis.

### Eveniment și continuare

Pagina ediției → alegerea opțiunii disponibile → înscriere → confirmare → participare → rezultate sau amintiri → invitație la Start ori la următorul antrenament.

Înscrierea în pereche și valurile sunt funcționalități propuse. Ele au nevoie de reguli clare pentru locuri, partener, plată și anulare înainte de implementare.

### Program digital

Exemplu de săptămână și demonstrație → ofertă cu nivel, echipament, acces și suport → plată confirmată → acces și instrucțiuni pentru prima săptămână.

Un cont complex nu este necesar pentru primul test. Livrarea simplă trebuie totuși să fie fiabilă, iar cumpărătorul să știe unde revine și pe cine contactează.

### Revenire și progres

Participantul primește următorul pas relevant. Rezultatele comparate trebuie să precizeze formatul, greutățile și adaptările. Publicarea rezultatelor personale și a imaginilor rămâne o alegere explicită a persoanei.

## 9. Stări care fac parte din redesign

- Eveniment anunțat, înscrieri deschise, listă de așteptare, locuri epuizate și înscrieri închise.
- Ediție încheiată și perioadă fără o ediție nouă.
- Sesiune anulată, reprogramată sau fără disponibilitate.
- Formular în curs, eroare recuperabilă, confirmare și trimitere repetată.
- Conținut video indisponibil și conexiune lentă.
- Plată în așteptare sau nereușită, când există un flux de plată.
- Program online nelansat: prezentare informativă fără promisiune de acces imediat.

Indisponibilitatea evenimentului nu blochează descoperirea antrenamentelor și a ofertelor care funcționează în continuare.

## 10. Legătura cu proiectul existent

Acest document propune o extindere a structurii comerciale. Planul anterior de [redesign al paginii publice](docs/plans/2026-09-26-1417-feat-redesign-pagina-publica-plan.md) rămâne referință pentru identitate și comportamentele existente; noua direcție schimbă deliberat rolul homepage-ului și organizarea ofertelor.

La implementare trebuie evaluate:

- Separarea homepage-ului permanent de fazele unei ediții din `App.tsx`.
- Rutarea din [src/main.tsx](src/main.tsx), care în prezent folosește căi explicite.
- Refolosirea componentelor de înscriere și păstrarea legăturilor din emailuri.
- Comportamentul adreselor `/inscriere`, `/confirmare`, `/renunt`, `/unsubscribe` și `/antrenament#s1`.
- Separarea informațiilor despre club de configurația unei ediții.
- Publicarea ofertelor, prețurilor și programului dintr-o sursă coerentă, fără date contradictorii între pagini.
- Măsurarea plăților și a participării distinct de clickuri și trimiteri de formular.

Aceste puncte sunt teme pentru proiectarea tehnică ulterioară, nu instrucțiuni de a modifica acum aplicația sau baza de date.

## 11. Ordinea recomandată

### Prima etapă: oferta permanentă

Homepage, antrenamente, prezentarea echipei și pagina evenimentului, cu informații reale și înscriere funcțională. Clarificarea pachetului actual și a următorului pas după participare.

### A doua etapă: Start și continuitate

Pagina programului de șase săptămâni, conținut demonstrativ, servicii incluse, preț și înscriere. Prezentarea clară a continuării în Club.

### A treia etapă: active digitale

Anywhere folosește materialele testate în programele ghidate. Progresul și recomandările încep într-o formă simplă, înaintea unui dashboard extins.

### Etape condiționate de cerere

Teams și sesiunile indoor. Interesul pentru sală se verifică prin participări plătite într-o locație și la un orar realist. Un formular de interes nu dovedește că o sală nouă își acoperă costurile.

Amânăm aplicația mobilă, stocul de merchandise, platforma socială, biblioteca video foarte mare și abonamentele cu suport individual nelimitat.

## 12. Cum evaluăm rezultatul

### Claritatea experienței

- O persoană nouă poate identifica oferta, nivelul, prețul, data și locația înainte să se înscrie.
- Homepage-ul rămâne util între evenimente.
- Oferta principală este utilizabilă pe un ecran de 360 px și cu tastatura.
- Confirmarea explică ce s-a rezervat, ce s-a plătit și ce urmează.
- Linkurile deja distribuite și fluxurile existente rămân funcționale sau au o tranziție explicită.

### Rezultatul comercial

| Indicator | Ce ne spune |
| --- | --- |
| Vizitatori → rezervări confirmate | Dacă oferta și înscrierea sunt convingătoare |
| Rezervări → participări efective | Dacă experiența de început produce prezență |
| Participanți noi → cumpărare ulterioară | Dacă evenimentul aduce clienți pentru antrenamente |
| Clienți → reînnoiri | Dacă oferta susține continuitatea |
| Venit minus costuri de livrare și timpul echipei | Dacă activitatea contribuie economic |
| Cumpărători online → utilizare și finalizare | Dacă activele digitale sunt utile după achiziție |

Stabilim valorile de bază înainte de lansare și comparăm perioade similare. Capacitatea, sezonalitatea și campaniile pot influența rezultatele; nu atribuim automat toate schimbările redesignului.

## 13. Conținut necesar pentru versiunea publică

- Orarul actual, durata și locațiile exacte.
- Prețurile și serviciile incluse în fiecare ofertă.
- Fotografiile și prezentările antrenorilor, cu informații verificate.
- Fotografii și mărturii cu acord de publicare.
- Regulile de rezervare, anulare și plată.
- Data, formatul, capacitatea și adaptările următorului eveniment.
- Pentru Start: programa, calendarul și timpul de suport.
- Pentru Anywhere: exemplul real, echipamentul necesar și mecanismul de acces.

Până când aceste informații sunt stabilite, documentul funcționează ca direcție de lucru. Nu folosim conținut fictiv pentru a prezenta ofertele ca fiind disponibile.

## 14. Redesignul adminului

Analiza funcționalității, problemele verificate în browser, reorganizarea celor 14 ecrane și fluxurile propuse sunt în [auditul adminului](docs/reviews/2026-10-04-admin-ui-audit.md).

Au fost pregătite trei schițe de organizare: A — simplificarea ecranelor existente; B — Acum / Antrenamente / Evenimente / Site; C — agenda activităților. Recomandarea inițială este B, dar utilizatorul nu a ales o variantă: a cerut explorarea stilului vizual, a unor elemente mai dinamice și a funcționalităților diferite pe ecrane diferite. Schițele inițiale au fost evaluate local și nu sunt incluse în acest PR; explorarea unui prototip mai finisat rămâne deschisă.

Această etapă privește analiza și organizarea interfeței. Planul final de cerințe se redactează după alegerea direcției și confirmarea scopului; codul adminului real nu a fost modificat.

# Membrii reali din Telegram și `/scoate`

Implementare pentru grupul unic configurat în `TELEGRAM_GROUP_CHAT_ID`. Fluxul public „Join” și un al doilea grup nu fac parte din această schimbare.

## Dashboard

„Membrii” pornește pe **În grup**, cu filtre separate pentru apartenența Telegram și starea la antrenamente. Ieșirea din Telegram nu șterge persoana, prezențele, plățile sau starea „activ/în pauză”. Filtrele **Ieșiți din Telegram**, **Neverificați** și **Toate conturile** păstrează accesul la restul persoanelor. Conturile cunoscute fără membru asociat rămân în secțiunea de asociere.

La fiecare minut, botul verifică până la 10 conturi cunoscute. O verificare reușită este reîmprospătată după șase ore; intrările și ieșirile primite prin `chat_member` sunt aplicate imediat. „Verifică apartenența” programează reverificarea; nu pretinde că rezultatul este instantaneu. Erorile păstrează ultima observație, afișează eșecul verificării și reprogramează încercarea după 15 minute. Membrii fără observație sunt „Neverificați”.

Bot API nu enumeră toți membrii vechi ai grupului: verificarea inițială acoperă ID-urile deja cunoscute. Persoanele necunoscute trebuie să interacționeze cu botul (de exemplu `/start`), să voteze sau să fie identificate/asociate manual. Botul trebuie să fie administrator în grup pentru verificarea fiabilă a altor membri. Nu se confundă o eroare API cu ieșirea din grup.

Reminderele și listele celor fără răspuns exclud plecările confirmate. Răspunsurile istorice rămân. Observațiile sunt separate de `members`, astfel încât asocierea sau unirea persoanelor continuă să folosească identitatea Telegram.

## Comanda privată

1. Un organizator din `TELEGRAM_ADMIN_CHAT_IDS` scrie `/scoate Ion` sau `/scoate @utilizator`.
2. Botul caută fără diferențe de majuscule/diacritice și afișează persoanele potrivite cu numele, username-ul și ID-ul Telegram. Peste 10 rezultate cere un nume mai precis.
3. Organizatorul alege contul, apoi confirmă persoana și grupul. Poate renunța.
4. Se creează o comandă în coada comună cu dashboard-ul. Înainte de executare se reverifică asocierea contului și statutul de administrator în Telegram. Organizatorii și administratorii nu sunt scoși.
5. Botul raportează rezultatul în conversația privată; dashboard-ul citește aceeași comandă și observația de apartenență.

Confirmările expiră după 15 minute, aparțin organizatorului care le-a creat, se consumă înainte de trimitere și nu funcționează după schimbarea grupului. Un restart le pierde; utilizatorul reia `/scoate`. Botul rămâne pe o singură replică, ca fluxul existent pentru antrenamente.

Scoaterea este ban + unban, pentru a permite o invitație ulterioară. Un cont deja blocat nu este deblocat automat. Dacă unban eșuează, comanda raportează eșec și cere deblocare manuală în Telegram; nu pretinde succes. Nicio stare de apartenență nu este schimbată doar pentru că a fost pusă o comandă în coadă.

## Activarea în producție

Codul și migrarea sunt pregătite în branch; această implementare locală **nu aplică migrarea și nu trimite comenzi către grupul real**.

1. Aplică `supabase/sql/supabase-migration-sala-apartenenta-telegram.sql` după `sala_06`. Păstrează fișierul în lista `MIGRARI_NEAPLICATE` din testele SQL până la regenerarea instantaneelor din baza reală.
2. Publică botul și interfața împreună cu această migrare. Botul vechi nu trebuie păstrat ca executor: nu are verificările suplimentare pentru scoatere.
3. Reînregistrează webhook-ul cu `npm --prefix bot run set-webhook` în mediul configurat. Lista include acum `chat_member`, pe lângă `message` și `callback_query`. Verifică `getWebhookInfo`.
4. Botul trebuie să fie administrator și să aibă dreptul de a elimina membri. Verifică lista organizatorilor; deschiderea chatului cu `/start` actualizează meniul lor.
5. Verifică pe un cont de test: intrare → În grup; ieșire → Ieșiți; reintrare → În grup; căutare cu nume duplicat → alegere → Renunță. O scoatere reală se probează numai pe contul de test ales explicit de organizator.

După migrarea live, regenerează instantaneele prin scripturile existente, apoi elimină migrarea din `MIGRARI_NEAPLICATE`. Nu transforma manual instantaneul de producție într-unul fictiv.

## Verificări automate

Testele botului acoperă autorizarea, duplicatele, expirarea, anularea, apăsarea dublă, schimbarea grupului/contului, protecția administratorilor, erorile Telegram și webhook-ul. Testele PostgreSQL locale verifică migrarea, privilegiile, observațiile vechi, conturile neasociate și deduplicarea cozii. Testele de interfață și browser verifică filtrele și reverificarea pe desktop și telefon. Aceste teste folosesc date false, fără scrieri în Telegram sau Supabase live.

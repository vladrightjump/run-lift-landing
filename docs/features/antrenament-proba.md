# Antrenamentul de proba prin Telegram

Homepage-ul poate afișa „Vreau la un antrenament”. Linkul deschide conversația privată cu botul; persoana apasă Start, citește condițiile, scrie numele și alege o sesiune disponibilă din următoarele 14 zile.

Persoana rămâne la **Antrenamente → Persoane noi**, separat de membri. Botul trimite confirmarea și reminderul, iar după durata configurată te întreabă dacă a venit. Confirmarea ta „A venit” declanșează întrebarea de continuare. Numai răspunsul explicit „Da” al persoanei permite invitația în grup. Trimiterea invitației nu înseamnă că persoana a intrat; apartenența se verifică în Telegram.

## Activare

1. Aplică migrarea `supabase/sql/supabase-migration-sala-probe.sql` înaintea activării funcției. Migrarea creează configurația dezactivată și nu modifică membrii existenți. Actualizează snapshot-urile și lista migrărilor neaplicate din testele SQL conform procesului repo, numai după aplicarea live.
2. Livrează botul și înregistrează webhook-ul actualizat, care include `chat_join_request` și păstrează `chat_member`. Botul trebuie să fie administrator în grupul configurat și să aibă dreptul de invitare. Nu este necesară deblocarea persoanelor excluse.
3. În **Setări bot → Antrenamente de probă**, completează username-ul real al botului (fără URL), bun venit, costul real, condițiile, echipamentul necesar, condițiile continuării, durata și contactul. Selectează un organizator asociat în baza de date (`members.is_admin`) cu cont Telegram care a deschis conversația cu botul.
4. Salvează cu activarea oprită. Workerul verifică periodic identitatea botului și dreptul de invitare, inclusiv când înscrierile sunt dezactivate. Workerul trebuie să ruleze cu schedulerul activ. Schimbarea username-ului sau organizatorului cere o nouă verificare.
5. Verifică parcursul într-un mediu/grup de test cu două conturi. Activează numai după confirmarea comportamentului și completarea condițiilor reale. Copiază linkul din setări; CTA-ul apare pe homepage după încărcarea configurației publice.

## Administrare

- **A venit / Nu a venit:** confirmă prezența din mesajul privat al botului sau din detaliul probei în admin. Fără răspuns, proba rămâne „De confirmat”. Corecțiile sunt explicite și auditabile.
- **Întrebări:** participantul apasă „Am o întrebare”. Organizatorul răspunde prin butonul din Telegram sau din admin, cu previzualizare și confirmare.
- **Reprogramare:** participantul anulează proba curentă și alege alta. Anularea sau mutarea sesiunii actualizează mesajele programate; confirmarea participării nu se confundă cu prezența fizică.
- **Mesaje nelivrate:** inspectează rezultatul și reîncearcă din detaliul persoanei. „Livrare neconfirmată” înseamnă că mesajul poate să fi ajuns deja; reîncercarea explicită îl poate dubla.
- **Mesaje oprite:** `/stop` oprește mesajele proactive pentru persoană; `/start` permite reluarea. Rezervarea nu este anulată de oprirea mesajelor.
- **Invitație expirată:** după prezență și acord, persoana poate cere din bot o invitație nouă. Linkul folosește cerere de aderare; botul validează contul și eligibilitatea, astfel încât redirecționarea lui nu acordă acces altcuiva.
- **Oprire:** dezactivează înscrierile din setări. CTA-ul dispare la următoarea încărcare, iar trimiterile automate sunt suspendate. Istoricul rămâne disponibil. Nu șterge tabelele pentru rollback.

## Limite

Un singur grup și o singură probă deschisă per persoană. Nu există plată online, chatbot AI sau verificare automată a prezenței fizice. Evenimentul HYROX Trial și înscrierea la antrenamente rămân fluxuri distincte. Configurația publică nu expune conversații, ID-uri private sau linkul grupului.

## Editarea mesajelor

În **Setări bot → Antrenamente de probă → Mesajele fluxului**, alege mesajul, modifică textul și salvează setările. Sunt disponibile confirmările, reminderul, notificările organizatorului, întrebarea de continuare, invitația și mesajele principale ale conversației. Bun venit, costul și condițiile rămân în câmpurile dedicate. Previzualizarea arată textul editabil și explică informațiile adăugate automat. Datele, condițiile acceptate, linkurile și butoanele sunt păstrate de bot. Mesajele de eroare și verificările de acces rămân gestionate de sistem.

Modificările se folosesc la trimiterile viitoare, inclusiv mesajele încă în așteptare; mesajele deja trimise nu sunt editate în Telegram. „Restabilește mesajul implicit” elimină personalizarea după salvare. Aplică și `supabase/sql/supabase-migration-trial-messages.sql`, după migrarea inițială a probelor.

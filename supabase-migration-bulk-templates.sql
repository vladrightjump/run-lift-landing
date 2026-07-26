-- Migrare: șabloanele de trimitere în masă mutate din codul frontend în DB.
--
-- Înainte, template-urile din tab-ul „Email" (trimitere în masă) erau constante
-- hardcodate în `src/admin/AdminEmailTab.tsx` — nu se salvau nicăieri și rămâneau
-- blocate pe ediția în care fusese scris codul. Acum stau în `email_templates`,
-- se editează din tab-ul „Șabloane de email" și se încarcă în tab-ul „Email".
--
-- Variabilele folosesc single-brace ({prenume}, {nume}, {email}, {telefon},
-- {data_inscrierii}) pentru că înlocuirea se face client-side în AdminEmailTab.
-- (Șablonul `confirmare`, randat server-side de funcția Edge, folosește {{...}}.)
--
-- Idempotent: upsert pe `cheie`. Actualizează la ediția curentă (25 iulie 2026).

insert into public.email_templates (cheie, subiect, text_email, actualizat_la) values
('bulk_participant_confirmare',
 'Confirmare înscriere — HYROX, 25 iulie',
 E'Salut, {prenume}!\n\nÎnscrierea ta la Run + Lift — HYROX Style Race este confirmată.\n\n• Când: sâmbătă, 25 iulie 2026, ora 07:00\n• Unde: Parcul Râșcani, Str. Braniștii, Chișinău\n\nAdu apă pentru hidratare și bună dispoziție. Ne vedem la start!\n\nEchipa Run + Lift',
 now()),
('bulk_participant_reminder',
 'Mâine e ziua — HYROX, 25 iulie, 07:00',
 E'Salut, {prenume}!\n\nÎți reamintim că Run + Lift — HYROX Style Race are loc mâine, sâmbătă 25 iulie, ora 07:00, la Parcul Râșcani (Str. Braniștii).\n\n• Check-in de la 06:30, start fix la 07:00\n• Adu: echipament sport, apă pentru hidratare și bună dispoziție\n\nDacă nu mai poți participa, răspunde la acest email ca să eliberăm locul.\n\nNe vedem la start!\nEchipa Run + Lift',
 now()),
('bulk_waitlist_anunt',
 'S-au deschis înscrierile — HYROX, 25 iulie',
 E'Salut, {prenume}!\n\nEvenimentul pe care îl așteptai e aici: Run + Lift — HYROX Style Race, sâmbătă 25 iulie 2026, ora 07:00, la Parcul Râșcani (Str. Braniștii), Chișinău.\n\nCursă în stil HYROX în aer liber — alergi, treci stația, repeți, contra cronometru. Locuri limitate.\n\nÎnscrie-te aici:\nhttps://parktraining.fit\n\nNe vedem la start!\nEchipa Run + Lift',
 now())
on conflict (cheie) do update
  set subiect = excluded.subiect,
      text_email = excluded.text_email,
      actualizat_la = now();

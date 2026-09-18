-- Migrare: șabloanele de email mutate din codul frontend/edge în DB.
--
-- Înainte, template-urile din tab-ul „Email" (trimitere în masă) erau constante
-- hardcodate în `src/admin/AdminEmailTab.tsx`, iar emailurile automate (confirmare
-- la înscriere, reminder, anunț) + badge-ul erau hardcodate în funcția Edge
-- `send-email`. Acum TOT conținutul stă în `email_templates`, se editează din
-- tab-ul „Șabloane de email" și e citit atât de tab-ul „Email" cât și de funcția
-- Edge (`template_lookup`). La ediție nouă NU se mai atinge codul.
--
-- Variabilele folosesc single-brace ({prenume}, {nume}, {email}, {telefon},
-- {data_inscrierii}). (Șablonul `confirmare`, double opt-in, folosește {{...}}.)
-- `event_badge` nu are variabile — e doar textul din capul fiecărui email.
--
-- Schema: `runlift` (proiectul ironworks-gym). Idempotent: upsert pe `cheie`.
-- Conținut aliniat la ediția curentă (4 — Hyrox Trial, 8 august 2026, 06:30).

insert into runlift.email_templates (cheie, subiect, text_email, actualizat_la) values
('bulk_participant_confirmare',
 'Confirmare înscriere — Hyrox Trial, 8 august',
 E'Salut, {prenume}!\n\nÎnscrierea ta la Run + Lift — Hyrox Trial este confirmată.\n\n• Când: sâmbătă, 8 august 2026, ora 06:30\n• Unde: Parcul Râșcani, Chișinău\n\nAdu apă pentru hidratare și bună dispoziție. Ne vedem la start!\n\nEchipa Run + Lift',
 now()),
('bulk_participant_reminder',
 'Mâine e ziua — Hyrox Trial, 8 august, 06:30',
 E'Salut, {prenume}!\n\nÎți reamintim că Run + Lift — Hyrox Trial are loc mâine, sâmbătă 8 august, ora 06:30, la Parcul Râșcani.\n\n• Check-in de la 06:00, start fix la 06:30\n• Adu: echipament sport, apă pentru hidratare și bună dispoziție\n\nDacă nu mai poți participa, răspunde la acest email ca să eliberăm locul.\n\nNe vedem la start!\nEchipa Run + Lift',
 now()),
('bulk_waitlist_anunt',
 'S-au deschis înscrierile — Hyrox Trial, 8 august',
 E'Salut, {prenume}!\n\nEvenimentul pe care îl așteptai e aici: Run + Lift — Hyrox Trial, sâmbătă 8 august 2026, ora 06:30, la Parcul Râșcani, Chișinău.\n\nCursă în stil HYROX în aer liber — alergi, treci stația, repeți, contra cronometru. Locuri limitate.\n\nÎnscrie-te aici:\nhttps://parktraining.fit\n\nNe vedem la start!\nEchipa Run + Lift',
 now()),
('event_badge',
 'Badge eveniment (capul emailului)',
 'Hyrox Trial · 8 august',
 now())
on conflict (cheie) do update
  set subiect = excluded.subiect,
      text_email = excluded.text_email,
      actualizat_la = now();

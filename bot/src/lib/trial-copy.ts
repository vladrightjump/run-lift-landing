// Shared by the admin preview and bot. User content is plain text, never evaluated.
export const TRIAL_COPY = {
  "booking_confirmed": {
    "label": "Confirmarea rezervării",
    "text": "Proba ta este confirmată!",
    "context": "Data, locația, condițiile acceptate și /stop se adaugă automat."
  },
  "reminder": {
    "label": "Reminder înainte de probă",
    "text": "Te așteptăm la antrenamentul de probă:",
    "context": "Data, locația și condițiile acceptate se adaugă automat."
  },
  "session_changed": {
    "label": "Program modificat",
    "text": "Programul probei tale a fost modificat:",
    "context": "Noul program și condițiile acceptate se adaugă automat."
  },
  "organizer_booking": {
    "label": "Organizator: rezervare nouă",
    "text": "O persoană vine la antrenamentul de probă:",
    "context": "Numele și programul se adaugă automat."
  },
  "attendance_request": {
    "label": "Organizator: verificarea prezenței",
    "text": "A venit la antrenamentul de probă?",
    "context": "Numele, programul și butoanele A venit / Nu a venit se adaugă automat."
  },
  "cancelled": {
    "label": "Probă anulată",
    "text": "Antrenamentul tău de probă a fost anulat. Poți alege altă zi.",
    "context": "Programul și butonul de reprogramare se adaugă automat."
  },
  "organizer_cancelled": {
    "label": "Organizator: anularea probei",
    "text": "Antrenamentul de probă a fost anulat:",
    "context": "Numele și programul se adaugă automat."
  },
  "continuation": {
    "label": "După probă: dorește să continue",
    "text": "Mulțumim că ai venit! Vrei să continui antrenamentele cu noi?",
    "context": "Condițiile continuării și butoanele Da / Nu acum se adaugă automat."
  },
  "rebook": {
    "label": "Nu a venit la probă",
    "text": "Nu ne-am întâlnit la antrenamentul de probă. Dacă dorești, poți alege altă zi.",
    "context": "Butonul de alegere a antrenamentului se adaugă automat."
  },
  "invite": {
    "label": "Invitația în grup",
    "text": "Te așteptăm în comunitate! Solicită intrarea cu acest link, folosind același cont Telegram:",
    "context": "Linkul personal se adaugă numai după prezență și acord."
  },
  "question": {
    "label": "Organizator: întrebare primită",
    "text": "Întrebare de la participant:",
    "context": "Numele, întrebarea și butonul de răspuns se adaugă automat."
  },
  "answer": {
    "label": "Răspuns pentru participant",
    "text": "Răspuns de la organizator",
    "context": "Întrebarea și răspunsul organizatorului se adaugă automat."
  },
  "name_prompt": {
    "label": "Solicitarea numelui",
    "text": "Scrie numele și prenumele tău.",
    "context": "Apare la începutul înscrierii, după bun venit și condiții."
  },
  "choose_session": {
    "label": "Alegerea antrenamentului",
    "text": "Alege antrenamentul. Orele sunt pentru Chișinău.",
    "context": "Opțiunile vin din programul existent al botului."
  },
  "no_sessions": {
    "label": "Fără antrenamente disponibile",
    "text": "Nu sunt antrenamente disponibile în următoarele 14 zile. Poți reveni sau ne poți scrie.",
    "context": "Apare când nu există sesiuni disponibile."
  },
  "awaiting_attendance": {
    "label": "Așteaptă confirmarea prezenței",
    "text": "Așteptăm confirmarea organizatorului privind prezența ta la probă.",
    "context": "Apare când participantul cere starea înscrierii."
  },
  "question_prompt": {
    "label": "Solicitarea întrebării",
    "text": "Scrie întrebarea pentru organizator.",
    "context": "Apare după apăsarea butonului Am o întrebare."
  },
  "question_received": {
    "label": "Confirmarea întrebării",
    "text": "Întrebarea a fost înregistrată pentru organizator. Vei primi răspunsul aici.",
    "context": "Confirmă înregistrarea; nu promite că răspunsul a fost trimis."
  },
  "booking_received": {
    "label": "Rezervare înregistrată",
    "text": "Rezervarea este înregistrată. Confirmarea completă va sosi aici.",
    "context": "Confirmarea completă se trimite separat."
  },
  "continuation_yes": {
    "label": "Acord pentru continuare",
    "text": "Ai confirmat continuarea. Vei primi invitația după verificare.",
    "context": "Linkul se trimite separat, numai dacă persoana este eligibilă."
  },
  "continuation_no": {
    "label": "Refuzul continuării",
    "text": "Am înregistrat răspunsul. Mulțumim că ai venit!",
    "context": "Încheie fluxul fără invitație."
  }
} as const;

export type TrialCopyKey = keyof typeof TRIAL_COPY;
export function trialCopy(config: { message_texts?: Record<string, string> }, key: TrialCopyKey): string {
  return config.message_texts?.[key]?.trim() || TRIAL_COPY[key].text;
}

import { rpc } from '../../../../shared/lib/rpc';


/**
 * Clientul grupului de antrenament: botul de Telegram, prezențele și membrii
 * (fostul gym-app). Totul trece prin funcțiile `runlift.admin_sala_*`, care
 * verifică tokenul de sesiune al adminului și lucrează pe tabelele din `public`
 * — vezi `supabase/sql/supabase-migration-sala-functii-admin.sql`.
 *
 * Separat de `adminApi.ts` doar ca mărime: aceeași formă (tokenul primul,
 * `AbortSignal` opțional, `InvalidTokenError` la sesiune expirată), același `rpc`.
 */


export type SalaConfig = {
  enabled: boolean;
  /** 0 = duminică … 6 = sâmbătă. */
  poll_days: number[];
  /** `HH:MM`, la Chișinău. */
  poll_time: string;
  summary_days: number[];
  summary_time: string;
  /** Ora antrenamentului, care apare în sondaj. */
  training_time: string;
  location: string;
  auto_reminder_enabled: boolean;
  /** Reminderul automat nu pleacă dacă au confirmat deja cel puțin atâția. */
  reminder_threshold: number;
  /** Textul sondajului. `null` = textul de azi, scris în bot. */
  poll_title: string | null;
  poll_yes_label: string | null;
  poll_no_label: string | null;
};

type StareMembru = 'active' | 'paused' | 'cancelled';

export type SalaMembru = {
  id: string;
  full_name: string;
  status: StareMembru;
  is_admin: boolean;
  telegram_user_id: number | null;
  telegram_username: string | null;
  bot_dm_enabled: boolean;
  join_date: string;
  /** Telegram membership is independent of training status. Missing before sala_07. */
  telegram_membership?: 'unknown' | 'in_group' | 'left' | 'kicked';
  telegram_checked_at?: string | null;
  telegram_check_failed?: boolean;
};

export type SalaAntrenament = {
  id: string;
  /** `YYYY-MM-DD`. */
  session_date: string;
  /** `HH:MM`. */
  starts_at: string;
  location: string;
  status: 'scheduled' | 'done' | 'cancelled';
  /** Sondajul a plecat deja în grup. */
  poll_sent: boolean;
};

type SalaRaspuns = {
  session_id: string;
  member_id: string;
  response: 'yes' | 'no';
  is_first_training: boolean;
  responded_at: string;
};

type SalaNecunoscut = {
  telegram_user_id: number;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
};

type ActiuneBot =
  | 'kick_member'
  | 'send_poll'
  | 'send_summary'
  | 'send_reminder'
  | 'send_message'
  // Ziua de antrenament: jurnalul botului pentru ce face din Telegram, plus
  // anunțul anulării/reactivării cerut de admin (`sala_06`).
  | 'cancel_session'
  | 'reactivate_session'
  | 'move_session'
  | 'add_session';

export type SalaComanda = {
  /** Acknowledged by an admin; execution status and result remain unchanged. */
  reviewed_at?: string | null;
  id: string;
  action: ActiuneBot;
  member_id: string | null;
  status: 'pending' | 'done' | 'failed';
  /** Motivul eșecului (sau un rezultat scurt), scris de bot. */
  result: string | null;
  created_at: string;
  processed_at: string | null;
  /** De unde a venit comanda: `telegram` (organizatorul, din chatul cu botul) sau `admin`. */
  sursa?: string | null;
  /** Prenumele din Telegram sau numele adminului. Rândurile vechi n-au. */
  organizator?: string | null;
  /** Ziua antrenamentului, `YYYY-MM-DD`, la acțiunile pe un antrenament. */
  data?: string | null;
};

/** Tot ce le trebuie ecranelor grupului, dintr-o cerere. */
export type SalaDate = {
  /** Ziua de azi la Chișinău, `YYYY-MM-DD`. */
  azi: string;
  config: SalaConfig | null;
  membri: SalaMembru[];
  /** Cel mai nou primul. */
  antrenamente: SalaAntrenament[];
  raspunsuri: SalaRaspuns[];
  necunoscuti: SalaNecunoscut[];
  /** Ultimele 30, cea mai nouă prima. */
  comenzi: SalaComanda[];
  /** Ultima scoatere (`kick_member`) a fiecărui membru, oricât de veche. */
  scoateri: SalaComanda[];
};

/** Ce-i trebuie cardului de pe pornire. */
export type SalaRezumat = {
  azi: string;
  /** `null` când rândul de setări nu există încă. */
  pornit: boolean | null;
  poll_days: number[] | null;
  poll_time: string | null;
  urmatorul: {
    session_date: string;
    starts_at: string;
    location: string;
    status: SalaAntrenament['status'];
    /** Sondajul pentru el a plecat deja în grup. */
    poll_sent: boolean;
    vin: number;
    nu_vin: number;
  } | null;
};

export const incarcaSala = (token: string, signal?: AbortSignal): Promise<SalaDate> =>
  rpc<SalaDate>('admin_sala_date', { p_token: token }, signal);

export const incarcaRezumatSala = (token: string, signal?: AbortSignal): Promise<SalaRezumat> =>
  rpc<SalaRezumat>('admin_sala_rezumat', { p_token: token }, signal);

/** Prezența de mână. `clear` șterge răspunsul. */
export const seteazaPrezenta = (
  token: string,
  sesiune: string,
  membru: string,
  raspuns: 'yes' | 'no' | 'clear'
): Promise<void> =>
  rpc<void>('admin_sala_set_prezenta', {
    p_token: token,
    p_sesiune: sesiune,
    p_membru: membru,
    p_raspuns: raspuns,
  });

/**
 * Anulează (sau reactivează) antrenamentul dintr-o zi. Dacă sondajul lui e deja în
 * grup, botul anunță grupul în cel mult un minut; `motiv` apare în anunț (R13).
 */
export const seteazaAntrenament = (token: string, data: string, anulat: boolean, motiv?: string): Promise<void> =>
  rpc<void>('admin_sala_seteaza_antrenament', {
    p_token: token,
    p_data: data,
    p_anulat: anulat,
    ...(motiv ? { p_motiv: motiv } : {}),
  });

export const salveazaConfigBot = (token: string, config: SalaConfig): Promise<void> =>
  rpc<void>('admin_sala_salveaza_config', { p_token: token, p_config: config });

export const pornesteBot = (token: string, pornit: boolean): Promise<void> =>
  rpc<void>('admin_sala_porneste_bot', { p_token: token, p_pornit: pornit });

export type ComandaAcum = 'send_poll' | 'send_summary' | 'send_reminder' | 'send_message';

/** O comandă „acum" pentru bot. `html` doar pentru `send_message`. */
export const trimiteComanda = (token: string, actiune: ComandaAcum, html?: string): Promise<string> =>
  rpc<string>('admin_sala_comanda', { p_token: token, p_actiune: actiune, p_html: html ?? null });

export const verificaMembri = (token: string): Promise<void> =>
  rpc<void>('admin_sala_verifica_membri', { p_token: token });

export const scoateDinGrup = (token: string, membru: string): Promise<string> =>
  rpc<string>('admin_sala_scoate_din_grup', { p_token: token, p_membru: membru });

export type DateMembru = {
  nume: string;
  telegramId: number | null;
  telegramUser: string | null;
  status: StareMembru;
  admin: boolean;
};

export const salveazaMembru = (token: string, membru: string, d: DateMembru): Promise<void> =>
  rpc<void>('admin_sala_salveaza_membru', {
    p_token: token,
    p_membru: membru,
    p_nume: d.nume,
    p_telegram_id: d.telegramId,
    p_telegram_user: d.telegramUser,
    p_status: d.status,
    p_admin: d.admin,
  });

/** Leagă un cont de Telegram necunoscut de un membru existent. */
export const leagaCont = (token: string, telegramId: number, membru: string): Promise<void> =>
  rpc<void>('admin_sala_leaga_cont', { p_token: token, p_telegram_id: telegramId, p_membru: membru });

/** Face un membru nou dintr-un cont de Telegram necunoscut. */
export const membruDinCont = (token: string, telegramId: number, nume: string): Promise<string> =>
  rpc<string>('admin_sala_membru_din_cont', { p_token: token, p_telegram_id: telegramId, p_nume: nume });

export const unesteMembri = (token: string, pastrat: string, eliminat: string): Promise<void> =>
  rpc<void>('admin_sala_uneste', { p_token: token, p_pastrat: pastrat, p_eliminat: eliminat });

/** Motivele de refuz pe care serverul le numește. */
export const REFUZURI_SALA = [
  'raspuns_invalid',
  'antrenament_inexistent',
  'membru_inexistent',
  'data_invalida',
  'config_invalid',
  'zi_invalida',
  'ora_invalida',
  'loc_invalid',
  'prag_invalid',
  'text_prea_lung',
  'comanda_necunoscuta',
  'mesaj_gol',
  'mesaj_prea_lung',
  'membru_admin',
  'fara_telegram',
  'nume_invalid',
  'telegram_invalid',
  'utilizator_invalid',
  'status_invalid',
  'telegram_deja_legat',
  'cont_inexistent',
  'acelasi_membru',
  'antrenament_anulat',
  'motiv_prea_lung',
] as const;

export type RefuzSala = (typeof REFUZURI_SALA)[number];

/** Motivul recunoscut al serverului, sau `null` când nu-l știm traduce. */
export const refuzSala = (err: unknown): RefuzSala | null => {
  const text = err instanceof Error ? err.message : String(err);
  return REFUZURI_SALA.find((motiv) => text.includes(motiv)) ?? null;
};

/** Motivul, în cuvintele organizatorului. */
export const MESAJE_REFUZ: Record<RefuzSala, string> = {
  raspuns_invalid: 'Răspunsul nu e unul cunoscut.',
  antrenament_inexistent: 'Antrenamentul nu mai există.',
  membru_inexistent: 'Membrul nu mai există.',
  data_invalida: 'Data nu e validă.',
  config_invalid: 'Setările nu sunt complete.',
  zi_invalida: 'Zilele trebuie alese din listă, fiecare o singură dată.',
  ora_invalida: 'Ora trebuie scrisă ca 06:30.',
  loc_invalid: 'Locul nu poate fi gol (cel mult 120 de caractere).',
  prag_invalid: 'Pragul trebuie să fie un număr întreg, de la 0 în sus.',
  text_prea_lung: 'Titlul are voie la 80 de caractere, butoanele la 32.',
  comanda_necunoscuta: 'Comanda nu e una pe care botul o știe.',
  mesaj_gol: 'Mesajul e gol.',
  mesaj_prea_lung: 'Mesajul trece de limita Telegram (4096 de caractere, cu mențiuni).',
  membru_admin: 'Adminii grupului nu pot fi scoși. Scoate-i întâi statutul de admin.',
  fara_telegram: 'Membrul nu are cont de Telegram legat, deci botul n-are pe cine scoate.',
  nume_invalid: 'Numele trebuie să aibă între 2 și 80 de caractere.',
  telegram_invalid: 'Id-ul de Telegram are doar cifre.',
  utilizator_invalid: 'Numele de utilizator Telegram are doar litere, cifre și „_”.',
  status_invalid: 'Starea nu e una cunoscută.',
  telegram_deja_legat: 'Contul de Telegram e deja legat de alt membru.',
  cont_inexistent: 'Contul a fost deja legat sau nu mai există.',
  acelasi_membru: 'Alege doi membri diferiți.',
  motiv_prea_lung: 'Motivul are voie la 200 de caractere.',
  antrenament_anulat: 'Antrenamentul de mâine e anulat, deci botul n-are pentru ce să trimită sondaj sau reminder.',
};

export const marcheazaComandaVerificata = (token: string, comanda: string): Promise<void> =>
  rpc('admin_sala_marcheaza_verificat', { p_token: token, p_comanda: comanda });


export type TrialConfig = {
  message_texts?: Record<string, string>;
  enabled: boolean; bot_username: string; welcome_text: string; trial_conditions: string;
  trial_price: string; bring_text: string; continuation_conditions: string;
  duration_minutes: number; organizer_telegram_id: number | null; contact_text: string;
  permissions_verified_at: string | null;
};
export type TrialProspect = {
  id: string; telegram_user_id: number; telegram_username: string | null;
  full_name: string | null; source: string; stage: string; dm_enabled: boolean;
  /** Numele din profilul Telegram, ținut la zi de bot (lipsește înainte de migrare). */
  telegram_first_name?: string | null; telegram_last_name?: string | null;
};
/** Un pas din drumul persoanei, scris de baza de date (`trial_events`). */
export type TrialEvent = {
  id: string; prospect_id: string; kind: string; occurred_at: string;
  detail: Record<string, unknown>; backfilled: boolean;
};
type TrialBooking = {
  id: string; prospect_id: string; status: string; version: number;
  session_start: string; session_location: string; attendance_at: string | null;
  continuation: 'yes' | 'no' | null;
};
type TrialQuestion = { id: string; prospect_id: string; body: string; response: string | null; status: string };
type TrialMessage = { id: string; prospect_id: string; kind: string; status: string; result: string | null; created_at: string };
export type TrialData = {
  config: TrialConfig; prospects: TrialProspect[]; bookings: TrialBooking[];
  questions: TrialQuestion[]; messages: TrialMessage[];
  /** Lipsește înainte de migrarea istoricului: ecranul o tratează ca listă goală. */
  events?: TrialEvent[];
  organizers: { id: string; full_name: string; telegram_user_id: number }[];
};
export const loadTrials = async (token: string, signal?: AbortSignal): Promise<TrialData> => {
  const data = await rpc<TrialData>('admin_trial_data', { p_token: token }, signal);
  if (!data?.config || !Array.isArray(data.prospects) || !Array.isArray(data.bookings)) throw new Error('trial_data_unavailable');
  return data;
};
export const saveTrialConfig = (token: string, config: TrialConfig) => rpc<void>('admin_trial_config', { p_token: token, p_config: config });
export const trialAttendance = (token: string, booking: string, attended: boolean, version: number, correction: boolean) => rpc<void>('admin_trial_attendance', { p_token: token, p_booking: booking, p_attended: attended, p_version: version, p_correction: correction });
export const trialReply = (token: string, question: string, response: string) => rpc<void>('admin_trial_reply', { p_token: token, p_question: question, p_response: response });
export const retryTrialMessage = (token: string, message: string) => rpc<void>('admin_trial_retry', { p_token: token, p_message: message });

export function trialNeedsAttention(data: TrialData) {
  return data.bookings.filter(b => b.status === 'awaiting_attendance').length
    + data.questions.filter(q => q.status === 'open').length
    + data.messages.filter(m => m.status === 'failed' || m.status === 'ambiguous').length;
}


export type AdminWorkoutRow = {
  id: string;
  /** Poziția în program, 1…N. Poziție, nu identificator: mutarea renumerotează. */
  numar: number;
  status: 'published' | 'superseded';
  titlu: string;
  corp: string;
  vizibil: boolean;
  creat_la: string;
};

/**
 * Salvează o săptămână. Efect imediat pe site — nu trece prin ciornă.
 *
 * `id` null înseamnă „săptămână nouă": serverul îi pune numărul următor, deci
 * organizatorul nu tastează și nu alege niciun număr. `id` dat înseamnă „editez
 * săptămâna asta" și e id-ul rândului ei PUBLICAT — nu numărul ei, fiindcă un
 * număr trimis dintr-un ecran rămas în urmă după o renumerotare ar lovi altă
 * săptămână decât cea apăsată.
 *
 * Serverul decide dacă scrie o versiune nouă sau peticește rândul publicat:
 * titlul sau corpul schimbat scriu, vizibilitatea singură peticește. Clientul nu
 * trebuie să știe regula, doar să nu o contrazică trimițând altceva.
 */
export const saveWeeklyWorkout = (
  token: string,
  id: string | null,
  titlu: string,
  corp: string,
  vizibil: boolean
): Promise<string> =>
  rpc<string>('admin_save_weekly_workout', {
    p_token: token,
    p_id: id,
    p_titlu: titlu,
    p_corp: corp,
    p_vizibil: vizibil,
  });

/**
 * Programul, cu tot cu versiuni.
 *
 * Verifică forma rândurilor, spre deosebire de celelalte wrappere, fiindcă e
 * singurul RPC din migrarea programului care și-a păstrat SEMNĂTURA schimbându-și
 * forma răspunsului (`activ` → `vizibil`, plus `numar`). Toate celelalte s-au
 * redenumit sau au primit un parametru, deci o bază nemigrată le respinge din
 * PostgREST. Ăsta ar rezolva liniștit împotriva funcției vechi și ar întoarce
 * rânduri fără `numar`, iar ecranul ar randa un program greșit în loc să se
 * oprească — exact felul de eșec tăcut pe care fereastra dintre deploy și
 * migrarea manuală îl face posibil (vezi `MIGRATIONS.md`).
 */
export const listWeeklyWorkout = async (
  token: string,
  signal?: AbortSignal
): Promise<AdminWorkoutRow[]> => {
  const randuri = await rpc<AdminWorkoutRow[]>(
    'admin_list_weekly_workout',
    { p_token: token },
    signal
  );
  if (!Array.isArray(randuri)) throw new Error('weekly_workout_forma_veche');
  for (const r of randuri) {
    if (typeof r?.numar !== 'number' || typeof r?.vizibil !== 'boolean') {
      throw new Error('weekly_workout_forma_veche');
    }
  }
  return randuri;
};

/**
 * Mută o săptămână cu o poziție. Întoarce numărul ei de după mutare — la capăt
 * de program e același, fiindcă nu există vecin și asta nu e o eroare.
 *
 * Operație, nu listă întreagă: clipurile Instagram trimit lista fiindcă fac
 * parte dintr-un document-ciornă, dar aici nu există ciornă, iar o listă
 * întreagă ar fi transformat orice reîmprospătare ratată într-o rescriere a
 * programului.
 */
export const moveWeeklyWorkout = (
  token: string,
  id: string,
  directie: -1 | 1
): Promise<number> =>
  rpc<number>('admin_move_weekly_workout', { p_token: token, p_id: id, p_directie: directie });

/** Șterge o săptămână cu tot cu versiunile ei și compactează numerele. Definitiv. */
export const deleteWeeklyWorkout = (token: string, id: string): Promise<number> =>
  rpc<number>('admin_delete_weekly_workout', { p_token: token, p_id: id });

export const restoreWeeklyWorkout = (token: string, id: string): Promise<string> =>
  rpc<string>('admin_restore_weekly_workout', { p_token: token, p_id: id });

/**
 * Refuzul serverului, în cuvintele operatorului.
 *
 * Stă lângă wrapper, nu în componentă: codul `workout_empty` e o proprietate a
 * RPC-ului, iar oricine îl mai cheamă cândva are nevoie de aceeași traducere.
 */
export const mesajRefuzAntrenament = (err: unknown): string => {
  const text = err instanceof Error ? err.message : String(err);
  if (text.includes('weekly_workout_forma_veche')) {
    return 'Baza de date n-are încă migrarea programului. Aplic-o înainte să folosești ecranul.';
  }
  if (text.includes('workout_empty')) {
    return 'Nu poți face vizibilă o săptămână fără text scris. Scrie antrenamentul, sau las-o ascunsă.';
  }
  if (text.includes('not_found')) {
    return 'Săptămâna aceea nu mai există. Reîncarcă pagina.';
  }
  if (text.includes('directie_invalida')) {
    return 'Nu am putut muta săptămâna. Reîncarcă pagina.';
  }
  // Neutru ca verb: aceeași traducere servește și mutarea, și ștergerea, nu doar
  // salvarea. „Nu am putut salva" pe o ștergere eșuată ar fi trimis omul să caute
  // problema în formular.
  return 'Nu a mers. Încearcă din nou.';
};

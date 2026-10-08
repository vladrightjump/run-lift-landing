import { rpc } from './adminApi';

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

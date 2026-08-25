import { SUPABASE } from './config';
import { SubmitHttpError } from './supabase';

/**
 * API-ul backoffice-ului — totul trece prin RPC-uri SECURITY DEFINER care
 * validează un token de sesiune (tabelele `admin_users`/`admin_sessions`
 * au RLS fără politici, deci cheia publică singură nu poate citi nimic).
 */

const TOKEN_KEY = 'runlift_admin_token';

export type AdminRegistration = {
  id: string;
  created_at: string;
  nume: string;
  telefon: string;
  email: string;
  echipa: string;
  /** Ediția din care face parte rândul (listările sunt filtrate pe ediție). */
  editie: number;
  /** Dezabonat de la emailuri; null = primește în continuare. */
  dezabonat_la: string | null;
};

export const getStoredToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export const storeToken = (token: string): void => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Privat mode fără localStorage — sesiunea ține doar cât pagina.
  }
};

export const clearStoredToken = (): void => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // idem
  }
};

/** Sesiune invalidă/expirată — semnal pentru revenirea la login. */
export class InvalidTokenError extends Error {
  constructor() {
    super('invalid_token');
  }
}

const rpc = async <T>(fn: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE.publishableKey,
      'Content-Type': 'application/json',
      'Content-Profile': SUPABASE.schema,
    },
    body: JSON.stringify(args),
    signal,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (body.includes('invalid_token')) throw new InvalidTokenError();
    throw new SubmitHttpError(res.status, body);
  }
  return (await res.json().catch(() => undefined)) as T;
};

/** Autentificare — întoarce token-ul de sesiune sau null la credențiale greșite. */
export const adminLogin = (username: string, password: string): Promise<string | null> =>
  rpc<string | null>('admin_login', { p_username: username, p_password: password });

export const checkToken = (token: string, signal?: AbortSignal): Promise<boolean> =>
  rpc<boolean>('admin_check_token', { p_token: token }, signal);

/** `editie` lipsă = ediția curentă din `app_config`. */
export const listRegistrations = (
  token: string,
  editie?: number,
  signal?: AbortSignal
): Promise<AdminRegistration[]> =>
  rpc<AdminRegistration[]>(
    'admin_list_registrations',
    { p_token: token, p_editie: editie ?? null },
    signal
  );

/* ---- Ediții (taburile din backoffice) ---- */

export type AdminEdition = {
  editie: number;
  participanti: number;
  asteptare: number;
  lansare: number;
  /** Prima/ultima înscriere din ediție; null dacă ediția e goală. */
  prima: string | null;
  ultima: string | null;
  /** Ediția pe care o consideră „curentă" backendul (`app_config`). */
  este_curenta: boolean;
};

export const listEditions = (token: string, signal?: AbortSignal): Promise<AdminEdition[]> =>
  rpc<AdminEdition[]>('admin_list_editions', { p_token: token }, signal);

/**
 * Deschide ediția următoare (tab nou, gol): mută ediția curentă din `app_config`
 * pe max+1 și șterge reperele de timp ale ediției încheiate (deadline + start).
 * Codul din `src/content/edition.ts` NU se schimbă — rămâne de aliniat manual.
 */
export const createEdition = (token: string): Promise<number> =>
  rpc<number>('admin_create_edition', { p_token: token });

export type AdminLaunchSignup = {
  id: string;
  created_at: string;
  nume: string;
  prenume: string;
  email: string;
  telefon: string;
  /** Ediția pentru care persoana s-a înscris (pusă de server la insert). */
  editie: number;
  /** De unde a venit: butonul de pe Coming Soon sau formularul din /despre-noi. */
  sursa: 'lansare' | 'despre-noi';
  /** Momentul confirmării din email; null = încă neconfirmat. */
  confirmat_la: string | null;
  /** Dezabonat prin linkul din email; null = primește în continuare. */
  dezabonat_la: string | null;
};

export type AdminEmailTemplate = {
  cheie: string;
  subiect: string;
  text_email: string;
  actualizat_la: string;
};

/** Șabloanele de email editabile din backoffice. */
export const listEmailTemplates = (
  token: string,
  signal?: AbortSignal
): Promise<AdminEmailTemplate[]> =>
  rpc<AdminEmailTemplate[]>('admin_list_email_templates', { p_token: token }, signal);

export const saveEmailTemplate = (
  token: string,
  cheie: string,
  subiect: string,
  text: string
): Promise<void> =>
  rpc<void>('admin_save_email_template', {
    p_token: token,
    p_cheie: cheie,
    p_subiect: subiect,
    p_text: text,
  });

/** Înscrierile la „Anunță-mă la lansare" (tabelul launch_notifications). */
export const listLaunchNotifications = (
  token: string,
  signal?: AbortSignal
): Promise<AdminLaunchSignup[]> =>
  rpc<AdminLaunchSignup[]>('admin_list_launch_notifications', { p_token: token }, signal);

/** Adaugă o înscriere (acord = true implicit). Email duplicat => HTTP 409. */
export const addRegistration = (
  token: string,
  data: { nume: string; telefon: string; email: string }
): Promise<string> =>
  rpc<string>('admin_add_registration', {
    p_token: token,
    p_nume: data.nume,
    p_telefon: data.telefon,
    p_email: data.email,
  });

export const deleteRegistration = (token: string, id: string): Promise<void> =>
  rpc<void>('admin_delete_registration', { p_token: token, p_id: id });

/** Editare in-place a unei înscrieri (păstrează `created_at`). Duplicat => HTTP 409. */
export const updateRegistration = (
  token: string,
  id: string,
  data: { nume: string; telefon: string; email: string }
): Promise<void> =>
  rpc<void>('admin_update_registration', {
    p_token: token,
    p_id: id,
    p_nume: data.nume,
    p_telefon: data.telefon,
    p_email: data.email,
  });

/* ---- Feed de audit (admin_events): promovări automate etc. ---- */

export type AdminEvent = {
  id: string;
  created_at: string;
  tip: string;
  detaliu: Record<string, unknown>;
};

export const listAdminEvents = (token: string, signal?: AbortSignal): Promise<AdminEvent[]> =>
  rpc<AdminEvent[]>('admin_list_events', { p_token: token }, signal);

/* ---- Lista de așteptare (event_waitlist) ---- */

export type AdminWaitlistEntry = {
  id: string;
  created_at: string;
  nume: string;
  telefon: string;
  email: string;
  editie: number;
};

/** `editie` lipsă = ediția curentă din `app_config`. */
export const listWaitlist = (
  token: string,
  editie?: number,
  signal?: AbortSignal
): Promise<AdminWaitlistEntry[]> =>
  rpc<AdminWaitlistEntry[]>(
    'admin_list_waitlist',
    { p_token: token, p_editie: editie ?? null },
    signal
  );

export const deleteWaitlist = (token: string, id: string): Promise<void> =>
  rpc<void>('admin_delete_waitlist', { p_token: token, p_id: id });

/** Mută o persoană din așteptare în participanți. Întoarce id-ul nou (sau null
 * dacă emailul era deja înscris). */
export const promoteWaitlist = (token: string, id: string): Promise<string | null> =>
  rpc<string | null>('admin_promote_waitlist', { p_token: token, p_id: id });

/* ---- Jurnal de livrare a emailurilor (email_log) ---- */

export type AdminEmailLogEntry = {
  id: string;
  created_at: string;
  email: string;
  nume: string;
  subiect: string;
  text_email: string;
  /** Cine a declanșat trimiterea. */
  mod: 'admin' | 'confirm' | 'promoted' | 'info' | 'broadcast';
  audienta: 'participanti' | 'asteptare' | '';
  status: 'trimis' | 'esuat';
  /** Codul HTTP de la Resend (200 la succes, 4xx/5xx la eșec). */
  provider_status: number | null;
  /** Corpul răspunsului de la provider — motivul concret al eșecului. */
  eroare: string | null;
  editie: number;
};

/**
 * `editie` lipsă = ediția curentă. Cele mai noi primele.
 *
 * `cuText`: corpul emailului e câmpul greu și e nevoie de el doar în tab-ul
 * „Livrare". Poll-ul de fundal îl cere `false` ca să nu care sute de KB la
 * fiecare refresh — rândurile vin atunci cu `text_email: ''`.
 */
export const listEmailLog = (
  token: string,
  editie?: number,
  cuText = true,
  signal?: AbortSignal
): Promise<AdminEmailLogEntry[]> =>
  rpc<AdminEmailLogEntry[]>(
    'admin_list_email_log',
    { p_token: token, p_editie: editie ?? null, p_cu_text: cuText },
    signal
  );

export const adminLogout = (token: string): Promise<void> =>
  rpc<void>('admin_logout', { p_token: token });

/* ---- Email (funcția Edge `send-email` → Resend) ---- */

export type EmailMessage = { to: string; subject: string; text: string };
export type SendEmailResult = {
  sent: number;
  failed: number;
  errors?: { to: string; status: number }[];
  /** `true` când zăvorul a oprit o difuzare deja trimisă pe aceeași cheie. */
  skipped?: boolean;
  note?: string;
};

const FUNCTIONS_URL = `${SUPABASE.url}/functions/v1`;

/**
 * Trimitere în masă din backoffice — protejată de token pe server.
 * `audience`/`editie` nu schimbă ce se trimite; ajung doar în `email_log`, ca
 * tab-ul „Livrare" să știe pe ce listă și pe ce ediție a fost trimis emailul.
 */
export const sendBulkEmail = async (
  token: string,
  messages: EmailMessage[],
  meta?: {
    audience?: 'participanti' | 'asteptare';
    editie?: number;
    /**
     * Cheie de idempotență (`src/admin/sendLock.ts`). Serverul trimite o singură
     * dată per cheie; a doua oară întoarce `skipped: true`. Lipsa ei păstrează
     * comportamentul de dinainte de zăvor.
     */
    onceKey?: string;
  },
  signal?: AbortSignal
): Promise<SendEmailResult> => {
  const res = await fetch(`${FUNCTIONS_URL}/send-email`, {
    method: 'POST',
    headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'admin',
      token,
      messages,
      audience: meta?.audience,
      editie: meta?.editie,
      once_key: meta?.onceKey,
    }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new InvalidTokenError();
    throw new SubmitHttpError(res.status, JSON.stringify(body));
  }
  return body as SendEmailResult;
};

import { SUPABASE } from '../../../../shared/lib/config';
import { SubmitHttpError } from '../../../../shared/lib/errors';
import { InvalidTokenError, rpc } from '../../../../shared/lib/rpc';
export { InvalidTokenError } from '../../../../shared/lib/rpc';

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
  /**
   * Tokenul din `{link_renunt}` — cu el își eliberează locul din email.
   *
   * Opțional în tip, nu în DB: rândurile din `admin-preview.tsx` (backoffice-ul
   * demonstrativ, fără server) nu-l au, iar un câmp obligatoriu ar fi cerut
   * inventarea unor UUID-uri care nu deschid nimic.
   */
  token_renunt?: string;
  /**
   * A venit la cursă. `null`/absent = încă nu se știe; `false` = s-a constatat
   * că n-a venit.
   *
   * Distincția e tot rostul coloanei: o valoare implicită `false` ar afirma
   * absența fiecărui înscris cu săptămâni înainte de cursă.
   */
  prezent?: boolean | null;
  /** Numărul de concurs. Unic pe ediție între rândurile vii. */
  numar?: number | null;
  /** Timpul final, ca `HH:MM:SS` — serverul îl fixează la forma asta. */
  timp_final?: string | null;
};

/** Cele trei câmpuri de prezență, așa cum se scriu împreună. */
export type Prezenta = {
  prezent: boolean | null;
  numar: number | null;
  timp_final: string | null;
};

/**
 * Motivul refuzului la scrierea prezenței, tradus.
 *
 * `null` când serverul n-a răspuns în termeni pe care-i știm — de regulă
 * fiindcă n-a răspuns deloc.
 */
export type RefuzPrezenta =
  | 'not_found'
  | 'timp_invalid'
  | 'numar_invalid'
  | 'numar_duplicat';

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

/* ---- Configurarea ediției (`event_config`) ---- */

export { listEventConfig, type AdminEventConfigRow } from '../../../../shared/lib/eventConfigAdmin';

/** Salvează ciorna. Nu schimbă nimic din ce vede vizitatorul. */
export const saveEventConfigDraft = (
  token: string,
  editie: number,
  config: unknown
): Promise<string> =>
  rpc<string>('admin_save_event_config_draft', {
    p_token: token,
    p_editie: editie,
    p_config: config,
  });

/**
 * Publică ciorna. Aceeași tranzacție scrie și cele șase scalare din
 * `app_config` pe care le citesc guard-urile și cron-ul de remindere — de asta
 * nu mai există desincronizare de aliniat manual.
 *
 * Refuzuri așteptate: `no_draft`, `config_invalid: …`,
 * `registration_hidden_while_open: …`.
 */
export const publishEventConfig = (token: string, editie: number): Promise<string> =>
  rpc<string>('admin_publish_event_config', { p_token: token, p_editie: editie });

/** Revenire la o versiune păstrată — republicare, deci rescrie și scalarele. */
export const restoreEventConfig = (token: string, id: string): Promise<string> =>
  rpc<string>('admin_restore_event_config', { p_token: token, p_id: id });

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

/**
 * Adaugă o înscriere (acord = true implicit). Email duplicat => HTTP 409.
 * Serverul refuză peste `event_capacity` cu `event_full`; `force` e derogarea
 * explicită a operatorului, nu un implicit.
 */
export const addRegistration = (
  token: string,
  data: { nume: string; telefon: string; email: string },
  force = false
): Promise<string> =>
  rpc<string>('admin_add_registration', {
    p_token: token,
    p_nume: data.nume,
    p_telefon: data.telefon,
    p_email: data.email,
    p_force: force,
  });

/** Ștergere LOGICĂ — rândul rămâne, cu `deleted_at` setat. */
export const deleteRegistration = (token: string, id: string): Promise<void> =>
  rpc<void>('admin_delete_registration', { p_token: token, p_id: id });

/**
 * Reversarea ștergerii: același rând, deci același `created_at` și aceeași
 * poziție în ordinea de promovare. Refuză cu `event_full` dacă locul a fost
 * ocupat între timp (auto-promovare) și cu `duplicate_email` dacă adresa a fost
 * re-înscrisă — ambele erau, înainte, supraîncărcări tăcute.
 */
export const undeleteRegistration = (
  token: string,
  id: string,
  force = false
): Promise<void> =>
  rpc<void>('admin_undelete_registration', { p_token: token, p_id: id, p_force: force });

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

/**
 * Scrie cele trei câmpuri de prezență pe un rând.
 *
 * Se scriu ÎMPREUNĂ și `null` ȘTERGE — semantica e „starea de prezență a
 * rândului e asta", nu „actualizează ce ți-am dat". Altfel un număr pus din
 * greșeală n-ar mai putea fi scos niciodată.
 */
export const setPrezenta = (
  token: string,
  id: string,
  date: Prezenta
): Promise<void> =>
  rpc<void>('admin_set_prezenta', {
    p_token: token,
    p_id: id,
    p_prezent: date.prezent,
    p_numar: date.numar,
    p_timp_final: date.timp_final,
  });

/** Motivul recunoscut al serverului, sau `null` când nu-l știm traduce. */
export const refuzPrezenta = (err: unknown): RefuzPrezenta | null => {
  const text = err instanceof Error ? err.message : String(err);
  for (const motiv of ['numar_duplicat', 'numar_invalid', 'timp_invalid', 'not_found'] as const) {
    if (text.includes(motiv)) return motiv;
  }
  return null;
};

/* ---- Feed de audit (admin_events): promovări automate etc. ---- */

export type AdminEvent = {
  id: string;
  created_at: string;
  tip: string;
  detaliu: Record<string, unknown>;
};

/**
 * Feedul de audit. Plafonul nu mai e fix la 50: de când fiecare scriere din
 * admin lasă urmă, feedul e răspunsul la „ce s-a întâmplat cu Ana?".
 */
export const listAdminEvents = (
  token: string,
  limit = 200,
  signal?: AbortSignal
): Promise<AdminEvent[]> =>
  rpc<AdminEvent[]>('admin_list_events', { p_token: token, p_limit: limit }, signal);

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

/** Ștergere LOGICĂ — rândul rămâne, cu `deleted_at` setat. */
export const deleteWaitlist = (token: string, id: string): Promise<void> =>
  rpc<void>('admin_delete_waitlist', { p_token: token, p_id: id });

/**
 * Reversarea ștergerii de pe listă: același rând, deci același `created_at` și
 * aceeași poziție în ordinea FIFO de promovare. Refuză cu `waitlist_full` dacă
 * plafonul s-a umplut între timp, cu `duplicate_email` dacă adresa a fost
 * re-adăugată, și cu `not_found` dacă rândul a fost promovat — promovarea îl
 * șterge fizic, deci nu mai e nimic de readus.
 */
export const undeleteWaitlist = (token: string, id: string, force = false): Promise<void> =>
  rpc<void>('admin_undelete_waitlist', { p_token: token, p_id: id, p_force: force });

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
  mod: 'admin' | 'confirm' | 'promoted' | 'info' | 'broadcast' | 'alert' | 'anunt' | 'anunt_test';
  /** `istoric` = anunțul către toți participanții de până acum. */
  audienta: 'participanti' | 'asteptare' | 'istoric' | '';
  /**
   * Cheia șablonului cu care s-a randat mesajul; `null` pe rândurile de dinainte
   * ca jurnalul s-o rețină. Fără ea, o difuzare nu se poate rejuca: orarul are
   * două șabloane pentru aceeași audiență, iar ghicitul ar retrimite alt text.
   */
  sablon: string | null;
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

export type EmailPreview = {
  /** HTML-ul exact cum pleacă — randat de aceeași funcție ca trimiterile. */
  html: string;
  subiect: string;
  /** Destinatarul real pentru care s-au completat variabilele. */
  pentru: { email: string; nume: string };
  /** `true` când s-a randat ciorna trimisă, nu șablonul din bază. */
  ciorna?: boolean;
};

/**
 * HTML-ul randat al unui șablon, pentru un destinatar real al ediției.
 *
 * Nu trimite nimic și nu scrie în `email_log`. Fără `email`, serverul alege
 * primul destinatar al ediției — previzualizarea are nevoie de o persoană
 * concretă, altfel variabilele rămân acolade și exact ce trebuie verificat
 * (linkurile) nu se poate verifica.
 */
export const previewEmailHtml = async (
  token: string,
  template: string,
  optiuni: {
    /** Destinatarul ale cărui date completează variabilele. Lipsă: primul înscris. */
    email?: string;
    /** Textul din editor, încă nepublicat. Lipsă: se randează șablonul din bază. */
    ciorna?: { subiect: string; text: string };
  } = {},
  signal?: AbortSignal
): Promise<EmailPreview> => {
  const { email, ciorna } = optiuni;
  const res = await fetch(`${FUNCTIONS_URL}/send-email`, {
    method: 'POST',
    headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'preview', token, template, email, ...ciorna }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new InvalidTokenError();
    throw new SubmitHttpError(res.status, JSON.stringify(body));
  }
  // O funcție `send-email` mai veche decât site-ul ignoră ciorna și randează
  // șablonul din bază. Fără confirmare, ecranul l-ar prezenta drept ciornă.
  if (ciorna && (body as EmailPreview).ciorna !== true) {
    throw new Error('draft_not_rendered');
  }
  return body as EmailPreview;
};

/* ---- Anunțul către toți participanții de până acum (`send-email` → `anunt`) ---- */

/**
 * Un om care primește anunțul. FĂRĂ tokenul de dezabonare: lista o rezolvă
 * serverul (`anunt_recipients`), iar clientul are nevoie doar să vadă cine e.
 */
export type DestinatarAnunt = {
  email: string;
  nume: string;
  /** Ultima ediție la care a fost înscris. */
  ultima_editie: number;
};

/** Refuzul funcției, cu codul ei — `motivEroareAnunt` îl traduce. */
export class AnuntError extends Error {
  constructor(
    readonly status: number,
    readonly cod: string
  ) {
    super(cod);
  }
}

const postAnunt = async <T>(token: string, corp: Record<string, unknown>, signal?: AbortSignal): Promise<T> => {
  const res = await fetch(`${FUNCTIONS_URL}/send-email`, {
    method: 'POST',
    headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'anunt', token, ...corp }),
    signal,
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401) throw new InvalidTokenError();
    throw new AnuntError(res.status, body.error ?? `http_${res.status}`);
  }
  return body as T;
};

/** Cine ar primi anunțul acum. Nu trimite și nu scrie nimic. */
export const previewAnunt = (
  token: string,
  signal?: AbortSignal
): Promise<{ total: number; destinatari: DestinatarAnunt[] }> =>
  postAnunt(token, { dry_run: true }, signal);

/** Un singur email, la operator, randat ca pentru primul om din listă. */
export const trimiteTestAnunt = (
  token: string,
  date: { catre: string; subiect: string; text: string; sablon?: string }
): Promise<SendEmailResult> =>
  postAnunt(token, {
    test_to: date.catre,
    subject: date.subiect,
    text: date.text,
    sablon: date.sablon,
  });

/**
 * Anunțul propriu-zis. `exclude` doar SCOATE oameni — serverul recalculează
 * lista la trimitere, deci un tab vechi nu poate trimite cuiva din afara ei.
 */
export const trimiteAnunt = (
  token: string,
  date: { subiect: string; text: string; exclude: string[]; onceKey: string; sablon?: string }
): Promise<SendEmailResult> =>
  postAnunt(token, {
    subject: date.subiect,
    text: date.text,
    exclude: date.exclude,
    once_key: date.onceKey,
    sablon: date.sablon,
  });

/** Refuzul serverului la o rejucare, cu motivul din `admin_replay_lookup`. */
export type ReplayRefuz =
  | 'mod_exclus'
  | 'sablon_necunoscut'
  | 'destinatar_lipsa'
  | 'dezabonat'
  | 'jurnal_lipsa'
  /** Anunț: între timp s-a înscris la ediția curentă, deci nu mai e în audiență. */
  | 'nu_mai_e_in_audienta';

/**
 * Rejoacă o trimitere eșuată prin fluxul MODULUI ei.
 *
 * Nu reia textul din jurnal: serverul reconstruiește mesajul din șablon și din
 * starea de acum a destinatarului. De aceea poate refuza — cine s-a dezabonat
 * între timp nu mai e destinatar, iar o înscriere ștearsă n-are cui primi.
 */
export const replayEmail = async (
  token: string,
  logId: string
): Promise<{ sent: number; failed: number; mod: string }> => {
  const res = await fetch(`${FUNCTIONS_URL}/send-email`, {
    method: 'POST',
    headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'replay', token, log_id: logId }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) throw new InvalidTokenError();
    throw new SubmitHttpError(res.status, JSON.stringify(body));
  }
  return body as { sent: number; failed: number; mod: string };
};

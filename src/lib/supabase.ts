import { SUPABASE } from './config';
import { parseEventConfig, type EventConfig } from '../content/eventConfig';
import { logClientError } from './monitoring';
import { normalizePhone } from './validation';
import type { FormData } from './validation';

export const SUBMIT_TIMEOUT_MS = 15_000;

/** Eroare HTTP de la PostgREST — status-ul permite distincția duplicate (409). */
export class SubmitHttpError extends Error {
  status: number;

  constructor(status: number, body: string) {
    super(`Supabase ${status}: ${body}`);
    this.status = status;
  }
}

/**
 * Timeout de 15s via AbortController, compus cu un semnal extern opțional
 * (abort la unmount). La expirare, abort cu TimeoutError distinct în catch.
 */
const timeoutSignal = (externalSignal?: AbortSignal): { signal: AbortSignal; done: () => void } => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort(new DOMException('timeout', 'TimeoutError'));
  }, SUBMIT_TIMEOUT_MS);

  if (externalSignal?.aborted) {
    controller.abort(externalSignal.reason);
  } else {
    externalSignal?.addEventListener('abort', () => controller.abort(externalSignal.reason), {
      once: true,
    });
  }

  return { signal: controller.signal, done: () => window.clearTimeout(timer) };
};

/**
 * Dovezile anti-bot care însoțesc fiecare submit public.
 *  • `token`   — Turnstile, verificat server-side (vezi `src/lib/turnstile.ts`)
 *  • `hp`      — honeypot; orice conținut = bot
 *  • `elapsed` — ms de la afișarea formularului; prea puțin = bot
 */
export type AntiBot = { token: string; hp: string; elapsed: number };

type SubmitMode = 'registration' | 'waitlist' | 'launch';

/**
 * Trimite un formular public prin funcția Edge `submit-form`.
 *
 * De ce nu mai scriem direct în PostgREST: cheia publishable e vizibilă în
 * bundle, deci un bot putea insera fără să treacă vreodată prin pagină. Acum RLS
 * interzice INSERT din `anon`, iar funcția scrie cu cheia de service DOAR după ce
 * a validat token-ul Turnstile la Cloudflare.
 *
 * Funcția propagă statusul și textul de eroare de la PostgREST ca atare, deci
 * `isDuplicateError` (409) și `isEventFullError` &co. (textul erorii) rămân
 * valabile neschimbate.
 */
const postForm = async (
  mode: SubmitMode,
  data: Record<string, unknown>,
  antiBot: AntiBot,
  externalSignal?: AbortSignal
): Promise<Response> => {
  const { signal, done } = timeoutSignal(externalSignal);
  try {
    const res = await fetch(`${SUPABASE.url}/functions/v1/submit-form`, {
      method: 'POST',
      headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode,
        token: antiBot.token,
        hp: antiBot.hp,
        elapsed: antiBot.elapsed,
        data,
      }),
      signal,
    });
    if (!res.ok) {
      throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
    }
    return res;
  } finally {
    done();
  }
};

/**
 * INSERT în `registrations`, prin `submit-form`. Emailul e unic
 * (case-insensitive) — duplicat => HTTP 409. Întoarce id-ul rândului, generat de
 * server (`Prefer: return=minimal` nu întoarce rândul înapoi).
 *
 * `editie` NU se trimite: o pune DEFAULT-ul din DB (`current_event_edition()`),
 * ca ediția să fie decisă de server, nu de client.
 */
export const submitRegistration = async (
  data: FormData,
  antiBot: AntiBot,
  externalSignal?: AbortSignal
): Promise<string> => {
  const res = await postForm(
    'registration',
    {
      nume: data.nume.trim(),
      telefon: normalizePhone(data.telefon),
      email: data.email.trim(),
      dataNasterii: data.dataNasterii || '',
      acord: data.acord,
    },
    antiBot,
    externalSignal
  );
  const body = (await res.json().catch(() => ({}))) as { id?: string };
  return body.id ?? '';
};

/**
 * Trimite emailul de confirmare pentru o înscriere tocmai făcută (best-effort).
 * Nu blochează fluxul de succes — dacă emailul eșuează, înscrierea rămâne validă.
 */
export const sendConfirmationEmail = async (id: string): Promise<void> => {
  if (!id) return;
  try {
    await fetch(`${SUPABASE.url}/functions/v1/send-email`, {
      method: 'POST',
      headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'confirm', id }),
    });
  } catch (err) {
    // Confirmarea e opțională — nu blocăm fluxul, dar lăsăm o urmă.
    logClientError('send-confirmation-email', err);
  }
};

export type LaunchNotificationData = {
  nume: string;
  prenume: string;
  email: string;
  telefon: string;
};

/**
 * De unde a venit înscrierea. Serverul acceptă doar aceste două valori
 * (constraint + politică RLS pe `launch_notifications.sursa`).
 */
export type SursaInscriere = 'lansare' | 'despre-noi';

/**
 * INSERT în `launch_notifications` (formularul „Anunță-mă la lansare"), prin
 * `submit-form`. Emailul e unic (case-insensitive) — duplicat => HTTP 409.
 *
 * Emailul de bun venit („info") îl trimite tot funcția Edge, best-effort, imediat
 * după insert — clientul nu mai face un al doilea apel.
 */
export const submitLaunchNotification = async (
  data: LaunchNotificationData,
  antiBot: AntiBot,
  externalSignal?: AbortSignal,
  sursa: SursaInscriere = 'lansare'
): Promise<void> => {
  await postForm(
    'launch',
    {
      nume: data.nume.trim(),
      prenume: data.prenume.trim(),
      email: data.email.trim(),
      telefon: normalizePhone(data.telefon),
      sursa,
      // `editie` NU se trimite: o pune DEFAULT-ul din DB.
    },
    antiBot,
    externalSignal
  );
};

export type PublicParticipant = { nume: string; echipa: string };
export type PublicStats = { count: number; participants: PublicParticipant[]; waitlist: number };

/**
 * INSERT în `event_waitlist` (lista de așteptare, când locurile sunt pline), prin
 * `submit-form`. Un trigger limitează la 10/ediție (eroare `waitlist_full`);
 * emailul e unic pe ediție (duplicat => HTTP 409).
 */
export const submitWaitlist = async (
  data: FormData,
  antiBot: AntiBot,
  externalSignal?: AbortSignal
): Promise<void> => {
  await postForm(
    'waitlist',
    {
      nume: data.nume.trim(),
      telefon: normalizePhone(data.telefon),
      email: data.email.trim(),
      dataNasterii: data.dataNasterii || '',
      acord: data.acord,
    },
    antiBot,
    externalSignal
  );
};

/** Lista de așteptare e plină (trigger `waitlist_full`). */
export const isWaitlistFullError = (err: unknown): boolean =>
  err instanceof SubmitHttpError && err.message.includes('waitlist_full');

/**
 * Locurile s-au ocupat între timp — serverul a respins înscrierea (trigger
 * `registrations_guard` → `event_full`). Frontend-ul era stale; comutăm pe waitlist.
 */
export const isEventFullError = (err: unknown): boolean =>
  err instanceof SubmitHttpError && err.message.includes('event_full');

/** Deadline-ul de înscriere a trecut, verificat pe server (`registration_closed`). */
export const isRegistrationClosedError = (err: unknown): boolean =>
  err instanceof SubmitHttpError && err.message.includes('registration_closed');

/** Date publice, ne-personale: număr înscriși + prenume mascat + echipă. */
export const fetchStats = async (signal?: AbortSignal): Promise<PublicStats> => {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/public_stats`, {
    headers: { apikey: SUPABASE.publishableKey, 'Accept-Profile': SUPABASE.schema },
    signal,
  });
  if (!res.ok) {
    throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
  }
  return (await res.json()) as PublicStats;
};

/**
 * Configurarea ediției publicate. Date publice, ne-personale — aceeași formă ca
 * `fetchStats`: RPC stabil peste un tabel închis de RLS, cu cheia publicabilă.
 * E o CITIRE, deci lockdown-ul pe INSERT n-o atinge.
 *
 * Întoarce `null` când documentul nu se poate randa, ca apelantul să rămână pe
 * instantaneul de build în loc să afișeze o pagină ciuntită.
 */
export const fetchPublicConfig = async (signal?: AbortSignal): Promise<EventConfig | null> => {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/public_config`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE.publishableKey,
      'Content-Type': 'application/json',
      'Content-Profile': SUPABASE.schema,
    },
    body: '{}',
    signal,
  });
  if (!res.ok) {
    throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
  }
  return parseEventConfig(await res.json());
};

export type ConfirmResult = 'confirmat' | 'deja_confirmat' | 'invalid';

/**
 * Confirmă înscrierea pe baza token-ului din linkul primit pe email.
 * Token-ul e secretul; RPC-ul întoarce doar starea, nu date personale.
 */
export const confirmSignup = async (
  token: string,
  signal?: AbortSignal
): Promise<ConfirmResult> => {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/confirm_signup`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE.publishableKey,
      'Content-Type': 'application/json',
      'Content-Profile': SUPABASE.schema,
    },
    body: JSON.stringify({ p_token: token }),
    signal,
  });
  if (!res.ok) {
    throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
  }
  const result = (await res.json()) as string;
  return (['confirmat', 'deja_confirmat'].includes(result) ? result : 'invalid') as ConfirmResult;
};

export type UnsubResult = 'dezabonat' | 'deja_dezabonat' | 'invalid';

/**
 * Dezabonare din emailurile în masă, pe baza token-ului din link. Token-ul e
 * secretul; RPC-ul întoarce doar starea, nu date personale.
 */
export const unsubscribe = async (token: string, signal?: AbortSignal): Promise<UnsubResult> => {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/unsubscribe`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE.publishableKey,
      'Content-Type': 'application/json',
      'Content-Profile': SUPABASE.schema,
    },
    body: JSON.stringify({ p_token: token }),
    signal,
  });
  if (!res.ok) {
    throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
  }
  const result = (await res.json()) as string;
  return (['dezabonat', 'deja_dezabonat'].includes(result) ? result : 'invalid') as UnsubResult;
};

export const isDuplicateError = (err: unknown): boolean =>
  err instanceof SubmitHttpError && err.status === 409;

/**
 * `submit-form` a respins submit-ul ca fiind automat: token Turnstile invalid
 * (403), honeypot completat sau submit prea rapid (400 `bot`/`too_fast`).
 * Merită un mesaj propriu — „mai încearcă o dată" e inutil aici.
 */
export const isBotRejectedError = (err: unknown): boolean =>
  err instanceof SubmitHttpError && /captcha_failed|"bot"|too_fast/.test(err.message);

export const isTimeoutError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'TimeoutError';

export const isAbortError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

/**
 * `fetch` a eșuat la nivel de rețea — inclusiv când browserul BLOCHEAZĂ cererea
 * prin CSP (`connect-src`). Un `fetch` care nu ajunge la un răspuns aruncă mereu
 * `TypeError`, dar MESAJUL diferă între browsere (Chrome „Failed to fetch",
 * Safari/iOS „Load failed", Firefox „NetworkError…"), așa că NU ne bazăm pe text.
 * Un răspuns HTTP de eroare e `SubmitHttpError`, nu `TypeError`, deci `instanceof
 * TypeError` separă corect cele două, pe toate browserele.
 */
export const isNetworkOrCspError = (err: unknown): boolean => err instanceof TypeError;

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
 * INSERT în `registrations`. RLS permite doar insert cu `acord = true`;
 * emailul e unic (case-insensitive) — duplicat => HTTP 409.
 */
export const submitRegistration = async (
  data: FormData,
  externalSignal?: AbortSignal
): Promise<string> => {
  const { signal, done } = timeoutSignal(externalSignal);
  // Generăm id-ul în client (RLS blochează citirea rândului înapoi) ca să-l
  // putem folosi la trimiterea emailului de confirmare.
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : undefined;
  try {
    const res = await fetch(`${SUPABASE.url}/rest/v1/registrations`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE.publishableKey,
        'Content-Type': 'application/json',
        'Content-Profile': SUPABASE.schema,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        ...(id ? { id } : {}),
        nume: data.nume.trim(),
        telefon: normalizePhone(data.telefon),
        email: data.email.trim(),
        data_nasterii: data.dataNasterii || null,
        acord: data.acord,
        // `editie` NU se trimite: o pune serverul din DEFAULT
        // (`current_event_edition()`), iar politica RLS respinge orice valoare
        // venită din client. Altfel un tab vechi ar scrie în ediția greșită.
      }),
      signal,
    });
    if (!res.ok) {
      throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
    }
    return id ?? '';
  } finally {
    done();
  }
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
 * INSERT în `launch_notifications` (formularul „Anunță-mă la lansare").
 * RLS permite doar insert pentru `anon`; emailul e unic (case-insensitive) — duplicat => HTTP 409.
 */
export const submitLaunchNotification = async (
  data: LaunchNotificationData,
  externalSignal?: AbortSignal,
  sursa: SursaInscriere = 'lansare'
): Promise<void> => {
  const { signal, done } = timeoutSignal(externalSignal);
  try {
    const res = await fetch(`${SUPABASE.url}/rest/v1/launch_notifications`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE.publishableKey,
        'Content-Type': 'application/json',
        'Content-Profile': SUPABASE.schema,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        nume: data.nume.trim(),
        prenume: data.prenume.trim(),
        email: data.email.trim(),
        telefon: normalizePhone(data.telefon),
        sursa,
        // `editie` NU se trimite: o pune serverul din DEFAULT, iar politica
        // RLS respinge orice valoare venită din client.
      }),
      signal,
    });
    if (!res.ok) {
      throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
    }
  } finally {
    done();
  }
};

/**
 * Emailul de bun venit pentru cei care cer informații (best-effort).
 * Șablonul e configurabil din /admin; dacă trimiterea eșuează, înscrierea
 * rămâne validă — nu blocăm fluxul de succes.
 */
export const sendInfoEmail = async (email: string): Promise<void> => {
  if (!email) return;
  try {
    await fetch(`${SUPABASE.url}/functions/v1/send-email`, {
      method: 'POST',
      headers: { apikey: SUPABASE.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'info', email }),
    });
  } catch (err) {
    // Emailul e opțional — nu blocăm fluxul, dar lăsăm o urmă.
    logClientError('send-info-email', err);
  }
};

export type PublicParticipant = { nume: string; echipa: string };
export type PublicStats = { count: number; participants: PublicParticipant[]; waitlist: number };

/**
 * INSERT în `event_waitlist` (lista de așteptare, când locurile sunt pline).
 * RLS permite doar insert cu `acord = true`; un trigger limitează la 10/ediție
 * (eroare `waitlist_full`); emailul e unic pe ediție (duplicat => HTTP 409).
 */
export const submitWaitlist = async (
  data: FormData,
  externalSignal?: AbortSignal
): Promise<void> => {
  const { signal, done } = timeoutSignal(externalSignal);
  try {
    const res = await fetch(`${SUPABASE.url}/rest/v1/event_waitlist`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE.publishableKey,
        'Content-Type': 'application/json',
        'Content-Profile': SUPABASE.schema,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        nume: data.nume.trim(),
        telefon: normalizePhone(data.telefon),
        email: data.email.trim(),
        data_nasterii: data.dataNasterii || null,
        acord: data.acord,
        // idem: ediția o pune serverul, nu bundle-ul.
      }),
      signal,
    });
    if (!res.ok) {
      throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
    }
  } finally {
    done();
  }
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

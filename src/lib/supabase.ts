import { SUPABASE } from './config';
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
): Promise<void> => {
  const { signal, done } = timeoutSignal(externalSignal);
  try {
    const res = await fetch(`${SUPABASE.url}/rest/v1/registrations`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE.publishableKey,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        nume: data.nume.trim(),
        telefon: normalizePhone(data.telefon),
        email: data.email.trim(),
        echipa: data.echipa.trim(),
        acord: data.acord,
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

export type PublicParticipant = { nume: string; echipa: string };
export type PublicStats = { count: number; participants: PublicParticipant[] };

/** Date publice, ne-personale: număr înscriși + prenume mascat + echipă. */
export const fetchStats = async (signal?: AbortSignal): Promise<PublicStats> => {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/public_stats`, {
    headers: { apikey: SUPABASE.publishableKey },
    signal,
  });
  if (!res.ok) {
    throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
  }
  return (await res.json()) as PublicStats;
};

export const isDuplicateError = (err: unknown): boolean =>
  err instanceof SubmitHttpError && err.status === 409;

export const isTimeoutError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'TimeoutError';

export const isAbortError = (err: unknown): boolean =>
  err instanceof DOMException && err.name === 'AbortError';

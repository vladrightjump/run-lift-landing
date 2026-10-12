/** Eroare HTTP de la PostgREST — status-ul permite distincția duplicate (409). */
export class SubmitHttpError extends Error {
  status: number;

  constructor(status: number, body: string) {
    super(`Supabase ${status}: ${body}`);
    this.status = status;
  }
}

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

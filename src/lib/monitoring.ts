/**
 * Monitoring ușor pentru client (fără backend/serviciu extern). Scopul: eșecurile
 * să lase o urmă vizibilă în consolă, ca să nu se mai repete situația din 4 august
 * când un blocaj CSP arăta ca o eroare generică și nu se logea nicăieri.
 *
 * `logClientError` — log structurat, apelat din toate `catch`-urile relevante.
 * `installGlobalMonitoring` — prinde ce scapă: violări CSP, erori globale,
 * promisiuni respinse. Se instalează o singură dată, în `main.tsx`.
 */
import { CURRENT_EDITION } from './config';

type Meta = Record<string, unknown>;

/** Log structurat al unei erori de client, cu context și metadate utile la debug. */
export const logClientError = (context: string, err: unknown, meta: Meta = {}): void => {
  const info: Meta =
    err instanceof Error
      ? { name: err.name, message: err.message }
      : { name: 'NonError', message: String(err) };

  // `SubmitHttpError` (și altele) expun un status numeric — îl scoatem fără să
  // importăm supabase.ts (ar crea import circular: supabase.ts → monitoring.ts).
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === 'number') info.status = status;

  console.error(`[runlift:${context}]`, {
    ...info,
    ...meta,
    editie: CURRENT_EDITION,
    url: typeof location !== 'undefined' ? location.href : undefined,
    at: new Date().toISOString(),
  });
};

let installed = false;

/** Atașează listenerele globale de monitorizare (idempotent). */
export const installGlobalMonitoring = (): void => {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  // Violare CSP — EXACT semnalul care lipsea în 4 august. Dacă `connect-src`
  // e desincronizat cu SUPABASE.url, aici apare clar ce URL a fost blocat.
  document.addEventListener('securitypolicyviolation', (e) => {
    logClientError('csp-violation', new Error('Content-Security-Policy a blocat o resursă'), {
      blockedURI: e.blockedURI,
      violatedDirective: e.violatedDirective,
      effectiveDirective: e.effectiveDirective,
      hint: e.effectiveDirective?.startsWith('connect-src')
        ? 'connect-src pare desincronizat cu SUPABASE.url — verifică vercel.json.'
        : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (e) => {
    logClientError('unhandledrejection', e.reason);
  });

  window.addEventListener('error', (e) => {
    logClientError('window-error', e.error ?? new Error(e.message), {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });
};

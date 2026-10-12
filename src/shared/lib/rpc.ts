import { SUPABASE } from '../../lib/config';
import { SubmitHttpError } from '../../lib/supabase';

/** Sesiune invalidă/expirată — semnal pentru revenirea la login. */
export class InvalidTokenError extends Error {
  constructor() {
    super('invalid_token');
  }
}

/** Cererea comună: un RPC Supabase cu cheia publicabilă. */
const cere = (fn: string, args: Record<string, unknown>, signal?: AbortSignal) =>
  fetch(`${SUPABASE.url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE.publishableKey,
      'Content-Type': 'application/json',
      'Content-Profile': SUPABASE.schema,
    },
    body: JSON.stringify(args),
    signal,
  });

export const rpc = async <T>(fn: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> => {
  const res = await cere(fn, args, signal);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (body.includes('invalid_token')) throw new InvalidTokenError();
    throw new SubmitHttpError(res.status, body);
  }
  return (await res.json().catch(() => undefined)) as T;
};

/**
 * Ca `rpc`, dar un corp care nu e JSON e o eroare, nu `undefined`. Pentru
 * paginile publice la care „n-am putut întreba" și „serverul a zis nu" arată
 * diferit: un răspuns stricat trebuie să ajungă în starea de eroare.
 */
export const rpcStrict = async <T>(fn: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> => {
  const res = await cere(fn, args, signal);
  if (!res.ok) {
    throw new SubmitHttpError(res.status, await res.text().catch(() => ''));
  }
  return (await res.json()) as T;
};

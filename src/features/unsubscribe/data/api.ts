import { rpcStrict } from '../../../shared/lib/rpc';

export type UnsubResult = 'dezabonat' | 'deja_dezabonat' | 'invalid';

/**
 * Dezabonare din emailurile în masă, pe baza token-ului din link. Token-ul e
 * secretul; RPC-ul întoarce doar starea, nu date personale.
 */
export const unsubscribe = async (token: string, signal?: AbortSignal): Promise<UnsubResult> => {
  const result = await rpcStrict<string>('unsubscribe', { p_token: token }, signal);
  return (['dezabonat', 'deja_dezabonat'].includes(result) ? result : 'invalid') as UnsubResult;
};

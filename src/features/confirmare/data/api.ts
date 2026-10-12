import { rpcStrict } from '../../../shared/lib/rpc';

export type ConfirmResult = 'confirmat' | 'deja_confirmat' | 'invalid';

/**
 * Confirmă înscrierea pe baza token-ului din linkul primit pe email.
 * Token-ul e secretul; RPC-ul întoarce doar starea, nu date personale.
 */
export const confirmSignup = async (token: string, signal?: AbortSignal): Promise<ConfirmResult> => {
  const result = await rpcStrict<string>('confirm_signup', { p_token: token }, signal);
  return (['confirmat', 'deja_confirmat'].includes(result) ? result : 'invalid') as ConfirmResult;
};

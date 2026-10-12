import { rpcStrict } from '../../../shared/lib/rpc';

export type DeclineResult = 'renuntat' | 'deja_renuntat' | 'prea_tarziu' | 'invalid';

/**
 * Renunțarea la loc, pe baza token-ului din email. Locul se eliberează pe loc și
 * declanșează promovarea primului din lista de așteptare.
 *
 * NU se cheamă la încărcarea paginii, spre deosebire de `unsubscribe`. Diferența
 * nu e stilistică: dezabonarea e reversibilă cu o reînscriere, pe când locul
 * eliberat pleacă imediat la altcineva. Pagina cere un click explicit, iar
 * linkul din email duce la pagină, nu aici — altfel un scaner de linkuri al
 * providerului ar fi dat locul mai departe fără ca omul să fi atins nimic.
 */
export const declineSpot = async (token: string, signal?: AbortSignal): Promise<DeclineResult> => {
  const result = await rpcStrict<string>('decline_spot', { p_token: token }, signal);
  return (['renuntat', 'deja_renuntat', 'prea_tarziu'].includes(result) ? result : 'invalid') as DeclineResult;
};

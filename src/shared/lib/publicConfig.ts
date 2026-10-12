import { SUPABASE } from './config';
import { parseEventConfig, type EventConfig } from '../content/eventConfig';
import { SubmitHttpError } from './errors';
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

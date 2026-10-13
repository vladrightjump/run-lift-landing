import { rpc } from './rpc';

export type AdminEventConfigRow = {
  id: string;
  editie: number;
  config: unknown;
  status: 'draft' | 'published' | 'superseded';
  created_at: string;
  /** Momentul publicării; null cât timp rândul e ciornă. */
  published_at: string | null;
};

/**
 * Ciorna + publicatul ediției cerute (lipsă = ediția curentă din `app_config`),
 * plus versiunile păstrate, pentru revenire.
 */
export const listEventConfig = (
  token: string,
  editie?: number,
  signal?: AbortSignal
): Promise<AdminEventConfigRow[]> =>
  rpc<AdminEventConfigRow[]>(
    'admin_get_event_config',
    { p_token: token, p_editie: editie ?? null },
    signal
  );

import { useCallback, useEffect, useId, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/** Fiecare montare păstrează ciclul public anterior: fără cache între pagini. */
export function usePublicQuery<T>(name: string, load: (signal: AbortSignal) => Promise<T>, enabled = true, intervalMs: number | null = null) {
  const client = useQueryClient();
  const id = useId();
  const queryKey = useMemo(() => ['public', name, id], [name, id]);
  const query = useQuery({ queryKey, queryFn: async ({ signal }) => ({ value: await load(signal) }), enabled, gcTime: 0, staleTime: Infinity, structuralSharing: false });
  const { refetch } = query;
  const refresh = useCallback(() => {
    void client.cancelQueries({ queryKey, exact: true });
    return refetch();
  }, [client, queryKey, refetch]);
  useEffect(() => {
    if (!enabled) { void client.cancelQueries({ queryKey, exact: true }); return; }
    if (intervalMs === null) return;
    const tick = () => { void refresh(); };
    const timer = window.setInterval(tick, intervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [client, queryKey, enabled, intervalMs, refresh]);
  return { ...query, refresh };
}

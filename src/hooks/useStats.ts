import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchStats } from '../lib/supabase';
import type { PublicStats } from '../lib/supabase';

const REFRESH_MS = 15_000;

/**
 * Statistici live (număr înscriși + participanți publici) din Supabase.
 * `stats` rămâne null dacă API-ul nu răspunde — caller-ul folosește
 * fallback-ul static (OCCUPIED_SLOTS).
 */
export const useStats = () => {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetchStats(controller.signal)
      .then(setStats)
      .catch(() => {
        // Păstrăm ultima valoare cunoscută (sau fallback-ul static).
      });
  }, []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, REFRESH_MS);
    // Refresh imediat când tab-ul redevine vizibil — numărul e proaspăt
    // fix în momentul în care userul se uită, nu la următorul tick.
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      abortRef.current?.abort();
    };
  }, [refresh]);

  return { stats, refresh };
};

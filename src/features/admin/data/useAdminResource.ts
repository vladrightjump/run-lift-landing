import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ADMIN_REFRESH_MS } from './useAdminPolling';
import { useSesiuneAdmin } from './adminSession';
import { wasAuthErrorHandled } from '../../../app/providers';

/** Query deține încărcarea și anularea; poll-ul anulează și înlocuiește. Un refresh picat păstrează datele. */
export type ResursaAdmin<T> = {
  /** `null` cât timp n-a venit niciun răspuns bun. */
  date: T | null;
  /** Adevărat doar dacă a picat ȘI n-avem încă nimic de arătat. */
  eroare: boolean;
  /**
   * Reîncarcă acum, anulând cererea în zbor. Promisiunea se împlinește când
   * răspunsul a ajuns pe ecran: true la succes, false la eșec sau anulare.
   */
  reincarca: () => Promise<boolean>;
};

// Contractul vechi repornește încărcarea când se schimbă callback-ul stabil.
type Loader = (token: string, signal: AbortSignal) => Promise<unknown>;
const loaderIds = new WeakMap<Loader, number>();
let nextLoaderId = 0;
const loaderId = (loader: Loader) => {
  let id = loaderIds.get(loader);
  if (id === undefined) {
    id = ++nextLoaderId;
    loaderIds.set(loader, id);
  }
  return id;
};

export const useAdminResource = <T>(
  /** Stabil (`useCallback`) — identitatea lui repornește încărcarea. */
  incarca: (token: string, signal: AbortSignal) => Promise<T>,
  /** `null` = se încarcă o singură dată. */
  intervalMs: number | null = ADMIN_REFRESH_MS
): ResursaAdmin<T> => {
  const { token } = useSesiuneAdmin();
  const client = useQueryClient();
  const id = useId();
  const queryKey = useMemo(() => ['admin-resource', token, id, loaderId(incarca)], [token, id, incarca]);
  const [previous, setPrevious] = useState<{ date: T | null; eroare: boolean }>({ date: null, eroare: false });
  const signalRef = useRef<AbortSignal | null>(null);
  const { data, error, refetch } = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      signalRef.current = signal;
      // RPC poate întoarce undefined pentru un corp gol; Query cere un cache
      // definit, fără să schimbăm valoarea livrată ecranului.
      return { date: await incarca(token, signal) };
    },
    gcTime: 0,
  });
  // Ca înainte, datele și eroarea inițială rămân până la un răspuns bun,
  // inclusiv când schimbarea callback-ului creează un query nou.
  const date = data !== undefined ? data.date : previous.date;
  const eroare = error && date === null && !wasAuthErrorHandled(client, queryKey, error)
    ? true
    : data !== undefined ? false : previous.eroare;
  if (date !== previous.date || eroare !== previous.eroare) setPrevious({ date, eroare });

  const reincarca = useCallback(() => {
    // `refetch` singur nu anulează prima cerere, cât timp n-avem încă date.
    void client.cancelQueries({ queryKey, exact: true });
    const request = refetch({ throwOnError: true });
    const signal = signalRef.current;
    // Query poate întoarce datele precedente după anulare; contractul nostru
    // întoarce false pentru cererea anulată, chiar dacă au rămas date bune.
    return request.then(result => !signal?.aborted && result.isSuccess).catch(() => false);
  }, [client, queryKey, refetch]);

  // Nu `refetchInterval`: acela refolosește cererea rămasă în zbor. Poll-ul
  // vechi o anula și pornea alta, și cerea imediat la revenirea în tab.
  useEffect(() => {
    if (intervalMs === null) return;
    const tick = () => void reincarca();
    const timer = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [reincarca, intervalMs]);

  return {
    date,
    eroare,
    reincarca,
  };
};

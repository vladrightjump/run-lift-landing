import { useCallback, useEffect, useRef } from 'react';

/**
 * Poll-ul comun al backoffice-ului. `AdminDashboard` și `AdminLaunchTab` aveau
 * fiecare aceeași secvență copiată — interval, listener pe `visibilitychange`,
 * `AbortController` per cerere și curățenie la demontare — iar fiecare tab nou
 * ar fi adus încă o copie.
 *
 * Hook-ul deține DOAR programarea și anularea. Ce se cere efectiv rămâne la
 * apelant: primește un `AbortSignal` și îl dă mai departe apelurilor din
 * `adminApi`. Callback-ul returnat declanșează un refresh manual (după o
 * ștergere, o promovare etc.) cu aceleași garanții de anulare.
 *
 * Vezi `tests/unit/useAdminPolling.test.ts`.
 */

/** Ritmul poll-ului din backoffice. Un singur operator, ~30 de rânduri. */
export const ADMIN_REFRESH_MS = 15_000;

export const useAdminPolling = (
  /** Stabil (`useCallback`) — identitatea lui repornește intervalul. */
  fetch: (signal: AbortSignal) => void,
  intervalMs: number = ADMIN_REFRESH_MS
): (() => void) => {
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    // O singură cerere în zbor: cea nouă o anulează pe cea veche, ca un răspuns
    // întârziat să nu suprascrie unul mai proaspăt.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    fetch(controller.signal);
  }, [fetch]);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      abortRef.current?.abort();
    };
  }, [refresh, intervalMs]);

  return refresh;
};

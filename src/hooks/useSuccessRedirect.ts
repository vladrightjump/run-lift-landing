import { useCallback, useEffect, useRef, useState } from 'react';

/** Unde aterizează cineva după înscriere (ancora secțiunii „Cine vine"). */
export const REDIRECT_TO = '/#participanti';

/** Câte secunde stă mesajul de confirmare înainte de redirect. */
export const REDIRECT_SECONDS = 3;

type Options = {
  /** `true` cât timp e afișată confirmarea (phase === 'success'). */
  active: boolean;
  to?: string;
  seconds?: number;
  /** `false` → nu redirecționăm deloc (ex. în overlay-ul de pe landing). */
  enabled?: boolean;
};

/**
 * Numărătoare inversă până la redirect, cu frână: orice interacțiune a
 * utilizatorului (atingere, click, tastă, scroll) o anulează — ca să nu-i smulgem
 * de sub degete butoanele „Adaugă în calendar" / „Distribuie".
 *
 * Întoarce `left` (secunde rămase), `cancelled` și `cancel()` pentru butonul
 * „Rămân aici".
 */
export const useSuccessRedirect = ({
  active,
  to = REDIRECT_TO,
  seconds = REDIRECT_SECONDS,
  enabled = true,
}: Options) => {
  const [left, setLeft] = useState(seconds);
  const [cancelled, setCancelled] = useState(false);
  const cancelledRef = useRef(false);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setCancelled(true);
  }, []);

  useEffect(() => {
    if (!active || !enabled) return;
    cancelledRef.current = false;
    setCancelled(false);
    setLeft(seconds);

    const onInteract = () => cancel();
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const ev of events) window.addEventListener(ev, onInteract, { passive: true });

    const tick = window.setInterval(() => {
      if (cancelledRef.current) return;
      setLeft((n) => {
        if (n <= 1) {
          window.clearInterval(tick);
          window.location.assign(to);
          return 0;
        }
        return n - 1;
      });
    }, 1000);

    return () => {
      window.clearInterval(tick);
      for (const ev of events) window.removeEventListener(ev, onInteract);
    };
  }, [active, enabled, seconds, to, cancel]);

  return { left, cancelled, cancel, total: seconds };
};

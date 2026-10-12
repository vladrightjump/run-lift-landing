import { useEffect, useState } from 'react';

/**
 * Timestamp-ul curent, reîmprospătat la fiecare `intervalMs`.
 * Pentru stări derivate din timp (deadline de înscriere, event ended)
 * care trebuie să se actualizeze și în tab-uri lăsate deschise.
 */
export const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  return now;
};

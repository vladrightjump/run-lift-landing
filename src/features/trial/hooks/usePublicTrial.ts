import { useEffect, useState } from 'react';
import { loadPublicTrial, type PublicTrialConfig } from '../data/api';

/** Cât așteaptă homepage-ul după configul probei înainte să așeze cardul fără el. */
const ASTEPTARE_MS = 2000;

/**
 * Configul probei, plus `gata`: răspunsul (sau eșecul) a sosit, ori a trecut
 * limita. Ecranul dintre ediții îl folosește ca să nu monteze cardul sub butoane
 * și să-l împingă apoi în jos când apare secțiunea de probă deasupra lui.
 */
export function usePublicTrialStare(): { config: PublicTrialConfig | null; gata: boolean } {
  const [config, setConfig] = useState<PublicTrialConfig | null>(null);
  const [gata, setGata] = useState(false);
  useEffect(() => {
    const control = new AbortController();
    const limita = window.setTimeout(() => setGata(true), ASTEPTARE_MS);
    // An unavailable or not-yet-migrated service keeps this optional entry hidden.
    void loadPublicTrial(control.signal)
      .then(setConfig)
      .catch(() => {})
      .finally(() => {
        if (!control.signal.aborted) setGata(true);
      });
    return () => {
      window.clearTimeout(limita);
      control.abort();
    };
  }, []);
  return { config, gata };
}

export function usePublicTrial() {
  return usePublicTrialStare().config;
}

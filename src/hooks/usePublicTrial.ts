import { useEffect, useState } from 'react';
import { loadPublicTrial, type PublicTrialConfig } from '../lib/trialPublic';

/**
 * Starea probei publice. „Se încarcă" e separat de „oprit": pe ecranul dintre
 * ediții oprit înseamnă butonul spre Instagram, iar fără distincție butonul
 * Instagram ar clipi înaintea celui Telegram la fiecare încărcare.
 */
export type StareProba =
  | { fel: 'incarca' }
  | { fel: 'pornit'; config: PublicTrialConfig }
  | { fel: 'oprit' };

export function useStareProba(): StareProba {
  const [stare, setStare] = useState<StareProba>({ fel: 'incarca' });
  useEffect(() => {
    const control = new AbortController();
    loadPublicTrial(control.signal).then(
      (config) => setStare(config ? { fel: 'pornit', config } : { fel: 'oprit' }),
      // O cerere anulată (demontare, curățarea dublă din StrictMode) nu spune nimic
      // despre bot; doar o eroare reală înseamnă oprit.
      () => {
        if (!control.signal.aborted) setStare({ fel: 'oprit' });
      }
    );
    return () => control.abort();
  }, []);
  return stare;
}

/** Configul, doar când proba e pornită. Landing-ul și teaser-ul ascund secțiunea altfel. */
export function usePublicTrial(): PublicTrialConfig | null {
  const stare = useStareProba();
  return stare.fel === 'pornit' ? stare.config : null;
}

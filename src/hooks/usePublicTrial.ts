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

/**
 * Cât așteptăm configul înainte să arătăm butonul Instagram. Cererea n-are
 * timeout propriu, iar una blocată ar lăsa primul bloc fără nicio acțiune.
 */
export const LIMITA_INCARCARE_PROBA_MS = 4000;

/**
 * `cuLimita` doar pe ecranul dintre ediții, unde proba e mesajul paginii și
 * trebuie să aibă mereu un buton. Landing-ul și teaser-ul așteaptă oricât, ca
 * înainte: acolo secțiunea e opțională și apare doar cu botul pornit.
 */
export function useStareProba({ cuLimita = false }: { cuLimita?: boolean } = {}): StareProba {
  const [stare, setStare] = useState<StareProba>({ fel: 'incarca' });
  useEffect(() => {
    const control = new AbortController();
    // La limită anulăm cererea, ca un răspuns întârziat să nu schimbe butonul
    // sub degetul cuiva care tocmai a ales Instagram.
    const limita = cuLimita
      ? window.setTimeout(() => {
          control.abort();
          setStare({ fel: 'oprit' });
        }, LIMITA_INCARCARE_PROBA_MS)
      : undefined;
    loadPublicTrial(control.signal).then(
      (config) => {
        window.clearTimeout(limita);
        setStare(config ? { fel: 'pornit', config } : { fel: 'oprit' });
      },
      // O cerere anulată (demontare, curățarea dublă din StrictMode, limita de
      // mai sus) nu spune nimic despre bot; doar o eroare reală înseamnă oprit.
      () => {
        window.clearTimeout(limita);
        if (!control.signal.aborted) setStare({ fel: 'oprit' });
      }
    );
    return () => {
      window.clearTimeout(limita);
      control.abort();
    };
  }, [cuLimita]);
  return stare;
}

/** Configul, doar când proba e pornită. Landing-ul și teaser-ul ascund secțiunea altfel. */
export function usePublicTrial(): PublicTrialConfig | null {
  const stare = useStareProba();
  return stare.fel === 'pornit' ? stare.config : null;
}

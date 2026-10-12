import { useSyncExternalStore } from 'react';

/**
 * Pragul unic al adminului (KTD5): sub 760 px, popoverele și panourile devin
 * foi de jos, iar zonele stau într-o bară de jos. E pragul prototipului.
 */
const INTEROGARE_TELEFON = '(max-width: 759.98px)';

const mq = (): MediaQueryList | null =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(INTEROGARE_TELEFON)
    : null;

const abonare = (anunta: () => void) => {
  const lista = mq();
  lista?.addEventListener?.('change', anunta);
  return () => lista?.removeEventListener?.('change', anunta);
};

export const useEsteTelefon = (): boolean =>
  useSyncExternalStore(abonare, () => mq()?.matches ?? false, () => false);

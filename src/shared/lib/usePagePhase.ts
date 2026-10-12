import { useCountdown } from './useCountdown';
import { useEditionDates } from './useEventConfig';

/**
 * Faza în care se află homepage-ul în ziua cursei:
 *
 * - `pre`         — landing normal, înscrierile deschise
 * - `leaderboard` — de la LEADERBOARD_DATE: landing fără formular, „cine vine" sus
 * - `next`        — de la EVENT_END_DATE: countdown spre următorul antrenament
 *
 * Comutarea e a ceasului, nu a unui redeploy — aceeași mecanică pe care o
 * folosește deja `App.tsx` pentru poarta de lansare (`LAUNCH_DATE`): două
 * countdown-uri care bat din secundă în secundă și se opresc după ce trec.
 */
export type PagePhase = 'pre' | 'leaderboard' | 'next';

/** Valoarea `?preview=` din URL, pentru verificarea fazelor înainte de ora lor. */
export const previewParam = (): string | null =>
  new URLSearchParams(window.location.search).get('preview');

export const usePagePhase = (): PagePhase => {
  const { LEADERBOARD_DATE, EVENT_END_DATE } = useEditionDates();
  const lista = useCountdown(LEADERBOARD_DATE);
  const final = useCountdown(EVENT_END_DATE);

  // Preview-ul bate ceasul, ca fazele să poată fi văzute cu o seară înainte.
  // `landing` există de dinainte și înseamnă „landing-ul complet", adică `pre`.
  const preview = previewParam();
  if (preview === 'next') return 'next';
  if (preview === 'leaderboard') return 'leaderboard';
  if (preview === 'landing') return 'pre';

  // Ordinea contează: exact pe graniță `useCountdown` raportează deja `done`,
  // deci faza următoare câștigă și nu există moment fără fază.
  if (final.done) return 'next';
  if (lista.done) return 'leaderboard';
  return 'pre';
};

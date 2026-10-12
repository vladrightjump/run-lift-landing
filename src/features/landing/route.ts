import { LandingPage } from './pages/LandingPage';

type LandingSearch = { preview?: 'landing' | 'soon' | 'leaderboard' | 'next' };

/** Necunoscutele rămân în URL; previewParam citește în continuare adresa originală. */
export const rutaLanding = {
  path: '/',
  component: LandingPage,
  validateSearch: (search: Record<string, unknown>): LandingSearch => {
    const { preview } = search;
    return preview === 'landing' || preview === 'soon' || preview === 'leaderboard' || preview === 'next'
      ? { preview }
      : {};
  },
} as const;


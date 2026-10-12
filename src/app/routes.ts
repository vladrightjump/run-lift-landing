import { lazyRouteComponent } from '@tanstack/react-router';
import { LandingPage } from '../features/landing';
import { rutaAntrenament } from '../features/antrenament/index';
import { rutaConfirmare } from '../features/confirmare/index';
import { rutaInscriere } from '../features/inscriere/index';
import { rutaRenunt } from '../features/renunt/index';
import { rutaUnsubscribe } from '../features/unsubscribe/index';

type LandingSearch = { preview?: 'landing' | 'soon' | 'leaderboard' | 'next' };

/** Necunoscutele rămân în URL; previewParam citește în continuare adresa originală. */
export const landingPage = {
  path: '/',
  component: LandingPage,
  validateSearch: (search: Record<string, unknown>): LandingSearch => {
    const { preview } = search;
    return preview === 'landing' || preview === 'soon' || preview === 'leaderboard' || preview === 'next'
      ? { preview }
      : {};
  },
} as const;

export const editionPages = [
  { path: '/admin', component: lazyRouteComponent(() => import('../admin/AdminApp'), 'AdminApp') },
  rutaConfirmare,
  rutaInscriere,
  rutaUnsubscribe,
  rutaRenunt,
] as const;

export const independentPages = [
  { path: '/despre-noi', component: lazyRouteComponent(() => import('../features/despre-noi'), 'DespreNoi') },
  rutaAntrenament,
] as const;

/** Același registru compune arborele și păzește paritatea cu rewrites explicite. */
export const ROUTE_PATHS = [landingPage, ...editionPages, ...independentPages].map((page) => page.path);

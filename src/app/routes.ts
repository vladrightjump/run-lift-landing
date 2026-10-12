import { lazyRouteComponent } from '@tanstack/react-router';
import { App } from '../App';
import { rutaAntrenament } from '../features/antrenament';
import { rutaConfirmare } from '../features/confirmare';
import { rutaInscriere } from '../features/inscriere';
import { rutaRenunt } from '../features/renunt';
import { rutaUnsubscribe } from '../features/unsubscribe';

type LandingSearch = { preview?: 'landing' | 'soon' | 'leaderboard' | 'next' };

/** Necunoscutele rămân în URL; previewParam citește în continuare adresa originală. */
export const landingPage = {
  path: '/',
  component: App,
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
  { path: '/despre-noi', component: lazyRouteComponent(() => import('../components/DespreNoi'), 'DespreNoi') },
  rutaAntrenament,
] as const;

/** Același registru compune arborele și păzește paritatea cu rewrites explicite. */
export const ROUTE_PATHS = [landingPage, ...editionPages, ...independentPages].map((page) => page.path);

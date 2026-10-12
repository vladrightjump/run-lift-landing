import { lazyRouteComponent } from '@tanstack/react-router';
import { App } from '../App';

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
  { path: '/confirmare', component: lazyRouteComponent(() => import('../components/Confirmare'), 'Confirmare') },
  { path: '/inscriere', component: lazyRouteComponent(() => import('../components/Inscriere'), 'Inscriere') },
  { path: '/unsubscribe', component: lazyRouteComponent(() => import('../components/Unsubscribe'), 'Unsubscribe') },
  { path: '/renunt', component: lazyRouteComponent(() => import('../components/Renunt'), 'Renunt') },
] as const;

export const independentPages = [
  { path: '/despre-noi', component: lazyRouteComponent(() => import('../components/DespreNoi'), 'DespreNoi') },
  { path: '/antrenament', component: lazyRouteComponent(() => import('../components/Antrenament'), 'Antrenament') },
] as const;

/** Același registru compune arborele și păzește paritatea cu rewrites explicite. */
export const ROUTE_PATHS = [landingPage, ...editionPages, ...independentPages].map((page) => page.path);

import { lazyRouteComponent } from '@tanstack/react-router';

/** Pagina de înscriere cu link direct. Formularul ei e încă în `components/landing/` și se mută cu landing-ul. Se încarcă la cerere. */
export const rutaInscriere = {
  path: '/inscriere',
  component: lazyRouteComponent(() => import('./pages/InscrierePage'), 'InscrierePage'),
} as const;

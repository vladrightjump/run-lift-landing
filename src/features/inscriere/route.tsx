import { lazyRouteComponent } from '@tanstack/react-router';

/** Pagina de înscriere cu link direct. Formularul și logica sunt locale; pagina se încarcă la cerere. */
export const rutaInscriere = {
  path: '/inscriere',
  component: lazyRouteComponent(() => import('./pages/InscrierePage'), 'InscrierePage'),
} as const;

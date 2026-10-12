import { lazyRouteComponent } from '@tanstack/react-router';

/** Pagina din linkul de confirmare a înscrierii. Se încarcă la cerere. */
export const rutaConfirmare = {
  path: '/confirmare',
  component: lazyRouteComponent(() => import('./pages/ConfirmarePage'), 'ConfirmarePage'),
} as const;

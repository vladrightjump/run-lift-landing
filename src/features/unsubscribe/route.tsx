import { lazyRouteComponent } from '@tanstack/react-router';

/** Pagina din linkul de dezabonare de la emailurile în masă. Se încarcă la cerere. */
export const rutaUnsubscribe = {
  path: '/unsubscribe',
  component: lazyRouteComponent(() => import('./pages/UnsubscribePage'), 'UnsubscribePage'),
} as const;

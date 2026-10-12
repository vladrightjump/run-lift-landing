import { lazyRouteComponent } from '@tanstack/react-router';

/** Pagina „Nu mai pot veni", din emailurile către participanți. Se încarcă la cerere. */
export const rutaRenunt = {
  path: '/renunt',
  component: lazyRouteComponent(() => import('./pages/RenuntPage'), 'RenuntPage'),
} as const;

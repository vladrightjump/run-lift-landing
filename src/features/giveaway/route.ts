import { lazyRouteComponent } from '@tanstack/react-router';

/** Pagina giveaway-ului de pe Instagram. Nu ține de nicio ediție; se încarcă la cerere. */
export const rutaGiveaway = {
  path: '/giveaway',
  component: lazyRouteComponent(() => import('./pages/GiveawayPage'), 'GiveawayPage'),
} as const;

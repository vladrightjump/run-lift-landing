import { lazyRouteComponent } from '@tanstack/react-router';

/**
 * Ruta `/antrenament`. Pagina se încarcă la cerere: importul dinamic e singura
 * legătură cu ea, deci cine folosește doar cardurile nu descarcă pagina.
 */
export const rutaAntrenament = {
  path: '/antrenament',
  component: lazyRouteComponent(() => import('./pages/AntrenamentPage'), 'AntrenamentPage'),
} as const;

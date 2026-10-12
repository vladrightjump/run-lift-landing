import { lazyRouteComponent } from '@tanstack/react-router';

export const rutaDespreNoi = { path: '/despre-noi', component: lazyRouteComponent(() => import('./pages/DespreNoiPage'), 'DespreNoi') } as const;

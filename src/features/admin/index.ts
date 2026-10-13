import { lazyRouteComponent } from '@tanstack/react-router';

/** API public al adminului; paginile se încarcă numai la intrarea în admin. */
export const rutaAdmin = { path: '/admin', component: lazyRouteComponent(() => import('./pages/AdminApp'), 'AdminApp') } as const;
export const loadAdminPreview = () => import('./pages/AdminDashboard');
export { RadacinaAdmin } from './components/RadacinaAdmin';

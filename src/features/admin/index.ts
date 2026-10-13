/**
 * API-ul public al adminului: cadrul (login, cadrul cu navigarea, registrul,
 * sesiunea, linia de timp), zonele Acum și Site, și ce folosesc din ele
 * ecranele încă nemutate din `src/admin/` (Evenimente, Antrenamente) și
 * `AdminDashboard`, care le compune. Restul folderului e intern; vezi
 * docs/ARCHITECTURE.md.
 */
export { AdminLogin } from './pages/AdminLogin';
export { AdminCadru, type PropsCadru } from './components/AdminCadru';
export { LiniaDeTimp } from './components/LiniaDeTimp';
export { InvelisEditare } from './components/InvelisEditare';
export { ECRAN_IMPLICIT, estePeEditie } from './navigatie/adminNavigatie';
export { useEcranCurent } from './navigatie/useEcranCurent';
export { FurnizorSesiuneAdmin, useSesiuneAdmin } from './data/adminSession';
export { useAdminResource } from './data/useAdminResource';
export { useAdminPolling } from './data/useAdminPolling';
export { FurnizorSala, useSala } from './data/useSala';
export { useTrials } from './data/useTrials';
export { EcranAcum } from './zones/acum/EcranAcum';
export { deRezolvat } from './zones/acum/acum';
export { AdminComingSoonTab } from './zones/site/AdminComingSoonTab';
export { AdminClipuriTab } from './zones/site/AdminClipuriTab';

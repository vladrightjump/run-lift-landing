/**
 * Preview DOAR PENTRU DEZVOLTARE al backoffice-ului, cu date false.
 *
 * De ce există: `/admin` cere un cont real, deci orice lucru de design pe
 * dashboard însemna fie login în producție (cu date reale pe ecran), fie
 * ghicit din cod. Aici MSW interceptează RPC-urile Supabase și randăm
 * dashboardul complet, cu date plauzibile.
 *
 * NU e inclus în build-ul de producție: `vite.config.ts` construiește doar
 * `index.html` și `antrenament.html`. Acest modul e importat exclusiv din
 * `admin-preview.html`.
 * Se deschide cu `npm run dev` → /admin-preview.html
 */
import { StrictMode } from 'react';
import { AppProviders } from './providers';
import { createRoot } from 'react-dom/client';
// Ca în producție, unde `app/main.tsx` importă foaia globală.
import '../shared/styles/tokens.css';
import '../shared/styles/base.css';
import { loadAdminPreview, RadacinaAdmin } from '../features/admin/index';
const { AdminDashboard } = await loadAdminPreview();
import { setupWorker } from 'msw/browser';
import { browserAssets, createHandlers } from '../../tests/support/handlers';
import { adminPreviewData } from '../../tests/support/builders/preview';

const worker = setupWorker(...createHandlers(adminPreviewData(), 120), browserAssets);
await worker.start({ onUnhandledFrame: 'error', quiet: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <RadacinaAdmin>
        <AdminDashboard token="token-preview" onLogout={() => location.reload()} />
      </RadacinaAdmin>
    </AppProviders>
  </StrictMode>
);

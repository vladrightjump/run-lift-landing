import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { makeRouter } from './router';
import { AppProviders } from './providers';
import { installGlobalMonitoring } from '../lib/monitoring';
import { pornesteAnalitice } from '../lib/analytics';
import { redirectCanonic } from '../lib/canonicalHost';
import '../index.css';

// Vizitatorii ajunși pe URL-ul de `*.vercel.app` al producției sunt mutați pe
// domeniul evenimentului, cu tot cu cale și parametri. Preview-urile de PR și
// dev-ul local rămân pe loc — vezi `../lib/canonicalHost.ts`.
//
// PRIMUL lucru din fișier, înaintea oricărei randări: `replace`, nu `assign`,
// ca URL-ul greșit să nu rămână în istoric și butonul „înapoi" să nu-l aducă
// îndărăt. Un `<script>` inline în index.html ar fi mutat mai devreme, dar CSP-ul
// e `script-src 'self'`, deci n-ar rula.
const canonic = redirectCanonic({ env: __VERCEL_ENV__, href: window.location.href });
if (canonic) window.location.replace(canonic);

// Prinde violările CSP, erorile globale și promisiunile respinse — indiferent de
// pagina randată mai jos. Fără asta, un blocaj CSP (ca cel din 4 august) e mut.
installGlobalMonitoring();

// Numărătoarea de trafic. Tăcută peste tot în afară de producție — `env` vine
// de la build, ca la `redirectCanonic` de mai sus. Scriptul se încarcă de pe
// același origin, deci CSP-ul (`script-src 'self'`) nu are nevoie de nimic nou.
pornesteAnalitice(__VERCEL_ENV__);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// Paginile care arată ediția o citesc din același context: pornește pe
// instantaneul de build (primul cadru e complet, fără ecran de încărcare) și se
// reconciliază când răspunde `public_config()`.
const router = makeRouter();
createRoot(rootEl).render(
  <StrictMode><AppProviders><RouterProvider router={router} /></AppProviders></StrictMode>
);

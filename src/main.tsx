import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AdminApp } from './admin/AdminApp';
import { DespreNoi } from './components/DespreNoi';
import { Confirmare } from './components/Confirmare';
import { installGlobalMonitoring } from './lib/monitoring';
import './index.css';

// Prinde violările CSP, erorile globale și promisiunile respinse — indiferent de
// pagina randată mai jos. Fără asta, un blocaj CSP (ca cel din 4 august) e mut.
installGlobalMonitoring();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// Pagini fără router: /admin → backoffice, /despre-noi → prezentare + formular,
// /confirmare → confirmarea înscrierii din email, restul → landing / Coming Soon.
const path = window.location.pathname.replace(/\/+$/, '');

const page =
  path === '/admin' ? (
    <AdminApp />
  ) : path === '/despre-noi' ? (
    <DespreNoi />
  ) : path === '/confirmare' ? (
    <Confirmare />
  ) : (
    <App />
  );

createRoot(rootEl).render(<StrictMode>{page}</StrictMode>);

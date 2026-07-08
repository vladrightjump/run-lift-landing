import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AdminApp } from './admin/AdminApp';
import './index.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// Două pagini, fără router: /admin* → backoffice, restul → landing.
const isAdmin = window.location.pathname.replace(/\/+$/, '') === '/admin';

createRoot(rootEl).render(
  <StrictMode>{isAdmin ? <AdminApp /> : <App />}</StrictMode>
);

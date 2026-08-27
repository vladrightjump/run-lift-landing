import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AdminApp } from './admin/AdminApp';
import { DespreNoi } from './components/DespreNoi';
import { Confirmare } from './components/Confirmare';
import { Inscriere } from './components/Inscriere';
import { Unsubscribe } from './components/Unsubscribe';
import { installGlobalMonitoring } from './lib/monitoring';
import { EventConfigProvider } from './hooks/useEventConfig';
import './index.css';

// Prinde violările CSP, erorile globale și promisiunile respinse — indiferent de
// pagina randată mai jos. Fără asta, un blocaj CSP (ca cel din 4 august) e mut.
installGlobalMonitoring();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

// Pagini fără router: /admin → backoffice, /despre-noi → prezentare + formular,
// /confirmare → confirmarea înscrierii din email, /inscriere → formularul singur
// (linkul din bio/story), /unsubscribe → dezabonare, restul → landing.
const path = window.location.pathname.replace(/\/+$/, '');

const page =
  path === '/admin' ? (
    <AdminApp />
  ) : path === '/despre-noi' ? (
    <DespreNoi />
  ) : path === '/confirmare' ? (
    <Confirmare />
  ) : path === '/inscriere' ? (
    <Inscriere />
  ) : path === '/unsubscribe' ? (
    <Unsubscribe />
  ) : (
    <App />
  );

/**
 * `/despre-noi` NU primește provider-ul, deliberat.
 *
 * Pagina arată doar locul antrenamentelor și linkurile de social — lucruri care
 * rămân în cod pentru că nu țin de ediție. Nu afișează nimic derivat din ediție,
 * deci n-are ce reconcilia, iar `tests/despre-noi.spec.ts` păzește de mai demult
 * proprietatea că se încarcă fără NICIUN request către Supabase. Un provider pus
 * peste tot ar fi rupt-o tăcut, pentru un fetch de care pagina n-are nevoie.
 *
 * Componentele ei care ar chema hook-urile ar primi oricum instantaneul de build
 * din valoarea implicită a contextului.
 */
const areNevoieDeConfig = path !== '/despre-noi';

// Paginile care arată ediția o citesc din același context: pornește pe
// instantaneul de build (primul cadru e complet, fără ecran de încărcare) și se
// reconciliază când răspunde `public_config()`.
createRoot(rootEl).render(
  <StrictMode>
    {areNevoieDeConfig ? <EventConfigProvider>{page}</EventConfigProvider> : page}
  </StrictMode>
);

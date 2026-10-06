import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AdminLogin } from './AdminLogin';
import { AdminDashboard } from './AdminDashboard';
import {
  adminLogout,
  checkToken,
  clearStoredToken,
  getStoredToken,
  storeToken,
} from '../lib/adminApi';

type Session =
  | { status: 'checking' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; token: string };

/**
 * Rădăcina temei „Panoul" (KTD2 din planul redesignului adminului).
 *
 * Jetoanele adminului stau pe `.admin-app`, iar clasa de pe `<html>` vopsește
 * și fundalul paginii — fără ea, derularea peste margine ar arăta fundalul
 * închis al paginii publice sub un admin luminos. Pagina publică nu poartă
 * niciuna dintre clase, deci rămâne neschimbată.
 */
export const RadacinaAdmin = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    const html = document.documentElement;
    html.classList.add('admin-pagina');
    return () => html.classList.remove('admin-pagina');
  }, []);
  return <div className="admin-app">{children}</div>;
};

/**
 * Backoffice-ul (/admin): validează token-ul salvat la încărcare,
 * apoi arată login-ul sau dashboard-ul.
 */
export const AdminApp = () => (
  <RadacinaAdmin>
    <SesiuneAdmin />
  </RadacinaAdmin>
);

const SesiuneAdmin = () => {
  const [session, setSession] = useState<Session>(() => {
    const token = getStoredToken();
    return token ? { status: 'checking' } : { status: 'anonymous' };
  });

  useEffect(() => {
    if (session.status !== 'checking') return;
    const token = getStoredToken();
    if (!token) {
      setSession({ status: 'anonymous' });
      return;
    }
    const controller = new AbortController();
    checkToken(token, controller.signal)
      .then((valid) => {
        if (valid) {
          setSession({ status: 'authenticated', token });
        } else {
          clearStoredToken();
          setSession({ status: 'anonymous' });
        }
      })
      .catch(() => {
        // API indisponibil — nu ștergem token-ul, dar cerem login din nou.
        if (!controller.signal.aborted) setSession({ status: 'anonymous' });
      });
    return () => controller.abort();
  }, [session.status]);

  const handleLogin = useCallback((token: string) => {
    storeToken(token);
    setSession({ status: 'authenticated', token });
  }, []);

  const handleLogout = useCallback(() => {
    const token = getStoredToken();
    if (token) adminLogout(token).catch(() => {});
    clearStoredToken();
    setSession({ status: 'anonymous' });
  }, []);

  if (session.status === 'checking') {
    return (
      <main className="admin-auth">
        <div className="form-loading admin-checking">
          <div className="spinner" />
          <div className="label">Se verifică sesiunea…</div>
        </div>
      </main>
    );
  }

  if (session.status === 'anonymous') {
    return <AdminLogin onLogin={handleLogin} />;
  }

  return <AdminDashboard token={session.token} onLogout={handleLogout} />;
};

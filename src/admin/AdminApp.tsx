import { useCallback, useEffect, useState } from 'react';
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
 * Backoffice-ul (/admin): validează token-ul salvat la încărcare,
 * apoi arată login-ul sau dashboard-ul.
 */
export const AdminApp = () => {
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

import { useQuery } from '@tanstack/react-query';
import { useAdminMutation } from '../data/useAdminMutation';
import styles from './AdminApp.module.css';
import { useCallback, useEffect, useId, useState } from 'react';
import { AdminLogin } from './AdminLogin';
import { RadacinaAdmin } from '../components/RadacinaAdmin';
import { AdminDashboard } from './AdminDashboard';
import { adminLogout, checkToken, clearStoredToken, getStoredToken, storeToken } from '../data/api';

type Session =
  | { status: 'checking' }
  | { status: 'anonymous' }
  | { status: 'authenticated'; token: string };

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

  const sessionId = useId();
  const tokenDeVerificat = session.status === 'checking' ? getStoredToken() : null;
  const verificare = useQuery({
    queryKey: ['admin-session', sessionId, tokenDeVerificat],
    queryFn: async ({ signal }) => ({ valid: await checkToken(tokenDeVerificat!, signal) }),
    enabled: session.status === 'checking' && tokenDeVerificat !== null,
    gcTime: 0,
  });
  useEffect(() => {
    if (session.status !== 'checking') return;
    if (!tokenDeVerificat) {
      setSession({ status: 'anonymous' });
    } else if (verificare.isSuccess) {
      if (verificare.data?.valid) setSession({ status: 'authenticated', token: tokenDeVerificat });
      else { clearStoredToken(); setSession({ status: 'anonymous' }); }
    } else if (verificare.isError) {
      // API indisponibil — nu ștergem token-ul, dar cerem login din nou.
      setSession({ status: 'anonymous' });
    }
  }, [session.status, tokenDeVerificat, verificare.isSuccess, verificare.isError, verificare.data]);
  const logout = useAdminMutation(adminLogout);

  const handleLogin = useCallback((token: string) => {
    storeToken(token);
    setSession({ status: 'authenticated', token });
  }, []);

  const handleLogout = useCallback(() => {
    const token = getStoredToken();
    if (token) logout(token).catch(() => {});
    clearStoredToken();
    setSession({ status: 'anonymous' });
  }, [logout]);

  if (session.status === 'checking') {
    return (
      <main className="admin-auth" data-css="admin-auth">
        <div className={'form-loading ' + styles['admin-checking']} data-css="form-loading admin-checking">
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

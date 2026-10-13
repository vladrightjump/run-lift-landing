import { useAdminMutation } from '../data/useAdminMutation';
import shared1 from '../components/AdminStyles.module.css';
import styles from './AdminLogin.module.css';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { adminLogin } from '../data/api';
import { useCountdown } from '../../../shared/lib/useCountdown';
import { useEditionDates } from '../../../shared/lib/useEventConfig';

type Props = {
  onLogin: (token: string) => void;
};

export const AdminLogin = ({ onLogin }: Props) => {
  const login = useAdminMutation(adminLogin);
  const { LAUNCH_DATE } = useEditionDates();
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(false);
  const cd = useCountdown(LAUNCH_DATE);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (checking) return;
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('utilizator') ?? '').trim();
    const password = String(fd.get('parola') ?? '');

    setChecking(true);
    setError('');
    try {
      const token = await login(username, password);
      if (token) {
        onLogin(token);
        return;
      }
      setError('Utilizator sau parolă greșită. Încearcă din nou.');
    } catch {
      setError('Nu am putut contacta serverul. Verifică conexiunea.');
    }
    setChecking(false);
    setShake((n) => n + 1);
    window.setTimeout(() => setShake(0), 450);
  };

  return (
    <main className="admin-auth">
      <div className={styles['admin-auth-box']} data-css={"admin-auth-box"}>
        <div className={styles['admin-auth-brand']} data-css={"admin-auth-brand"}>
          <span className={shared1['admin-logo']} data-css={"admin-logo"}>
            Run <span className={shared1['accent']} data-css={"accent"}>+</span> Lift
          </span>
          <span className={styles['admin-badge']} data-css={"admin-badge"}>Backoffice</span>
        </div>

        <form
          className={styles['admin-auth-form'] + (shake ? ' ' + styles.shake : '')}
          data-css={`admin-auth-form${shake ? ' shake' : ''}`}
          onSubmit={handleSubmit}
        >
          <div className={styles['admin-auth-head']} data-css={"admin-auth-head"}>
            <h1>Autentificare</h1>
            <p>Acces doar pentru organizatori.</p>
          </div>

          <label className={`field${error ? ' invalid' : ''}`}>
            <span className="label">Utilizator</span>
            <input
              name="utilizator"
              type="text"
              required
              placeholder="vlad"
              autoComplete="username"
              autoCapitalize="none"
            />
          </label>

          <label className={`field${error ? ' invalid' : ''}`}>
            <span className="label">Parolă</span>
            <div className={styles['admin-password-wrap']} data-css={"admin-password-wrap"}>
              <input
                name="parola"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className={styles['admin-password-toggle']} data-css={"admin-password-toggle"}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Ascunde' : 'Arată'}
              </button>
            </div>
          </label>

          {error && (
            <p className={styles['admin-auth-error']} data-css={"admin-auth-error"} role="alert">
              <span className={styles['dot']} data-css={"dot"} />
              {error}
            </p>
          )}

          <button type="submit" className={'btn-submit ' + styles['admin-auth-submit']} data-css={"btn-submit admin-auth-submit"} disabled={checking}>
            {checking ? 'Se verifică…' : 'Intră în cont'}
          </button>
        </form>

        <p className={styles['admin-auth-countdown']} data-css={"admin-auth-countdown"}>
          <span className="countdown-dot" />
          {cd.done
            ? 'Anunțul e live'
            : `Anunț în ${cd.zile}z ${cd.ore}h ${cd.minute}m ${cd.secunde}s`}
        </p>
      </div>
    </main>
  );
};

import { useState } from 'react';
import type { FormEvent } from 'react';
import { adminLogin } from '../lib/adminApi';
import { useCountdown } from '../hooks/useCountdown';
import { EVENT_DATE } from '../lib/config';

type Props = {
  onLogin: (token: string) => void;
};

export const AdminLogin = ({ onLogin }: Props) => {
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [checking, setChecking] = useState(false);
  const cd = useCountdown(EVENT_DATE);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (checking) return;
    const fd = new FormData(e.currentTarget);
    const username = String(fd.get('utilizator') ?? '').trim();
    const password = String(fd.get('parola') ?? '');

    setChecking(true);
    setError('');
    try {
      const token = await adminLogin(username, password);
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
      <div className="admin-auth-box">
        <div className="admin-auth-brand">
          <span className="admin-logo">
            Run <span className="accent">+</span> Lift
          </span>
          <span className="admin-badge">Backoffice</span>
        </div>

        <form className={`admin-auth-form${shake ? ' shake' : ''}`} onSubmit={handleSubmit}>
          <div className="admin-auth-head">
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
            <div className="admin-password-wrap">
              <input
                name="parola"
                type={showPassword ? 'text' : 'password'}
                required
                placeholder="••••••••"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="admin-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? 'Ascunde' : 'Arată'}
              </button>
            </div>
          </label>

          {error && (
            <p className="admin-auth-error" role="alert">
              <span className="dot" />
              {error}
            </p>
          )}

          <button type="submit" className="btn-submit admin-auth-submit" disabled={checking}>
            {checking ? 'Se verifică…' : 'Intră în cont'}
          </button>
        </form>

        <p className="admin-auth-countdown">
          <span className="countdown-dot" />
          Start în {cd.zile}z {cd.ore}h {cd.minute}m {cd.secunde}s
        </p>
      </div>
    </main>
  );
};

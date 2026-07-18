import { useEffect, useState } from 'react';
import { confirmSignup } from '../lib/supabase';
import type { ConfirmResult } from '../lib/supabase';
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';

type Stare = 'loading' | ConfirmResult | 'eroare';

/** UUID v4 — validăm înainte să lovim serverul cu token evident greșit. */
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONTINUT: Record<Exclude<Stare, 'loading'>, { titlu: string; text: string; ok: boolean }> = {
  confirmat: {
    titlu: 'Înscriere confirmată!',
    text: 'Gata — ești pe listă. Îți scriem imediat ce avem noutăți despre noul antrenament.',
    ok: true,
  },
  deja_confirmat: {
    titlu: 'Erai deja confirmat',
    text: 'Linkul a fost folosit deja, totul e în regulă. Rămâi pe listă și îți scriem cu noutățile.',
    ok: true,
  },
  invalid: {
    titlu: 'Link invalid',
    text: 'Linkul nu (mai) e valabil. Dacă tocmai te-ai înscris, verifică să fi deschis exact linkul din email — sau înscrie-te din nou.',
    ok: false,
  },
  eroare: {
    titlu: 'Nu am putut verifica',
    text: 'A apărut o problemă de conexiune. Reîncarcă pagina sau încearcă din nou în câteva minute.',
    ok: false,
  },
};

export const Confirmare = () => {
  const [stare, setStare] = useState<Stare>('loading');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    if (!TOKEN_RE.test(token)) {
      setStare('invalid');
      return;
    }
    const controller = new AbortController();
    confirmSignup(token, controller.signal)
      .then(setStare)
      .catch(() => {
        if (!controller.signal.aborted) setStare('eroare');
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="cs-root">
      <div className="cs-bg" aria-hidden="true" />

      <header className="cs-topbar">
        <a className="cs-logo" href="/">
          R<span className="cs-accent">+</span>L
        </a>
        <span className="cs-brand-meta">Run + Lift · Ediția a treia</span>
      </header>

      <main className="cs-main">
        {stare === 'loading' ? (
          <p className="cs-sub">Verificăm linkul…</p>
        ) : (
          <>
            <div
              className={`cf-icon${CONTINUT[stare].ok ? '' : ' err'}`}
              aria-hidden="true"
            >
              {CONTINUT[stare].ok ? '✓' : '✕'}
            </div>
            <h1 className="cf-title">{CONTINUT[stare].titlu}</h1>
            <p className="cs-sub">{CONTINUT[stare].text}</p>
            <a className="cs-cta" href="/">
              Înapoi la pagina principală
            </a>
          </>
        )}
      </main>

      <footer className="cs-footer">
        <span>Run + Lift · Chișinău</span>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          Instagram {INSTAGRAM_HANDLE}
        </a>
      </footer>
    </div>
  );
};

import { useEffect, useState } from 'react';
import { unsubscribe } from '../lib/supabase';
import type { UnsubResult } from '../lib/supabase';
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';
import { LAUNCH_EDITION_ORDINAL } from '../content/format';

type Stare = 'loading' | UnsubResult | 'eroare';

/** UUID v4 — validăm înainte să lovim serverul cu token evident greșit. */
const TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CONTINUT: Record<Exclude<Stare, 'loading'>, { titlu: string; text: string; ok: boolean }> = {
  dezabonat: {
    titlu: 'Te-am dezabonat',
    text: 'Nu îți mai trimitem emailuri în masă. Confirmările tranzacționale (ex. înscriere) pot totuși ajunge.',
    ok: true,
  },
  deja_dezabonat: {
    titlu: 'Erai deja dezabonat',
    text: 'Adresa ta era deja scoasă de pe listă. Nu trebuie să faci nimic.',
    ok: true,
  },
  invalid: {
    titlu: 'Link invalid',
    text: 'Linkul de dezabonare nu (mai) e valabil. Dacă tot primești emailuri nedorite, scrie-ne pe Instagram.',
    ok: false,
  },
  eroare: {
    titlu: 'Nu am putut procesa',
    text: 'A apărut o problemă de conexiune. Reîncarcă pagina sau încearcă din nou în câteva minute.',
    ok: false,
  },
};

export const Unsubscribe = () => {
  const [stare, setStare] = useState<Stare>('loading');

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    if (!TOKEN_RE.test(token)) {
      setStare('invalid');
      return;
    }
    const controller = new AbortController();
    unsubscribe(token, controller.signal)
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
        <span className="cs-brand-meta">Run + Lift · Ediția {LAUNCH_EDITION_ORDINAL}</span>
      </header>

      <main className="cs-main">
        {stare === 'loading' ? (
          <p className="cs-sub">Procesăm cererea…</p>
        ) : (
          <>
            <div className={`cf-icon${CONTINUT[stare].ok ? '' : ' err'}`} aria-hidden="true">
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

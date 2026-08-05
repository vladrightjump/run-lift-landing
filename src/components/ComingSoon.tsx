import { useCallback, useEffect, useState } from 'react';
import { LAUNCH_DATE, INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';
import { LAUNCH_EDITION_ORDINAL } from '../content/format';
import { useCountdown } from '../hooks/useCountdown';
import { useLaunchForm } from '../hooks/useLaunchForm';
import type { ToastKind } from '../hooks/useToast';

type Props = {
  showToast: (kind: ToastKind, msg: string) => void;
};

const MARQUEE_ITEMS = ['Aleargă · Ridică · Rezistă', 'Antrenament nou', 'Run + Lift'];

const LAUNCH_LABEL = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Chisinau',
}).format(LAUNCH_DATE);

export const ComingSoon = ({ showToast }: Props) => {
  const cd = useCountdown(LAUNCH_DATE);
  const { draft, setField, errors, state, submit, reset } = useLaunchForm();
  const [open, setOpen] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  const closeForm = useCallback(() => {
    setOpen(false);
  }, []);

  const openForm = () => {
    reset();
    setDuplicate(false);
    setOpen(true);
  };

  // Închide modalul cu Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeForm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeForm]);

  const handleSubmit = async () => {
    const outcome = await submit();
    switch (outcome.kind) {
      case 'success':
        setDuplicate(outcome.duplicate);
        showToast(
          'success',
          outcome.duplicate ? 'Ești deja pe listă.' : 'Gata! Verifică emailul pentru confirmare.'
        );
        break;
      case 'invalid':
      case 'offline':
      case 'error':
        showToast('error', outcome.message);
        break;
      // 'busy' → fără feedback
    }
  };

  return (
    <div className="cs-root">
      <div className="cs-bg" aria-hidden="true" />

      <header className="cs-topbar">
        <span className="cs-logo">
          R<span className="cs-accent">+</span>L
        </span>
        <nav className="cs-nav">
          <span className="cs-brand-meta">Run + Lift · Ediția {LAUNCH_EDITION_ORDINAL}</span>
          <a className="cs-tab" href="/despre-noi">Despre noi</a>
        </nav>
      </header>

      <main className="cs-main">
        <span className="cs-badge">
          <span className="cs-badge-dot" />
          Antrenament nou · Ediția {LAUNCH_EDITION_ORDINAL}
        </span>

        <h1 className="cs-title">
          Coming<br />
          <span className="cs-accent">Soon</span>
        </h1>

        <p className="cs-sub">
          {cd.done ? (
            <>
              Anunțul pentru noul antrenament Run <span className="cs-accent">+</span> Lift este
              gata. Lasă-ți datele și îți scriem imediat.
            </>
          ) : (
            <>
              Pe {LAUNCH_LABEL} anunțăm noul antrenament Run <span className="cs-accent">+</span>{' '}
              Lift. Lasă-ți datele și te anunțăm primii.
            </>
          )}
        </p>

        {!cd.done && (
          <div className="cs-countdown" role="timer" aria-label="Timp rămas până la anunț">
            {[
              { v: cd.zile, l: 'Zile' },
              { v: cd.ore, l: 'Ore' },
              { v: cd.minute, l: 'Minute' },
              { v: cd.secunde, l: 'Secunde' },
            ].map((u) => (
              <div key={u.l} className="cs-cd-unit">
                <span className="cs-cd-value">{u.v}</span>
                <span className="cs-cd-label">{u.l}</span>
              </div>
            ))}
          </div>
        )}

        <div className="cs-actions">
          <button type="button" className="cs-cta" onClick={openForm}>
            Anunță-mă la lansare
          </button>
          <a className="cs-cta-secondary" href="/despre-noi">
            Află mai multe
          </a>
        </div>
      </main>

      <footer className="cs-footer">
        <span>Run + Lift · Chișinău</span>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          Instagram {INSTAGRAM_HANDLE}
        </a>
      </footer>

      <div className="cs-marquee" aria-hidden="true">
        <div className="cs-marquee-track">
          {[0, 1].map((rep) => (
            <span key={rep} className="cs-marquee-group">
              {MARQUEE_ITEMS.map((item) => (
                <span key={item} className="cs-marquee-item">
                  {item}
                  <span className="cs-marquee-star">✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {open && (
        <div
          className="cs-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div className="cs-modal" role="dialog" aria-modal="true" aria-label="Anunță-mă la lansare">
            <button type="button" className="cs-modal-close" aria-label="Închide" onClick={closeForm}>
              ✕
            </button>

            {state === 'success' ? (
              <div className="cs-success">
                <div className="cs-success-check" aria-hidden="true">
                  ✓
                </div>
                <h2 className="cs-modal-title">
                  {duplicate ? 'Ești deja pe listă' : 'Te-am adăugat!'}
                </h2>
                <p className="cs-modal-sub">
                  {duplicate
                    ? 'Adresa ta era deja înscrisă. Te anunțăm când lansăm noul antrenament.'
                    : 'Ți-am trimis un email — apasă pe linkul din el ca să confirmi înscrierea.'}
                </p>
                <button type="button" className="cs-submit" onClick={closeForm}>
                  Închide
                </button>
              </div>
            ) : (
              <>
                <h2 className="cs-modal-title">Anunță-mă la lansare</h2>
                <p className="cs-modal-sub">
                  Îți scriem imediat ce anunțăm noul antrenament.
                </p>

                <form
                  className="cs-form"
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                  }}
                >
                  <div className="cs-form-row">
                    <label className={`cs-field${errors.nume ? ' invalid' : ''}`}>
                      <span>Nume</span>
                      <input
                        type="text"
                        placeholder="Popescu"
                        autoComplete="family-name"
                        value={draft.nume}
                        onChange={(e) => setField('nume', e.target.value)}
                      />
                    </label>
                    <label className={`cs-field${errors.prenume ? ' invalid' : ''}`}>
                      <span>Prenume</span>
                      <input
                        type="text"
                        placeholder="Andrei"
                        autoComplete="given-name"
                        value={draft.prenume}
                        onChange={(e) => setField('prenume', e.target.value)}
                      />
                    </label>
                  </div>
                  <label className={`cs-field${errors.email ? ' invalid' : ''}`}>
                    <span>Email</span>
                    <input
                      type="email"
                      placeholder="andrei@email.ro"
                      autoComplete="email"
                      value={draft.email}
                      onChange={(e) => setField('email', e.target.value)}
                    />
                  </label>
                  <label className={`cs-field${errors.telefon ? ' invalid' : ''}`}>
                    <span>Telefon</span>
                    <input
                      type="tel"
                      placeholder="07xx xxx xxx"
                      autoComplete="tel"
                      value={draft.telefon}
                      onChange={(e) => setField('telefon', e.target.value)}
                    />
                  </label>

                  <button type="submit" className="cs-submit" disabled={state === 'loading'}>
                    {state === 'loading' ? 'Se trimite…' : 'Anunță-mă'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

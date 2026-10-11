import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLaunchForm } from '../hooks/useLaunchForm';
import type { ToastKind } from '../hooks/useToast';

type Props = {
  showToast: (kind: ToastKind, msg: string) => void;
  /** Textul butonului care deschide formularul. */
  label: string;
  className: string;
};

/**
 * „Anunță-mă la lansare" — butonul și modalul listei de notificare, folosite de
 * teaser-ul Coming Soon și de ecranul dintre ediții.
 *
 * Hookul formularului stă AICI, montat odată cu butonul, nu odată cu modalul:
 * capcana anti-bot măsoară timpul de la montare, iar un modal montat la deschidere
 * ar fi respins un om care completează repede.
 */
export const AnuntaMa = ({ showToast, label, className }: Props) => {
  const { draft, setField, errors, state, submit, reset, hpProps } = useLaunchForm();
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
    <>
      <button type="button" className={className} onClick={openForm}>
        {label}
      </button>
      {/* Portal: butonul stă în blocuri cu propriul context de stivuire
          (`.cs-main` are z-index), iar overlay-ul trebuie să acopere tot ecranul. */}
      {open && createPortal(
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
                    : 'Ți-am trimis un email. Apasă pe linkul din el ca să confirmi înscrierea.'}
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
                  {/* Capcană anti-bot — invizibilă; verificată pe server. */}
                  <input type="text" {...hpProps} />
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
        </div>,
        document.body
      )}
    </>
  );
};

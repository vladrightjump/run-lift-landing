import { useCallback, useEffect, useRef, useState } from 'react';
import { LAUNCH_DATE } from '../lib/config';
import { useCountdown } from '../hooks/useCountdown';
import {
  submitLaunchNotification,
  isDuplicateError,
  isTimeoutError,
  isAbortError,
} from '../lib/supabase';
import { EMAIL_RE, PHONE_RE, normalizePhone } from '../lib/validation';
import type { ToastKind } from '../hooks/useToast';

type Props = {
  showToast: (kind: ToastKind, msg: string) => void;
};

type Draft = { nume: string; prenume: string; email: string; telefon: string };
type FieldErrors = Partial<Record<keyof Draft, boolean>>;
type FormState = 'form' | 'loading' | 'success';

const MARQUEE_ITEMS = ['Aleargă · Ridică · Rezistă', 'Eveniment nou', 'Run + Lift'];

const validateDraft = (d: Draft): FieldErrors => {
  const errors: FieldErrors = {};
  if (d.nume.trim().length < 2) errors.nume = true;
  if (d.prenume.trim().length < 2) errors.prenume = true;
  if (!EMAIL_RE.test(d.email.trim())) errors.email = true;
  if (!PHONE_RE.test(normalizePhone(d.telefon))) errors.telefon = true;
  return errors;
};

export const ComingSoon = ({ showToast }: Props) => {
  const cd = useCountdown(LAUNCH_DATE);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({ nume: '', prenume: '', email: '', telefon: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<FormState>('form');
  const [duplicate, setDuplicate] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);

  const closeForm = useCallback(() => {
    setOpen(false);
  }, []);

  const openForm = () => {
    setDraft({ nume: '', prenume: '', email: '', telefon: '' });
    setErrors({});
    setState('form');
    setDuplicate(false);
    setOpen(true);
  };

  // Închide modalul cu Esc; oprește fetch-ul în curs la unmount.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeForm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeForm]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const setField = (name: keyof Draft, value: string) => {
    setDraft((d) => ({ ...d, [name]: value }));
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (submittingRef.current) return;
    const errs = validateDraft(draft);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      showToast('error', 'Verifică câmpurile marcate cu roșu.');
      return;
    }
    if (!navigator.onLine) {
      showToast('error', 'Nu ai conexiune la internet. Reîncearcă când revii online.');
      return;
    }

    setErrors({});
    setState('loading');
    submittingRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await submitLaunchNotification(draft, controller.signal);
      setDuplicate(false);
      setState('success');
      showToast('success', 'Gata! Te anunțăm la lansare.');
    } catch (err) {
      if (isAbortError(err)) return;
      if (isDuplicateError(err)) {
        // Emailul e deja pe listă — tratăm ca succes, cu mesaj distinct.
        setDuplicate(true);
        setState('success');
        showToast('success', 'Ești deja pe listă.');
        return;
      }
      setState('form');
      showToast(
        'error',
        isTimeoutError(err)
          ? 'Serverul răspunde greu. Încearcă din nou.'
          : 'Nu am putut trimite. Verifică conexiunea și încearcă din nou.'
      );
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <div className="cs-root">
      <div className="cs-bg" aria-hidden="true" />

      <header className="cs-topbar">
        <span className="cs-logo">
          R<span className="cs-accent">+</span>L
        </span>
        <span className="cs-brand-meta">Run + Lift · Ediția a doua</span>
      </header>

      <main className="cs-main">
        <span className="cs-badge">
          <span className="cs-badge-dot" />
          Eveniment nou · Ediția a doua
        </span>

        <h1 className="cs-title">
          Coming<br />
          <span className="cs-accent">Soon</span>
        </h1>

        <p className="cs-sub">
          Pregătim următoarea ediție Run <span className="cs-accent">+</span> Lift. Lasă-ți datele
          și te anunțăm primii când se deschid înscrierile.
        </p>

        <div className="cs-countdown" role="timer" aria-label="Timp rămas până la lansare">
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

        <button type="button" className="cs-cta" onClick={openForm}>
          Anunță-mă la lansare
        </button>
      </main>

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
                    ? 'Adresa ta era deja înscrisă. Te anunțăm la lansarea ediției a doua.'
                    : 'Îți scriem primii când se deschid înscrierile la ediția a doua.'}
                </p>
                <button type="button" className="cs-submit" onClick={closeForm}>
                  Închide
                </button>
              </div>
            ) : (
              <>
                <h2 className="cs-modal-title">Anunță-mă la lansare</h2>
                <p className="cs-modal-sub">Îți scriem imediat ce se deschid înscrierile.</p>

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

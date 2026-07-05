import { useCallback, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { OCCUPIED_SLOTS, TOTAL_SLOTS, isFormConfigured } from '../lib/config';
import { submitToGoogleForm } from '../lib/googleForm';
import { validate, errorMessage, firstErrorField } from '../lib/validation';
import type { FieldName, FieldErrors, FormData } from '../lib/validation';
import type { ToastKind } from '../hooks/useToast';

type FormState = 'form' | 'loading' | 'error' | 'success';

type Props = {
  showToast: (kind: ToastKind, msg: string) => void;
};

const SUMMARY_ITEMS = [
  'Sâmbătă, 11 iulie 2026, ora 6:30 — Stadionul Dinamo, Chișinău',
  '5 runde: alergare 400 m + Bear Complex',
  'Antrenorul îți alege echipamentul: halteră, kettlebell sau gantere',
  'Deschis oricui, indiferent de nivel',
  'Înscrieri până pe 10 iulie · limită de 16 participanți',
  'Adu cu tine: apă pentru hidratare și bună dispoziție',
];

export const RegistrationSection = ({ showToast }: Props) => {
  const [formState, setFormState] = useState<FormState>('form');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmName, setConfirmName] = useState('atlet');
  const [sessionSignups, setSessionSignups] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);

  const slots = useMemo(() => {
    const occupied = Math.min(TOTAL_SLOTS, OCCUPIED_SLOTS + sessionSignups);
    const remaining = TOTAL_SLOTS - occupied;
    return {
      occupied,
      remaining,
      cells: Array.from({ length: TOTAL_SLOTS }, (_, i) => i < occupied),
    };
  }, [sessionSignups]);

  const clearErrorFor = useCallback((name: FieldName) => {
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new window.FormData(e.currentTarget);
    const data: FormData = {
      nume: String(fd.get('nume') ?? '').trim(),
      telefon: String(fd.get('telefon') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      echipa: String(fd.get('echipa') ?? '').trim(),
      acord: !!fd.get('acord'),
    };

    const errs = validate(data);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      showToast('error', errorMessage(errs));
      const bad = firstErrorField(errs);
      if (bad) formRef.current?.querySelector<HTMLInputElement>(`[name="${bad}"]`)?.focus();
      return;
    }

    setErrors({});
    setFormState('loading');
    const firstName = data.nume.split(/\s+/)[0] || 'atlet';

    const scrollToConfirmation = () => {
      requestAnimationFrame(() => {
        const el = confirmationRef.current;
        if (!el) return;
        window.scrollTo({
          top: el.getBoundingClientRect().top + window.scrollY - 80,
          behavior: 'smooth',
        });
      });
    };

    const onSuccess = () => {
      setConfirmName(firstName);
      setSessionSignups((n) => n + 1);
      setFormState('success');
      showToast('success', 'Înscrierea a fost trimisă!');
      scrollToConfirmation();
    };

    if (!isFormConfigured()) {
      console.warn('[Run+Lift] Google Form nu e configurat (vezi src/lib/config.ts). Simulez trimiterea.');
      window.setTimeout(onSuccess, 1800);
      return;
    }

    try {
      await submitToGoogleForm(data);
      onSuccess();
    } catch (err) {
      console.error('[Run+Lift] Eroare la trimitere:', err);
      setFormState('error');
      showToast('error', 'Înscrierea nu a putut fi trimisă.');
    }
  };

  const resetForm = () => {
    formRef.current?.reset();
    setErrors({});
    setFormState('form');
  };

  const retrySubmit = () => {
    setErrors({});
    setFormState('form');
  };

  return (
    <section id="inscriere" className="reg-section">
      <div className="container reg-grid">
        <div>
          <div className="section-head" style={{ marginBottom: 32 }} data-reveal>
            <span className="section-num">03</span>
            <h2>Înscriere</h2>
          </div>
          <p className="reg-intro">
            Completează formularul și primești confirmarea pe email. Înscrierile sunt deschise{' '}
            <strong style={{ color: '#C9F24B' }}>până pe 10 iulie</strong> —{' '}
            <strong style={{ color: '#C9F24B' }}>doar 16 locuri</strong>.
          </p>
          <div className="summary-box">
            <div className="summary-title">Pe scurt</div>
            <ul className="summary-list">
              {SUMMARY_ITEMS.map((item) => (
                <li key={item}>
                  <span className="arrow">→</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <div className="slots-bar">
            <div className="slots-head">
              <span className="slots-label">Locuri rămase</span>
              <span id="slots-count" className={`slots-count${slots.remaining <= 3 ? ' low' : ''}`}>
                {slots.remaining} / {TOTAL_SLOTS}
              </span>
            </div>
            <div id="slots-grid" className="slots-grid" aria-hidden="true">
              {slots.cells.map((filled, i) => (
                <div key={i} className={`slot${filled ? ' filled' : ''}`}></div>
              ))}
            </div>
          </div>

          <form
            id="reg-form"
            ref={formRef}
            className="reg-form"
            hidden={formState !== 'form'}
            noValidate
            onSubmit={handleSubmit}
            onInput={(e) => {
              const wrap = (e.target as HTMLElement).closest<HTMLElement>('[data-field]');
              const name = wrap?.dataset.field as FieldName | undefined;
              if (name && name !== 'acord') clearErrorFor(name);
            }}
          >
            <div className="row-2">
              <label className={`field${errors.nume ? ' invalid' : ''}`} data-field="nume">
                <span className="label">Nume complet *</span>
                <input name="nume" type="text" placeholder="Ana Popescu" autoComplete="name" />
                <span className="field-error">Completează numele complet.</span>
              </label>
              <label className={`field${errors.telefon ? ' invalid' : ''}`} data-field="telefon">
                <span className="label">Telefon *</span>
                <input name="telefon" type="tel" placeholder="07xx xxx xxx" autoComplete="tel" />
                <span className="field-error">Numărul de telefon nu e valid.</span>
              </label>
            </div>
            <label className={`field${errors.email ? ' invalid' : ''}`} data-field="email">
              <span className="label">Email *</span>
              <input name="email" type="email" placeholder="ana@email.ro" autoComplete="email" />
              <span className="field-error">Adresa de email nu e validă.</span>
            </label>
            <p className="helper">
              Echipamentul și greutatea sunt alese de antrenor la fața locului, în funcție de pregătirea ta
              fizică.
            </p>
            <label className="field" data-field="echipa">
              <span className="label">
                Nume echipă / partener <span className="muted">(doar pentru Echipă de 2)</span>
              </span>
              <input name="echipa" type="text" placeholder="Opțional" />
            </label>
            <label
              className={`checkbox${errors.acord ? ' invalid' : ''}`}
              data-field="acord"
              onChange={() => clearErrorFor('acord')}
            >
              <input name="acord" type="checkbox" />
              <span>
                Confirm că sunt apt din punct de vedere medical pentru efort fizic intens și accept
                regulamentul evenimentului. *
              </span>
            </label>
            <span className={`acord-error${errors.acord ? ' show' : ''}`}>
              Trebuie să accepți regulamentul ca să te poți înscrie.
            </span>
            <button type="submit" className="btn-submit">
              Trimite înscrierea
            </button>
          </form>

          <div id="form-loading" className="form-loading" hidden={formState !== 'loading'}>
            <div className="spinner" aria-hidden="true"></div>
            <div className="label">Se trimite înscrierea…</div>
          </div>

          <div id="form-error" className="form-error" hidden={formState !== 'error'}>
            <div className="x-circle" aria-hidden="true">
              <span>✕</span>
            </div>
            <div className="headline">Ceva n-a mers</div>
            <p>Înscrierea nu a putut fi trimisă. Verifică conexiunea la internet și încearcă din nou.</p>
            <button type="button" id="retry-btn" className="btn-retry" onClick={retrySubmit}>
              Încearcă din nou
            </button>
          </div>

          <div id="confirmation" ref={confirmationRef} className="confirmation" hidden={formState !== 'success'}>
            <div className="check-wrap">
              <div className="check-ring" aria-hidden="true"></div>
              <div className="check-circle">
                <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden="true">
                  <path
                    d="M10 23 L19 32 L34 13"
                    stroke="#121410"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <div className="headline">Te-ai înregistrat, <span id="confirm-name">{confirmName}</span>!</div>
            <p>Ți-am trimis un email de confirmare cu toate detaliile. Ne vedem pe 11 iulie la start.</p>
            <button type="button" id="reset-btn" className="btn-ghost" onClick={resetForm}>
              Înscrie altă persoană
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  EVENT_END_DATE,
  OCCUPIED_SLOTS,
  REGISTRATION_DEADLINE,
  TOTAL_SLOTS,
  WAITLIST_SLOTS,
  isBackendConfigured,
} from '../lib/config';
import {
  submitRegistration,
  submitWaitlist,
  sendConfirmationEmail,
  isTimeoutError,
  isAbortError,
  isDuplicateError,
  isWaitlistFullError,
} from '../lib/supabase';
import type { PublicStats } from '../lib/supabase';
import { rememberMySignup } from '../lib/mySignups';
import { validate, errorMessage, firstErrorField, dataNasteriiError } from '../lib/validation';
import type { FieldName, FieldErrors, FormData } from '../lib/validation';
import type { ToastKind } from '../hooks/useToast';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useNow } from '../hooks/useNow';

type FormState = 'form' | 'loading' | 'error' | 'success';
type ErrorReason = 'network' | 'timeout' | 'config' | 'duplicate' | 'unknown';

const MIN_LOADING_MS = 700; // evită flash-ul de spinner
const SIM_LOADING_MS = 1800; // dev mode fără Google Form configurat

type Props = {
  showToast: (kind: ToastKind, msg: string) => void;
  stats: PublicStats | null;
  refreshStats: () => void;
};

const SUMMARY_ITEMS = [
  'Sâmbătă, 18 iulie 2026, ora 07:00 — Parcul Râșcani, Str. Braniștii',
  'Cursă în stil HYROX: alergare + stații funcționale, contra cronometru',
  'Stațiile și greutățile se adaptează nivelului tău',
  'Deschis oricui, indiferent de nivel',
  `Înscrieri până pe 17 iulie · limită de ${TOTAL_SLOTS} participanți`,
  'Adu cu tine: apă pentru hidratare și bună dispoziție',
];

const ERROR_COPY: Record<ErrorReason, { title: string; msg: string }> = {
  network: {
    title: 'Fără conexiune',
    msg: 'Nu am putut ajunge la server. Verifică conexiunea la internet și încearcă din nou.',
  },
  timeout: {
    title: 'Timp expirat',
    msg: 'Serverul răspunde prea greu. Verifică conexiunea și încearcă din nou.',
  },
  config: {
    title: 'Înscrierea nu e disponibilă',
    msg: 'Sistemul de înscrieri nu e pornit încă. Scrie-ne pe Instagram sau sună-ne — datele de contact sunt în josul paginii.',
  },
  duplicate: {
    title: 'Ești deja înscris(ă)',
    msg: 'Există deja o înscriere cu acest email. Dacă crezi că e o greșeală, scrie-ne pe Instagram — datele de contact sunt în josul paginii.',
  },
  unknown: {
    title: 'Ceva n-a mers',
    msg: 'Înscrierea nu a putut fi trimisă. Verifică conexiunea la internet și încearcă din nou.',
  },
};

const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export const RegistrationSection = ({ showToast, stats, refreshStats }: Props) => {
  const [formState, setFormState] = useState<FormState>('form');
  const [errorReason, setErrorReason] = useState<ErrorReason>('unknown');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [confirmName, setConfirmName] = useState('atlet');
  const [sessionSignups, setSessionSignups] = useState(0);
  const [dateErrMsg, setDateErrMsg] = useState('Introdu data nașterii.');
  // Când locurile sunt epuizate, același formular scrie în lista de așteptare.
  const [submittedAsWaitlist, setSubmittedAsWaitlist] = useState(false);
  const [wlFull, setWlFull] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const errorPanelRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const isOnline = useOnlineStatus();

  // Când sosesc statistici proaspete, numărul live e autoritar — bump-ul
  // optimist de sesiune nu mai e necesar (insert-ul e deja în count).
  useEffect(() => {
    if (stats) setSessionSignups(0);
  }, [stats]);

  useEffect(() => {
    return () => {
      // Cleanup pending timers + fetch în curs on unmount
      for (const id of timersRef.current) window.clearTimeout(id);
      abortRef.current?.abort();
    };
  }, []);

  // Mută focusul pe panoul de rezultat — altfel rămâne pe un buton ascuns.
  useEffect(() => {
    if (formState === 'error') {
      errorPanelRef.current?.focus();
    } else if (formState === 'success') {
      confirmationRef.current?.focus({ preventScroll: true });
    }
  }, [formState]);

  const slots = useMemo(() => {
    const base = stats?.count ?? OCCUPIED_SLOTS;
    const occupied = Math.min(TOTAL_SLOTS, base + sessionSignups);
    const remaining = TOTAL_SLOTS - occupied;
    return {
      occupied,
      remaining,
      cells: Array.from({ length: TOTAL_SLOTS }, (_, i) => i < occupied),
    };
  }, [stats, sessionSignups]);

  // Reactiv (tick la 30s) ca tab-urile lăsate deschise să treacă singure
  // în starea corectă când se depășește deadline-ul sau finalul evenimentului.
  const now = useNow(30_000);
  const isEventEnded = now > EVENT_END_DATE.getTime();
  const isRegClosed = now > REGISTRATION_DEADLINE.getTime();

  const isSoldOut = slots.remaining <= 0;

  // Lista de așteptare — apare când e sold-out, până se umplu cele WAITLIST_SLOTS locuri.
  const waitlistCount = stats?.waitlist ?? 0;
  const isWaitlistFull = wlFull || waitlistCount >= WAITLIST_SLOTS;
  // În modul „așteptare": locuri epuizate, dar lista mai are loc — formularul rămâne activ.
  const waitlistMode = isSoldOut && !isWaitlistFull;
  const waitlistLeft = Math.max(0, WAITLIST_SLOTS - waitlistCount);

  // Formularul e vizibil pentru înscriere normală SAU pentru lista de așteptare.
  const showForm =
    formState === 'form' && !isEventEnded && !isRegClosed && !(isSoldOut && isWaitlistFull);

  const clearErrorFor = useCallback((name: FieldName) => {
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const scheduleTimer = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timersRef.current = timersRef.current.filter((t) => t !== id);
      fn();
    }, ms);
    timersRef.current.push(id);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Double-submit guard
    if (submittingRef.current) return;

    // Dacă locurile sunt epuizate (dar lista mai are loc), scriem în lista de așteptare.
    const asWaitlist = isSoldOut && !isWaitlistFull;

    const fd = new window.FormData(e.currentTarget);
    const data: FormData = {
      nume: String(fd.get('nume') ?? '').trim(),
      telefon: String(fd.get('telefon') ?? '').trim(),
      email: String(fd.get('email') ?? '').trim(),
      dataNasterii: String(fd.get('dataNasterii') ?? '').trim(),
      acord: !!fd.get('acord'),
    };

    const errs = validate(data);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      if (errs.dataNasterii) {
        setDateErrMsg(dataNasteriiError(data.dataNasterii) ?? 'Data nașterii nu e validă.');
      }
      showToast('error', errorMessage(errs));
      const bad = firstErrorField(errs);
      if (bad) formRef.current?.querySelector<HTMLInputElement>(`[name="${bad}"]`)?.focus();
      return;
    }

    // Offline guard — refuză submit-ul înainte să pornim fetch-ul.
    if (!isOnline) {
      showToast('error', 'Nu ai conexiune la internet. Reîncearcă când revii online.');
      return;
    }

    setErrors({});
    setFormState('loading');
    submittingRef.current = true;

    const firstName = data.nume.split(/\s+/)[0] || 'atlet';
    const startedAt = Date.now();

    const finishSuccess = () => {
      setConfirmName(firstName);
      setSubmittedAsWaitlist(asWaitlist);
      if (!asWaitlist) {
        setSessionSignups((n) => n + 1);
        rememberMySignup(data.nume); // pentru badge-ul „Nou" din lista de participanți
      }
      if (isBackendConfigured()) refreshStats();
      setFormState('success');
      submittingRef.current = false;
      showToast('success', asWaitlist ? 'Ești pe lista de așteptare!' : 'Înscrierea a fost trimisă!');
      requestAnimationFrame(() => {
        const el = confirmationRef.current;
        if (!el) return;
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({
          top: el.getBoundingClientRect().top + window.scrollY - 80,
          behavior: reduceMotion ? 'auto' : 'smooth',
        });
      });
    };

    const finishError = (reason: ErrorReason) => {
      setErrorReason(reason);
      setFormState('error');
      submittingRef.current = false;
      showToast('error', ERROR_COPY[reason].title);
    };

    // Asigură minim MIN_LOADING_MS timp de afișare a spinner-ului
    const enforceMin = async () => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOADING_MS) await delay(MIN_LOADING_MS - elapsed);
    };

    if (!isBackendConfigured()) {
      if (import.meta.env.DEV) {
        // Doar în development simulăm succesul — util pentru testat UI-ul.
        console.warn('[Run+Lift] Supabase nu e configurat (vezi src/lib/config.ts). Simulez trimiterea.');
        scheduleTimer(async () => {
          await enforceMin();
          finishSuccess();
        }, SIM_LOADING_MS);
      } else {
        // În producție nu mințim: fără backend configurat, înscrierea s-ar pierde.
        console.error('[Run+Lift] Supabase nu e configurat — înscrierea nu poate fi trimisă.');
        scheduleTimer(async () => {
          await enforceMin();
          finishError('config');
        }, 300);
      }
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      if (asWaitlist) {
        await submitWaitlist(data, controller.signal);
      } else {
        const newId = await submitRegistration(data, controller.signal);
        // Confirmare automată prin email (best-effort, nu blochează succesul).
        void sendConfirmationEmail(newId);
      }
      await enforceMin();
      finishSuccess();
    } catch (err) {
      // Abort la unmount — componenta nu mai există, nu mai actualizăm UI.
      if (isAbortError(err)) return;
      console.error('[Run+Lift] Eroare la trimitere:', err);
      await enforceMin();
      // Lista de așteptare tocmai s-a umplut — comutăm pe ecranul „plin".
      if (asWaitlist && isWaitlistFullError(err)) {
        setWlFull(true);
        if (isBackendConfigured()) refreshStats();
        setFormState('form');
        submittingRef.current = false;
        showToast('error', 'Lista de așteptare tocmai s-a umplut.');
        return;
      }
      const reason: ErrorReason = isTimeoutError(err)
        ? 'timeout'
        : isDuplicateError(err)
        ? 'duplicate'
        : !navigator.onLine
        ? 'network'
        : 'unknown';
      finishError(reason);
    }
  };

  const resetForm = () => {
    formRef.current?.reset();
    setErrors({});
    setFormState('form');
  };

  const retrySubmit = () => {
    // Păstrează valorile din form ca user-ul să poată reîncerca fără să retapeze.
    setErrors({});
    setFormState('form');
  };

  const errorCopy = ERROR_COPY[errorReason];

  return (
    <section id="inscriere" className="reg-section">
      <div className="container reg-grid">
        <div>
          <div className="section-head" style={{ marginBottom: 32 }} data-reveal>
            <span className="section-num">03</span>
            <h2>Înscriere</h2>
          </div>
          <p className="reg-intro">
            {waitlistMode ? (
              <>
                Locurile s-au epuizat, dar te poți pune pe{' '}
                <strong style={{ color: '#C9F24B' }}>lista de așteptare</strong>. Dacă se eliberează un
                loc, te contactăm — au mai rămas{' '}
                <strong style={{ color: '#C9F24B' }}>
                  {waitlistLeft} {waitlistLeft === 1 ? 'loc' : 'locuri'}
                </strong>{' '}
                pe listă.
              </>
            ) : (
              <>
                Completează formularul și locul tău e rezervat pe loc. Înscrierile sunt deschise{' '}
                <strong style={{ color: '#C9F24B' }}>până pe 17 iulie</strong> —{' '}
                <strong style={{ color: '#C9F24B' }}>doar {TOTAL_SLOTS} locuri</strong>.
              </>
            )}
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

          {/* Event ended — înlocuiește formularul; ecranele loading/error/success au prioritate */}
          <div id="event-ended" className="form-error" hidden={!isEventEnded || formState !== 'form'}>
            <div className="x-circle x-circle-neutral" aria-hidden="true">
              <span>✓</span>
            </div>
            <div className="headline">Evenimentul a avut loc</div>
            <p>
              Ne vedem la ediția următoare. Urmărește-i pe <a href="https://www.instagram.com/vladfillip" target="_blank" rel="noopener noreferrer" style={{ color: '#C9F24B' }}>organizatori</a>{' '}
              pentru anunțuri.
            </p>
          </div>

          {/* Deadline de înscriere depășit — "până pe 10 iulie" */}
          <div
            id="reg-closed"
            className="form-error"
            hidden={!isRegClosed || isEventEnded || formState !== 'form'}
          >
            <div className="x-circle x-circle-neutral" aria-hidden="true">
              <span>✕</span>
            </div>
            <div className="headline">Înscrierile s-au închis</div>
            <p>
              Perioada de înscriere s-a încheiat pe 17 iulie. Scrie-ne pe Instagram — dacă se
              eliberează un loc, te anunțăm.
            </p>
            <a
              href="https://www.instagram.com/vladfillip"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-retry"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              Contactează organizatorii
            </a>
          </div>

          {/* Sold out ȘI lista de așteptare plină — totul e ocupat */}
          <div
            id="sold-out"
            className="form-error"
            hidden={!(isSoldOut && isWaitlistFull) || isEventEnded || isRegClosed || formState !== 'form'}
          >
            <div className="x-circle x-circle-neutral" aria-hidden="true">
              <span>✕</span>
            </div>
            <div className="headline">Locurile și lista de așteptare sunt pline</div>
            <p>
              Toate cele {TOTAL_SLOTS} locuri și cele {WAITLIST_SLOTS} de pe lista de așteptare sunt
              ocupate. Scrie-ne pe Instagram — dacă apare o disponibilitate, te anunțăm.
            </p>
            <a
              href="https://www.instagram.com/vladfillip"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-retry"
              style={{ textDecoration: 'none', display: 'inline-block' }}
            >
              Contactează organizatorii
            </a>
          </div>

          {/* Offline banner — appears above form/error but doesn't block them */}
          {!isOnline && (showForm || formState === 'error') && (
            <div id="offline-banner" className="offline-banner" role="status" aria-live="polite">
              <span aria-hidden="true">⚠</span>
              <span>Nu ai conexiune la internet. Trimiterea nu va funcționa până revii online.</span>
            </div>
          )}

          <form
            id="reg-form"
            ref={formRef}
            className="reg-form"
            hidden={!showForm}
            noValidate
            onSubmit={handleSubmit}
            onInput={(e) => {
              const wrap = (e.target as HTMLElement).closest<HTMLElement>('[data-field]');
              const name = wrap?.dataset.field as FieldName | undefined;
              if (name && name !== 'acord') clearErrorFor(name);
            }}
          >
            {waitlistMode && (
              <div className="waitlist-banner" role="status">
                <span aria-hidden="true">⏳</span>
                <span>
                  Locuri epuizate — te pui pe lista de așteptare. Au mai rămas {waitlistLeft}{' '}
                  {waitlistLeft === 1 ? 'loc' : 'locuri'}.
                </span>
              </div>
            )}
            <div className="row-2">
              <label className={`field${errors.nume ? ' invalid' : ''}`} data-field="nume">
                <span className="label">Nume complet *</span>
                <input
                  name="nume"
                  type="text"
                  placeholder="Ana Popescu"
                  autoComplete="name"
                  aria-invalid={errors.nume || undefined}
                  aria-describedby={errors.nume ? 'err-nume' : undefined}
                />
                <span id="err-nume" className="field-error">Completează numele complet.</span>
              </label>
              <label className={`field${errors.telefon ? ' invalid' : ''}`} data-field="telefon">
                <span className="label">Telefon *</span>
                <input
                  name="telefon"
                  type="tel"
                  placeholder="07xx xxx xxx"
                  autoComplete="tel"
                  aria-invalid={errors.telefon || undefined}
                  aria-describedby={errors.telefon ? 'err-telefon' : undefined}
                />
                <span id="err-telefon" className="field-error">Numărul de telefon nu e valid.</span>
              </label>
            </div>
            <div className="row-2">
              <label className={`field${errors.email ? ' invalid' : ''}`} data-field="email">
                <span className="label">Email *</span>
                <input
                  name="email"
                  type="email"
                  placeholder="ana@email.ro"
                  autoComplete="email"
                  aria-invalid={errors.email || undefined}
                  aria-describedby={errors.email ? 'err-email' : undefined}
                />
                <span id="err-email" className="field-error">Adresa de email nu e validă.</span>
              </label>
              <label
                className={`field${errors.dataNasterii ? ' invalid' : ''}`}
                data-field="dataNasterii"
              >
                <span className="label">Data nașterii *</span>
                <input
                  name="dataNasterii"
                  type="date"
                  min="1940-01-01"
                  max="2012-07-18"
                  autoComplete="bday"
                  aria-invalid={errors.dataNasterii || undefined}
                  aria-describedby={errors.dataNasterii ? 'err-datanasterii' : undefined}
                />
                <span id="err-datanasterii" className="field-error">{dateErrMsg}</span>
              </label>
            </div>
            <p className="helper">
              Participanții trebuie să aibă minim 14 ani în ziua evenimentului. Stațiile și greutățile sunt
              adaptate de antrenori la fața locului, în funcție de pregătirea ta fizică.
            </p>
            <label
              className={`checkbox${errors.acord ? ' invalid' : ''}`}
              data-field="acord"
              onChange={() => clearErrorFor('acord')}
            >
              <input
                name="acord"
                type="checkbox"
                aria-invalid={errors.acord || undefined}
                aria-describedby={errors.acord ? 'err-acord' : undefined}
              />
              <span>
                Confirm că sunt apt din punct de vedere medical pentru efort fizic intens și accept
                regulamentul evenimentului. *
              </span>
            </label>
            <span id="err-acord" className={`acord-error${errors.acord ? ' show' : ''}`}>
              Trebuie să accepți regulamentul ca să te poți înscrie.
            </span>
            <button type="submit" className="btn-submit" disabled={!isOnline}>
              {!isOnline
                ? 'Offline — nu se poate trimite'
                : waitlistMode
                ? 'Intră pe lista de așteptare'
                : 'Trimite înscrierea'}
            </button>
          </form>

          <div id="form-loading" className="form-loading" hidden={formState !== 'loading'}>
            <div className="spinner" aria-hidden="true"></div>
            <div className="label">Se trimite înscrierea…</div>
          </div>

          <div
            id="form-error"
            ref={errorPanelRef}
            className="form-error"
            tabIndex={-1}
            hidden={formState !== 'error'}
          >
            <div className="x-circle" aria-hidden="true">
              <span>✕</span>
            </div>
            <div className="headline">{errorCopy.title}</div>
            <p>{errorCopy.msg}</p>
            <button type="button" id="retry-btn" className="btn-retry" onClick={retrySubmit}>
              Încearcă din nou
            </button>
          </div>

          <div
            id="confirmation"
            ref={confirmationRef}
            className="confirmation"
            tabIndex={-1}
            hidden={formState !== 'success'}
          >
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
            <div className="headline">
              {submittedAsWaitlist ? 'Ești pe lista de așteptare' : 'Te-ai înregistrat'},{' '}
              <span id="confirm-name">{confirmName}</span>!
            </div>
            <p>
              {submittedAsWaitlist
                ? 'Te-am adăugat pe lista de așteptare. Dacă se eliberează un loc, te contactăm la datele lăsate.'
                : 'Locul tău e rezervat. Ne vedem sâmbătă, 18 iulie, ora 07:00, la Parcul Râșcani.'}
            </p>
            <button type="button" id="reset-btn" className="btn-ghost" onClick={resetForm}>
              {submittedAsWaitlist ? 'Adaugă altă persoană' : 'Înscrie altă persoană'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

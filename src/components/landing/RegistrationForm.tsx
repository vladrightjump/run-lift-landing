import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { TOTAL_SLOTS, INSTAGRAM_URL } from '../../lib/config';
import { downloadEventIcs, shareSignup } from '../../lib/calendar';
import { EVENT_SUMMARY_LINE, SUCCESS_SEE_YOU } from '../../content/format';
import type { FieldName } from '../../lib/validation';
import type { PublicStats } from '../../lib/supabase';
import type { useRegistration } from '../../hooks/useRegistration';
import { markJustSignedUp } from '../../lib/justSignedUp';
import { useSuccessRedirect } from '../../hooks/useSuccessRedirect';
import { BirthDateField } from './BirthDateField';

/**
 * Formularul de înscriere, ambalabil oriunde: pe pagina `/inscriere` și în
 * overlay-ul de pe landing. Aceleași stări ca secțiunea 03 de pe landing
 * (`form → loading → success/error` + „închis"), dar:
 *   · data nașterii într-un singur câmp scris (`BirthDateField`),
 *   · confirmarea are numărătoare inversă spre lista de participanți.
 *
 * Logica NU e duplicată — vine tot din `useRegistration`, dat prin `reg`.
 */

const label: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 2,
  textTransform: 'uppercase',
  color: 'var(--e3-muted)',
};
const inputStyle: CSSProperties = {
  background: 'var(--e3-bg)',
  border: '1px solid var(--e3-border)',
  color: 'var(--e3-text)',
  fontFamily: 'Archivo, sans-serif',
  fontSize: 16, // 16px: iOS nu face zoom la focus
  padding: '13px 14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};
const panel: CSSProperties = {
  border: '1px solid var(--e3-border)',
  background: 'var(--e3-surface)',
  padding: 'clamp(20px, 4vw, 32px)',
  textAlign: 'center',
  display: 'grid',
  gap: 16,
  justifyItems: 'center',
};
const fieldErr: CSSProperties = { fontSize: 13, color: 'var(--e3-danger)' };
const ctaSmall: CSSProperties = {
  background: 'var(--e3-accent)',
  color: 'var(--e3-bg)',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'Anton, sans-serif',
  fontSize: 15,
  letterSpacing: 1,
  textTransform: 'uppercase',
  padding: '12px 22px',
};

type Props = {
  reg: ReturnType<typeof useRegistration>;
  stats: PublicStats | null;
  /** `true` → după confirmare redirecționăm spre `/#participanti`. */
  redirect?: boolean;
  /** Afișat sub formular (ex. „Vezi tot despre eveniment →"). */
  footerSlot?: React.ReactNode;
  /** Primul câmp primește focus la montare (pagina /inscriere, overlay). */
  autoFocus?: boolean;
};

export const RegistrationForm = ({ reg, stats, redirect = false, footerSlot, autoFocus = false }: Props) => {
  const {
    waitlistMode, waitlistLeft, slots, isSoldOut, isWaitlistFull, showForm, closedReason,
    phase, errors, birthISO, dateErrMsg, confirmName, submittedAsWaitlist,
    formRef, handleSubmit, clearErrorFor, setBirth, resetForm, setErrors, setPhase,
  } = reg;

  const firstFieldRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus && showForm) firstFieldRef.current?.focus({ preventScroll: true });
  }, [autoFocus, showForm]);

  // Flagul pentru bannerul verde de pe landing — pus o singură dată, la succes.
  useEffect(() => {
    if (phase !== 'success' || !redirect) return;
    markJustSignedUp({
      prenume: confirmName,
      loc: submittedAsWaitlist ? null : slots.occupied,
      waitlist: submittedAsWaitlist,
    });
  }, [phase, redirect, confirmName, submittedAsWaitlist, slots.occupied]);

  const rd = useSuccessRedirect({ active: phase === 'success', enabled: redirect });

  /** BirthDateField ne dă ISO; `useRegistration` ține {d,m,y}. */
  const setBirthFromISO = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    setBirth(m ? { d: String(Number(m[3])), m: String(Number(m[2])), y: m[1] } : { d: '', m: '', y: '' });
  };

  return (
    <div style={{ display: 'grid', gap: 0 }}>
      {/* Locuri rămase — lipit peste formular, ca pe landing */}
      <div
        style={{
          border: '1px solid var(--e3-border)',
          borderBottom: 'none',
          background: 'var(--e3-surface)',
          padding: '16px 20px',
          display: 'grid',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--e3-muted)' }}>
            Locuri rămase
          </span>
          <span
            style={{
              fontFamily: 'Anton, sans-serif',
              fontSize: 22,
              letterSpacing: 1,
              color: slots.remaining <= 3 ? 'var(--e3-danger)' : 'var(--e3-accent)',
            }}
          >
            {stats ? slots.remaining : '–'} / {TOTAL_SLOTS}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 3 }} aria-hidden="true">
          {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
            <div key={i} style={{ height: 8, flex: 1, background: i < slots.occupied ? 'var(--e3-accent)' : 'var(--e3-border)' }} />
          ))}
        </div>
        {isSoldOut && !isWaitlistFull && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--e3-accent)', fontWeight: 600, textWrap: 'pretty' }}>
            Locurile s-au epuizat — completează formularul și intri pe lista de așteptare
            ({waitlistLeft} {waitlistLeft === 1 ? 'loc' : 'locuri'} rămase).
          </p>
        )}
      </div>

      {showForm && (
        <form
          ref={formRef}
          noValidate
          onSubmit={handleSubmit}
          onInput={(e) => {
            const el = e.target as HTMLElement;
            const name = el.getAttribute('name') as FieldName | null;
            if (name && name !== 'acord') clearErrorFor(name);
          }}
          style={{
            border: '1px solid var(--e3-border)',
            background: 'var(--e3-surface)',
            padding: 'clamp(18px, 4vw, 32px)',
            display: 'grid',
            gap: 18,
          }}
        >
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={label}>Nume complet *</span>
            <input
              ref={firstFieldRef}
              className="e3-input"
              name="nume"
              type="text"
              placeholder="Ana Popescu"
              autoComplete="name"
              style={{ ...inputStyle, borderColor: errors.nume ? 'var(--e3-danger)' : 'var(--e3-border)' }}
            />
            {errors.nume && <span style={fieldErr}>Completează numele complet.</span>}
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={label}>Telefon *</span>
            <input
              className="e3-input"
              name="telefon"
              type="tel"
              inputMode="tel"
              placeholder="07xx xxx xxx"
              autoComplete="tel"
              style={{ ...inputStyle, borderColor: errors.telefon ? 'var(--e3-danger)' : 'var(--e3-border)' }}
            />
            {errors.telefon && <span style={fieldErr}>Numărul de telefon nu e valid.</span>}
          </label>
          <label style={{ display: 'grid', gap: 8 }}>
            <span style={label}>Email *</span>
            <input
              className="e3-input"
              name="email"
              type="email"
              inputMode="email"
              placeholder="ana@email.ro"
              autoComplete="email"
              style={{ ...inputStyle, borderColor: errors.email ? 'var(--e3-danger)' : 'var(--e3-border)' }}
            />
            {errors.email && <span style={fieldErr}>Adresa de email nu e validă.</span>}
          </label>

          <BirthDateField
            value={birthISO}
            onChange={(iso) => {
              setBirthFromISO(iso);
              clearErrorFor('dataNasterii');
            }}
            error={!!errors.dataNasterii}
            errMsg={dateErrMsg}
            hint="Minim 14 ani în ziua evenimentului."
          />

          <label
            style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
            onChange={() => clearErrorFor('acord')}
          >
            <input
              name="acord"
              type="checkbox"
              style={{
                width: 20,
                height: 20,
                margin: '1px 0 0',
                accentColor: 'var(--e3-accent)',
                cursor: 'pointer',
                outline: `2px solid ${errors.acord ? 'var(--e3-danger)' : 'transparent'}`,
                outlineOffset: 2,
              }}
            />
            <span style={{ fontSize: 14, lineHeight: 1.5, color: errors.acord ? 'var(--e3-danger)' : 'var(--e3-muted)' }}>
              Confirm că sunt apt din punct de vedere medical pentru efort fizic intens și accept
              regulamentul evenimentului. *
            </span>
          </label>
          {errors.acord && <span style={fieldErr}>Trebuie să accepți regulamentul ca să te poți înscrie.</span>}

          <button
            type="submit"
            className="e3-submit"
            style={{
              background: 'var(--e3-accent)',
              color: 'var(--e3-bg)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'Anton, sans-serif',
              fontSize: 20,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              padding: 18,
              marginTop: 2,
            }}
          >
            {waitlistMode ? 'Intră pe lista de așteptare' : 'Trimite înscrierea'}
          </button>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--e3-muted)', textAlign: 'center' }}>
            Primești confirmarea pe email imediat. {EVENT_SUMMARY_LINE}
          </p>
          {footerSlot}
        </form>
      )}

      {closedReason && (
        <div style={panel}>
          <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 'clamp(24px, 5vw, 34px)', textTransform: 'uppercase', letterSpacing: 1 }}>
            {closedReason === 'ended' ? 'Evenimentul a avut loc' : closedReason === 'reg' ? 'Înscrierile s-au închis' : 'Locurile sunt pline'}
          </div>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'var(--e3-muted)', maxWidth: 380 }}>
            {closedReason === 'ended'
              ? 'Ne vedem la ediția următoare. Urmărește-ne pentru anunțuri.'
              : closedReason === 'reg'
              ? 'Perioada de înscriere s-a încheiat. Scrie-ne pe Instagram — dacă se eliberează un loc, te anunțăm.'
              : 'Toate locurile și lista de așteptare sunt ocupate. Scrie-ne pe Instagram dacă apare o disponibilitate.'}
          </p>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className="e3-cta" style={{ ...ctaSmall, textDecoration: 'none', display: 'inline-block' }}>
            Contactează organizatorii
          </a>
        </div>
      )}

      {phase === 'loading' && (
        <div style={{ ...panel, padding: 'clamp(40px, 8vw, 64px) 24px', gap: 22 }}>
          <div
            style={{
              width: 52,
              height: 52,
              border: '4px solid var(--e3-border)',
              borderTopColor: 'var(--e3-accent)',
              borderRadius: '50%',
              animation: 'e3-spin 0.8s linear infinite',
            }}
          />
          <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 22, textTransform: 'uppercase', letterSpacing: 1.5, color: 'var(--e3-muted-strong)' }}>
            Se trimite înscrierea…
          </div>
        </div>
      )}

      {phase === 'success' && (
        <div style={{ ...panel, border: '1px solid var(--e3-accent)' }}>
          <div style={{ position: 'relative', width: 84, height: 84, display: 'grid', placeItems: 'center' }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '2px solid var(--e3-accent)', animation: 'e3-ring-pulse 1.6s ease-out 0.4s 3' }} />
            <div
              style={{
                width: 84,
                height: 84,
                background: 'var(--e3-accent)',
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                animation: 'e3-pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
                <path
                  d="M10 23 L19 32 L34 13"
                  stroke="var(--e3-bg)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ strokeDasharray: 40, strokeDashoffset: 40, animation: 'e3-draw-check 0.5s ease-out 0.35s forwards' }}
                />
              </svg>
            </div>
          </div>
          <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 'clamp(26px, 6vw, 38px)', textTransform: 'uppercase', letterSpacing: 1 }}>
            {submittedAsWaitlist ? 'Ești pe lista de așteptare, ' : 'Te-ai înscris, '}
            {confirmName}!
          </div>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'var(--e3-muted)', maxWidth: 400 }}>
            {submittedAsWaitlist
              ? 'Toate locurile sunt ocupate momentan. Te contactăm pe email sau telefon imediat ce se eliberează un loc — în ordinea înscrierii.'
              : `Locul ${slots.occupied} din ${TOTAL_SLOTS}. Ți-am trimis emailul de confirmare cu toate detaliile. ${SUCCESS_SEE_YOU}`}
          </p>
          {!submittedAsWaitlist && (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button type="button" onClick={downloadEventIcs} style={ctaSmall}>
                Adaugă în calendar
              </button>
              <button
                type="button"
                onClick={() => void shareSignup()}
                style={{ ...ctaSmall, background: 'transparent', border: '1px solid var(--e3-accent)', color: 'var(--e3-accent)' }}
              >
                Distribuie
              </button>
            </div>
          )}

          {/* Numărătoare inversă spre pagina evenimentului — orice atingere o oprește. */}
          {redirect && !rd.cancelled && (
            <div style={{ width: '100%', maxWidth: 400, border: '1px dashed var(--e3-border)', padding: 14, display: 'grid', gap: 10, justifyItems: 'stretch' }}>
              <div style={{ fontSize: 14, color: 'var(--e3-muted-strong)', textAlign: 'center' }}>
                Te ducem la pagina evenimentului… {rd.left}
              </div>
              <div style={{ height: 6, background: 'var(--e3-border)' }} aria-hidden="true">
                <div style={{ height: '100%', width: `${((rd.total - rd.left) / rd.total) * 100}%`, background: 'var(--e3-accent)', transition: 'width 1s linear' }} />
              </div>
              <button
                type="button"
                onClick={rd.cancel}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--e3-muted)',
                  cursor: 'pointer',
                  fontFamily: 'Archivo, sans-serif',
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  textDecoration: 'underline',
                  padding: 4,
                }}
              >
                Rămân aici
              </button>
            </div>
          )}
          {redirect && rd.cancelled && (
            <a href="/#participanti" className="e3-cta" style={{ ...ctaSmall, textDecoration: 'none', display: 'inline-block' }}>
              Vezi pagina evenimentului
            </a>
          )}

          <button
            type="button"
            className="e3-ghost"
            onClick={resetForm}
            style={{
              background: 'transparent',
              border: '1px solid var(--e3-border)',
              color: 'var(--e3-muted)',
              cursor: 'pointer',
              fontFamily: 'Archivo, sans-serif',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: 'uppercase',
              padding: '12px 24px',
            }}
          >
            {submittedAsWaitlist ? 'Adaugă altă persoană' : 'Înscrie altă persoană'}
          </button>
        </div>
      )}

      {phase === 'error' && (
        <div style={{ ...panel, border: '1px solid var(--e3-danger)' }}>
          <div
            style={{
              width: 84,
              height: 84,
              background: 'var(--e3-danger-bg)',
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              animation: 'e3-pop-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <span style={{ fontSize: 38, fontWeight: 700, color: 'var(--e3-danger)' }}>✕</span>
          </div>
          <div style={{ fontFamily: 'Anton, sans-serif', fontSize: 'clamp(26px, 6vw, 38px)', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--e3-danger)' }}>
            Ceva n-a mers
          </div>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'var(--e3-muted)', maxWidth: 380 }}>
            Înscrierea nu a putut fi trimisă. Verifică conexiunea la internet și încearcă din nou.
          </p>
          <button
            type="button"
            className="e3-retry"
            onClick={() => {
              setErrors({});
              setPhase('form');
            }}
            style={{ ...ctaSmall, fontSize: 17, padding: '14px 32px' }}
          >
            Încearcă din nou
          </button>
        </div>
      )}
    </div>
  );
};

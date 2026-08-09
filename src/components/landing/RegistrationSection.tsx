import type { CSSProperties } from 'react';
import { TOTAL_SLOTS, INSTAGRAM_URL } from '../../lib/config';
import { downloadEventIcs, shareSignup } from '../../lib/calendar';
import { EVENT_SUMMARY_LINE, SUCCESS_SEE_YOU } from '../../content/format';
import type { FieldName } from '../../lib/validation';
import type { PublicStats } from '../../lib/supabase';
import type { useRegistration } from '../../hooks/useRegistration';
import { sectionNum, sectionTitle } from './shared';

const SUMMARY_ITEMS = [
  EVENT_SUMMARY_LINE,
  'Cursă în stil HYROX: alergare + stații funcționale',
  'Stațiile și greutățile se adaptează nivelului tău',
  'Deschis oricui, indiferent de nivel',
  'Adu cu tine: apă pentru hidratare și bună dispoziție',
];

const MONTHS = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];
// Ani permiși: de la 14 ani (2012) în urmă până la 100 (1926).
const BIRTH_YEARS = Array.from({ length: 2012 - 1926 + 1 }, (_, i) => 2012 - i);

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
  fontSize: 15,
  padding: '13px 14px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};
const selectStyle: CSSProperties = {
  background: 'var(--e3-bg)',
  border: '1px solid var(--e3-border)',
  color: 'var(--e3-text)',
  fontFamily: 'Archivo, sans-serif',
  fontSize: 15,
  padding: '13px 28px 13px 12px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  appearance: 'none',
  cursor: 'pointer',
  colorScheme: 'dark',
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239BA08F' stroke-width='2' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
};
const fieldErr: CSSProperties = { fontSize: 13, color: 'var(--e3-danger)' };

type Props = { reg: ReturnType<typeof useRegistration>; stats: PublicStats | null };

/** Secțiunea „Înscriere": rezumat + formular / listă de așteptare / închis / loading / succes / eroare. */
export const RegistrationSection = ({ reg, stats }: Props) => {
  const {
    waitlistMode, waitlistLeft, slots, isSoldOut, isWaitlistFull, showForm, closedReason,
    phase, errors, birth, birthISO, dateErrMsg, confirmName, submittedAsWaitlist,
    formRef, handleSubmit, clearErrorFor, setBirth, resetForm, setErrors, setPhase,
  } = reg;
  return (
      <section
        id="inscriere"
        style={{ padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px) clamp(64px, 9vw, 96px)' }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))',
            gap: 'clamp(32px, 5vw, 56px)',
            alignItems: 'start',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 32 }}>
              <span style={sectionNum}>03</span>
              <h2 style={sectionTitle}>Înscriere</h2>
            </div>
            <p style={{ margin: '0 0 28px', fontSize: 17, lineHeight: 1.55, color: 'var(--e3-muted-strong)', textWrap: 'pretty' }}>
              {waitlistMode ? (
                <>
                  Locurile s-au epuizat, dar te poți pune pe <strong style={{ color: 'var(--e3-accent)' }}>lista de așteptare</strong>.
                  Au mai rămas{' '}
                  <strong style={{ color: 'var(--e3-accent)' }}>
                    {waitlistLeft} {waitlistLeft === 1 ? 'loc' : 'locuri'}
                  </strong>{' '}
                  pe listă.
                </>
              ) : (
                <>
                  Completează formularul și primești confirmarea pe email.{' '}
                  <strong style={{ color: 'var(--e3-accent)' }}>Locuri limitate</strong> — primul venit, primul servit.
                </>
              )}
            </p>
            <div style={{ border: '1px solid var(--e3-border)', background: 'var(--e3-surface)', padding: 26 }}>
              <div
                style={{
                  fontFamily: 'Anton, sans-serif',
                  fontSize: 15,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: 'var(--e3-accent)',
                  marginBottom: 18,
                }}
              >
                Pe scurt
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 14 }}>
                {SUMMARY_ITEMS.map((item) => (
                  <li key={item} style={{ display: 'flex', gap: 12, fontSize: 15, lineHeight: 1.5, color: 'var(--e3-muted-strong)' }}>
                    <span style={{ color: 'var(--e3-accent)', fontWeight: 700 }}>→</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            {/* Slots */}
            <div
              style={{
                border: '1px solid var(--e3-border)',
                borderBottom: 'none',
                background: 'var(--e3-surface)',
                padding: '18px 22px',
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
              <div style={{ display: 'flex', gap: 4 }} aria-hidden="true">
                {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
                  <div key={i} style={{ height: 8, flex: 1, background: i < slots.occupied ? 'var(--e3-accent)' : 'var(--e3-border)' }} />
                ))}
              </div>
              {isSoldOut && !isWaitlistFull && (
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--e3-accent)', fontWeight: 600, textWrap: 'pretty' }}>
                  Locurile s-au epuizat — completează formularul și intri pe lista de așteptare. Te contactăm
                  imediat ce se eliberează un loc.
                </p>
              )}
            </div>

            {/* Formular */}
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
                  padding: 'clamp(20px, 4vw, 36px)',
                  display: 'grid',
                  gap: 22,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 18 }}>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={label}>Nume complet *</span>
                    <input
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
                      placeholder="07xx xxx xxx"
                      autoComplete="tel"
                      style={{ ...inputStyle, borderColor: errors.telefon ? 'var(--e3-danger)' : 'var(--e3-border)' }}
                    />
                    {errors.telefon && <span style={fieldErr}>Numărul de telefon nu e valid.</span>}
                  </label>
                </div>
                <div style={{ display: 'grid', gap: 18 }}>
                  <label style={{ display: 'grid', gap: 8 }}>
                    <span style={label}>Email *</span>
                    <input
                      className="e3-input"
                      name="email"
                      type="email"
                      placeholder="ana@email.ro"
                      autoComplete="email"
                      style={{ ...inputStyle, borderColor: errors.email ? 'var(--e3-danger)' : 'var(--e3-border)' }}
                    />
                    {errors.email && <span style={fieldErr}>Adresa de email nu e validă.</span>}
                  </label>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <span style={label}>Data nașterii *</span>
                    <input type="hidden" name="dataNasterii" value={birthISO} readOnly />
                    <div style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.6fr 1.1fr', gap: 10 }}>
                      <select
                        aria-label="Ziua nașterii"
                        className="e3-input"
                        value={birth.d}
                        onChange={(e) => {
                          setBirth((b) => ({ ...b, d: e.target.value }));
                          clearErrorFor('dataNasterii');
                        }}
                        style={{ ...selectStyle, borderColor: errors.dataNasterii ? 'var(--e3-danger)' : 'var(--e3-border)' }}
                      >
                        <option value="">Zi</option>
                        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                          <option key={d} value={String(d)}>
                            {d}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Luna nașterii"
                        className="e3-input"
                        value={birth.m}
                        onChange={(e) => {
                          setBirth((b) => ({ ...b, m: e.target.value }));
                          clearErrorFor('dataNasterii');
                        }}
                        style={{ ...selectStyle, borderColor: errors.dataNasterii ? 'var(--e3-danger)' : 'var(--e3-border)' }}
                      >
                        <option value="">Luna</option>
                        {MONTHS.map((name, i) => (
                          <option key={name} value={String(i + 1)}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label="Anul nașterii"
                        className="e3-input"
                        value={birth.y}
                        onChange={(e) => {
                          setBirth((b) => ({ ...b, y: e.target.value }));
                          clearErrorFor('dataNasterii');
                        }}
                        style={{ ...selectStyle, borderColor: errors.dataNasterii ? 'var(--e3-danger)' : 'var(--e3-border)' }}
                      >
                        <option value="">An</option>
                        {BIRTH_YEARS.map((y) => (
                          <option key={y} value={String(y)}>
                            {y}
                          </option>
                        ))}
                      </select>
                    </div>
                    {errors.dataNasterii && <span style={fieldErr}>{dateErrMsg}</span>}
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--e3-muted)', textWrap: 'pretty' }}>
                  Participanții trebuie să aibă minim 14 ani în ziua evenimentului. Stațiile și greutățile sunt
                  adaptate de antrenori la fața locului.
                </p>
                <label
                  style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
                  onChange={() => clearErrorFor('acord')}
                >
                  <input
                    name="acord"
                    type="checkbox"
                    style={{
                      width: 18,
                      height: 18,
                      margin: '2px 0 0',
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
                    marginTop: 4,
                  }}
                >
                  {waitlistMode ? 'Intră pe lista de așteptare' : 'Trimite înscrierea'}
                </button>
              </form>
            )}

            {/* Închis (eveniment trecut / înscrieri închise / totul plin) */}
            {closedReason && (
              <div
                style={{
                  border: '1px solid var(--e3-border)',
                  background: 'var(--e3-surface)',
                  padding: 'clamp(32px, 6vw, 56px) clamp(20px, 5vw, 40px)',
                  textAlign: 'center',
                  display: 'grid',
                  gap: 16,
                  justifyItems: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 'clamp(24px, 5vw, 34px)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {closedReason === 'ended'
                    ? 'Evenimentul a avut loc'
                    : closedReason === 'reg'
                    ? 'Înscrierile s-au închis'
                    : 'Locurile sunt pline'}
                </div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'var(--e3-muted)', maxWidth: 380 }}>
                  {closedReason === 'ended'
                    ? 'Ne vedem la ediția următoare. Urmărește-ne pentru anunțuri.'
                    : closedReason === 'reg'
                    ? 'Perioada de înscriere s-a încheiat. Scrie-ne pe Instagram — dacă se eliberează un loc, te anunțăm.'
                    : 'Toate locurile și lista de așteptare sunt ocupate. Scrie-ne pe Instagram dacă apare o disponibilitate.'}
                </p>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="e3-cta"
                  style={{
                    display: 'inline-block',
                    background: 'var(--e3-accent)',
                    color: 'var(--e3-bg)',
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 17,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    padding: '14px 32px',
                    textDecoration: 'none',
                  }}
                >
                  Contactează organizatorii
                </a>
              </div>
            )}

            {/* Loading */}
            {phase === 'loading' && (
              <div
                style={{
                  border: '1px solid var(--e3-border)',
                  background: 'var(--e3-surface)',
                  padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)',
                  textAlign: 'center',
                  display: 'grid',
                  gap: 22,
                  justifyItems: 'center',
                }}
              >
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
                <div
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 22,
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    color: 'var(--e3-muted-strong)',
                  }}
                >
                  Se trimite înscrierea…
                </div>
              </div>
            )}

            {/* Success */}
            {phase === 'success' && (
              <div
                style={{
                  border: '1px solid var(--e3-accent)',
                  background: 'var(--e3-surface)',
                  padding: 'clamp(32px, 6vw, 56px) clamp(20px, 5vw, 40px)',
                  textAlign: 'center',
                  display: 'grid',
                  gap: 16,
                  justifyItems: 'center',
                }}
              >
                <div style={{ position: 'relative', width: 84, height: 84, display: 'grid', placeItems: 'center' }}>
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: '50%',
                      border: '2px solid var(--e3-accent)',
                      animation: 'e3-ring-pulse 1.6s ease-out 0.4s 3',
                    }}
                  />
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
                <div
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 'clamp(28px, 6vw, 40px)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  {submittedAsWaitlist ? 'Ești pe lista de așteptare, ' : 'Te-ai înregistrat, '}
                  {confirmName}!
                </div>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'var(--e3-muted)', maxWidth: 380 }}>
                  {submittedAsWaitlist
                    ? 'Toate locurile sunt ocupate momentan. Te contactăm pe email sau telefon imediat ce se eliberează un loc — în ordinea înscrierii.'
                    : `Ți-am trimis un email de confirmare cu toate detaliile. ${SUCCESS_SEE_YOU}`}
                </p>
                {!submittedAsWaitlist && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button
                      type="button"
                      onClick={downloadEventIcs}
                      style={{
                        background: 'var(--e3-accent)',
                        color: 'var(--e3-bg)',
                        border: 'none',
                        cursor: 'pointer',
                        fontFamily: 'Anton, sans-serif',
                        fontSize: 15,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        padding: '12px 22px',
                      }}
                    >
                      Adaugă în calendar
                    </button>
                    <button
                      type="button"
                      onClick={() => void shareSignup()}
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--e3-accent)',
                        color: 'var(--e3-accent)',
                        cursor: 'pointer',
                        fontFamily: 'Anton, sans-serif',
                        fontSize: 15,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        padding: '12px 22px',
                      }}
                    >
                      Distribuie
                    </button>
                  </div>
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
                    marginTop: 8,
                  }}
                >
                  {submittedAsWaitlist ? 'Adaugă altă persoană' : 'Înscrie altă persoană'}
                </button>
              </div>
            )}

            {/* Error */}
            {phase === 'error' && (
              <div
                style={{
                  border: '1px solid var(--e3-danger)',
                  background: 'var(--e3-surface)',
                  padding: 'clamp(32px, 6vw, 56px) clamp(20px, 5vw, 40px)',
                  textAlign: 'center',
                  display: 'grid',
                  gap: 16,
                  justifyItems: 'center',
                }}
              >
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
                <div
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 'clamp(28px, 6vw, 40px)',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                    color: 'var(--e3-danger)',
                  }}
                >
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
                  style={{
                    background: 'var(--e3-accent)',
                    color: 'var(--e3-bg)',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 17,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    padding: '14px 32px',
                    marginTop: 8,
                  }}
                >
                  Încearcă din nou
                </button>
              </div>
            )}
          </div>
        </div>
      </section>
  );
};

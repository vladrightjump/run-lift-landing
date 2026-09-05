import type { CSSProperties } from 'react';
import { useEventConfig, useEditionStrings } from '../../hooks/useEventConfig';
import type { FieldName } from '../../lib/validation';
import type { PublicStats } from '../../lib/supabase';
import type { useRegistration } from '../../hooks/useRegistration';
import { useCountUp } from '../../hooks/useCountUp';
import { BirthDateField } from './BirthDateField';
import { sectionNum, sectionTitle } from './shared';
import {
  AntetLocuri,
  BaraLocuri,
  BifaAcord,
  BifaSucces,
  ButonReincearca,
  ButonReset,
  ButonTrimite,
  CampText,
  IconEroare,
  LinkContact,
  Rotitor,
  ActiuniSucces,
  TEXT_EROARE_MESAJ,
  TEXT_EROARE_TITLU,
  TEXT_INCARCARE,
  TEXT_SUCCES_ASTEPTARE,
  textInchis,
} from './registrationStates';

/** Prima linie depinde de ediție, restul e proză statică. */
const summaryItems = (eventSummaryLine: string): string[] => [
  eventSummaryLine,
  'Cursă în stil HYROX: alergare + stații funcționale',
  'Stațiile și greutățile se adaptează nivelului tău',
  'Deschis oricui, indiferent de nivel',
  'Adu cu tine: apă pentru hidratare și bună dispoziție',
];

/** Cadrul comun al panourilor de stare (închis / încărcare / succes / eroare). */
const panou: CSSProperties = {
  border: '1px solid var(--e3-border)',
  background: 'var(--e3-surface)',
  padding: 'clamp(32px, 6vw, 56px) clamp(20px, 5vw, 40px)',
  textAlign: 'center',
  display: 'grid',
  gap: 16,
  justifyItems: 'center',
};

const titluPanou: CSSProperties = {
  fontFamily: 'Anton, sans-serif',
  fontSize: 'clamp(28px, 6vw, 40px)',
  textTransform: 'uppercase',
  letterSpacing: 1,
};

const mesajPanou: CSSProperties = {
  margin: 0,
  fontSize: 16,
  lineHeight: 1.55,
  color: 'var(--e3-muted)',
  maxWidth: 380,
};

type Props = {
  reg: ReturnType<typeof useRegistration>;
  stats: PublicStats | null;
  /** Numărul afișat al secțiunii — se schimbă când ordinea secțiunilor se schimbă. */
  num?: string;
};

/** Secțiunea „Înscriere": rezumat + formular / listă de așteptare / închis / loading / succes / eroare. */
export const RegistrationSection = ({ reg, stats, num = '03' }: Props) => {
  const config = useEventConfig();
  const TOTAL_SLOTS = config.slots.total;
  const { EVENT_SUMMARY_LINE, SUCCESS_SEE_YOU } = useEditionStrings();
  const {
    waitlistMode, waitlistLeft, slots, isSoldOut, isWaitlistFull, showForm, closedReason,
    phase, errors, birthISO, dateErrMsg, confirmName, submittedAsWaitlist,
    formRef, handleSubmit, clearErrorFor, setBirth, resetForm, setErrors, setPhase,
  } = reg;

  // Contorul urcă spre valoarea reală în loc să sară de la „–". `null` cât
  // timp statisticile n-au sosit, ca marcajul de gol să rămână.
  const remainingShown = useCountUp(stats ? slots.remaining : null);

  /** BirthDateField ne dă ISO; `useRegistration` ține {d,m,y}. */
  const setBirthFromISO = (iso: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    setBirth(m ? { d: String(Number(m[3])), m: String(Number(m[2])), y: m[1] } : { d: '', m: '', y: '' });
  };

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
              <span className="e3-title-num" style={sectionNum}>{num}</span>
              <h2 className="e3-title" style={sectionTitle}>Înscriere</h2>
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
            {/* Fundalul și bordura vin din `.e3-card` — vezi nota de acolo. */}
            <div data-reveal className="e3-card e3-spot" style={{ padding: 26 }}>
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
                {summaryItems(EVENT_SUMMARY_LINE).map((item) => (
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
              <AntetLocuri>
                {/* Contorul respiră doar cât chiar mai sunt locuri puține.
                    Pe zero n-ar mai fi urgență, ci doar zgomot lângă mesajul
                    de „epuizat" de dedesubt. */}
                <span
                  className={
                    stats && slots.remaining > 0 && slots.remaining <= 5 ? 'e3-urgent' : undefined
                  }
                  style={{
                    display: 'inline-block',
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 22,
                    letterSpacing: 1,
                    color: slots.remaining <= 3 ? 'var(--e3-danger)' : 'var(--e3-accent)',
                  }}
                >
                  {remainingShown ?? '–'} / {TOTAL_SLOTS}
                </span>
              </AntetLocuri>
              <BaraLocuri total={TOTAL_SLOTS} ocupate={slots.occupied} gap={4} animat />
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
                  <CampText
                    nume="nume"
                    eticheta="Nume *"
                    tip="text"
                    placeholder="Popescu"
                    autoComplete="family-name"
                    eroare={errors.nume}
                    mesajEroare="Completează numele de familie."
                  />
                  <CampText
                    nume="prenume"
                    eticheta="Prenume *"
                    tip="text"
                    placeholder="Ana"
                    autoComplete="given-name"
                    eroare={errors.prenume}
                    mesajEroare="Completează prenumele."
                  />
                  <CampText
                    nume="telefon"
                    eticheta="Telefon *"
                    tip="tel"
                    placeholder="07xx xxx xxx"
                    autoComplete="tel"
                    eroare={errors.telefon}
                    mesajEroare="Numărul de telefon nu e valid."
                  />
                </div>
                <div style={{ display: 'grid', gap: 18 }}>
                  <CampText
                    nume="email"
                    eticheta="Email *"
                    tip="email"
                    placeholder="ana@email.ro"
                    autoComplete="email"
                    eroare={errors.email}
                    mesajEroare="Adresa de email nu e validă."
                  />
                  <BirthDateField
                    value={birthISO}
                    onChange={(iso) => {
                      setBirthFromISO(iso);
                      clearErrorFor('dataNasterii');
                    }}
                    error={!!errors.dataNasterii}
                    errMsg={dateErrMsg}
                  />
                </div>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--e3-muted)', textWrap: 'pretty' }}>
                  Participanții trebuie să aibă minim 14 ani în ziua evenimentului. Stațiile și greutățile sunt
                  adaptate de antrenori la fața locului.
                </p>
                <BifaAcord
                  eroare={errors.acord}
                  onClear={() => clearErrorFor('acord')}
                  marime={18}
                  margineSus="2px 0 0"
                />
                <ButonTrimite peListaDeAsteptare={waitlistMode} marginTop={4} />
              </form>
            )}

            {/* Închis (eveniment trecut / înscrieri închise / totul plin) */}
            {closedReason && (
              <div style={panou}>
                <div style={{ ...titluPanou, fontSize: 'clamp(24px, 5vw, 34px)' }}>
                  {textInchis(closedReason).titlu}
                </div>
                <p style={mesajPanou}>{textInchis(closedReason).mesaj}</p>
                <LinkContact
                  stil={{
                    background: 'var(--e3-accent)',
                    color: 'var(--e3-bg)',
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 17,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    padding: '14px 32px',
                  }}
                />
              </div>
            )}

            {/* Loading */}
            {phase === 'loading' && (
              <div style={{ ...panou, padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)', gap: 22 }}>
                <Rotitor />
                <div
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 22,
                    textTransform: 'uppercase',
                    letterSpacing: 1.5,
                    color: 'var(--e3-muted-strong)',
                  }}
                >
                  {TEXT_INCARCARE}
                </div>
              </div>
            )}

            {/* Success */}
            {phase === 'success' && (
              <div style={{ ...panou, border: '1px solid var(--e3-accent)' }}>
                <BifaSucces />
                <div style={titluPanou}>
                  {submittedAsWaitlist ? 'Ești pe lista de așteptare, ' : 'Te-ai înregistrat, '}
                  {confirmName}!
                </div>
                <p style={mesajPanou}>
                  {submittedAsWaitlist
                    ? TEXT_SUCCES_ASTEPTARE
                    : `Ți-am trimis un email de confirmare cu toate detaliile. ${SUCCESS_SEE_YOU}`}
                </p>
                {!submittedAsWaitlist && <ActiuniSucces config={config} />}
                <ButonReset
                  peListaDeAsteptare={submittedAsWaitlist}
                  onClick={resetForm}
                  marginTop={8}
                />
              </div>
            )}

            {/* Error */}
            {phase === 'error' && (
              <div style={{ ...panou, border: '1px solid var(--e3-danger)' }}>
                <IconEroare />
                <div style={{ ...titluPanou, color: 'var(--e3-danger)' }}>{TEXT_EROARE_TITLU}</div>
                <p style={mesajPanou}>{TEXT_EROARE_MESAJ}</p>
                <ButonReincearca
                  onClick={() => {
                    setErrors({});
                    setPhase('form');
                  }}
                  stil={{ letterSpacing: 1.5, marginTop: 8 }}
                />
              </div>
            )}
          </div>
        </div>
      </section>
  );
};

import { useEventConfig, useEditionStrings } from '../../hooks/useEventConfig';
import type { FieldName } from '../../lib/validation';
import type { PublicStats } from '../../lib/supabase';
import type { useRegistration } from '../../hooks/useRegistration';
import { useCountUp } from '../../hooks/useCountUp';
import { BirthDateField } from './BirthDateField';
import { SectionHead } from './SectionHead';
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
    formRef, handleSubmit, clearErrorFor, setBirth, resetForm, setErrors, setPhase, hpProps,
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
    <section id="inscriere" className="e3-sec e3-reg">
      {/* Linia de sosire. Stă în secțiune, la marginea ei de sus, și nu depinde
          de ce vine înainte sau după: ordinea secțiunilor se schimbă din admin,
          iar înscrierea nu e neapărat ultima. */}
      <div className="e3-finish" aria-hidden="true">
        <span className="e3-finish-band" />
        <span className="e3-finish-word">Finish</span>
      </div>
      <div className="e3-wrap">
        <SectionHead num={num}>Înscriere</SectionHead>
        <div className="e3-reg-grid">
          <div className="e3-reg-side">
            <p className="e3-lead e3-reg-lead">
              {waitlistMode ? (
                <>
                  Locurile s-au epuizat, dar te poți pune pe <strong>lista de așteptare</strong>.
                  Au mai rămas{' '}
                  <strong>
                    {waitlistLeft} {waitlistLeft === 1 ? 'loc' : 'locuri'}
                  </strong>{' '}
                  pe listă.
                </>
              ) : (
                <>
                  Completează formularul și primești confirmarea pe email. <strong>Locuri limitate</strong>:
                  primul venit, primul servit.
                </>
              )}
            </p>
            {/* Fundalul și bordura vin din `.e3-card` (edition3.css): inline ar
                bate `:hover`. */}
            <div data-reveal className="e3-card e3-spot e3-reg-summary">
              <div className="e3-reg-summary-title">Pe scurt</div>
              <ul className="e3-reg-summary-list">
                {summaryItems(EVENT_SUMMARY_LINE).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="e3-reg-main">
            <div className="e3-reg-slots">
              <AntetLocuri>
                {/* Contorul respiră doar cât chiar mai sunt locuri puține.
                    Pe zero n-ar mai fi urgență, ci doar zgomot lângă mesajul
                    de „epuizat" de dedesubt. */}
                <span
                  className={[
                    'e3-num e3-reg-count',
                    slots.remaining <= 3 ? 'e3-reg-count-low' : '',
                    stats && slots.remaining > 0 && slots.remaining <= 5 ? 'e3-urgent' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {remainingShown ?? '–'} / {TOTAL_SLOTS}
                </span>
              </AntetLocuri>
              <BaraLocuri total={TOTAL_SLOTS} ocupate={slots.occupied} gap={4} animat />
              {isSoldOut && !isWaitlistFull && (
                <p className="e3-reg-soldout">
                  Locurile s-au epuizat. Completează formularul și intri pe lista de așteptare. Te contactăm
                  imediat ce se eliberează un loc.
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
                className="e3-reg-form"
              >
                {/* Capcană anti-bot: invizibilă pentru oameni, tentantă pentru
                    scripturile care completează orice câmp. Verificată pe server. */}
                <input type="text" {...hpProps} />
                <div className="e3-reg-fields">
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
                <div className="e3-reg-stack">
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
                <p className="e3-reg-note">
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
              <div className="e3-reg-panel">
                <div className="e3-reg-panel-title">{textInchis(closedReason).titlu}</div>
                <p className="e3-reg-panel-msg">{textInchis(closedReason).mesaj}</p>
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

            {phase === 'loading' && (
              <div className="e3-reg-panel e3-reg-panel-loading">
                <Rotitor />
                <div className="e3-reg-panel-title e3-reg-panel-wait">{TEXT_INCARCARE}</div>
              </div>
            )}

            {/* Succes: ai trecut linia. Bordura lime o spune. */}
            {phase === 'success' && (
              <div className="e3-reg-panel e3-reg-panel-ok">
                <BifaSucces />
                <div className="e3-reg-panel-title">
                  {submittedAsWaitlist ? 'Ești pe lista de așteptare, ' : 'Te-ai înregistrat, '}
                  {confirmName}!
                </div>
                <p className="e3-reg-panel-msg">
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

            {phase === 'error' && (
              <div className="e3-reg-panel e3-reg-panel-err">
                <IconEroare />
                <div className="e3-reg-panel-title">{TEXT_EROARE_TITLU}</div>
                <p className="e3-reg-panel-msg">{TEXT_EROARE_MESAJ}</p>
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
      </div>
    </section>
  );
};

import shared4 from './RegistrationStyles.module.css';
import shared3 from '../../../shared/ui/PublicSurface.module.css';
import styles from './RegistrationSection.module.css';
import shared1 from '../../../shared/ui/PublicLayout.module.css';
import { useEventConfig, useEditionStrings } from '../../../shared/lib/useEventConfig';
import type { FieldName } from '../../../shared/lib/validation';
import type { PublicStats } from '../data/api';
import type { useRegistration } from '../hooks/useRegistration';
import { useCountUp } from '../../../shared/lib/useCountUp';
import { BirthDateField } from './BirthDateField';
import { SectionHead } from '../../landing';
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
  BaraIncarcare,
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
    <section id="inscriere" className={shared1['e3-sec'] + ' ' + styles['e3-reg']} data-css={"e3-sec e3-reg"}>
      {/* Linia de sosire. Stă în secțiune, la marginea ei de sus, și nu depinde
          de ce vine înainte sau după: ordinea secțiunilor se schimbă din admin,
          iar înscrierea nu e neapărat ultima. */}
      <div className={styles['e3-finish']} data-css={"e3-finish"} aria-hidden="true">
        <span className={styles['e3-finish-band']} data-css={"e3-finish-band"} />
        <span className={styles['e3-finish-word']} data-css={"e3-finish-word"}>Finish</span>
      </div>
      <div className={shared1['e3-wrap']} data-css={"e3-wrap"}>
        <SectionHead num={num}>Înscriere</SectionHead>
        <div className={styles['e3-reg-grid']} data-css={"e3-reg-grid"}>
          <div className={styles['e3-reg-side']} data-css={"e3-reg-side"}>
            <p className={shared1['e3-lead'] + ' ' + styles['e3-reg-lead']} data-css={"e3-lead e3-reg-lead"}>
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
            <div data-reveal className={shared3['e3-card'] + ' ' + shared3['e3-spot'] + ' ' + styles['e3-reg-summary']} data-css={"e3-card e3-spot e3-reg-summary"}>
              <div className={styles['e3-reg-summary-title']} data-css={"e3-reg-summary-title"}>Pe scurt</div>
              <ul className={styles['e3-reg-summary-list']} data-css={"e3-reg-summary-list"}>
                {summaryItems(EVENT_SUMMARY_LINE).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className={styles['e3-reg-main']} data-css={"e3-reg-main"}>
            <div className={styles['e3-reg-slots']} data-css={"e3-reg-slots"}>
              <AntetLocuri>
                {/* Contorul respiră doar cât chiar mai sunt locuri puține.
                    Pe zero n-ar mai fi urgență, ci doar zgomot lângă mesajul
                    de „epuizat" de dedesubt. */}
                <span
                  className={[
                    shared1['e3-num'] + ' ' + styles['e3-reg-count'],
                    slots.remaining <= 3 ? styles['e3-reg-count-low'] : '',
                    stats && slots.remaining > 0 && slots.remaining <= 5 ? styles['e3-urgent'] : '',
                  ]
                    .filter(Boolean)
                    .join(' ')} data-css={[
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
              <BaraLocuri total={TOTAL_SLOTS} ocupate={slots.occupied} className={styles.locuri} animat />
              {isSoldOut && !isWaitlistFull && (
                <p className={styles['e3-reg-soldout']} data-css={"e3-reg-soldout"}>
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
                className={styles['e3-reg-form']} data-css={"e3-reg-form"}
              >
                {/* Capcană anti-bot: invizibilă pentru oameni, tentantă pentru
                    scripturile care completează orice câmp. Verificată pe server. */}
                <input type="text" {...hpProps} />
                <div className={styles['e3-reg-fields']} data-css={"e3-reg-fields"}>
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
                <div className={styles['e3-reg-stack']} data-css={"e3-reg-stack"}>
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
                <p className={styles['e3-reg-note']} data-css={"e3-reg-note"}>
                  Participanții trebuie să aibă minim 14 ani în ziua evenimentului. Stațiile și greutățile sunt
                  adaptate de antrenori la fața locului.
                </p>
                <BifaAcord
                  eroare={errors.acord}
                  onClear={() => clearErrorFor('acord')}
                  className={styles.acord}
                />
                <ButonTrimite peListaDeAsteptare={waitlistMode} className={styles.trimite} />
              </form>
            )}

            {/* Închis (eveniment trecut / înscrieri închise / totul plin) */}
            {closedReason && (
              <div className={shared4['e3-reg-panel']} data-css={"e3-reg-panel"}>
                <div className={shared4['e3-reg-panel-title']} data-css={"e3-reg-panel-title"}>{textInchis(closedReason).titlu}</div>
                <p className={shared4['e3-reg-panel-msg']} data-css={"e3-reg-panel-msg"}>{textInchis(closedReason).mesaj}</p>
                <LinkContact
                  className={styles.contact}
                />
              </div>
            )}

            {phase === 'loading' && (
              <div className={shared4['e3-reg-panel'] + ' ' + shared4['e3-reg-panel-loading']} data-css={"e3-reg-panel e3-reg-panel-loading"}>
                <BaraIncarcare />
                <div className={shared4['e3-reg-panel-title'] + ' ' + shared4['e3-reg-panel-wait']} data-css={"e3-reg-panel-title e3-reg-panel-wait"}>{TEXT_INCARCARE}</div>
              </div>
            )}

            {/* Succes: ai trecut linia. Bordura lime o spune. */}
            {phase === 'success' && (
              <div className={shared4['e3-reg-panel'] + ' ' + shared4['e3-reg-panel-ok']} data-css={"e3-reg-panel e3-reg-panel-ok"}>
                <BifaSucces />
                <div className={shared4['e3-reg-panel-title']} data-css={"e3-reg-panel-title"}>
                  {submittedAsWaitlist ? 'Ești pe lista de așteptare, ' : 'Te-ai înregistrat, '}
                  {confirmName}!
                </div>
                <p className={shared4['e3-reg-panel-msg']} data-css={"e3-reg-panel-msg"}>
                  {submittedAsWaitlist
                    ? TEXT_SUCCES_ASTEPTARE
                    : `Ți-am trimis un email de confirmare cu toate detaliile. ${SUCCESS_SEE_YOU}`}
                </p>
                {!submittedAsWaitlist && <ActiuniSucces config={config} />}
                <ButonReset
                  peListaDeAsteptare={submittedAsWaitlist}
                  onClick={resetForm}
                  className={styles.reset}
                />
              </div>
            )}

            {phase === 'error' && (
              <div className={shared4['e3-reg-panel'] + ' ' + shared4['e3-reg-panel-err']} data-css={"e3-reg-panel e3-reg-panel-err"}>
                <IconEroare />
                <div className={shared4['e3-reg-panel-title']} data-css={"e3-reg-panel-title"}>{TEXT_EROARE_TITLU}</div>
                <p className={shared4['e3-reg-panel-msg']} data-css={"e3-reg-panel-msg"}>{TEXT_EROARE_MESAJ}</p>
                <ButonReincearca
                  onClick={() => {
                    setErrors({});
                    setPhase('form');
                  }}
                  className={styles.retry}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

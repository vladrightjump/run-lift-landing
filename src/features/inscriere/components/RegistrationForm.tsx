import shared3 from '../../../shared/ui/PublicControls.module.css';
import shared1 from './RegistrationStyles.module.css';
import styles from './RegistrationForm.module.css';
import { useEffect, useRef } from 'react';
import { useEventConfig, useEditionStrings } from '../../../shared/lib/useEventConfig';
import type { FieldName } from '../../../shared/lib/validation';
import type { PublicStats } from '../data/api';
import type { useRegistration } from '../hooks/useRegistration';
import { markJustSignedUp } from '../../../shared/lib/justSignedUp';
import { useSuccessRedirect } from '../hooks/useSuccessRedirect';
import { BirthDateField } from './BirthDateField';
import {
  ActiuniSucces,
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
  TEXT_EROARE_MESAJ,
  TEXT_EROARE_TITLU,
  TEXT_INCARCARE,
  TEXT_SUCCES_ASTEPTARE,
  textInchis,
} from './registrationStates';

/**
 * Formularul de înscriere, ambalabil oriunde: pe pagina `/inscriere` și în
 * overlay-ul de pe landing. Aceleași stări ca secțiunea 03 de pe landing
 * (`form → loading → success/error` + „închis"), dar:
 *   · câmpurile pe o singură coloană, cu tastatură potrivită pe telefon,
 *   · confirmarea anunță locul ocupat și are numărătoare inversă spre lista
 *     de participanți.
 *
 * Nici logica, nici prezentarea stărilor nu mai sunt duplicate: prima vine din
 * `useRegistration`, a doua din `registrationStates.tsx`. Aici rămâne doar ce
 * ține de suprafața asta.
 */

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
  const config = useEventConfig();
  const TOTAL_SLOTS = config.slots.total;
  const { EVENT_SUMMARY_LINE, SUCCESS_SEE_YOU } = useEditionStrings();
  const {
    waitlistMode, waitlistLeft, slots, isSoldOut, isWaitlistFull, showForm, closedReason,
    phase, errors, birthISO, dateErrMsg, confirmName, submittedAsWaitlist,
    formRef, handleSubmit, clearErrorFor, setBirth, resetForm, setErrors, setPhase, hpProps,
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
    <div className={styles.layout1}>
      {/* Locuri rămase — lipit peste formular, ca pe landing */}
      <div
        className={styles.layout2}
      >
        <AntetLocuri>
          <span
            className={styles.text3 + ' ' + (slots.remaining <= 3 ? styles.text3On0 : styles.text3Off0)}
          >
            {stats ? slots.remaining : '–'} / {TOTAL_SLOTS}
          </span>
        </AntetLocuri>
        <BaraLocuri total={TOTAL_SLOTS} ocupate={slots.occupied} className={styles.locuri} animat={false} />
        {isSoldOut && !isWaitlistFull && (
          <p className={styles.copy4}>
            Locurile s-au epuizat. Completează formularul și intri pe lista de așteptare
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
          className={styles.element5}
        >
          {/* Capcană anti-bot: invizibilă pentru oameni, tentantă pentru
              scripturile care completează orice câmp. Verificată pe server.
              Formularul ăsta e montat de DOUĂ ori — pagina /inscriere și
              overlay-ul de pe landing — deci fără linia asta două din cele
              cinci suprafețe publice ar trimite fără capcană. */}
          <input type="text" {...hpProps} />
          <CampText
            nume="nume"
            eticheta="Nume *"
            tip="text"
            placeholder="Popescu"
            autoComplete="family-name"
            eroare={errors.nume}
            mesajEroare="Completează numele de familie."
            campRef={firstFieldRef}
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
            inputMode="tel"
            placeholder="07xx xxx xxx"
            autoComplete="tel"
            eroare={errors.telefon}
            mesajEroare="Numărul de telefon nu e valid."
          />
          <CampText
            nume="email"
            eticheta="Email *"
            tip="email"
            inputMode="email"
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
            hint="Minim 14 ani în ziua evenimentului."
          />

          <BifaAcord
            eroare={errors.acord}
            onClear={() => clearErrorFor('acord')}
            className={styles.acord}
          />

          <ButonTrimite peListaDeAsteptare={waitlistMode} className={styles.trimite} />
          <p className={styles.copy6}>
            Primești confirmarea pe email imediat. {EVENT_SUMMARY_LINE}
          </p>
          {footerSlot}
        </form>
      )}

      {closedReason && (
        <div className={shared1['e3-reg-panel'] + ' ' + styles['e3-reg-panel-compact']} data-css={"e3-reg-panel e3-reg-panel-compact"}>
          <div className={shared1['e3-reg-panel-title']} data-css={"e3-reg-panel-title"}>{textInchis(closedReason).titlu}</div>
          <p className={shared1['e3-reg-panel-msg']} data-css={"e3-reg-panel-msg"}>
            {textInchis(closedReason).mesaj}
          </p>
          <LinkContact className={styles.contact} />
        </div>
      )}

      {phase === 'loading' && (
        <div className={shared1['e3-reg-panel'] + ' ' + shared1['e3-reg-panel-loading']} data-css={"e3-reg-panel e3-reg-panel-loading"}>
          <BaraIncarcare />
          <div className={shared1['e3-reg-panel-title'] + ' ' + shared1['e3-reg-panel-wait']} data-css={"e3-reg-panel-title e3-reg-panel-wait"}>{TEXT_INCARCARE}</div>
        </div>
      )}

      {phase === 'success' && (
        <div className={shared1['e3-reg-panel'] + ' ' + styles['e3-reg-panel-compact'] + ' ' + shared1['e3-reg-panel-ok']} data-css={"e3-reg-panel e3-reg-panel-compact e3-reg-panel-ok"}>
          <BifaSucces />
          <div className={shared1['e3-reg-panel-title']} data-css={"e3-reg-panel-title"}>
            {submittedAsWaitlist ? 'Ești pe lista de așteptare, ' : 'Te-ai înscris, '}
            {confirmName}!
          </div>
          <p className={shared1['e3-reg-panel-msg']} data-css={"e3-reg-panel-msg"}>
            {submittedAsWaitlist
              ? TEXT_SUCCES_ASTEPTARE
              : `Locul ${slots.occupied} din ${TOTAL_SLOTS}. Ți-am trimis emailul de confirmare cu toate detaliile. ${SUCCESS_SEE_YOU}`}
          </p>
          {!submittedAsWaitlist && <ActiuniSucces config={config} />}

          {/* Numărătoare inversă spre pagina evenimentului — orice atingere o oprește. */}
          {redirect && !rd.cancelled && (
            <div className={styles.layout7}>
              <div className={styles.layout8}>
                Te ducem la pagina evenimentului… {rd.left}
              </div>
              <div className={styles.layout9} aria-hidden="true">
                <div className={styles.layout10} style={{ width: `${((rd.total - rd.left) / rd.total) * 100}%` }} />
              </div>
              <button
                type="button"
                onClick={rd.cancel}
                className={styles.button11}
              >
                Rămân aici
              </button>
            </div>
          )}
          {redirect && rd.cancelled && (
            <a href="/#participanti" className={shared3['e3-cta'] + ' ' + styles.link12} data-css={"e3-cta"} >
              Vezi pagina evenimentului
            </a>
          )}

          <ButonReset peListaDeAsteptare={submittedAsWaitlist} onClick={resetForm} className={styles.reset} />
        </div>
      )}

      {phase === 'error' && (
        <div className={shared1['e3-reg-panel'] + ' ' + styles['e3-reg-panel-compact'] + ' ' + shared1['e3-reg-panel-err']} data-css={"e3-reg-panel e3-reg-panel-compact e3-reg-panel-err"}>
          <IconEroare />
          <div className={shared1['e3-reg-panel-title']} data-css={"e3-reg-panel-title"}>{TEXT_EROARE_TITLU}</div>
          <p className={shared1['e3-reg-panel-msg']} data-css={"e3-reg-panel-msg"}>
            {TEXT_EROARE_MESAJ}
          </p>
          <ButonReincearca
            onClick={() => {
              setErrors({});
              setPhase('form');
            }}
          />
        </div>
      )}
    </div>
  );
};

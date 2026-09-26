import { useEffect, useRef } from 'react';
import { useEventConfig, useEditionStrings } from '../../hooks/useEventConfig';
import type { FieldName } from '../../lib/validation';
import type { PublicStats } from '../../lib/supabase';
import type { useRegistration } from '../../hooks/useRegistration';
import { markJustSignedUp } from '../../lib/justSignedUp';
import { useSuccessRedirect } from '../../hooks/useSuccessRedirect';
import { BirthDateField } from './BirthDateField';
import { ctaSmall } from './shared';
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
        <AntetLocuri>
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
        </AntetLocuri>
        <BaraLocuri total={TOTAL_SLOTS} ocupate={slots.occupied} gap={3} animat={false} />
        {isSoldOut && !isWaitlistFull && (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--e3-accent)', fontWeight: 600, textWrap: 'pretty' }}>
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
          style={{
            border: '1px solid var(--e3-border)',
            background: 'var(--e3-surface)',
            padding: 'clamp(18px, 4vw, 32px)',
            display: 'grid',
            gap: 18,
          }}
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
            marime={20}
            margineSus="1px 0 0"
          />

          <ButonTrimite peListaDeAsteptare={waitlistMode} marginTop={2} />
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--e3-muted)', textAlign: 'center' }}>
            Primești confirmarea pe email imediat. {EVENT_SUMMARY_LINE}
          </p>
          {footerSlot}
        </form>
      )}

      {closedReason && (
        <div className="e3-reg-panel e3-reg-panel-compact">
          <div className="e3-reg-panel-title">{textInchis(closedReason).titlu}</div>
          <p className="e3-reg-panel-msg">
            {textInchis(closedReason).mesaj}
          </p>
          <LinkContact stil={ctaSmall} />
        </div>
      )}

      {phase === 'loading' && (
        <div className="e3-reg-panel e3-reg-panel-loading">
          <BaraIncarcare />
          <div className="e3-reg-panel-title e3-reg-panel-wait">{TEXT_INCARCARE}</div>
        </div>
      )}

      {phase === 'success' && (
        <div className="e3-reg-panel e3-reg-panel-compact e3-reg-panel-ok">
          <BifaSucces />
          <div className="e3-reg-panel-title">
            {submittedAsWaitlist ? 'Ești pe lista de așteptare, ' : 'Te-ai înscris, '}
            {confirmName}!
          </div>
          <p className="e3-reg-panel-msg">
            {submittedAsWaitlist
              ? TEXT_SUCCES_ASTEPTARE
              : `Locul ${slots.occupied} din ${TOTAL_SLOTS}. Ți-am trimis emailul de confirmare cu toate detaliile. ${SUCCESS_SEE_YOU}`}
          </p>
          {!submittedAsWaitlist && <ActiuniSucces config={config} />}

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

          <ButonReset peListaDeAsteptare={submittedAsWaitlist} onClick={resetForm} />
        </div>
      )}

      {phase === 'error' && (
        <div className="e3-reg-panel e3-reg-panel-compact e3-reg-panel-err">
          <IconEroare />
          <div className="e3-reg-panel-title">{TEXT_EROARE_TITLU}</div>
          <p className="e3-reg-panel-msg">
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

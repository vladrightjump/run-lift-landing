import shared1 from '../../../shared/ui/CadruScurt.module.css';
import styles from './ComingSoon.module.css';
import { useCallback, useEffect, useState } from 'react';
import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../../../shared/lib/config';
import { useEditionStrings, useEditionDates } from '../../../shared/lib/useEventConfig';
import { useCountdown } from '../../../shared/lib/useCountdown';
import { useLaunchForm } from '../../inscriere';
import type { ToastKind } from '../../../shared/lib/useToast';
import { momentComplet, ziLunaLunga } from '../../../shared/lib/formatare';
import { usePublicTrialStare } from '../../trial';
import { usePublicHomepage } from '../../../shared/lib/usePublicHomepage';
import { TrialTraining } from '../../trial';
import { CardAntrenament } from '../../antrenament/index';

type Props = {
  showToast: (kind: ToastKind, msg: string) => void;
  /** Ținta countdown-ului. Implicit: momentul anunțului (`LAUNCH_DATE`). */
  target?: Date;
  /**
   * `launch` (implicit) — ecranul de dinainte de anunț, textul de azi.
   * `next-session` — același ecran, dar numărând spre următorul antrenament;
   * folosit de homepage după ce se termină cursa (vezi `usePagePhase`).
   */
  variant?: 'launch' | 'next-session';
};

const MARQUEE_ITEMS = ['Aleargă · Ridică · Rezistă', 'Antrenament nou', 'Run + Lift'];


export const ComingSoon = ({ showToast, target, variant = 'launch' }: Props) => {
  const { config: trial, gata: trialGata } = usePublicTrialStare();
  const { LAUNCH_EDITION_ORDINAL } = useEditionStrings();
  const { LAUNCH_DATE } = useEditionDates();
  // Implicitul nu poate sta în semnătură: vine din config, care e un hook.
  const tinta = target ?? LAUNCH_DATE;
  const cd = useCountdown(tinta);
  const urmatorul = variant === 'next-session';
  // Doar ecranul dintre ediții are ordine de ales (setarea din tabul Coming Soon).
  // Cardul își așteaptă locul: altfel ar apărea sub butoane și apoi ar sări sub
  // secțiunea de probă. Cu „Proba primul" așteaptă și configul probei, ca
  // secțiunea să fie deja deasupra lui. Cererile pleacă în paralel și fiecare
  // așteptare e plafonată la 2 s, deci întârzierea e scurtă.
  const ordine = usePublicHomepage(urmatorul);
  const cardSus = urmatorul && ordine.gata && !ordine.trialFirst;
  const cardJos = urmatorul && ordine.gata && ordine.trialFirst && trialGata;
  const momentLabel = momentComplet(tinta);
  const { draft, setField, errors, state, submit, reset, hpProps } = useLaunchForm();
  const [open, setOpen] = useState(false);
  const [duplicate, setDuplicate] = useState(false);

  const closeForm = useCallback(() => {
    setOpen(false);
  }, []);

  const openForm = () => {
    reset();
    setDuplicate(false);
    setOpen(true);
  };

  // Închide modalul cu Esc.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeForm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeForm]);

  const handleSubmit = async () => {
    const outcome = await submit();
    switch (outcome.kind) {
      case 'success':
        setDuplicate(outcome.duplicate);
        showToast(
          'success',
          outcome.duplicate ? 'Ești deja pe listă.' : 'Gata! Verifică emailul pentru confirmare.'
        );
        break;
      case 'invalid':
      case 'offline':
      case 'error':
        showToast('error', outcome.message);
        break;
      // 'busy' → fără feedback
    }
  };

  return (
    <div className={shared1['cs-root']} data-css={"cs-root"}>
      <div className={shared1['cs-bg']} data-css={"cs-bg"} aria-hidden="true" />

      <header className={shared1['cs-topbar']} data-css={"cs-topbar"}>
        <span className={shared1['cs-logo']} data-css={"cs-logo"}>
          R<span className={shared1['cs-accent']} data-css={"cs-accent"}>+</span>L
        </span>
        <nav className={styles['cs-nav']} data-css={"cs-nav"}>
          <span className={shared1['cs-brand-meta']} data-css={"cs-brand-meta"}>
            {urmatorul ? 'Run + Lift · Chișinău' : `Run + Lift · Ediția ${LAUNCH_EDITION_ORDINAL}`}
          </span>
          <a className={styles['cs-tab']} data-css={"cs-tab"} href="/despre-noi">Despre noi</a>
        </nav>
      </header>

      <main className={shared1['cs-main']} data-css={"cs-main"}>
        <span className={styles['cs-badge']} data-css={"cs-badge"}>
          {urmatorul
            ? `Următorul antrenament · ${ziLunaLunga(tinta)}`
            : `Antrenament nou · Ediția ${LAUNCH_EDITION_ORDINAL}`}
        </span>

        <h1 className={styles['cs-title'] + ' ' + (urmatorul ? styles['cs-title--diacritice'] : '')} data-css={`cs-title${urmatorul ? ' cs-title--diacritice' : ''}`}>
          {urmatorul ? (
            <>
              Ne vedem<br />
              <span className={shared1['cs-accent']} data-css={"cs-accent"}>curând</span>
            </>
          ) : (
            <>
              Coming<br />
              <span className={shared1['cs-accent']} data-css={"cs-accent"}>Soon</span>
            </>
          )}
        </h1>

        <p className={shared1['cs-sub']} data-css={"cs-sub"}>
          {urmatorul ? (
            // Și după ce trece ținta textul rămâne adevărat: nu promite un anunț
            // „gata", ci trimite spre lista de notificare — singurul lucru sigur
            // până când ediția următoare e configurată.
            cd.done ? (
              <>
                Următorul antrenament Run <span className={shared1['cs-accent']} data-css={"cs-accent"}>+</span> Lift e aproape.
                Lasă-ți datele și te anunțăm când deschidem înscrierile.
              </>
            ) : (
              <>
                Următorul antrenament Run <span className={shared1['cs-accent']} data-css={"cs-accent"}>+</span> Lift e pe{' '}
                {momentLabel}. Lasă-ți datele și te anunțăm când deschidem înscrierile.
              </>
            )
          ) : cd.done ? (
            <>
              Anunțul pentru noul antrenament Run <span className={shared1['cs-accent']} data-css={"cs-accent"}>+</span> Lift este
              gata. Lasă-ți datele și îți scriem imediat.
            </>
          ) : (
            <>
              Pe {momentLabel} anunțăm noul antrenament Run <span className={shared1['cs-accent']} data-css={"cs-accent"}>+</span>{' '}
              Lift. Lasă-ți datele și te anunțăm primii.
            </>
          )}
        </p>

        {!cd.done && (
          <div className={styles['cs-countdown']} data-css={"cs-countdown"} role="timer" aria-label="Timp rămas până la anunț">
            {[
              { v: cd.zile, l: 'Zile' },
              { v: cd.ore, l: 'Ore' },
              { v: cd.minute, l: 'Minute' },
              { v: cd.secunde, l: 'Secunde' },
            ].map((u) => (
              <div key={u.l} className={styles['cs-cd-unit']} data-css={"cs-cd-unit"}>
                <span className={styles['cs-cd-value']} data-css={"cs-cd-value"}>{u.v}</span>
                <span className={styles['cs-cd-label']} data-css={"cs-cd-label"}>{u.l}</span>
              </div>
            ))}
          </div>
        )}

        <div className={shared1['cs-actions']} data-css={"cs-actions"}>
          <button type="button" className={shared1['cs-cta']} data-css={"cs-cta"} onClick={openForm}>
            Anunță-mă la lansare
          </button>
          <a className={shared1['cs-cta-secondary']} data-css={"cs-cta-secondary"} href="/despre-noi">
            Află mai multe
          </a>
        </div>

        {/*
          Doar pe ecranul dintre ediții. Pe „Coming Soon" (înainte de anunț)
          întrebarea „până atunci ce fac?" n-a apărut încă — acolo ecranul încă
          își construiește promisiunea, iar un al doilea conținut ar împărți
          atenția înainte de a o câștiga.
        */}
        {cardSus && <CardAntrenament />}
      </main>

      <TrialTraining config={trial} />
      {/*
        „Proba primul" (din /admin): secțiunea de probă urcă imediat sub butoane,
        iar cardul coboară sub ea, în propria coloană centrată.
      */}
      {cardJos && (
        <div className={styles['cs-dupa-proba']} data-css={"cs-dupa-proba"}>
          <CardAntrenament className={styles['cs-dupa-proba-card']} data-css={"cs-dupa-proba-card"} />
        </div>
      )}
      <footer className={shared1['cs-footer']} data-css={"cs-footer"}>
        <span>Run + Lift · Chișinău</span>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          Instagram {INSTAGRAM_HANDLE}
        </a>
      </footer>

      <div className={styles['cs-marquee']} data-css={"cs-marquee"} aria-hidden="true">
        <div className={styles['cs-marquee-track']} data-css={"cs-marquee-track"}>
          {[0, 1].map((rep) => (
            <span key={rep} className={styles['cs-marquee-group']} data-css={"cs-marquee-group"}>
              {MARQUEE_ITEMS.map((item) => (
                <span key={item} className={styles['cs-marquee-item']} data-css={"cs-marquee-item"}>
                  {item}
                  <span className={styles['cs-marquee-star']} data-css={"cs-marquee-star"}>✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      {open && (
        <div
          className={styles['cs-modal-overlay']} data-css={"cs-modal-overlay"}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeForm();
          }}
        >
          <div className={styles['cs-modal']} data-css={"cs-modal"} role="dialog" aria-modal="true" aria-label="Anunță-mă la lansare">
            <button type="button" className={styles['cs-modal-close']} data-css={"cs-modal-close"} aria-label="Închide" onClick={closeForm}>
              ✕
            </button>

            {state === 'success' ? (
              <div className={styles['cs-success']} data-css={"cs-success"}>
                <div className={styles['cs-success-check']} data-css={"cs-success-check"} aria-hidden="true">
                  ✓
                </div>
                <h2 className={styles['cs-modal-title']} data-css={"cs-modal-title"}>
                  {duplicate ? 'Ești deja pe listă' : 'Te-am adăugat!'}
                </h2>
                <p className={styles['cs-modal-sub']} data-css={"cs-modal-sub"}>
                  {duplicate
                    ? 'Adresa ta era deja înscrisă. Te anunțăm când lansăm noul antrenament.'
                    : 'Ți-am trimis un email. Apasă pe linkul din el ca să confirmi înscrierea.'}
                </p>
                <button type="button" className={styles['cs-submit']} data-css={"cs-submit"} onClick={closeForm}>
                  Închide
                </button>
              </div>
            ) : (
              <>
                <h2 className={styles['cs-modal-title']} data-css={"cs-modal-title"}>Anunță-mă la lansare</h2>
                <p className={styles['cs-modal-sub']} data-css={"cs-modal-sub"}>
                  Îți scriem imediat ce anunțăm noul antrenament.
                </p>

                <form
                  className={styles['cs-form']} data-css={"cs-form"}
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                  }}
                >
                  {/* Capcană anti-bot — invizibilă; verificată pe server. */}
                  <input type="text" {...hpProps} />
                  <div className={styles['cs-form-row']} data-css={"cs-form-row"}>
                    <label className={styles['cs-field'] + ' ' + (errors.nume ? styles.invalid : '')} data-css={`cs-field${errors.nume ? ' invalid' : ''}`}>
                      <span>Nume</span>
                      <input
                        type="text"
                        placeholder="Popescu"
                        autoComplete="family-name"
                        value={draft.nume}
                        onChange={(e) => setField('nume', e.target.value)}
                      />
                    </label>
                    <label className={styles['cs-field'] + ' ' + (errors.prenume ? styles.invalid : '')} data-css={`cs-field${errors.prenume ? ' invalid' : ''}`}>
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
                  <label className={styles['cs-field'] + ' ' + (errors.email ? styles.invalid : '')} data-css={`cs-field${errors.email ? ' invalid' : ''}`}>
                    <span>Email</span>
                    <input
                      type="email"
                      placeholder="andrei@email.ro"
                      autoComplete="email"
                      value={draft.email}
                      onChange={(e) => setField('email', e.target.value)}
                    />
                  </label>
                  <label className={styles['cs-field'] + ' ' + (errors.telefon ? styles.invalid : '')} data-css={`cs-field${errors.telefon ? ' invalid' : ''}`}>
                    <span>Telefon</span>
                    <input
                      type="tel"
                      placeholder="07xx xxx xxx"
                      autoComplete="tel"
                      value={draft.telefon}
                      onChange={(e) => setField('telefon', e.target.value)}
                    />
                  </label>

                  <button type="submit" className={styles['cs-submit']} data-css={"cs-submit"} disabled={state === 'loading'}>
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

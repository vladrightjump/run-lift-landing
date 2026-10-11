import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';
import { useEditionStrings, useEditionDates } from '../hooks/useEventConfig';
import { useCountdown } from '../hooks/useCountdown';
import { AnuntaMa } from './AnuntaMa';
import type { ToastKind } from '../hooks/useToast';
import { momentComplet, ziLunaLunga } from '../lib/formatare';
import { usePublicTrial } from '../hooks/usePublicTrial';
import { TrialTraining } from './TrialTraining';
import { CardAntrenament } from './CardAntrenament';

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
  const trial = usePublicTrial();
  const { LAUNCH_EDITION_ORDINAL } = useEditionStrings();
  const { LAUNCH_DATE } = useEditionDates();
  // Implicitul nu poate sta în semnătură: vine din config, care e un hook.
  const tinta = target ?? LAUNCH_DATE;
  const cd = useCountdown(tinta);
  const urmatorul = variant === 'next-session';
  const momentLabel = momentComplet(tinta);

  return (
    <div className="cs-root">
      <div className="cs-bg" aria-hidden="true" />

      <header className="cs-topbar">
        <span className="cs-logo">
          R<span className="cs-accent">+</span>L
        </span>
        <nav className="cs-nav">
          <span className="cs-brand-meta">
            {urmatorul ? 'Run + Lift · Chișinău' : `Run + Lift · Ediția ${LAUNCH_EDITION_ORDINAL}`}
          </span>
          <a className="cs-tab" href="/despre-noi">Despre noi</a>
        </nav>
      </header>

      <main className="cs-main">
        <span className="cs-badge">
          {urmatorul
            ? `Următorul antrenament · ${ziLunaLunga(tinta)}`
            : `Antrenament nou · Ediția ${LAUNCH_EDITION_ORDINAL}`}
        </span>

        <h1 className={`cs-title${urmatorul ? ' cs-title--diacritice' : ''}`}>
          {urmatorul ? (
            <>
              Ne vedem<br />
              <span className="cs-accent">curând</span>
            </>
          ) : (
            <>
              Coming<br />
              <span className="cs-accent">Soon</span>
            </>
          )}
        </h1>

        <p className="cs-sub">
          {urmatorul ? (
            // Și după ce trece ținta textul rămâne adevărat: nu promite un anunț
            // „gata", ci trimite spre lista de notificare — singurul lucru sigur
            // până când ediția următoare e configurată.
            cd.done ? (
              <>
                Următorul antrenament Run <span className="cs-accent">+</span> Lift e aproape.
                Lasă-ți datele și te anunțăm când deschidem înscrierile.
              </>
            ) : (
              <>
                Următorul antrenament Run <span className="cs-accent">+</span> Lift e pe{' '}
                {momentLabel}. Lasă-ți datele și te anunțăm când deschidem înscrierile.
              </>
            )
          ) : cd.done ? (
            <>
              Anunțul pentru noul antrenament Run <span className="cs-accent">+</span> Lift este
              gata. Lasă-ți datele și îți scriem imediat.
            </>
          ) : (
            <>
              Pe {momentLabel} anunțăm noul antrenament Run <span className="cs-accent">+</span>{' '}
              Lift. Lasă-ți datele și te anunțăm primii.
            </>
          )}
        </p>

        {!cd.done && (
          <div className="cs-countdown" role="timer" aria-label="Timp rămas până la anunț">
            {[
              { v: cd.zile, l: 'Zile' },
              { v: cd.ore, l: 'Ore' },
              { v: cd.minute, l: 'Minute' },
              { v: cd.secunde, l: 'Secunde' },
            ].map((u) => (
              <div key={u.l} className="cs-cd-unit">
                <span className="cs-cd-value">{u.v}</span>
                <span className="cs-cd-label">{u.l}</span>
              </div>
            ))}
          </div>
        )}

        <div className="cs-actions">
          <AnuntaMa showToast={showToast} label="Anunță-mă la lansare" className="cs-cta" />
          <a className="cs-cta-secondary" href="/despre-noi">
            Află mai multe
          </a>
        </div>

        {/*
          Doar pe ecranul dintre ediții. Pe „Coming Soon" (înainte de anunț)
          întrebarea „până atunci ce fac?" n-a apărut încă — acolo ecranul încă
          își construiește promisiunea, iar un al doilea conținut ar împărți
          atenția înainte de a o câștiga.
        */}
        {urmatorul && <CardAntrenament />}
      </main>

      <TrialTraining config={trial} />
      <footer className="cs-footer">
        <span>Run + Lift · Chișinău</span>
        <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
          Instagram {INSTAGRAM_HANDLE}
        </a>
      </footer>

      <div className="cs-marquee" aria-hidden="true">
        <div className="cs-marquee-track">
          {[0, 1].map((rep) => (
            <span key={rep} className="cs-marquee-group">
              {MARQUEE_ITEMS.map((item) => (
                <span key={item} className="cs-marquee-item">
                  {item}
                  <span className="cs-marquee-star">✦</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

    </div>
  );
};

import { INSTAGRAM_URL, INSTAGRAM_HANDLE } from '../lib/config';
import { useEditionStrings, useEditionDates } from '../hooks/useEventConfig';
import { useCountdown } from '../hooks/useCountdown';
import { AnuntaMa } from './AnuntaMa';
import type { ToastKind } from '../hooks/useToast';
import { momentComplet } from '../lib/formatare';
import { usePublicTrial } from '../hooks/usePublicTrial';
import { TrialTraining } from './TrialTraining';

/**
 * Teaser-ul de dinainte de anunțul unei ediții. Ecranul de după cursă e separat:
 * vezi `IntreEditii`.
 */
type Props = {
  showToast: (kind: ToastKind, msg: string) => void;
};

const MARQUEE_ITEMS = ['Aleargă · Ridică · Rezistă', 'Antrenament nou', 'Run + Lift'];


export const ComingSoon = ({ showToast }: Props) => {
  const trial = usePublicTrial();
  const { LAUNCH_EDITION_ORDINAL } = useEditionStrings();
  const { LAUNCH_DATE } = useEditionDates();
  const cd = useCountdown(LAUNCH_DATE);
  const momentLabel = momentComplet(LAUNCH_DATE);

  return (
    <div className="cs-root">
      <div className="cs-bg" aria-hidden="true" />

      <header className="cs-topbar">
        <span className="cs-logo">
          R<span className="cs-accent">+</span>L
        </span>
        <nav className="cs-nav">
          <span className="cs-brand-meta">{`Run + Lift · Ediția ${LAUNCH_EDITION_ORDINAL}`}</span>
          <a className="cs-tab" href="/despre-noi">Despre noi</a>
        </nav>
      </header>

      <main className="cs-main">
        <span className="cs-badge">{`Antrenament nou · Ediția ${LAUNCH_EDITION_ORDINAL}`}</span>

        <h1 className="cs-title">
          Coming<br />
          <span className="cs-accent">Soon</span>
        </h1>

        <p className="cs-sub">
          {cd.done ? (
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

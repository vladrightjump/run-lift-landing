import shared4 from '../../../shared/ui/PublicControls.module.css';
import shared3 from '../../../shared/ui/PublicLayout.module.css';
import shared2 from './LandingStyles.module.css';
import styles from './TopBar.module.css';
import { useEditionStrings } from '../../../shared/lib/useEventConfig';
import { useCountdown } from '../../../shared/lib/useCountdown';

type Props = {
  cd: ReturnType<typeof useCountdown>;
  /** Deschide formularul ca overlay. Fără el, CTA-ul navighează la /inscriere. */
  onInscrie?: () => void;
  /** `false` ascunde butonul „Înscrie-te" (fereastra din ziua cursei). */
  showCta?: boolean;
};

/** Antetul sticky: brand, countdown „start în" și acțiuni. */
export const TopBar = ({ cd, onInscrie, showCta = true }: Props) => {
  const { EVENT_META } = useEditionStrings();

  // Aspectul stă în `.e3-topbar*` (TopBar.module.css pentru comportamentul la
  // scroll și compoziție), NU inline: inline ar bate media
  // query-ul de mobil la specificitate.
  return (
    <header className={styles['e3-topbar']} data-css={"e3-topbar"}>
      <div className={styles['e3-topbar-brand']} data-css={"e3-topbar-brand"}>
        <div className={styles['e3-topbar-mark']} data-css={"e3-topbar-mark"}>RL</div>
        <span className={styles['e3-topbar-name']} data-css={"e3-topbar-name"}>Run + Lift</span>
      </div>
      <div className={styles['e3-topbar-cd']} data-css={"e3-topbar-cd"}>
        {/* După ora de start countdown-ul ar sta pe patru zerouri, care arată
            a pagină stricată. Îl înlocuim cu starea „se întâmplă acum". */}
        {cd.done ? (
          <span className={styles['e3-topbar-live']} data-css={"e3-topbar-live"}>Live acum</span>
        ) : (
          <>
            <span className={shared2['e3-label']} data-css={"e3-label"}>Start în</span>
            <div className={styles['e3-topbar-units']} data-css={"e3-topbar-units"} role="timer" aria-label="Timp rămas până la start">
              {[
                { v: cd.zile, l: 'z', lime: true },
                { v: cd.ore, l: 'h', lime: false },
                { v: cd.minute, l: 'm', lime: false },
                { v: cd.secunde, l: 's', lime: false },
              ].map((u) => (
                <span key={u.l} className={styles['e3-topbar-unit']} data-css={"e3-topbar-unit"}>
                  {/* Cifra se rostogolește la fiecare schimbare: cheia include
                      valoarea, deci React remontează, iar animația de montare
                      din `.e3-digit` pornește din nou. Unitățile care nu s-au
                      schimbat păstrează aceeași cheie și stau pe loc. */}
                  <span className={(u.lime ? styles['e3-digit'] + ' ' + shared3['e3-num'] + ' ' + styles['e3-topbar-lime'] : styles['e3-digit'] + ' ' + shared3['e3-num'])} data-css={(u.lime ? "e3-digit e3-num e3-topbar-lime" : "e3-digit e3-num")}>
                    <span key={u.v}>{u.v}</span>
                  </span>
                  <span className={styles['e3-topbar-unit-l']} data-css={"e3-topbar-unit-l"}>{u.l}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <nav className={styles['e3-topbar-nav']} data-css={"e3-topbar-nav"} aria-label="Principal">
        <span className={styles['e3-topbar-meta']} data-css={"e3-topbar-meta"}>{EVENT_META}</span>
        <a href="/despre-noi" className={shared4['e3-link'] + ' ' + styles['e3-topbar-link']} data-css={"e3-link e3-topbar-link"}>
          Despre noi
        </a>
        {showCta && (
          <a
            href="/inscriere"
            onClick={(e) => {
              if (onInscrie) {
                e.preventDefault();
                onInscrie();
              }
            }}
            className={shared2['e3-btn'] + ' ' + styles['e3-btn-sm'] + ' ' + shared4['e3-cta'] + ' ' + shared4['e3-shine'] + ' ' + styles['e3-topbar-cta']} data-css={"e3-btn e3-btn-sm e3-cta e3-shine e3-topbar-cta"}
          >
            Înscrie-te
          </a>
        )}
      </nav>
    </header>
  );
};

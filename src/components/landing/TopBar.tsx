import { useEditionStrings } from '../../hooks/useEventConfig';
import { useCountdown } from '../../hooks/useCountdown';

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

  // Aspectul stă în `.e3-topbar*` (edition3.css pentru comportamentul la
  // scroll, public.css pentru compoziție), NU inline: inline ar bate media
  // query-ul de mobil la specificitate.
  return (
    <header className="e3-topbar">
      <div className="e3-topbar-brand">
        <div className="e3-topbar-mark">RL</div>
        <span className="e3-topbar-name">Run + Lift</span>
      </div>
      <div className="e3-topbar-cd">
        {/* După ora de start countdown-ul ar sta pe patru zerouri, care arată
            a pagină stricată. Îl înlocuim cu starea „se întâmplă acum". */}
        {cd.done ? (
          <span className="e3-topbar-live">Live acum</span>
        ) : (
          <>
            <span className="e3-label">Start în</span>
            <div className="e3-topbar-units" role="timer" aria-label="Timp rămas până la start">
              {[
                { v: cd.zile, l: 'z', lime: true },
                { v: cd.ore, l: 'h', lime: false },
                { v: cd.minute, l: 'm', lime: false },
                { v: cd.secunde, l: 's', lime: false },
              ].map((u) => (
                <span key={u.l} className="e3-topbar-unit">
                  {/* Cifra se rostogolește la fiecare schimbare: cheia include
                      valoarea, deci React remontează, iar animația de montare
                      din `.e3-digit` pornește din nou. Unitățile care nu s-au
                      schimbat păstrează aceeași cheie și stau pe loc. */}
                  <span className={u.lime ? 'e3-digit e3-num e3-topbar-lime' : 'e3-digit e3-num'}>
                    <span key={u.v}>{u.v}</span>
                  </span>
                  <span className="e3-topbar-unit-l">{u.l}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      <nav className="e3-topbar-nav" aria-label="Principal">
        <span className="e3-topbar-meta">{EVENT_META}</span>
        <a href="/despre-noi" className="e3-link e3-topbar-link">
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
            className="e3-btn e3-btn-sm e3-cta e3-shine e3-topbar-cta"
          >
            Înscrie-te
          </a>
        )}
      </nav>
    </header>
  );
};

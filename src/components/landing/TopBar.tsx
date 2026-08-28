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

  // Padding-ul barei, mărimea mărcii și cea a butonului stau în `.e3-topbar*`
  // din edition3.css, NU aici: inline ar bate media query-ul de mobil la
  // specificitate, iar antetul ar rămâne la fel pe telefon fără ca nimic să
  // pară stricat.
  return (
      <header
        className="e3-topbar"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          background: 'rgba(18,20,16,0.92)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--e3-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className="e3-topbar-mark"
            style={{
              background: 'var(--e3-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'Anton, sans-serif',
              color: 'var(--e3-bg)',
              letterSpacing: 0.5,
            }}
          >
            RL
          </div>
          <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 18, letterSpacing: 1, textTransform: 'uppercase' }}>
            Run + Lift
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--e3-accent)',
              animation: 'e3-dot-blink 1.4s ease-in-out infinite',
            }}
          />
          {/* După ora de start countdown-ul ar sta pe patru zerouri, care arată
              a pagină stricată. Îl înlocuim cu starea „se întâmplă acum". */}
          {cd.done ? (
            <span
              style={{
                fontFamily: 'Anton, sans-serif',
                fontSize: 19,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: 'var(--e3-accent)',
              }}
            >
              Live acum
            </span>
          ) : (
            <>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--e3-muted)' }}>
            Start în
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }} role="timer" aria-label="Timp rămas până la start">
            {[
              { v: cd.zile, l: 'z', lime: true },
              { v: cd.ore, l: 'h', lime: false },
              { v: cd.minute, l: 'm', lime: false },
              { v: cd.secunde, l: 's', lime: false },
            ].map((u) => (
              <span key={u.l} style={{ display: 'inline-flex', alignItems: 'baseline' }}>
                {/* Cifra se rostogolește la fiecare schimbare: cheia include
                    valoarea, deci React remontează, iar animația de montare
                    din `.e3-digit` pornește din nou. Unitățile care nu s-au
                    schimbat păstrează aceeași cheie și stau pe loc. */}
                <span
                  className="e3-digit"
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 24,
                    color: u.lime ? 'var(--e3-accent)' : 'var(--e3-text-bright)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  <span key={u.v}>{u.v}</span>
                </span>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--e3-muted)' }}>
                  {u.l}
                </span>
              </span>
            ))}
          </div>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--e3-muted)' }}>
            {EVENT_META}
          </span>
          <a
            href="/despre-noi"
            className="e3-link"
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: 'var(--e3-muted)',
              textDecoration: 'none',
            }}
          >
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
              className="e3-cta e3-shine e3-topbar-cta"
              style={{
                display: 'inline-block',
                background: 'var(--e3-accent)',
                color: 'var(--e3-bg)',
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              Înscrie-te
            </a>
          )}
        </div>
      </header>
  );
};

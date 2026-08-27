import { useEventConfig } from '../../hooks/useEventConfig';
import { getMySignups } from '../../lib/mySignups';
import type { PublicStats } from '../../lib/supabase';
import { useCountUp } from '../../hooks/useCountUp';
import { sectionNum, sectionTitle } from './shared';

type Props = {
  stats: PublicStats | null;
  /**
   * `false` scoate invitația „fii primul" din starea goală — în fereastra din
   * ziua cursei nu mai există secțiunea de înscriere spre care să trimită.
   */
  canSignUp?: boolean;
  /** Numărul afișat al secțiunii — se schimbă când ordinea secțiunilor se schimbă. */
  num?: string;
};

/** Secțiunea „Cine vine": lista publică de participanți + contorul listei de așteptare. */
export const ParticipantsSection = ({ stats, canSignUp = true, num = '04' }: Props) => {
  const TOTAL_SLOTS = useEventConfig().slots.total;
  const participants = stats?.participants ?? [];
  const mine = new Set(getMySignups());
  const waitlistCount = stats?.waitlist ?? 0;
  // Contorul urcă spre numărul real în loc să apară dintr-odată.
  const countShown = useCountUp(stats ? stats.count : null);
  return (
      <section id="participanti" style={{ padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)', borderTop: '1px solid var(--e3-border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 32 }}>
            <span className="e3-title-num" style={sectionNum}>{num}</span>
            <h2 className="e3-title" style={sectionTitle}>Cine vine</h2>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              border: '1px solid var(--e3-border)',
              borderBottom: 'none',
              background: 'var(--e3-surface)',
              padding: '16px 22px',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--e3-muted)' }}>
              Participanți înscriși
            </span>
            <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, letterSpacing: 1, color: 'var(--e3-accent)' }}>
              {countShown ?? '–'} / {TOTAL_SLOTS}
            </span>
          </div>
          <div data-reveal style={{ border: '1px solid var(--e3-border)', background: 'var(--e3-surface)' }}>
            {participants.map((p, i) => (
              <div
                key={`${p.nume}-${i}`}
                className="e3-row"
                style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '15px 22px', borderBottom: '1px solid var(--e3-hairline)' }}
              >
                <span
                  style={{
                    fontFamily: 'Anton, sans-serif',
                    fontSize: 15,
                    color: 'var(--e3-muted-dim)',
                    minWidth: 28,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--e3-text)', flex: 1 }}>{p.nume}</span>
                {mine.has(p.nume) && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      color: 'var(--e3-bg)',
                      background: 'var(--e3-accent)',
                      padding: '3px 8px',
                    }}
                  >
                    Nou
                  </span>
                )}
              </div>
            ))}
            {stats && participants.length === 0 && (
              <div style={{ padding: '36px 22px', textAlign: 'center', fontSize: 15, color: 'var(--e3-muted)' }}>
                {canSignUp ? (
                  <>
                    Încă nimeni înscris — fii primul!{' '}
                    <a href="#inscriere" style={{ color: 'var(--e3-accent)', fontWeight: 600 }}>
                      Înscrie-te
                    </a>
                  </>
                ) : (
                  'Nicio înscriere pentru ediția asta.'
                )}
              </div>
            )}
            {!stats && (
              <div role="status" aria-busy="true">
                <span className="e3-sr">Se încarcă lista…</span>
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="e3-skel-row" aria-hidden="true">
                    <span className="e3-skel" style={{ width: 20 }} />
                    <span className="e3-skel" style={{ flex: 1, maxWidth: 120 + i * 26 }} />
                  </div>
                ))}
              </div>
            )}
          </div>
          {waitlistCount > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
                border: '1px solid var(--e3-border)',
                background: 'var(--e3-surface)',
                padding: '16px 22px',
                marginTop: 28,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--e3-muted)' }}>
                Pe lista de așteptare
              </span>
              <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, letterSpacing: 1, color: 'var(--e3-accent)' }}>
                {waitlistCount}
              </span>
            </div>
          )}
        </div>
      </section>
  );
};

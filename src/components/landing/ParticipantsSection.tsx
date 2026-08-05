import { TOTAL_SLOTS } from '../../lib/config';
import { getMySignups } from '../../lib/mySignups';
import type { PublicStats } from '../../lib/supabase';
import { sectionNum, sectionTitle } from './shared';

type Props = { stats: PublicStats | null };

/** Secțiunea „Cine vine": lista publică de participanți + contorul listei de așteptare. */
export const ParticipantsSection = ({ stats }: Props) => {
  const participants = stats?.participants ?? [];
  const mine = new Set(getMySignups());
  const waitlistCount = stats?.waitlist ?? 0;
  return (
      <section id="participanti" style={{ padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)', borderTop: '1px solid var(--e3-border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 32 }}>
            <span style={sectionNum}>04</span>
            <h2 style={sectionTitle}>Cine vine</h2>
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
              {stats ? stats.count : '–'} / {TOTAL_SLOTS}
            </span>
          </div>
          <div style={{ border: '1px solid var(--e3-border)', background: 'var(--e3-surface)' }}>
            {participants.map((p, i) => (
              <div
                key={`${p.nume}-${i}`}
                style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '15px 22px', borderBottom: '1px solid #232620' }}
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
                Încă nimeni înscris — fii primul!{' '}
                <a href="#inscriere" style={{ color: 'var(--e3-accent)', fontWeight: 600 }}>
                  Înscrie-te
                </a>
              </div>
            )}
            {!stats && (
              <div style={{ padding: '36px 22px', textAlign: 'center', fontSize: 15, color: 'var(--e3-muted)' }}>Se încarcă lista…</div>
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

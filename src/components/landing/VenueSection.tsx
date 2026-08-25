import {
  EVENT_WHERE,
  EVENT_WHEN,
  EVENT_START_TIME,
  MAP_EMBED_SRC,
  MAP_DIRECTIONS_URL,
} from '../../content/format';
import { sectionNum, sectionTitle } from './shared';

const MAP_SRC = MAP_EMBED_SRC;
const DIRECTIONS_URL = MAP_DIRECTIONS_URL;

type Props = {
  /** Numărul afișat al secțiunii — se schimbă când ordinea secțiunilor se schimbă. */
  num?: string;
};

/** Secțiunea „Locația": detalii (unde/când/start) + hartă + link Google Maps. */
export const VenueSection = ({ num = '02' }: Props) => {
  // Ton mai adânc decât secțiunile vecine — alternanța dă pagina în trepte,
  // fără să introducă vreo culoare nouă (`bg-deep` e deja în paletă).
  return (
      <section
        style={{
          padding: 'clamp(56px, 8vw, 88px) clamp(20px, 5vw, 40px) clamp(64px, 9vw, 96px)',
          borderBottom: '1px solid var(--e3-border)',
          background: 'var(--e3-bg-deep)',
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))',
            gap: 'clamp(32px, 5vw, 56px)',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 32 }}>
              <span className="e3-title-num" style={sectionNum}>{num}</span>
              <h2 className="e3-title" style={sectionTitle}>Locația</h2>
            </div>
            <div data-reveal style={{ display: 'grid', gap: 0, border: '1px solid var(--e3-border)' }}>
              {[
                { k: 'Unde', v: EVENT_WHERE, lime: false },
                { k: 'Când', v: EVENT_WHEN, lime: false },
                { k: 'Start', v: EVENT_START_TIME, lime: true },
              ].map((row, i, arr) => (
                <div
                  key={row.k}
                  className="e3-row"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    padding: '18px 22px',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--e3-border)' : 'none',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--e3-muted)' }}>
                    {row.k}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: row.lime ? 'var(--e3-accent)' : undefined }}>{row.v}</span>
                </div>
              ))}
            </div>
            <p style={{ margin: '24px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--e3-muted)', textWrap: 'pretty' }}>
              Vino cu 30 de minute înainte pentru check-in și încălzire. Hidratare la fața locului.
            </p>
          </div>
          <div data-reveal>
            <div style={{ border: '1px solid var(--e3-border)', overflow: 'hidden', background: 'var(--e3-surface)' }}>
              <iframe
                title={`${EVENT_WHERE} — hartă`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                src={MAP_SRC}
                style={{ display: 'block', width: '100%', aspectRatio: '4 / 3', border: 0 }}
              />
            </div>
            <a
              className="e3-link"
              href={DIRECTIONS_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 14,
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: 1,
                textTransform: 'uppercase',
                color: 'var(--e3-accent)',
              }}
            >
              <span aria-hidden="true">↗</span> Deschide în Google Maps
            </a>
          </div>
        </div>
      </section>
  );
};

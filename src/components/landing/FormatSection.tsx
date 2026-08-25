import { sectionNum, sectionTitle } from './shared';

const FORMAT_CARDS = [
  { t: 'RUN', d: 'Segmente de alergare prin parc între stații — același traseu pentru toți.' },
  { t: 'LIFT', d: 'Stații de exerciții funcționale — forță, împins, tras, cărat.' },
  { t: 'REPEAT', d: 'Alternezi alergarea cu stațiile până la finish — contra cronometru.' },
];

type Props = {
  /** Numărul afișat al secțiunii — se schimbă când ordinea secțiunilor se schimbă. */
  num?: string;
};

/** Secțiunea „Formatul": descriere + cardurile RUN / LIFT / REPEAT. */
export const FormatSection = ({ num = '01' }: Props) => {
  return (
      <section style={{ padding: 'clamp(48px, 8vw, 80px) clamp(20px, 5vw, 40px)', borderBottom: '1px solid var(--e3-border)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 44 }}>
            <span className="e3-title-num" style={sectionNum}>{num}</span>
            <h2 className="e3-title" style={sectionTitle}>Formatul</h2>
          </div>
          <p style={{ margin: '0 0 40px', maxWidth: 620, fontSize: 17, lineHeight: 1.55, color: 'var(--e3-muted-strong)', textWrap: 'pretty' }}>
            Aleargă. Ridică. Repetă. Segmente de alergare alternate cu stații de exerciții funcționale, în
            stil HYROX. Fără trucuri — doar tu, cronometrul și traseul. Stațiile și greutățile se adaptează
            nivelului tău de către antrenori la fața locului.
          </p>
          <div className="e3-format-grid">
            {FORMAT_CARDS.map((c, i) => (
              <div
                key={c.t}
                className="e3-card e3-step e3-spot"
                data-reveal
                style={{ background: 'var(--e3-surface)', border: '1px solid var(--e3-border)', padding: '28px 24px', display: 'grid', gap: 10 }}
              >
                <span className="e3-step-idx" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 40, color: 'var(--e3-accent)', position: 'relative' }}>{c.t}</span>
                <span style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--e3-muted-strong)', position: 'relative' }}>{c.d}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
  );
};

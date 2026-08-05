/** Footerul: an + organizatori (contacte + Instagram). */
export const Footer = () => {
  return (
      <footer
        style={{
          borderTop: '1px solid var(--e3-border)',
          padding: '28px clamp(20px, 5vw, 40px)',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px 24px',
        }}
      >
        <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 15, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--e3-muted)' }}>
          Run + Lift · 2026
        </span>
        <span style={{ fontSize: 13, color: 'var(--e3-muted)' }}>
          Organizatori: <span style={{ color: 'var(--e3-muted-strong)', fontWeight: 600 }}>Vladislav Filip</span>{' '}
          <a href="tel:+37369509949" className="e3-link" style={{ color: 'var(--e3-accent)', fontWeight: 600 }}>
            +373 69 509 949
          </a>{' '}
          <a href="https://www.instagram.com/vladfillip" target="_blank" rel="noopener noreferrer" className="e3-link" style={{ color: 'var(--e3-accent)', fontWeight: 600 }}>
            @vladfillip
          </a>{' '}
          · <span style={{ color: 'var(--e3-muted-strong)', fontWeight: 600 }}>Roma Morari</span>{' '}
          <a href="tel:+37369819404" className="e3-link" style={{ color: 'var(--e3-accent)', fontWeight: 600 }}>
            +373 69 819 404
          </a>{' '}
          <a href="https://www.instagram.com/morarroma" target="_blank" rel="noopener noreferrer" className="e3-link" style={{ color: 'var(--e3-accent)', fontWeight: 600 }}>
            @morarroma
          </a>{' '}
          ·{' '}
          <a href="https://www.instagram.com/we_run_and_lift/" target="_blank" rel="noopener noreferrer" className="e3-link" style={{ color: 'var(--e3-accent)', fontWeight: 600 }}>
            @we_run_and_lift
          </a>
        </span>
      </footer>
  );
};

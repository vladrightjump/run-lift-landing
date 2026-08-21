import { useEffect, useState } from 'react';
import { TOTAL_SLOTS } from '../../lib/config';
import { consumeJustSignedUp } from '../../lib/justSignedUp';
import type { JustSignedUp } from '../../lib/justSignedUp';

/**
 * Bannerul verde de aterizare: „Ești înscris — locul 13/40". Apare o singură
 * dată, imediat după redirectul de pe `/inscriere`, și dispare la primul scroll
 * (sau la click pe ✕). Sursa e `sessionStorage`, nu backendul.
 */
export const SignupBanner = () => {
  const [data, setData] = useState<JustSignedUp | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setData(consumeJustSignedUp());
  }, []);

  useEffect(() => {
    if (!data) return;
    const onScroll = () => setHidden(true);
    window.addEventListener('scroll', onScroll, { passive: true, once: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [data]);

  if (!data || hidden) return null;

  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '13px clamp(16px, 4vw, 40px)',
        background: 'var(--e3-accent)',
        color: 'var(--e3-bg)',
        fontFamily: 'Archivo, sans-serif',
        fontSize: 15,
        fontWeight: 600,
        animation: 'e3-fade-up 0.3s ease-out',
      }}
    >
      <span style={{ fontSize: 17, fontWeight: 700 }}>✓</span>
      <span style={{ flex: 1, textWrap: 'pretty' }}>
        {data.waitlist
          ? `${data.prenume}, ești pe lista de așteptare. Te anunțăm imediat ce se eliberează un loc.`
          : `${data.prenume}, ești înscris${data.loc ? ` — locul ${data.loc}/${TOTAL_SLOTS}` : ''}. Confirmarea a plecat pe email.`}
      </span>
      <button
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Închide"
        style={{ background: 'transparent', border: 'none', color: 'var(--e3-bg)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}
      >
        ✕
      </button>
    </div>
  );
};

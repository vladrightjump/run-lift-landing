import '../edition3.css';
import { useEffect, useRef, useState } from 'react';
import { EVENT_DATE } from '../lib/config';
import { useCountdown } from '../hooks/useCountdown';
import { useStats } from '../hooks/useStats';
import { useNow } from '../hooks/useNow';
import { useRegistration } from '../hooks/useRegistration';
import type { ToastKind } from '../hooks/useToast';
import { TopBar } from './landing/TopBar';
import { Hero } from './landing/Hero';
import { FormatSection } from './landing/FormatSection';
import { VenueSection } from './landing/VenueSection';
import { RegistrationSection } from './landing/RegistrationSection';
import { ParticipantsSection } from './landing/ParticipantsSection';
import { Footer } from './landing/Footer';

/**
 * Landing-ul ediției curente („Hyrox Trial"). Compozitor subțire: leagă hookurile
 * (countdown, stats, timp, înscriere) și randează secțiunile. Logica de înscriere
 * stă în `useRegistration`; fiecare secțiune într-un fișier din `landing/`.
 */
export const Landing = () => {
  const cd = useCountdown(EVENT_DATE);
  const { stats, refresh } = useStats();
  const now = useNow(30_000);

  // Toast propriu (vizual specific landing-ului). showToast e dat înscrierii.
  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const showToast = (kind: ToastKind, msg: string) => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ kind, msg });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  };
  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const reg = useRegistration({ stats, now, refresh, showToast });

  return (
    <div className="e3-root">
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: toast.kind === 'error' ? 'var(--e3-danger-bg)' : 'var(--e3-accent)',
            color: toast.kind === 'error' ? 'var(--e3-danger)' : 'var(--e3-bg)',
            fontFamily: 'Archivo, sans-serif',
            fontSize: 15,
            fontWeight: 600,
            padding: '14px 22px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            animation: 'e3-toast-in 0.25s ease',
            maxWidth: 'min(90vw, 480px)',
          }}
        >
          <span style={{ fontSize: 17, fontWeight: 700 }}>{toast.kind === 'error' ? '!' : '✓'}</span>
          {toast.msg}
        </div>
      )}

      <TopBar cd={cd} />
      <Hero />
      <FormatSection />
      <VenueSection />
      <RegistrationSection reg={reg} stats={stats} />
      <ParticipantsSection stats={stats} />
      <Footer />
    </div>
  );
};

import '../edition3.css';
import { useEffect, useRef, useState } from 'react';
import { useEventConfig, useEditionStrings, useEditionDates } from '../hooks/useEventConfig';
import { useCountdown } from '../hooks/useCountdown';
import { usePagePhase } from '../hooks/usePagePhase';
import { useStats } from '../hooks/useStats';
import { useNow } from '../hooks/useNow';
import { useRegistration } from '../hooks/useRegistration';
import type { ToastKind } from '../hooks/useToast';

import { RegistrationForm } from './landing/RegistrationForm';

/**
 * `/inscriere` — pagina „un singur link": doar formularul, cu strictul necesar de
 * context (countdown, locuri, dată/locație). E linkul de pus în bio-ul de
 * Instagram, în story și în WhatsApp: se deschide direct pe primul câmp, fără
 * scroll și fără să treci prin hero + format + locație.
 *
 * Aceleași hookuri ca landing-ul (`useStats`, `useRegistration`) — deci aceleași
 * validări, aceeași listă de așteptare, același email de confirmare.
 */

const SUMMARY_ITEMS = [
  'Cursă în stil HYROX: alergare + stații funcționale',
  'Stațiile și greutățile se adaptează nivelului tău',
  'Deschis oricui, indiferent de nivel',
  'Adu cu tine: apă pentru hidratare și bună dispoziție',
];

export const Inscriere = () => {
  const { showComingSoon: SHOW_COMING_SOON } = useEventConfig();
  const { EVENT_META, EVENT_START_TIME } = useEditionStrings();
  const { EVENT_DATE, LAUNCH_DATE } = useEditionDates();
  const cd = useCountdown(EVENT_DATE);
  const launch = useCountdown(LAUNCH_DATE);
  const phase = usePagePhase();
  const { stats, refresh } = useStats();
  const now = useNow(30_000);
  const [openSummary, setOpenSummary] = useState(false);

  // Aceeași poartă ca în `App.tsx`: cât timp landing-ul e ascuns în spatele
  // Coming Soon, /inscriere nu are voie să servească formularul pe ușa din dos.
  // Azi e inertă (showComingSoon: false), dar la o ediție viitoare care repune
  // poarta, linkul direct ar scurge înscrierile înainte de lansare.
  const comingSoon = SHOW_COMING_SOON && !launch.done;
  // După ce se termină cursa, teaserul pentru următorul antrenament trăiește
  // într-un singur loc — homepage-ul. Linkul direct trimite acolo.
  //
  // Atenție: NU redirectăm în faza „leaderboard". Homepage-ul ascunde formularul
  // cu o oră înainte de start, dar linkul direct rămâne viu până la deadline-ul
  // real (07:00) — e linkul de dat la fața locului. Îl închide `useRegistration`,
  // pe deadline, nu faza.
  const dupaCursa = phase === 'next';
  const redirect = comingSoon || dupaCursa;
  useEffect(() => {
    if (redirect) window.location.replace('/');
  }, [redirect]);

  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);
  const showToast = (kind: ToastKind, msg: string) => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ kind, msg });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
  };
  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const reg = useRegistration({ stats, now, refresh, showToast });

  // Ieșirea stă DUPĂ toate hookurile, ca ordinea lor să nu se schimbe între
  // randări (regulile hookurilor). Redirectul de mai sus face restul.
  if (redirect) return null;

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

      {/* Antet compact: brand + countdown pe un rând. Fără nav, fără CTA — ești deja aici. */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px 20px',
          padding: '12px clamp(16px, 5vw, 32px)',
          borderBottom: '1px solid var(--e3-border)',
          background: 'var(--e3-bg)',
        }}
      >
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
          <div
            style={{
              width: 28,
              height: 28,
              background: 'var(--e3-accent)',
              display: 'grid',
              placeItems: 'center',
              fontFamily: 'Anton, sans-serif',
              fontSize: 14,
              color: 'var(--e3-bg)',
            }}
          >
            RL
          </div>
          <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 17, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--e3-text)' }}>
            Run + Lift
          </span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} role="timer" aria-label="Timp rămas până la start">
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--e3-accent)', animation: 'e3-dot-blink 1.4s ease-in-out infinite' }} />
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--e3-muted)' }}>Start în</span>
          <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 19, color: 'var(--e3-text-bright)', fontVariantNumeric: 'tabular-nums' }}>
            {cd.zile}z {cd.ore}h {cd.minute}m
          </span>
        </div>
      </header>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: 'clamp(20px, 5vw, 36px) clamp(16px, 5vw, 32px) 48px', display: 'grid', gap: 18 }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'Anton, sans-serif',
              fontWeight: 400,
              fontSize: 'clamp(34px, 9vw, 52px)',
              lineHeight: 1,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
            }}
          >
            Înscrie-te
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, color: 'var(--e3-muted-strong)', textWrap: 'pretty' }}>
            {EVENT_META} · ora {EVENT_START_TIME}. Completezi 5 câmpuri și primești confirmarea pe email.
          </p>
        </div>

        <RegistrationForm
          reg={reg}
          stats={stats}
          redirect
          autoFocus
          footerSlot={
            <div style={{ borderTop: '1px solid var(--e3-border)', paddingTop: 14, display: 'grid', gap: 12 }}>
              <button
                type="button"
                onClick={() => setOpenSummary((v) => !v)}
                aria-expanded={openSummary}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontFamily: 'Anton, sans-serif',
                  fontSize: 15,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: 'var(--e3-accent)',
                }}
              >
                Pe scurt — ce e Hyrox Trial
                <span style={{ fontSize: 18, lineHeight: 1 }}>{openSummary ? '–' : '+'}</span>
              </button>
              {openSummary && (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 12 }}>
                  {SUMMARY_ITEMS.map((item) => (
                    <li key={item} style={{ display: 'flex', gap: 10, fontSize: 15, lineHeight: 1.5, color: 'var(--e3-muted-strong)' }}>
                      <span style={{ color: 'var(--e3-accent)', fontWeight: 700 }}>→</span>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              <a href="/" className="e3-link" style={{ fontSize: 14, fontWeight: 600, color: 'var(--e3-muted)' }}>
                Vezi tot despre eveniment →
              </a>
            </div>
          }
        />
      </main>
    </div>
  );
};

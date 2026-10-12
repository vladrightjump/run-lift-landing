import { useEffect, useEffectEvent, useRef } from 'react';
import { useRouter } from '@tanstack/react-router';
import type { PublicStats } from '../../lib/supabase';
import type { useRegistration } from '../../hooks/useRegistration';
import { useEditionStrings } from '../../hooks/useEventConfig';
import { RegistrationForm } from './RegistrationForm';

declare module '@tanstack/history' {
  interface HistoryState {
    inscriere?: boolean;
  }
}

/**
 * Formularul de înscriere ca overlay peste landing — pentru cine e deja pe site
 * și nu vrea să piardă pagina.
 *
 * Detalii care fac diferența:
 *  · URL propriu (`/inscriere`) prin masca routerului, deci butonul „back"
 *    închide overlay-ul, iar linkul e același ca cel din Instagram;
 *  · Esc / click pe fundal închid;
 *  · scroll-ul paginii de dedesubt e blocat cât timp overlay-ul e deschis;
 *  · după confirmare NU redirecționăm (suntem deja pe landing) — overlay-ul se
 *    închide singur după 3 secunde și rămâi la lista de participanți, dar orice
 *    interacțiune oprește închiderea (la fel ca `useSuccessRedirect` pe
 *    /inscriere), ca butoanele din confirmare să rămână apăsabile.
 */

type Props = {
  reg: ReturnType<typeof useRegistration>;
  stats: PublicStats | null;
  onClose: () => void;
};

const CLOSE_AFTER_SUCCESS_MS = 3000;

export const RegistrationOverlay = ({ reg, stats, onClose }: Props) => {
  const { EVENT_META } = useEditionStrings();
  const boxRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const closeFromHistory = useEffectEvent(onClose);

  // URL + istoric: masca păstrează landing-ul montat, dar arată /inscriere.
  // La reload se deschide pagina de sine stătătoare, ca la acces direct.
  useEffect(() => {
    const prev = router.state.location;
    const previousHref = window.location.pathname + window.location.search;
    void router.navigate({
      to: prev.pathname,
      search: prev.search,
      state: { inscriere: true },
      mask: { to: '/inscriere', unmaskOnReload: true },
      resetScroll: false,
    });
    const onPop = () => closeFromHistory();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (window.location.pathname === '/inscriere') {
        router.history.replace(previousHref, prev.state);
      }
    };
  }, [router]);

  // Esc + blocarea scrollului de fundal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Confirmare afișată 3 secunde, apoi închidem și lăsăm utilizatorul la „Cine
  // vine". Orice atingere/tastă/scroll oprește numărătoarea: altfel i-am smulge
  // de sub deget butoanele „Adaugă în calendar" / „Distribuie" din confirmare.
  useEffect(() => {
    if (reg.phase !== 'success') return;

    let cancelled = false;
    const stop = () => {
      cancelled = true;
      window.clearTimeout(id);
    };
    const id = window.setTimeout(() => {
      if (cancelled) return;
      onClose();
      window.location.hash = '#participanti';
    }, CLOSE_AFTER_SUCCESS_MS);

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;
    for (const ev of events) window.addEventListener(ev, stop, { passive: true });

    return () => {
      window.clearTimeout(id);
      for (const ev of events) window.removeEventListener(ev, stop);
    };
  }, [reg.phase, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Înscriere"
      onMouseDown={(e) => {
        if (!boxRef.current?.contains(e.target as Node)) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(12,14,10,0.72)',
        backdropFilter: 'blur(3px)',
        overflowY: 'auto',
        padding: 'clamp(12px, 4vw, 40px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        animation: 'e3-fade-up 0.25s ease-out',
      }}
    >
      <div ref={boxRef} style={{ width: '100%', maxWidth: 560, display: 'grid', gap: 0 }}>
        <div
          style={{
            border: '1px solid var(--e3-border)',
            borderBottom: 'none',
            background: 'var(--e3-bg)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 16,
          }}
        >
          <div style={{ display: 'grid', gap: 4 }}>
            <span style={{ fontFamily: 'Anton, sans-serif', fontSize: 24, textTransform: 'uppercase', letterSpacing: 1 }}>
              Înscrie-te
            </span>
            <span style={{ fontSize: 13, color: 'var(--e3-muted)' }}>{EVENT_META}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="e3-ghost"
            style={{
              background: 'transparent',
              border: '1px solid var(--e3-border)',
              color: 'var(--e3-muted)',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              padding: '9px 13px',
            }}
          >
            ✕
          </button>
        </div>
        <RegistrationForm reg={reg} stats={stats} autoFocus />
      </div>
    </div>
  );
};

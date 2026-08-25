import { useEffect } from 'react';

/**
 * Hrănește `.e3-spot` cu poziția cursorului, ca `--sx` / `--sy` în procente.
 * CSS-ul desenează din ele haloul lime care urmărește mouse-ul peste carduri.
 *
 * Un singur listener delegat pe document, nu unul per card, iar scrierea se
 * face într-un rAF — pointermove se declanșează la fiecare cadru și un
 * `setProperty` sincron per eveniment ar face layout thrash degeaba.
 */
export const useSpotlight = () => {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Fără cursor real (touch) nu are ce urmări.
    if (!window.matchMedia('(hover: hover)').matches) return;

    let frame = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;

    const flush = () => {
      frame = 0;
      if (!pending) return;
      pending.el.style.setProperty('--sx', `${pending.x}%`);
      pending.el.style.setProperty('--sy', `${pending.y}%`);
      pending = null;
    };

    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>('.e3-spot');
      if (!el) return;
      const r = el.getBoundingClientRect();
      pending = {
        el,
        x: ((e.clientX - r.left) / r.width) * 100,
        y: ((e.clientY - r.top) / r.height) * 100,
      };
      if (!frame) frame = requestAnimationFrame(flush);
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
};

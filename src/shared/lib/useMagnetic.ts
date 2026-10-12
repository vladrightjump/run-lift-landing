import { useEffect } from 'react';

/** Cât de mult se poate lăsa atras butonul, în px. Peste ~12 începe să pară rupt de layout. */
const MAX = 9;

/**
 * Face `.e3-mag` să se lase atras de cursor: cât timp cursorul e deasupra,
 * elementul se deplasează spre el, proporțional cu distanța față de centru.
 *
 * Scrie în `--mx` / `--my`, pe care CSS-ul le consumă prin proprietatea
 * `translate` — nu `transform`, fiindcă hover-ul butoanelor îl ocupă deja pe
 * acela. Cele două se compun în loc să se anuleze.
 *
 * Un singur listener delegat pe document, cu scriere într-un rAF, la fel ca
 * `useSpotlight`: pointermove vine la fiecare cadru, iar un `setProperty`
 * sincron per eveniment ar face layout thrash degeaba.
 */
export const useMagnetic = () => {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Fără cursor real (touch) nu are ce urmări.
    if (!window.matchMedia('(hover: hover)').matches) return;

    let frame = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;
    // Ultimul buton atras — ca să-l putem readuce la zero când cursorul pleacă.
    let activ: HTMLElement | null = null;

    const reset = (el: HTMLElement) => {
      el.style.removeProperty('--mx');
      el.style.removeProperty('--my');
    };

    const flush = () => {
      frame = 0;
      if (!pending) return;
      pending.el.style.setProperty('--mx', `${pending.x}px`);
      pending.el.style.setProperty('--my', `${pending.y}px`);
      pending = null;
    };

    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>('.e3-mag') ?? null;
      if (el !== activ) {
        if (activ) reset(activ);
        activ = el;
      }
      if (!el) {
        pending = null;
        return;
      }
      const r = el.getBoundingClientRect();
      // Offset față de centru, normalizat la [-1, 1] și scalat la MAX.
      pending = {
        el,
        x: ((e.clientX - (r.left + r.width / 2)) / (r.width / 2)) * MAX,
        y: ((e.clientY - (r.top + r.height / 2)) / (r.height / 2)) * MAX,
      };
      if (!frame) frame = requestAnimationFrame(flush);
    };

    // Scroll-ul poate scoate butonul de sub cursor fără niciun pointermove;
    // fără asta ar rămâne deplasat pe vecie.
    const onLeave = () => {
      if (activ) reset(activ);
      activ = null;
      pending = null;
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerdown', onLeave, { passive: true });
    window.addEventListener('blur', onLeave);

    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerdown', onLeave);
      window.removeEventListener('blur', onLeave);
      if (activ) reset(activ);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
};

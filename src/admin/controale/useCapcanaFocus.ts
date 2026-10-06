import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

/**
 * Focusul unei suprapuneri (R34): intră la deschidere, nu iese prin Tab,
 * Escape închide, iar la închidere se întoarce exact de unde a plecat.
 *
 * Era logica dialogului din tabul „Eveniment"; acum o împart toate
 * suprapunerile — popover, foaie de jos, panou, dialog — ca să nu existe
 * două feluri de „se închide cu Escape" în același admin.
 */

export const FOCUSABILE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Unde cade focusul la deschidere, în ordinea asta: un element marcat explicit,
 * varianta deja aleasă dintr-o listă (cine deschide alegerea ediției vrea să
 * vadă unde e acum), primul element de meniu, apoi primul control.
 */
const PREFERAT = '[data-focus-initial], [aria-selected="true"], [role="menuitem"]:not([disabled])';

export const useCapcanaFocus = (
  cutie: RefObject<HTMLElement | null>,
  onInchide: () => void,
  /**
   * Unde se întoarce focusul dacă la deschidere nu era pe nimic. Safari nu
   * mută focusul pe un buton apăsat cu mouse-ul, deci „de unde a plecat" e
   * `<body>`; atunci declanșatorul e singura întoarcere care are sens.
   */
  revenire?: HTMLElement | null
) => {
  /**
   * Elementul de unde s-a deschis. Fără el, la închidere focusul cade pe
   * `<body>` și tabularea reîncepe din capul paginii.
   */
  const deUnde = useRef<Element | null>(null);

  useEffect(() => {
    deUnde.current = document.activeElement;
    const el = cutie.current;
    const tinta =
      el?.querySelector<HTMLElement>(PREFERAT) ?? el?.querySelector<HTMLElement>(FOCUSABILE) ?? el;
    tinta?.focus({ preventScroll: true });
    return () => {
      const anterior = deUnde.current as HTMLElement | null;
      const inapoi = anterior && anterior !== document.body ? anterior : revenire;
      inapoi?.focus?.({ preventScroll: true });
    };
  }, [cutie, revenire]);

  return (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // O suprapunere deschisă din alta (meniul dintr-un panou) primește
      // tasta întâi. Fără oprire, același Escape le-ar închide pe amândouă.
      e.stopPropagation();
      onInchide();
      return;
    }
    if (e.key !== 'Tab') return;
    e.stopPropagation();

    // Lista se recitește la fiecare Tab: ce e focusabil se schimbă sub
    // degete (un buton se activează după ce alegi o dată).
    const lista = [...(cutie.current?.querySelectorAll<HTMLElement>(FOCUSABILE) ?? [])];
    if (lista.length === 0) return;
    const primul = lista[0];
    const ultimul = lista[lista.length - 1];
    const activ = document.activeElement;

    if (e.shiftKey && (activ === primul || activ === cutie.current)) {
      e.preventDefault();
      ultimul.focus();
    } else if (!e.shiftKey && activ === ultimul) {
      e.preventDefault();
      primul.focus();
    }
  };
};

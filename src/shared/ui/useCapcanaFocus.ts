import { useEffect, useRef, type KeyboardEvent, type RefObject } from 'react';

/**
 * Focusul unei suprapuneri (R34): intră la deschidere, nu iese prin Tab,
 * Escape închide, iar la închidere se întoarce exact de unde a plecat.
 *
 * Era logica dialogului din tabul „Eveniment"; acum o împart toate
 * suprapunerile — popover, foaie de jos, panou, dialog — ca să nu existe
 * două feluri de „se închide cu Escape" în același admin.
 */

const FOCUSABILE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Candidatul din DOM trebuie să fie și disponibil în ordinea reală de Tab. */
const disponibil = (el: HTMLElement): boolean => {
  if (el.matches(':disabled, input[type="hidden"]')) return false;
  for (let nod: HTMLElement | null = el; nod; nod = nod.parentElement) {
    if (nod.hidden || nod.hasAttribute('inert')) return false;
    const stil = getComputedStyle(nod);
    if (stil.display === 'none' || stil.visibility === 'hidden' || stil.visibility === 'collapse') return false;
  }
  return true;
};

/** Ordinea de Tab a browserului: întâi `tabindex` pozitiv, crescător, apoi restul în ordinea din DOM. */
const ordineTab = (el: HTMLElement): number => (el.tabIndex > 0 ? el.tabIndex : Number.MAX_SAFE_INTEGER);

const opririTab = (cutie: HTMLElement | null): HTMLElement[] => {
  const candidati = [...(cutie?.querySelectorAll<HTMLElement>(FOCUSABILE) ?? [])]
    .filter((el) => el.tabIndex >= 0 && disponibil(el));
  return candidati.filter((el) => {
    if (!(el instanceof HTMLInputElement) || el.type !== 'radio' || !el.name) return true;
    const grup = candidati.filter((alt): alt is HTMLInputElement =>
      alt instanceof HTMLInputElement && alt.type === 'radio' && alt.name === el.name && alt.form === el.form
    );
    return el === (grup.find((radio) => radio.checked) ?? grup[0]);
  }).sort((a, b) => ordineTab(a) - ordineTab(b));
};

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
      [...(el?.querySelectorAll<HTMLElement>(PREFERAT) ?? [])].find(disponibil) ?? opririTab(el)[0] ?? el;
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
    const lista = opririTab(cutie.current);
    if (lista.length === 0) {
      e.preventDefault();
      cutie.current?.focus();
      return;
    }
    // Tab-ul se ia doar la margini, unde browserul l-ar scoate din suprapunere.
    // Între ele rămâne al browserului: într-un câmp de dată sau oră, Tab trece
    // întâi prin segmente (zi, lună, an), iar un grup radio e o singură oprire.
    // Un Tab preluat peste tot ar sări de pe lună direct la controlul următor.
    const index = lista.indexOf(document.activeElement as HTMLElement);
    const laMargine = index < 0 || (e.shiftKey ? index === 0 : index === lista.length - 1);
    if (!laMargine) return;
    e.preventDefault();
    lista[e.shiftKey ? lista.length - 1 : 0].focus();
  };
};

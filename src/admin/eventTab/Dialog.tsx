import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * Un dialog modal cu tastatură.
 *
 * Cele două dialoguri ale tabului („Ediția N+1" și confirmarea publicării) se
 * puteau închide doar cu mouse-ul: fără Escape, fără focus la deschidere, fără
 * nimic care să țină tabularea înăuntru. Adică un dialog care ACOPERĂ
 * formularul, dar lasă tabularea să plece prin el, în câmpurile de dedesubt pe
 * care nu le mai vezi.
 *
 * Marcajul rămâne cel de până acum (`.admin-confirm-overlay` > `.admin-confirm`)
 * ca stilurile să nu se schimbe; ce se adaugă e comportamentul.
 */

const FOCUSABILE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Dialog = ({
  titlu,
  rol = 'dialog',
  clasa,
  onInchide,
  children,
}: {
  /** Titlul vizibil — devine și numele accesibil al dialogului. */
  titlu: string;
  /**
   * `alertdialog` pentru cele care cer o decizie despre ceva ireversibil
   * (publicarea); `dialog` pentru restul. Cititoarele de ecran anunță altfel.
   */
  rol?: 'dialog' | 'alertdialog';
  /** Clasă suplimentară pe cutie, pentru variantele de culoare existente. */
  clasa?: string;
  onInchide: () => void;
  children: ReactNode;
}) => {
  const cutie = useRef<HTMLDivElement>(null);
  const idTitlu = useId();
  /**
   * Elementul de unde s-a deschis dialogul. Fără el, la închidere focusul cade
   * pe `<body>` și tabularea reîncepe din capul paginii — pe un formular de
   * douăzeci de câmpuri, asta e o pierdere de loc.
   */
  const deUnde = useRef<Element | null>(null);

  useEffect(() => {
    deUnde.current = document.activeElement;
    // Primul control din dialog, nu cutia: cine deschide „Ediția N+1" are de
    // completat o dată, iar cine deschide confirmarea are de apăsat un buton.
    const primul = cutie.current?.querySelector<HTMLElement>(FOCUSABILE);
    (primul ?? cutie.current)?.focus();

    return () => {
      (deUnde.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  const laTasta = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onInchide();
      return;
    }
    if (e.key !== 'Tab') return;

    // Capcana de focus. Lista se recitește la fiecare Tab: în dialogul de
    // ediție nouă butonul „Creează ciorna" e dezactivat până la alegerea datei,
    // deci ce e focusabil se schimbă sub degete.
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

  return (
    <div
      className="admin-confirm-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onInchide();
      }}
      onKeyDown={laTasta}
    >
      <div
        ref={cutie}
        className={`admin-confirm${clasa ? ` ${clasa}` : ''}`}
        role={rol}
        aria-modal="true"
        aria-labelledby={idTitlu}
        tabIndex={-1}
      >
        <h3 id={idTitlu}>{titlu}</h3>
        {children}
      </div>
    </div>
  );
};

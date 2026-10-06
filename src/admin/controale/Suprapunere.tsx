import { useId, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useCapcanaFocus } from './useCapcanaFocus';
import { useEsteTelefon } from './useEsteTelefon';

/**
 * Tot ce se deschide peste un ecran trece pe aici (KTD5).
 *
 * Ce se cere (`tip`) și ce se arată (prezentarea) sunt lucruri diferite:
 *
 *   tip        | peste 760 px            | sub 760 px
 *   popover    | ancorat sub declanșator | foaie de jos
 *   panou      | panou lateral, dreapta  | foaie de jos
 *   dialog     | dialog central          | dialog central
 *
 * Pe telefon, un popover mic lângă deget e greu de nimerit și se ascunde sub
 * tastatură; foaia de jos stă unde ajunge degetul mare.
 *
 * Se randează în rădăcina adminului (`.admin-app`), nu în `body`: acolo stau
 * jetoanele temei, iar un strămoș cu `backdrop-filter` (antetul) n-are cum să
 * prindă un `position: fixed` care nu e înăuntrul lui.
 */

type TipSuprapunere = 'popover' | 'panou' | 'dialog';
type Prezentare = 'popover' | 'panou' | 'dialog' | 'foaie';

/** Scrise întregi, nu compuse: garda de clase (`claseCss.test.ts`) le caută literal. */
const CLASA: Record<Prezentare, string> = {
  popover: 'admin-popover',
  panou: 'admin-panou',
  dialog: 'admin-dialog admin-confirm',
  foaie: 'admin-foaie',
};

const SPATIU = 6;
const MARGINE = 12;

/**
 * Unde stă un popover. Sub declanșator dacă încape; altfel deasupra; dacă nu
 * încape nici acolo, pagina trebuie derulată (`deruleaza` px) ca să încapă
 * dedesubt — un popover lipit peste propriul declanșator ascunde exact ce ai
 * apăsat.
 */
export const pozitiePopover = (
  ancora: { top: number; bottom: number; left: number },
  cutie: { width: number; height: number },
  ecran: { width: number; height: number }
): { top: number; left: number; deruleaza: number } => {
  const left = Math.max(MARGINE, Math.min(ancora.left, ecran.width - cutie.width - MARGINE));
  if (ancora.bottom + SPATIU + cutie.height <= ecran.height - MARGINE) {
    return { top: ancora.bottom + SPATIU, left, deruleaza: 0 };
  }
  if (ancora.top - SPATIU - cutie.height >= MARGINE) {
    return { top: ancora.top - SPATIU - cutie.height, left, deruleaza: 0 };
  }
  const deruleaza = ancora.bottom + SPATIU + cutie.height - (ecran.height - MARGINE);
  return { top: ancora.bottom + SPATIU - deruleaza, left, deruleaza };
};

type Props = {
  tip: TipSuprapunere;
  /** Numele accesibil. Se vede ca titlu pe foaie, panou și dialog. */
  titlu: string;
  /** Declanșatorul, pentru popover. */
  ancora?: HTMLElement | null;
  rol?: 'dialog' | 'alertdialog' | 'menu';
  clasa?: string;
  onInchide: () => void;
  /** Tastele proprii conținutului (săgețile unui meniu), înaintea capcanei. */
  onTasta?: (e: KeyboardEvent<HTMLDivElement>) => void;
  children: ReactNode;
};

export const Suprapunere = ({
  tip,
  titlu,
  ancora,
  rol = 'dialog',
  clasa,
  onInchide,
  onTasta,
  children,
}: Props) => {
  const telefon = useEsteTelefon();
  const prezentare: Prezentare = tip === 'dialog' ? 'dialog' : telefon ? 'foaie' : tip;
  const cutie = useRef<HTMLDivElement>(null);
  const idTitlu = useId();
  const capcana = useCapcanaFocus(cutie, onInchide, ancora);

  useLayoutEffect(() => {
    const el = cutie.current;
    if (prezentare !== 'popover' || !ancora || !el) return;
    const aplica = (cuDerulare: boolean) => {
      const r = ancora.getBoundingClientRect();
      const p = pozitiePopover(
        r,
        { width: el.offsetWidth, height: el.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight }
      );
      if (cuDerulare && p.deruleaza > 0) {
        window.scrollBy(0, p.deruleaza);
        aplica(false);
        return;
      }
      el.style.top = `${p.top}px`;
      el.style.left = `${p.left}px`;
    };
    aplica(true);
    const laSchimbare = () => aplica(false);
    window.addEventListener('resize', laSchimbare);
    window.addEventListener('scroll', laSchimbare, true);
    return () => {
      window.removeEventListener('resize', laSchimbare);
      window.removeEventListener('scroll', laSchimbare, true);
    };
  }, [prezentare, ancora]);

  const cuAntet = prezentare !== 'popover';
  const clase = ['admin-supr', CLASA[prezentare], clasa ?? ''].filter(Boolean).join(' ');

  const continut = (
    <>
      <div
        className={`admin-supr-fundal${prezentare === 'popover' ? ' admin-supr-fundal--clar' : ''}${
          prezentare === 'dialog' ? ' admin-confirm-overlay' : ''
        }`}
        onClick={onInchide}
      />
      <div
        ref={cutie}
        className={clase}
        role={rol}
        aria-modal="true"
        aria-labelledby={cuAntet ? idTitlu : undefined}
        aria-label={cuAntet ? undefined : titlu}
        tabIndex={-1}
        onKeyDown={(e) => {
          onTasta?.(e);
          if (!e.defaultPrevented) capcana(e);
        }}
      >
        {prezentare === 'foaie' && <div className="admin-foaie-maner" aria-hidden="true" />}
        {cuAntet && (
          <div className="admin-supr-antet">
            <h2 id={idTitlu} className="admin-supr-titlu">
              {titlu}
            </h2>
            {prezentare !== 'dialog' && (
              <button type="button" className="admin-buton-icon" aria-label="Închide" onClick={onInchide}>
                <Icon nume="x" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </>
  );

  const radacina =
    typeof document === 'undefined' ? null : (document.querySelector('.admin-app') ?? document.body);
  return radacina ? createPortal(continut, radacina) : continut;
};

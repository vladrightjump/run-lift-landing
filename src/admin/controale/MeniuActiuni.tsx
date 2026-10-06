import { Fragment, useState, type KeyboardEvent } from 'react';
import { Icon, type NumeIcon } from './Icon';
import { Suprapunere } from './Suprapunere';

/**
 * Meniul „⋯" al unui rând (R26).
 *
 * De ce un meniu și nu trei butoane pe rând: „Editează", „Prezență" și
 * „Șterge" cu aceeași greutate, pe fiecare din 30 de rânduri, fac din
 * ștergere o acțiune la fel de la îndemână ca editarea. Rândul păstrează
 * acțiunea principală la vedere; restul stau aici, cu ștergerea separată.
 */

export type ElementMeniu = {
  eticheta: string;
  onAlege: () => void;
  icon?: NumeIcon;
  distructiv?: boolean;
  /** Linie de despărțire înaintea elementului — pentru acțiunile distructive. */
  separatInainte?: boolean;
  dezactivat?: boolean;
};

export const MeniuActiuni = ({
  eticheta,
  elemente,
}: {
  /** Numele butonului și al meniului, de forma „Mai multe pentru Ana Postică". */
  eticheta: string;
  elemente: ElementMeniu[];
}) => {
  const [deschis, setDeschis] = useState(false);
  const [ancora, setAncora] = useState<HTMLButtonElement | null>(null);

  const muta = (e: KeyboardEvent<HTMLDivElement>) => {
    const lista = [
      ...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])'),
    ];
    if (lista.length === 0) return;
    const i = lista.indexOf(document.activeElement as HTMLElement);
    const tinta =
      e.key === 'ArrowDown'
        ? (i + 1) % lista.length
        : e.key === 'ArrowUp'
          ? (i - 1 + lista.length) % lista.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? lista.length - 1
              : -1;
    if (tinta < 0) return;
    e.preventDefault();
    lista[tinta].focus();
  };

  return (
    <>
      <button
        ref={setAncora}
        type="button"
        className="admin-buton-icon"
        aria-label={eticheta}
        aria-haspopup="menu"
        aria-expanded={deschis}
        onClick={() => setDeschis(true)}
      >
        <Icon nume="mai" />
      </button>
      {deschis && (
        <Suprapunere
          tip="popover"
          titlu={eticheta}
          ancora={ancora}
          rol="menu"
          clasa="admin-meniu"
          onInchide={() => setDeschis(false)}
          onTasta={muta}
        >
          {elemente.map((el) => (
            <Fragment key={el.eticheta}>
              {el.separatInainte && <hr className="admin-meniu-sep" />}
              <button
                type="button"
                role="menuitem"
                disabled={el.dezactivat}
                className={`admin-meniu-item${el.distructiv ? ' admin-meniu-item--distructiv' : ''}`}
                onClick={() => {
                  setDeschis(false);
                  el.onAlege();
                }}
              >
                {el.icon && <Icon nume={el.icon} marime={18} />}
                {el.eticheta}
              </button>
            </Fragment>
          ))}
        </Suprapunere>
      )}
    </>
  );
};

import { useId, type ReactNode } from 'react';

type Element = {
  id: string;
  /** Numele elementului, pentru eticheta controlului de poziție. */
  nume: string;
  continut: ReactNode;
};

type Props = {
  eticheta: string;
  elemente: Element[];
  /** Mută elementul pe poziția cerută, numărată de la 1. */
  onMuta: (id: string, pozitie: number) => void;
  dezactivat?: boolean;
};

/**
 * O listă a cărei ordine contează, reordonată prin alegerea poziției.
 *
 * Ce înlocuiește: două butoane de direcție pe FIECARE rând, dintre care unul
 * era mereu dezactivat la capete. Zece clipuri însemnau douăzeci de butoane,
 * iar mutarea ultimului pe primul loc cerea nouă clicuri.
 *
 * De ce nu tragere: ar fi cerut fie o dependență nouă, fie tratare manuală de
 * `pointer`. Amândouă sînt greu de testat, nefolosibile cu tastatura și
 * capricioase pe telefon — exact locul de unde se administrează banda.
 *
 * Fiecare rând oferă TOATE pozițiile, inclusiv pe a lui. O listă care o sare
 * pe cea curentă ar arăta „2, 3" pentru un element aflat pe 1, iar numerele
 * n-ar mai însemna poziția.
 */
export const ListaOrdonabila = ({ eticheta, elemente, onMuta, dezactivat }: Props) => {
  const id = useId();
  // Sub două elemente nu există ordine de schimbat, iar un control care nu
  // poate face nimic e zgomot cu aparență de acțiune.
  const reordonabil = elemente.length > 1;

  return (
    <ol className="admin-ordonabila" aria-label={eticheta}>
      {elemente.map((e, i) => (
        <li key={e.id} className="admin-ordonabila-rand">
          <span className="admin-ordonabila-nr" aria-hidden="true">
            {String(i + 1).padStart(2, '0')}
          </span>

          <div className="admin-ordonabila-continut">{e.continut}</div>

          {reordonabil && (
            <div className="admin-ordonabila-pozitie">
              <label className="admin-ordonabila-eticheta" htmlFor={`${id}-${e.id}`}>
                Poziția pentru „{e.nume}”
              </label>
              <select
                id={`${id}-${e.id}`}
                value={i + 1}
                disabled={dezactivat}
                onChange={(ev) => onMuta(e.id, Number(ev.target.value))}
              >
                {elemente.map((_, j) => (
                  <option key={j} value={j + 1}>
                    {j + 1}
                  </option>
                ))}
              </select>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
};

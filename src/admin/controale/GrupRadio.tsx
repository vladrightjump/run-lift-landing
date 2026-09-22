import { useId } from 'react';

type Optiune<T extends string> = {
  valoare: T;
  eticheta: string;
  /** De ce ai alege varianta asta. Se vede lângă ea, nu într-un `title`. */
  descriere?: string;
};

type Props<T extends string> = {
  eticheta: string;
  valoare: T;
  optiuni: Optiune<T>[];
  onSchimba: (valoare: T) => void;
  dezactivat?: boolean;
};

/**
 * O alegere dintre puține variante exclusive.
 *
 * De ce nu butoane: un rând de butoane nu spune care e ales decât prin
 * culoare, nu se parcurge cu săgețile și nu se anunță ca „1 din 3". Un grup
 * radio le face pe toate trei fără nimic în plus.
 *
 * De ce nu o listă derulantă: cu două-trei variante, lista ascunde tocmai
 * informația pentru care există alegerea. Setul care crește e `ListaDerulanta`.
 */
export const GrupRadio = <T extends string>({
  eticheta,
  valoare,
  optiuni,
  onSchimba,
  dezactivat,
}: Props<T>) => {
  const nume = useId();

  return (
    <fieldset className="admin-control admin-radio" disabled={dezactivat}>
      <legend className="admin-control-eticheta">{eticheta}</legend>

      {optiuni.map((o) => {
        const id = `${nume}-${o.valoare}`;
        return (
          <label key={o.valoare} className="admin-radio-optiune" htmlFor={id}>
            <input
              id={id}
              type="radio"
              name={nume}
              value={o.valoare}
              checked={valoare === o.valoare}
              onChange={() => onSchimba(o.valoare)}
            />
            <span className="admin-radio-text">
              <span className="admin-radio-nume">{o.eticheta}</span>
              {o.descriere && <span className="admin-radio-descriere">{o.descriere}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
};

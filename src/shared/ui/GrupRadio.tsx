import controlStyles from './ControlStyles.module.css';
import styles from './GrupRadio.module.css';
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
    <fieldset className={`${controlStyles['admin-control']} ` + styles['admin-radio']} data-css={"admin-control admin-radio"} disabled={dezactivat}>
      <legend className={controlStyles['admin-control-eticheta']} data-css="admin-control-eticheta">{eticheta}</legend>

      {optiuni.map((o) => {
        const id = `${nume}-${o.valoare}`;
        return (
          <label key={o.valoare} className={styles['admin-radio-optiune']} data-css={"admin-radio-optiune"} htmlFor={id}>
            <input
              id={id}
              type="radio"
              name={nume}
              value={o.valoare}
              checked={valoare === o.valoare}
              disabled={dezactivat}
              onChange={() => onSchimba(o.valoare)}
            />
            <span className={styles['admin-radio-text']} data-css={"admin-radio-text"}>
              <span className={styles['admin-radio-nume']} data-css={"admin-radio-nume"}>{o.eticheta}</span>
              {o.descriere && <span className={styles['admin-radio-descriere']} data-css={"admin-radio-descriere"}>{o.descriere}</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
};

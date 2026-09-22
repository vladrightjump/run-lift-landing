import { useId } from 'react';

type Optiune<T extends string> = { valoare: T; eticheta: string };

/** Opțiuni strânse sub un titlu, când setul e destul de mare să se ceară. */
type Grup<T extends string> = { eticheta: string; optiuni: Optiune<T>[] };

type Props<T extends string> = {
  eticheta: string;
  valoare: T | '';
  /** Plat sau pe grupuri — aceeași primitivă, ca să nu apară a doua. */
  optiuni: Optiune<T>[] | Grup<T>[];
  onSchimba: (valoare: T) => void;
  /** Ce face alegerea. Se VEDE — nu ajunge în `title`. */
  descriere?: string;
  /** Problema, în cuvinte. Culoarea singură n-o spune nimănui care n-o vede. */
  problema?: string;
  dezactivat?: boolean;
  /** Text pentru „încă n-ai ales", când `valoare` e goală. */
  placeholder?: string;
};

/**
 * O alegere dintr-un set care crește în timp.
 *
 * Când se folosește asta și nu un grup radio: numărul de variante nu e
 * cunoscut dinainte și crește (ediții, ecrane, șabloane). Un set mic și fix
 * de variante exclusive e `GrupRadio` — acolo a le vedea pe toate deodată
 * chiar ajută.
 */
export const ListaDerulanta = <T extends string>({
  eticheta,
  valoare,
  optiuni,
  onSchimba,
  descriere,
  problema,
  dezactivat,
  placeholder,
}: Props<T>) => {
  const id = useId();
  const idDescriere = `${id}-descriere`;
  const idProblema = `${id}-problema`;

  return (
    <div className="admin-control">
      <label className="admin-control-eticheta" htmlFor={id}>
        {eticheta}
      </label>

      <select
        id={id}
        className="admin-control-select"
        value={valoare}
        disabled={dezactivat}
        aria-invalid={problema ? true : undefined}
        aria-describedby={
          [descriere ? idDescriere : null, problema ? idProblema : null]
            .filter(Boolean)
            .join(' ') || undefined
        }
        onChange={(e) => onSchimba(e.target.value as T)}
      >
        {/* Placeholderul există doar cât timp nu s-a ales nimic. Fără el,
            `value=""` n-ar avea corespondent, iar browserul ar afișa prima
            opțiune ca și cum ar fi aleasă: controlul ar minți. */}
        {valoare === '' && placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {optiuni.map((o) =>
          'optiuni' in o ? (
            <optgroup key={o.eticheta} label={o.eticheta}>
              {o.optiuni.map((sub) => (
                <option key={sub.valoare} value={sub.valoare}>
                  {sub.eticheta}
                </option>
              ))}
            </optgroup>
          ) : (
            <option key={o.valoare} value={o.valoare}>
              {o.eticheta}
            </option>
          )
        )}
      </select>

      {descriere && (
        <small id={idDescriere} className="admin-control-descriere">
          {descriere}
        </small>
      )}

      {problema && (
        <small id={idProblema} className="admin-control-problema" role="alert">
          {problema}
        </small>
      )}
    </div>
  );
};

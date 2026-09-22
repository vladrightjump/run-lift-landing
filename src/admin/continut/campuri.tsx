import { useId, cloneElement, type ReactElement, type ReactNode } from 'react';

type Props = {
  eticheta: string;
  /**
   * Ce vrea câmpul, în cuvinte, ÎNAINTE de a greși.
   *
   * Nu e decor. Formularul de clipuri cerea un link de Instagram obligatoriu
   * sub eticheta „Linkul postării", iar de ce un clip de pe YouTube are nevoie
   * și de o postare aflai abia când validarea refuza salvarea.
   */
  ajutor?: ReactNode;
  /** Se spune aici, nu se lasă pe seama refuzului de la salvare. */
  obligatoriu?: boolean;
  problema?: string;
  /** Controlul propriu-zis. Primește `id` și `aria-describedby` de aici. */
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
};

/**
 * Un câmp de editare: etichetă legată, ajutor vizibil, problemă în cuvinte.
 *
 * De ce împachetează controlul în loc să-l randeze: seturile de câmpuri diferă
 * ireductibil între ecrane (o dată, un link de YouTube, un bloc de text). Ce
 * se repetă e cadrul din jurul lor, nu controlul.
 */
export const CampEditare = ({ eticheta, ajutor, obligatoriu, problema, children }: Props) => {
  const id = useId();
  const idAjutor = `${id}-ajutor`;
  const idProblema = `${id}-problema`;

  const descrieri = [ajutor ? idAjutor : null, problema ? idProblema : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="admin-camp">
      <label className="admin-camp-eticheta" htmlFor={id}>
        {eticheta}
        {obligatoriu && <span className="admin-camp-obligatoriu">obligatoriu</span>}
      </label>

      {cloneElement(children, {
        id,
        'aria-describedby': descrieri || undefined,
        'aria-invalid': problema ? true : undefined,
      })}

      {ajutor && (
        <small id={idAjutor} className="admin-camp-ajutor">
          {ajutor}
        </small>
      )}

      {problema && (
        <small id={idProblema} className="admin-camp-problema" role="alert">
          {problema}
        </small>
      )}
    </div>
  );
};

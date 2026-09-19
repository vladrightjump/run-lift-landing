import { useCallback } from 'react';
import { listWeeklyWorkout, type AdminWorkoutRow } from '../lib/adminApi';
import { useAdminResource } from './useAdminResource';

type Props = {
  /** Deschide ecranul antrenamentului. */
  onDeschide: () => void;
};

/**
 * „În fiecare săptămână" — blocul de sub linia de timp.
 *
 * Stă în afara liniei fiindcă antrenamentul nu aparține niciunei ediții: se
 * schimbă săptămânal și rămâne valabil între ediții. Pus pe linie, ar fi
 * sugerat că e un reper al ediției curente și ar fi dispărut odată cu ea.
 *
 * Sub linie, nu lângă ea: proximitatea îl face vizibil fără să-l amestece cu
 * desfășurarea. Împărțirea de nivel întâi a backoffice-ului devine astfel
 * episodic (ediția) față de recurent (săptămâna).
 *
 * Arată starea și titlul curent fără să intri în el — dacă trebuie să deschizi
 * ecranul ca să afli dacă pagina e pornită, blocul nu și-a făcut treaba.
 */
export const BlocSaptamanal = ({ onDeschide }: Props) => {
  const incarca = useCallback(
    (token: string, signal: AbortSignal) => listWeeklyWorkout(token, signal),
    []
  );
  // O singură încărcare: antrenamentul se schimbă o dată pe săptămână, dintr-un
  // singur loc. Un poll la 15 secunde ar fi trafic pentru nimic.
  const { date: versiuni } = useAdminResource<AdminWorkoutRow[]>(incarca, null);

  const publicat = versiuni?.find((v) => v.status === 'published') ?? null;
  const pornit = publicat?.activ === true;

  return (
    <section className="admin-saptamanal" aria-label="În fiecare săptămână">
      <div className="admin-saptamanal-cap">
        <span className="admin-saptamanal-eticheta">În fiecare săptămână</span>
      </div>

      <div className="admin-saptamanal-rand">
        <span
          className={`admin-saptamanal-stare${pornit ? ' pornit' : ''}`}
          // Starea în cuvinte, nu doar prin culoarea punctului — aceeași
          // regulă ca pe nodurile liniei de timp.
        >
          <span className="admin-saptamanal-punct" aria-hidden="true" />
          {versiuni === null ? 'se încarcă…' : pornit ? 'Pagina e pornită' : 'Pagina e oprită'}
        </span>

        <span className="admin-saptamanal-titlu">
          {versiuni === null
            ? ''
            : publicat
              ? publicat.titlu || '(fără titlu)'
              : 'Niciun antrenament scris încă'}
        </span>

        <button type="button" className="admin-btn-ghost" onClick={onDeschide}>
          Antrenamentul săptămânii
        </button>
      </div>
    </section>
  );
};

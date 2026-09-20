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
 * Arată unde a ajuns programul fără să intri în el — dacă trebuie să deschizi
 * ecranul ca să afli dacă pagina arată ceva, blocul nu și-a făcut treaba.
 */
export const BlocSaptamanal = ({ onDeschide }: Props) => {
  const incarca = useCallback(
    (token: string, signal: AbortSignal) => listWeeklyWorkout(token, signal),
    []
  );
  // O singură încărcare: antrenamentul se schimbă o dată pe săptămână, dintr-un
  // singur loc. Un poll la 15 secunde ar fi trafic pentru nimic.
  const { date: randuri } = useAdminResource<AdminWorkoutRow[]>(incarca, null);

  /**
   * Săptămâna pe care o vede publicul: cea mai mare dintre cele vizibile.
   * Derivată, nu marcată — o coloană „curent" ar fi fost o a doua sursă de
   * adevăr peste ordine, cu voie să o contrazică.
   */
  const vizibile = (randuri ?? [])
    .filter((r) => r.status === 'published' && r.vizibil)
    .sort((a, b) => a.numar - b.numar);
  const curenta = vizibile.length === 0 ? null : vizibile[vizibile.length - 1];
  const cate = (randuri ?? []).filter((r) => r.status === 'published').length;

  return (
    <section className="admin-saptamanal" aria-label="În fiecare săptămână">
      <div className="admin-saptamanal-cap">
        <span className="admin-saptamanal-eticheta">În fiecare săptămână</span>
      </div>

      <div className="admin-saptamanal-rand">
        <span
          className={`admin-saptamanal-stare${curenta ? ' pornit' : ''}`}
          // Starea în cuvinte, nu doar prin culoarea punctului — aceeași
          // regulă ca pe nodurile liniei de timp.
        >
          <span className="admin-saptamanal-punct" aria-hidden="true" />
          {randuri === null
            ? 'se încarcă…'
            : curenta
              ? `Săptămâna ${curenta.numar} pe pagină`
              : 'Pagina e oprită'}
        </span>

        <span className="admin-saptamanal-titlu">
          {randuri === null
            ? ''
            : curenta
              ? `${curenta.titlu || '(fără titlu)'} · ${cate} în program`
              : cate > 0
                ? `${cate} în program, niciuna vizibilă`
                : 'Niciun antrenament scris încă'}
        </span>

        <button type="button" className="admin-btn-ghost" onClick={onDeschide}>
          Antrenamentul săptămânii
        </button>
      </div>
    </section>
  );
};

import { useId, type ReactNode } from 'react';
import type { EcranAdmin, FazaSite } from './stareCurenta';
import { ETICHETA_FAZA } from './stareCurenta';
import { GRUPURI, etichetaEcranului } from './adminNavigatie';

type Props = {
  ecran: EcranAdmin;
  onEcran: (ecran: EcranAdmin) => void;
  faza: FazaSite;
  /** Numărătoarea spre anunț, cât timp n-a trecut. */
  countdown: string | null;
  onLogout: () => void;
  children: ReactNode;
};

/** Ecranul pe care se aterizează și la care duce calea de întoarcere. */
const ACASA: EcranAdmin = 'desfasurare';

/**
 * Cadrul backoffice-ului: antetul, calea de întoarcere și exact un ecran.
 *
 * Înlocuiește stiva permanentă. Înainte, deasupra oricărei treburi stăteau
 * cinci blocuri — selectorul de ediție, bannerul de arhivă, linia de timp cu
 * butoanele ei, blocul săptămânal și bara de navigație pe două rânduri — iar
 * ecranul pe care voiai să ajungi începea sub ele. Două dintre blocuri erau
 * ele însele suprafețe interactive, deci concurau cu ecranul de dedesubt.
 *
 * Ce rămâne permanent: antetul și, când nu ești acasă, calea de întoarcere.
 * Nimic altceva. Un al doilea bloc de funcționalitate deasupra ecranului ar
 * readuce exact problema.
 *
 * Comutatorul de ecrane e o listă derulantă, nu o bară de butoane. Zece ecrane
 * în butoane se rup pe două rânduri și mănâncă din nou capul paginii; o listă
 * are aceeași înălțime oricâte ecrane s-ar aduna. Grupurile rămân vizibile în
 * listă, ca alegerea să nu ceară să știi dinainte unde stă ce cauți.
 */
export const AdminCadru = ({
  ecran,
  onEcran,
  faza,
  countdown,
  onLogout,
  children,
}: Props) => {
  const id = useId();

  return (
    <>
      <header className="admin-topbar">
        <div className="brand">
          <span className="admin-logo">
            Run <span className="accent">+</span> Lift
          </span>
          <span className="admin-badge">Backoffice</span>
        </div>

        <div className="admin-topbar-meta">
          {/* Ce vede un vizitator ACUM. Întrebarea nu se pune o dată la
              deschidere: se pune de fiecare dată când te pregătești să schimbi
              ceva, deci stă în antet, nu pe un ecran anume. */}
          <a
            className={`admin-faza faza-${faza}`}
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            title="Deschide site-ul public într-un tab nou"
          >
            <span className="admin-faza-punct" aria-hidden="true" />
            <span className="admin-faza-eticheta">Pe site</span>
            <span className="admin-faza-valoare">{ETICHETA_FAZA[faza]}</span>
            <span aria-hidden="true">↗</span>
          </a>

          {/* Numărătoarea spre anunț dispare după ce trece: un „Anunțul e live"
              lipit permanent în antet e zgomot, nu informație. */}
          {countdown && (
            <span className="admin-cd">
              <span className="countdown-dot" />
              {countdown}
            </span>
          )}

          <label className="admin-comutator" htmlFor={id}>
            <span className="admin-comutator-eticheta">Ecran</span>
            <select
              id={id}
              className="admin-comutator-select"
              value={ecran}
              onChange={(e) => onEcran(e.target.value as EcranAdmin)}
            >
              {GRUPURI.map((g) => (
                <optgroup key={g.cheie} label={`${g.eticheta} — ${g.intrebare}`}>
                  {g.ecrane.map((e) => (
                    <option key={e.cheie} value={e.cheie}>
                      {e.eticheta}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          <button type="button" className="admin-logout" onClick={onLogout}>
            Ieși din cont
          </button>
        </div>
      </header>

      <main className="admin-main">
        {/* Calea de întoarcere apare doar când ai unde să te întorci. Pe ecranul
            de pornire ar fi un buton care nu duce nicăieri. */}
        {ecran !== ACASA && (
          <nav className="admin-cale" aria-label="Calea de întoarcere">
            <button type="button" className="admin-cale-inapoi" onClick={() => onEcran(ACASA)}>
              <span aria-hidden="true">←</span> {etichetaEcranului(ACASA)}
            </button>
            <span className="admin-cale-separator" aria-hidden="true">
              /
            </span>
            <span className="admin-cale-aici" aria-current="page">
              {etichetaEcranului(ecran)}
            </span>
          </nav>
        )}

        {children}
      </main>
    </>
  );
};

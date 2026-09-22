import type { ReactNode } from 'react';
import type { EcranAdmin, FazaSite } from './stareCurenta';
import { ETICHETA_FAZA } from './stareCurenta';
import { GRUPURI, etichetaEcranului } from './adminNavigatie';
import { ListaDerulanta } from './controale/ListaDerulanta';

type Props = {
  ecran: EcranAdmin;
  onEcran: (ecran: EcranAdmin) => void;
  faza: FazaSite;
  /** Numărătoarea spre anunț, cât timp n-a trecut. */
  countdown: string | null;
  /** Emailuri nelivrate — alerta care trebuie să te găsească pe orice ecran. */
  nelivrate: number;
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
  nelivrate,
  onLogout,
  children,
}: Props) => (
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

          {/* Cât timp navigația era permanentă, alerta de livrare călătorea cu
              ea. De când registrul stă pe ecranul de pornire, o alertă lăsată
              acolo s-ar vedea numai dacă te întorci acasă — exact pe dos față
              de ce cere un email care n-a ajuns. */}
          {nelivrate > 0 && (
            <button
              type="button"
              className="admin-alerta-livrare"
              onClick={() => onEcran('livrare')}
            >
              <span className="admin-tab-alert">{nelivrate}</span>
              {nelivrate === 1 ? 'email n-a ajuns' : 'emailuri n-au ajuns'}
            </button>
          )}

          <div className="admin-comutator">
            <ListaDerulanta
              eticheta="Ecran"
              valoare={ecran}
              onSchimba={onEcran}
              optiuni={GRUPURI.map((g) => ({
                eticheta: `${g.eticheta} — ${g.intrebare}`,
                optiuni: g.ecrane.map((e) => ({ valoare: e.cheie, eticheta: e.eticheta })),
              }))}
            />
          </div>

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

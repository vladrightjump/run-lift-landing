import type { EcranAdmin, SemnaleAdmin } from './stareCurenta';
import { LiniaDeTimp } from './LiniaDeTimp';
import { BlocSaptamanal } from './BlocSaptamanal';
import { AdminNav } from './AdminNav';

type Props = {
  semnale: SemnaleAdmin;
  onEcran: (ecran: EcranAdmin) => void;
  onEditieNoua: () => void;
  arhiva: boolean;
  contorEcran: Record<EcranAdmin, number | null>;
  nelivrate: number;
};

/**
 * Ecranul pe care se aterizează.
 *
 * Răspunde la „unde e ediția acum?" fără niciun clic. Asta era și înainte
 * prima întrebare a backoffice-ului, dar răspunsul stătea într-un bloc
 * permanent deasupra fiecărui alt ecran: îl plăteai pe toate, chiar când
 * veniseși pentru cu totul altceva.
 *
 * Trei lucruri, în ordinea în care se citesc: unde a ajuns ediția, ce e valabil
 * în fiecare săptămână indiferent de ediție, și toate ecranele.
 *
 * Registrul stă ultimul, nu primul. Cine intră cu o treabă anume o are deja în
 * minte și derulează; cine intră fără una are nevoie întâi de starea ediției.
 */
export const EcranPornire = ({
  semnale,
  onEcran,
  onEditieNoua,
  arhiva,
  contorEcran,
  nelivrate,
}: Props) => (
  <>
    <LiniaDeTimp
      semnale={semnale}
      onTab={onEcran}
      onEditieNoua={onEditieNoua}
      arhiva={arhiva}
    />

    {/* Antrenamentul nu aparține niciunei ediții: se schimbă săptămânal și
        rămâne valabil între ediții. De asta stă lângă linie, nu pe ea — pus pe
        linie ar fi sugerat că e un reper al ediției curente și ar fi dispărut
        odată cu ea. */}
    <BlocSaptamanal onDeschide={() => onEcran('antrenament')} />

    <AdminNav onEcran={onEcran} contorEcran={contorEcran} nelivrate={nelivrate} />
  </>
);

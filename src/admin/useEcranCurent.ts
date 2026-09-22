import { useCallback, useEffect, useRef, useState } from 'react';
import type { EcranAdmin } from './stareCurenta';
import { esteEcran } from './adminNavigatie';

/**
 * Ecranul curent al backoffice-ului, ținut în fragmentul adresei.
 *
 * De ce fragment și nu stare pură: de îndată ce ecranele se exclud, „înapoi"
 * devine o așteptare rezonabilă. Fără adresă, apăsarea lui te scotea din
 * `/admin` cu totul — pierdeai tot contextul fiindcă voiai să te întorci un
 * pas. Cu fragment, ecranul se poate și trimite prin link.
 *
 * De ce fragmentul și nu calea: `src/main.tsx` comută pe `pathname` exact, iar
 * `vercel.json` rescrie exact `/admin`. O cale a doua ar fi cerut o intrare în
 * amândouă și un router pe care proiectul nu-l are. Fragmentul nu ajunge nici
 * la server, nici la rutarea din `main.tsx`.
 *
 * Garda de ieșire stă aici, lângă navigare. Se navighează din trei locuri —
 * registrul de ecrane, acțiunile liniei de timp, semnalele de atenție — iar o
 * gardă pusă pe unul singur ar fi o gardă cu trei sferturi de gaură.
 */

const dinHash = (hash: string): EcranAdmin | null => {
  const cheie = hash.replace(/^#/, '');
  return esteEcran(cheie) ? cheie : null;
};

export const useEcranCurent = (implicit: EcranAdmin) => {
  const [ecran, setEcran] = useState<EcranAdmin>(
    () => dinHash(window.location.hash) ?? implicit
  );
  const gardaIesire = useRef<(() => boolean) | null>(null);

  // Ecranul curent, citibil din ascultătorul de `hashchange` fără să-l lege de
  // o valoare veche: efectul se înregistrează o dată, iar `ecran` s-ar fi
  // închis peste valoarea de la montare.
  //
  // Sincronizarea stă într-un efect, nu în corpul randării: cititorii lui sînt
  // toți asincroni (handler de eveniment, ascultător de `hashchange`), deci
  // rulează după ce efectul a trecut.
  const ecranRef = useRef(ecran);
  useEffect(() => {
    ecranRef.current = ecran;
  }, [ecran]);

  const schimba = useCallback((urmator: EcranAdmin) => {
    if (urmator === ecranRef.current) return;
    if (gardaIesire.current && !gardaIesire.current()) return;
    setEcran(urmator);
  }, []);

  const inregistreazaGardaIesire = useCallback((garda: (() => boolean) | null) => {
    gardaIesire.current = garda;
  }, []);

  // Fragmentul urmează ecranul. `replace` n-ar merge aici: fiecare ecran
  // trebuie să lase o intrare în istoric, altfel „înapoi" n-ar avea unde să se
  // întoarcă și am fi scris adresa degeaba.
  useEffect(() => {
    if (window.location.hash !== `#${ecran}`) window.location.hash = ecran;
  }, [ecran]);

  // „Înapoi" și „înainte" din browser, plus orice link care schimbă fragmentul.
  useEffect(() => {
    const laSchimbare = () => {
      const cerut = dinHash(window.location.hash);
      const curent = ecranRef.current;
      if (cerut === null || cerut === curent) return;
      if (gardaIesire.current && !gardaIesire.current()) {
        // Refuzul trebuie să pună adresa la loc. Altfel URL-ul ar arăta un
        // ecran iar pe ecran ar fi altul — exact minciuna pe care adresa
        // trebuia s-o repare.
        window.location.hash = curent;
        return;
      }
      setEcran(cerut);
    };
    window.addEventListener('hashchange', laSchimbare);
    return () => window.removeEventListener('hashchange', laSchimbare);
  }, []);

  return { ecran, schimba, inregistreazaGardaIesire };
};

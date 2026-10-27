import { useCallback, useEffect, useRef, useState } from 'react';
import type { EcranAdmin } from '../data/stareCurenta';
import { esteEcran } from './adminNavigatie';

/**
 * Ecranul curent al backoffice-ului, ținut în fragmentul adresei.
 *
 * De ce fragment și nu stare pură: de îndată ce ecranele se exclud, „înapoi"
 * devine o așteptare rezonabilă. Fără adresă, apăsarea lui te scotea din
 * `/admin` cu totul — pierdeai tot contextul fiindcă voiai să te întorci un
 * pas. Cu fragment, ecranul se poate și trimite prin link.
 *
 * De ce fragmentul și nu calea: routerul din `src/app/router.tsx` deține
 * numai `/admin`, iar `vercel.json` rescrie exact această cale. O cale a doua
 * ar fi cerut o intrare în amândouă. Fragmentul rămâne în grija navigării
 * adminului și nu ajunge la server.
 *
 * Garda de ieșire stă aici, lângă navigare. Se navighează din trei locuri —
 * registrul de ecrane, acțiunile liniei de timp, semnalele de atenție — iar o
 * gardă pusă pe unul singur ar fi o gardă cu trei sferturi de gaură.
 */

type AdresaAdmin = { ecran: EcranAdmin; parametri: string[] };

const fragment = ({ ecran, parametri }: AdresaAdmin) =>
  `#${[ecran, ...parametri.map(encodeURIComponent)].join('/')}`;

const dinHash = (hash: string): AdresaAdmin | null => {
  const [cheie, ...parti] = hash.replace(/^#/, '').split('/');
  if (!esteEcran(cheie)) return null;
  try { return { ecran: cheie, parametri: parti.map(decodeURIComponent) }; }
  catch { return null; }
};

export const useEcranCurent = (implicit: EcranAdmin) => {
  const [adresa, setAdresa] = useState<AdresaAdmin>(
    () => dinHash(window.location.hash) ?? { ecran: implicit, parametri: [] }
  );
  const gardaIesire = useRef<(() => boolean) | null>(null);
  const adresaRef = useRef(adresa);
  useEffect(() => { adresaRef.current = adresa; }, [adresa]);

  const schimba = useCallback((ecran: EcranAdmin, parametri: string[] = []) => {
    const urmatoare = { ecran, parametri };
    if (fragment(urmatoare) === fragment(adresaRef.current)) return;
    if (gardaIesire.current && !gardaIesire.current()) return;
    const eraFoaie = adresaRef.current.ecran === 'prog-azi' && !!adresaRef.current.parametri[1];
    // Scrierea sincronă îi permite foii să înlocuiască selecția curentă fără
    // să ajungă înaintea efectului care ar fi creat intrarea inițială.
    window.location.hash = fragment(urmatoare);
    if (ecran === 'prog-azi' && parametri[1] && !eraFoaie) {
      window.history.replaceState({ ...window.history.state,
        programareFoaie: { data: parametri[0], atribuire: parametri[3] },
      }, '', window.location.href);
    }
    adresaRef.current = urmatoare;
    setAdresa(urmatoare);
  }, []);

  const inregistreazaGardaIesire = useCallback((garda: (() => boolean) | null) => {
    gardaIesire.current = garda;
  }, []);

  // Fiecare dată sau bloc deschis lasă un pas în istoricul browserului.
  useEffect(() => {
    const hash = fragment(adresa);
    if (window.location.hash !== hash) window.location.hash = hash;
  }, [adresa]);

  useEffect(() => {
    const laSchimbare = () => {
      const ceruta = dinHash(window.location.hash);
      const curenta = adresaRef.current;
      if (ceruta === null || fragment(ceruta) === fragment(curenta)) return;
      if (gardaIesire.current && !gardaIesire.current()) {
        window.location.hash = fragment(curenta);
        return;
      }
      adresaRef.current = ceruta;
      setAdresa(ceruta);
    };
    window.addEventListener('hashchange', laSchimbare);
    return () => window.removeEventListener('hashchange', laSchimbare);
  }, []);

  return { ...adresa, schimba, inregistreazaGardaIesire };
};

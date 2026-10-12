import { useEffect, useRef, useState } from 'react';
import { HOMEPAGE_IMPLICIT, loadPublicHomepage, type PublicHomepage } from './homepagePublic';

/** Cât așteaptă pagina după setare înainte să afișeze cu implicitul. */
const ASTEPTARE_MS = 2000;

/**
 * Ordinea de pe ecranul dintre ediții și locul antrenamentelor. Până răspunde
 * serverul, și când nu răspunde deloc (migrare neaplicată, rețea), rămâne
 * implicitul. `enabled: false` nu face nicio cerere — Coming Soon-ul de dinainte
 * de anunț n-are nevoie de ele.
 *
 * `gata` spune dacă răspunsul (sau eșecul) a sosit. Homepage-ul așteaptă după el
 * ca un bloc să nu apară într-un loc și apoi să sară în celălalt.
 *
 * Dacă limita trece înaintea răspunsului, pagina s-a așezat deja cu ordinea
 * implicită: un răspuns întârziat mai aduce doar locul, nu și ordinea, ca un
 * card pe care vizitatorul îl citește să nu se mute de sub ochii lui.
 */
export function usePublicHomepage(enabled = true): PublicHomepage & { gata: boolean } {
  const [homepage, setHomepage] = useState<PublicHomepage>(HOMEPAGE_IMPLICIT);
  const [gata, setGata] = useState(false);
  const dupaLimita = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const control = new AbortController();
    dupaLimita.current = false;
    // O cerere care atârnă nu are voie să țină cardul ascuns: după ASTEPTARE_MS
    // pagina merge mai departe cu ce știe (implicitul, dacă n-a sosit nimic).
    const limita = window.setTimeout(() => {
      dupaLimita.current = true;
      setGata(true);
    }, ASTEPTARE_MS);
    void loadPublicHomepage(control.signal)
      .then((nou) =>
        setHomepage((vechi) =>
          dupaLimita.current ? { ...vechi, trainingLocation: nou.trainingLocation } : nou
        )
      )
      .catch(() => {})
      .finally(() => {
        if (!control.signal.aborted) setGata(true);
      });
    return () => {
      window.clearTimeout(limita);
      control.abort();
    };
  }, [enabled]);
  return { ...homepage, gata };
}

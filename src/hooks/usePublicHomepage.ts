import { useEffect, useState } from 'react';
import { HOMEPAGE_IMPLICIT, loadPublicHomepage, type PublicHomepage } from '../lib/homepagePublic';

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
 */
export function usePublicHomepage(enabled = true): PublicHomepage & { gata: boolean } {
  const [homepage, setHomepage] = useState<PublicHomepage>(HOMEPAGE_IMPLICIT);
  const [gata, setGata] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const control = new AbortController();
    // O cerere care atârnă nu are voie să țină cardul ascuns: după ASTEPTARE_MS
    // pagina merge mai departe cu ce știe (implicitul, dacă n-a sosit nimic).
    const limita = window.setTimeout(() => setGata(true), ASTEPTARE_MS);
    void loadPublicHomepage(control.signal)
      .then(setHomepage)
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

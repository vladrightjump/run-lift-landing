/**
 * Filtrul cu care se deschide „Următorul" (R10): o atingere pe „Fără răspuns"
 * din Acum duce direct la lista acelor oameni.
 *
 * Trece prin `sessionStorage`, nu prin adresă: adresa e cheia ecranului
 * (`#grup-prezente`), iar un filtru lipit de ea ar rămâne aplicat la fiecare
 * Back. Se consumă o dată, la deschidere.
 */

export type FiltruUrmatorul = 'toti' | 'vin' | 'nu' | 'fara';

const CHEIE = 'admin.filtruUrmatorul';

export const cereFiltruUrmatorul = (f: FiltruUrmatorul) => {
  try {
    sessionStorage.setItem(CHEIE, f);
  } catch {
    // Fără stocare (mod privat), ecranul se deschide nefiltrat.
  }
};

/**
 * Doar citește: starea ecranului îl ia la inițializare, care trebuie să fie
 * pură (React o poate chema de două ori). Ștergerea e separată, mai jos.
 */
export const citesteFiltruUrmatorul = (): FiltruUrmatorul | null => {
  try {
    const f = sessionStorage.getItem(CHEIE);
    return f === 'vin' || f === 'nu' || f === 'fara' || f === 'toti' ? f : null;
  } catch {
    return null;
  }
};

/** Odată deschis ecranul, cererea s-a onorat; un Back nu o mai moștenește. */
export const uitaFiltruUrmatorul = () => {
  try {
    sessionStorage.removeItem(CHEIE);
  } catch {
    // Fără stocare n-avem ce uita.
  }
};

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

export const iaFiltruUrmatorul = (): FiltruUrmatorul | null => {
  try {
    const f = sessionStorage.getItem(CHEIE);
    sessionStorage.removeItem(CHEIE);
    return f === 'vin' || f === 'nu' || f === 'fara' || f === 'toti' ? f : null;
  } catch {
    return null;
  }
};

import type { SalaComanda } from '../../lib/salaApi';

/**
 * Răspunde botul? (R14, KTD12)
 *
 * Adminul nu vorbește cu botul; îi lasă comenzi în coadă, iar botul le golește
 * la fiecare minut. O comandă care stă în așteptare mult peste minut e deci
 * semnul că botul nu rulează — fără să schimbăm nimic în bot.
 *
 * Invers nu ține: cu coada goală nu știm dacă botul rulează, doar că nimic nu
 * e blocat. De aceea starea „normală" poartă și momentul ultimei comenzi
 * executate — singura dovadă de viață pe care o avem fără un semnal din bot.
 */

/** Trei minute: botul are un tic pe minut, deci trei ratate la rând nu sunt întâmplare. */
const PRAG_NERASPUNS_MS = 3 * 60_000;

export type StareBot =
  | { tip: 'oprit' }
  | { tip: 'nu-raspunde'; comanda: SalaComanda; minute: number }
  | { tip: 'normal'; ultimaExecutata: string | null };

export const stareBot = (pornit: boolean | null, comenzi: SalaComanda[], acum: Date): StareBot => {
  // Coada se golește și cu botul oprit din setări — comutatorul suspendă doar
  // sondajele programate. Deci o comandă blocată înseamnă că procesul nu rulează,
  // oricare ar fi starea comutatorului.
  const blocata = comenzi
    .filter((c) => c.status === 'pending')
    .map((c) => ({ c, varsta: acum.getTime() - Date.parse(c.created_at) }))
    .filter((x) => x.varsta > PRAG_NERASPUNS_MS)
    .sort((a, b) => b.varsta - a.varsta)[0];
  if (blocata) {
    return { tip: 'nu-raspunde', comanda: blocata.c, minute: Math.floor(blocata.varsta / 60_000) };
  }
  if (pornit === false) return { tip: 'oprit' };
  const ultimaExecutata =
    comenzi
      .map((c) => c.processed_at)
      .filter((t): t is string => t !== null)
      .sort()
      .at(-1) ?? null;
  return { tip: 'normal', ultimaExecutata };
};

import type { EventConfig } from '../../content/eventConfig';

/**
 * Are ciorna de pe ecran diferențe față de ultimul document scris pe server?
 *
 * De ce nu e destul `atinsa` (ref-ul care ține polling-ul la distanță): acela e
 * un flag de ATINGERE, nu de diferență. E `useRef`, deci nu re-randează nimic —
 * o bară care spune „nesalvat" n-ar afla niciodată că trebuie să se aprindă.
 * Iar „am tastat o cifră și am șters-o" l-ar lăsa aprins pe veci, adică ar cere
 * o confirmare la fiecare ieșire din tab. O confirmare care apare mereu e o
 * confirmare pe care o închizi fără s-o citești — exact apărarea pe care o
 * construim aici.
 *
 * Comparația e structurală, nu pe referință: ciorna se rescrie la fiecare
 * tastare (`{...c, [cheie]: valoare}`), deci referințele diferă întotdeauna.
 */

/**
 * Forma canonică a documentului: chei de obiect sortate, ordinea listelor
 * păstrată.
 *
 * Cheile se sortează pentru că ordinea lor nu e informație — un `{...publicat,
 * number}` pune `number` la sfârșit, iar un document venit din DB îl are la
 * început; sînt același document. Ordinea LISTELOR e informație (ordinea
 * secțiunilor e chiar ordinea de pe pagină), deci nu se atinge.
 */
const canonic = (valoare: unknown): unknown => {
  if (Array.isArray(valoare)) return valoare.map(canonic);
  if (valoare && typeof valoare === 'object') {
    const intrari = Object.entries(valoare as Record<string, unknown>)
      // `undefined` și lipsa cheii sînt același lucru pentru documentul salvat:
      // `JSON.stringify` le scoate oricum la scriere, deci nu pot fi o diferență.
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(intrari.map(([cheie, v]) => [cheie, canonic(v)]));
  }
  return valoare;
};

/**
 * `true` dacă ciorna de pe ecran nu e (încă) documentul de pe server.
 *
 * `salvat` e ce s-a încărcat de pe server sau ce tocmai s-a scris acolo.
 * `null` NU înseamnă „fără diferențe": înseamnă că documentul ăsta n-a ajuns
 * niciodată pe server — o ciornă construită din dialogul de ediție nouă sau
 * pornită din ediția publicată trăiește doar în browser, deci e chiar starea
 * cea mai ușor de pierdut și cea mai scump de refăcut.
 */
export const esteNesalvat = (
  salvat: EventConfig | null,
  ciorna: EventConfig | null
): boolean => {
  if (ciorna === null) return false;
  if (salvat === null) return true;
  return JSON.stringify(canonic(salvat)) !== JSON.stringify(canonic(ciorna));
};

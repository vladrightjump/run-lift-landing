import { formatRoDate, timeOf, weekdayRo } from '../content/format';
import type { CampInvalid } from './eventConfigForm';

/**
 * Traducerile dintre forma în care documentul de config ține datele și forma
 * pe care o cer controalele native de browser — plus ecoul în limbaj natural
 * de sub fiecare câmp.
 *
 * De ce modul separat: tabul „Eveniment" cerea până acum datele scrise de mână
 * ca „2026-08-22T07:00:00". Organizatorul n-are de unde ști formatul, iar o
 * greșeală se vedea abia la „Publică". Un `<input type="datetime-local">` nu
 * poate greși formatul — dar vorbește alt dialect (`YYYY-MM-DDTHH:mm`, fără
 * secunde), deci traducerea trebuie făcută undeva. Aici, ca funcții pure,
 * testabile fără randare.
 */

/** „2026-08-22T07:00:00" — local, fără fus. Aceeași regulă ca la validare. */
const LOCAL_ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

/**
 * Config → `<input type="datetime-local">`. Controlul acceptă și secundele,
 * dar le afișează ca al treilea câmp editabil, care n-are ce căuta acolo:
 * nicio ediție nu începe la 07:00:30.
 *
 * O valoare pe care n-o recunoaștem (document vechi, editat manual în DB) se
 * întoarce goală, ca inputul să nu arate o dată inventată. Câmpul rămâne gol
 * și validarea îl semnalează.
 */
export const laDatetimeLocal = (localIso: string): string =>
  LOCAL_ISO_RE.test(localIso) ? localIso.slice(0, 16) : '';

/**
 * `<input type="datetime-local">` → config. Golirea inputului nu poate produce
 * un ISO valid, deci întoarcem stringul gol: validarea îl prinde și spune de ce,
 * în loc să scriem în tăcere ceva plauzibil dar greșit.
 */
export const dinDatetimeLocal = (valoare: string): string =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valoare) ? `${valoare}:00` : valoare;

/** Distanțele pe care le rotunjim, de la an în jos. */
const UNITATI: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3_600_000],
  ['month', 30 * 24 * 3_600_000],
  ['week', 7 * 24 * 3_600_000],
  ['day', 24 * 3_600_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

const relativ = new Intl.RelativeTimeFormat('ro', { numeric: 'auto' });

/**
 * „peste 3 luni" / „acum 2 zile", pornind de la un moment local + fus.
 *
 * `acum` e parametru, nu `Date.now()`: altfel funcția n-ar fi pură și testul ar
 * depinde de ziua în care rulează.
 */
export const distantaFataDeAcum = (localIso: string, tz: string, acum: number): string => {
  const t = new Date(`${localIso}${tz}`).getTime();
  if (!Number.isFinite(t)) return '';
  const delta = t - acum;
  for (const [unitate, ms] of UNITATI) {
    if (Math.abs(delta) >= ms) return relativ.format(Math.round(delta / ms), unitate);
  }
  return 'chiar acum';
};

/**
 * Ecoul de sub un câmp de dată: „sâmbătă, 22 august 2026, ora 07:00 · peste 3 luni".
 *
 * Rostul lui e să confirme că ce a ales organizatorul chiar înseamnă ce crede
 * el — ziua săptămânii mai ales. O cursă mutată din greșeală de sâmbătă pe
 * duminică arată identic într-un calendar, dar nu și scrisă cu litere.
 */
export const descrieMoment = (localIso: string, tz: string, acum: number): string => {
  if (!LOCAL_ISO_RE.test(localIso)) return '';
  const cand = `${weekdayRo(localIso)}, ${formatRoDate(localIso)}, ora ${timeOf(localIso)}`;
  const cat = distantaFataDeAcum(localIso, tz, acum);
  return cat ? `${cand} · ${cat}` : cand;
};

/**
 * Problemele indexate pe câmp, ca formularul să le poată arăta LÂNGĂ inputul
 * vinovat, nu doar strânse într-un banner deasupra. Bannerul rămâne — e util
 * când greșeala e sub fold — dar singur însemna că trebuie să ghicești care
 * dintre cele optsprezece câmpuri e cel reclamat.
 */
export const problemePeCamp = (probleme: CampInvalid[]): Map<string, string> => {
  const m = new Map<string, string>();
  // Primul mesaj per câmp: două reguli pot cădea pe același câmp (format + relație),
  // iar cea de format vine prima și e cea care trebuie reparată întâi.
  for (const p of probleme) if (!m.has(p.camp)) m.set(p.camp, p.mesaj);
  return m;
};

/** Linkul spre Google Maps pentru o pereche „lat,lng" — verificare cu un click. */
export const linkHarta = (mapQuery: string): string | null =>
  /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(mapQuery)
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : null;

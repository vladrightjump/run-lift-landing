import type { EventConfig, ReminderEntry, SectionLayoutEntry } from '../../content/eventConfig';
import { candScurt, durataRo } from '../reperele';
import { ETICHETE_SABLOANE } from './ajutoare';

/**
 * Ce se schimbă pe site dacă apeși „Publică" — câmp cu câmp, față de documentul
 * publicat acum.
 *
 * Confirmarea spunea până acum doar CONSECINȚA („vizitatorii vor vedea
 * landing-ul cu înscrieri"), niciodată DIFERENȚA. Singurul click ireversibil
 * din tot backoffice-ul era și singurul fără o listă sub el.
 *
 * De ce nu un diff generic pe JSON: ar fi produs „slots.occupiedFallback: 0 →
 * 3" și „layout[2].visible: true → false" — corecte și necitibile. Aici
 * documentul se aplatizează în perechi etichetă/valoare cu ACELEAȘI etichete și
 * aceiași formatori ca formularul, deci diferența se citește în limba în care
 * s-a editat.
 */

export type Diferenta = {
  eticheta: string;
  inainte: string;
  acum: string;
};

/** Momentul, scris cum îl scrie formularul; forma brută dacă nu-l recunoaștem. */
const moment = (localIso: string): string => candScurt(localIso) || localIso || '—';

const ore = (h: number): string => (Number.isFinite(h) ? durataRo(h * 3_600_000) : String(h));

/**
 * Secțiunile, ca o singură linie: ordinea E informația, iar o diferență per
 * secțiune ar fi umplut lista cu cinci rânduri la orice mutare.
 */
const sectiuni = (layout: SectionLayoutEntry[], etichete: Record<string, string>): string =>
  layout
    .map((s) => (s.visible ? etichete[s.key] ?? s.key : `(${etichete[s.key] ?? s.key})`))
    .join(' · ') || '—';

/** Reminderele, în ordinea în care pleacă. Oprite în paranteze. */
const remindere = (lista: ReminderEntry[]): string => {
  if (lista.length === 0) return 'niciunul';
  return [...lista]
    .sort((a, b) => b.offsetHours - a.offsetHours)
    .map((r) => {
      const text = `${r.offsetHours}h · ${ETICHETE_SABLOANE[r.template] ?? r.template}`;
      return r.enabled ? text : `(${text})`;
    })
    .join(' · ');
};

/** Clipurile, în ordinea din bandă — codul e singurul lucru care le identifică. */
const clipuri = (c: EventConfig): string =>
  c.reels.items.length === 0
    ? 'niciunul'
    : c.reels.items.map((r) => r.code || '(gol)').join(' · ');

/**
 * Documentul, aplatizat în perechi citibile.
 *
 * Ordinea e a formularului („Ediția", „Când", „Unde", „Locuri", „Remindere",
 * „Ce arată pagina", „Instagram"), nu a tipului TypeScript: lista se citește
 * lângă ecranul pe care s-a editat.
 */
const aplatizeaza = (
  c: EventConfig,
  etichete: Record<string, string>
): [string, string][] => [
  ['Numărul ediției', String(c.number)],
  ['Ediția de lansare', String(c.launchNumber)],
  ['Numele evenimentului', c.eventName],
  ['Concept', c.concept],
  ['Startul cursei', moment(c.start)],
  ['Durata', ore(c.durationHours)],
  ['Check-in de la', c.checkinFrom],
  ['Se închid înscrierile', moment(c.registrationDeadline)],
  ['Se anunță ediția', moment(c.launchAt)],
  ['Următorul antrenament', moment(c.nextEditionAt)],
  ['„Cine vine" apare cu', c.leaderboardLeadHours === 0 ? 'exact la start' : `${ore(c.leaderboardLeadHours)} înainte`],
  ['Fusul orar', c.tz],
  ['Numele locului', c.venue.name],
  ['Orașul sau zona', c.venue.city],
  ['Coordonatele', c.venue.mapQuery],
  ['Zoom-ul hărții', String(c.venue.zoom)],
  ['Locuri disponibile', String(c.slots.total)],
  ['Lista de așteptare', String(c.slots.waitlist)],
  ['Ocupate (valoare de rezervă)', String(c.slots.occupiedFallback)],
  ['Remindere', remindere(c.reminders)],
  ['Homepage-ul arată', c.showComingSoon ? 'Coming Soon' : 'Landing, cu înscrieri'],
  ['Secțiunile paginii', sectiuni(c.layout, etichete)],
  ['Titlul secțiunii Instagram', c.reels.headline],
  ['Textul de lângă bandă', c.reels.body],
  ['Clipurile din bandă', clipuri(c)],
  ['Ordinal scris manual', c.ordinalOverride ? c.ordinalOverride : 'derivat automat'],
];

/**
 * Diferențele dintre ciornă și documentul publicat. Un câmp neschimbat nu apare.
 *
 * `publicat === null` → listă goală: nu există versiune anterioară, iar o listă
 * în care TOT documentul apare ca „schimbat" n-ar spune nimic. Apelantul face
 * diferența dintre „nimic nu se schimbă" și „nu există cu ce compara" — vezi
 * `esteComparabil`.
 */
export const diferenteFataDePublicat = (
  publicat: EventConfig | null,
  ciorna: EventConfig,
  etichete: Record<string, string>
): Diferenta[] => {
  if (!esteComparabil(publicat, ciorna)) return [];
  const vechi = aplatizeaza(publicat as EventConfig, etichete);
  const nou = aplatizeaza(ciorna, etichete);
  const rezultat: Diferenta[] = [];
  for (let i = 0; i < nou.length; i++) {
    const [eticheta, acum] = nou[i];
    const inainte = vechi[i][1];
    if (inainte !== acum) rezultat.push({ eticheta, inainte, acum });
  }
  return rezultat;
};

/**
 * Se poate compara ciorna cu documentul publicat?
 *
 * Nu, când nu există niciunul publicat, și nu când ciorna e a ALTEI ediții:
 * atunci nu e o modificare a ediției de pe site, e o ediție nouă, iar fiecare
 * câmp diferit ar apărea ca „schimbat" — o listă de douăzeci de rânduri care nu
 * ajută pe nimeni să verifice nimic.
 */
export const esteComparabil = (
  publicat: EventConfig | null,
  ciorna: EventConfig
): boolean => publicat !== null && publicat.number === ciorna.number;

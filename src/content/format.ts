/**
 * Derivate din `EDITION` — string-urile DEPENDENTE de ediție/dată, calculate
 * într-un singur loc. Componentele și testele importă de aici, ca să nu mai
 * existe „8 august"/„a patra"/„06:30" scrise de mână prin cod.
 *
 * Proza statică (descrieri RUN/LIFT/REPEAT, valori) NU stă aici — rămâne în
 * componente. Aici e doar ce se schimbă de la o ediție la alta.
 *
 * Datele se derivă din componentele calendaristice ale string-ului local
 * (`EDITION.start` etc.), NU din `Date` + fusul mașinii — ca ziua/ziua-săptămânii
 * să fie deterministe indiferent de fusul pe care rulează build-ul/testul.
 */
import { EDITION } from './edition';

const MONTHS_RO = [
  'ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie',
  'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie',
] as const;

const WEEKDAYS_RO = [
  'duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă',
] as const;

const ORDINALS_RO: Record<number, string> = {
  1: 'întâi', 2: 'a doua', 3: 'a treia', 4: 'a patra', 5: 'a cincea',
  6: 'a șasea', 7: 'a șaptea', 8: 'a opta', 9: 'a noua', 10: 'a zecea',
  11: 'a unsprezecea', 12: 'a douăsprezecea',
};

/** Componentele calendaristice dintr-un string local `YYYY-MM-DDTHH:mm:ss`. */
const parts = (localIso: string) => {
  const [date, time = '00:00'] = localIso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, hm: time.slice(0, 5) };
};

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Ordinalul feminin RO al ediției („a patra"), cu override opțional din EDITION. */
export const ordinal = (n: number): string =>
  EDITION.ordinalOverride ?? ORDINALS_RO[n] ?? `a ${n}-a`;

/** „8 august 2026". */
export const formatRoDate = (localIso: string): string => {
  const { y, m, d } = parts(localIso);
  return `${d} ${MONTHS_RO[m - 1]} ${y}`;
};

/** „8 august" (fără an). */
export const dayMonth = (localIso: string): string => {
  const { m, d } = parts(localIso);
  return `${d} ${MONTHS_RO[m - 1]}`;
};

/** Ora locală „06:30". */
export const timeOf = (localIso: string): string => parts(localIso).hm;

/** Ziua săptămânii în RO, deterministă („sâmbătă"); `caps` → „Sâmbătă". */
export const weekdayRo = (localIso: string, caps = false): string => {
  const { y, m, d } = parts(localIso);
  const name = WEEKDAYS_RO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return caps ? cap(name) : name;
};

// --- String-uri derivate, gata de folosit în UI -----------------------------

/** „a patra" pentru ediția curentă (ex. „Ediția a patra"). */
export const EDITION_ORDINAL = ordinal(EDITION.number);
export const LAUNCH_EDITION_ORDINAL = ordinal(EDITION.launchNumber);

/** „8 august 2026 · Parcul Râșcani". */
export const EVENT_META = `${formatRoDate(EDITION.start)} · ${EDITION.venue.name}`;

/** „Sâmbătă, 8 august 2026 · Parcul Râșcani, Chișinău · Outdoor Adaptive". */
export const HERO_KICKER = `${weekdayRo(EDITION.start, true)}, ${formatRoDate(EDITION.start)} · ${EDITION.venue.name}, ${EDITION.venue.city} · ${EDITION.concept}`;

/** „Sâmbătă, 8 august 2026" (rândul „Când" din Locație). */
export const EVENT_WHEN = `${weekdayRo(EDITION.start, true)}, ${formatRoDate(EDITION.start)}`;

/** „Parcul Râșcani, Chișinău" (rândul „Unde"). */
export const EVENT_WHERE = `${EDITION.venue.name}, ${EDITION.venue.city}`;

/** „06:30" (rândul „Start" + ora din copy). */
export const EVENT_START_TIME = timeOf(EDITION.start);

/** Prima linie din „Pe scurt": „Sâmbătă, 8 august 2026, ora 06:30 — Parcul Râșcani, Chișinău". */
export const EVENT_SUMMARY_LINE = `${EVENT_WHEN}, ora ${EVENT_START_TIME} — ${EVENT_WHERE}`;

/** Mesajul de succes: „Ne vedem pe 8 august la start, ora 06:30." */
export const SUCCESS_SEE_YOU = `Ne vedem pe ${dayMonth(EDITION.start)} la start, ora ${EVENT_START_TIME}.`;

/** Badge-ul emailurilor („Hyrox Trial · 8 august"). Sursa la runtime e DB (event_badge);
 *  aici e doar valoarea derivată, pt. seed/sync și teste. */
export const EVENT_BADGE = `${EDITION.eventName} · ${dayMonth(EDITION.start)}`;

/** Google Maps: embed + link de direcții (aceeași căutare). */
export const MAP_EMBED_SRC = `https://maps.google.com/maps?q=${EDITION.venue.mapQuery}&z=16&hl=ro&output=embed`;
export const MAP_DIRECTIONS_URL = `https://www.google.com/maps/search/?api=1&query=${EDITION.venue.mapQuery}`;

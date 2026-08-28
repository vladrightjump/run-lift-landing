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
import { EDITION, type Place } from './edition';
import type { EventConfig } from './eventConfig';

/**
 * Derivatele unui loc — rândul „Unde", embed-ul de hartă și linkul de direcții —
 * calculate ÎNTR-UN SINGUR LOC, pentru orice `Place`.
 *
 * Ăsta e antidotul la bug-ul care a mutat antrenamentele odată cu cursa:
 * cât timp fiecare loc își avea propria copie a șabloanelor, sursa greșită se
 * putea strecura într-una din ele fără să sară în ochi. Acum există un singur
 * șablon, iar alegerea locului e argumentul de mai jos — la vedere.
 */
const placeStrings = (p: Place) => ({
  /** „Teren Sportiv, Parcul Râșcani" sau, fără reper, „Scările de Granit, Valea Morilor". */
  where: `${p.name}, ${p.landmark ?? p.city}`,
  embedSrc: `https://maps.google.com/maps?q=${p.mapQuery}&z=${p.zoom}&hl=ro&output=embed`,
  directionsUrl: `https://www.google.com/maps/search/?api=1&query=${p.mapQuery}`,
});

/**
 * Locul ANTRENAMENTELOR — fix, deci rămâne constantă de modul. Locul CURSEI nu
 * mai are pereche aici: se derivă din configul activ, în `deriveEventStrings`.
 */
const TRAINING_PLACE = placeStrings(EDITION.training.place);

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

/** Ordinalul feminin RO al ediției („a patra"), cu override opțional din config. */
export const ordinal = (n: number, override?: string | null): string =>
  override ?? ORDINALS_RO[n] ?? `a ${n}-a`;

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
//
// FUNCȚIE, nu constante de modul. Până la mutarea configului în DB, valorile de
// mai jos se calculau o dată, la import, din `EDITION` înghețat — exact motivul
// pentru care ediția nu putea fi schimbată fără redeploy.
//
// Componentele NU apelează funcția asta direct: iau valorile din `useEditionStrings()`,
// care le derivă din configul activ. Apelul direct rămâne pentru locurile care
// TREBUIE să folosească instantaneul de build: meta de share (`content/meta.ts`,
// injectată în HTML la build, pentru că scraper-ele nu rulează JS) și teste.

export type EventStrings = {
  EDITION_ORDINAL: string;
  LAUNCH_EDITION_ORDINAL: string;
  EVENT_META: string;
  HERO_KICKER: string;
  EVENT_WHEN: string;
  EVENT_WHERE: string;
  EVENT_START_TIME: string;
  EVENT_SUMMARY_LINE: string;
  SUCCESS_SEE_YOU: string;
  EVENT_BADGE: string;
  MAP_EMBED_SRC: string;
  MAP_DIRECTIONS_URL: string;
};

/** Toate string-urile dependente de ediție, derivate dintr-un singur config. */
export const deriveEventStrings = (config: EventConfig): EventStrings => {
  const place = placeStrings(config.venue);
  const when = `${weekdayRo(config.start, true)}, ${formatRoDate(config.start)}`;
  const startTime = timeOf(config.start);

  return {
    /** „a patra" pentru ediția curentă (ex. „Ediția a patra"). */
    EDITION_ORDINAL: ordinal(config.number, config.ordinalOverride),
    LAUNCH_EDITION_ORDINAL: ordinal(config.launchNumber, config.ordinalOverride),

    /** „22 august 2026 · Scările de Granit". */
    EVENT_META: `${formatRoDate(config.start)} · ${config.venue.name}`,

    /** „Sâmbătă, 22 august 2026 · Scările de Granit, Valea Morilor · Outdoor Adaptive". */
    HERO_KICKER: `${when} · ${place.where} · ${config.concept}`,

    /** „Sâmbătă, 22 august 2026" (rândul „Când" din Locație). */
    EVENT_WHEN: when,

    /** „Scările de Granit, Valea Morilor" (rândul „Unde"). Sursa unică a locului cursei. */
    EVENT_WHERE: place.where,

    /** „07:00" (rândul „Start" + ora din copy). */
    EVENT_START_TIME: startTime,

    /** Prima linie din „Pe scurt". */
    EVENT_SUMMARY_LINE: `${when}, ora ${startTime} — ${place.where}`,

    /** Mesajul de succes: „Ne vedem pe 22 august la start, ora 07:00." */
    SUCCESS_SEE_YOU: `Ne vedem pe ${dayMonth(config.start)} la start, ora ${startTime}.`,

    /** Badge-ul emailurilor („Hyrox Trial · 22 august"). Sursa la runtime e DB
     *  (`event_badge`); aici e doar valoarea derivată, pt. seed și teste. */
    EVENT_BADGE: `${config.eventName} · ${dayMonth(config.start)}`,

    /** Google Maps pentru locul CURSEI: embed + link de direcții. */
    MAP_EMBED_SRC: place.embedSrc,
    MAP_DIRECTIONS_URL: place.directionsUrl,
  };
};

// --- Antrenamentele săptămânale --------------------------------------------
// Separate de cursă: antrenamentele sunt mereu în același parc, evenimentele se
// mută. `/despre-noi` folosește EXCLUSIV constantele de mai jos.

/** „Teren Sportiv, Parcul Râșcani" (rândul „Unde" din „Unde ne antrenăm"). */
export const TRAINING_WHERE = TRAINING_PLACE.where;

/** Google Maps pentru locul ANTRENAMENTELOR: embed + link de direcții. */
export const TRAINING_MAP_EMBED_SRC = TRAINING_PLACE.embedSrc;
export const TRAINING_MAP_DIRECTIONS_URL = TRAINING_PLACE.directionsUrl;

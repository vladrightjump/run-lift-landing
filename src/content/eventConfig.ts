/**
 * Forma documentului de configurare a ediției — contractul dintre DB, admin și
 * pagina publică.
 *
 * SURSA DE ADEVĂR e rândul `published` din `runlift.event_config`, citit la
 * runtime prin `public_config()`. `src/content/edition.ts` a rămas INSTANTANEU
 * de build: randează primul cadru și acoperă cazul „backendul nu răspunde".
 *
 * Ce NU stă aici (rămâne în cod, pentru că nu se schimbă de la o ediție la alta):
 * locul antrenamentelor, URL-urile site-ului, brandul și `ogImageVersion` — acela
 * hrănește meta de share, care e injectată la build (vezi `content/meta.ts`).
 *
 * Datele/orele se scriu FĂRĂ offset și se compun cu `tz`, exact ca înainte.
 */
import { EDITION, type Place } from './edition';

/** Secțiunile pe care organizatorul le poate ascunde și reordona. */
export const SECTION_KEYS = ['format', 'venue', 'registration', 'participants', 'reels'] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

/**
 * Un clip de pe Instagram, așa cum îl ține documentul.
 *
 * Ținem CODUL, nu URL-ul întreg: din cod se derivă și adresa de embed, și cea
 * canonică, iar un URL lipit cu query string (`?igsh=…`) n-are cum să otrăvească
 * `src`-ul unui iframe. Extragerea codului dintr-un link lipit se face în admin
 * (`parseInstagramUrl`), ca organizatorul să nu fie pus să citească URL-uri.
 */
export type ReelEntry = {
  /** Codul din URL: `/reel/<code>/` sau `/p/<code>/`. */
  code: string;
  /** Decide forma URL-ului. Instagram nu servește un reel pe ruta `/p/`. */
  kind: 'reel' | 'p';
  /** Poster local („/reels/x.jpg"). Gol → cardul cade pe fallback-ul desenat. */
  poster: string;
  /** O linie sub card. Gol e permis. */
  caption: string;
};

export type ReelsConfig = {
  headline: string;
  body: string;
  items: ReelEntry[];
};

/** Plafon de intrări. Peste atât, banda nu mai e o selecție, ci un feed. */
export const MAX_REELS = 12;

/** Textele implicite ale secțiunii, când documentul nu le poartă. */
export const DEFAULT_REELS: ReelsConfig = {
  headline: 'Instagram',
  body: '',
  items: [],
};

export type SectionLayoutEntry = {
  key: SectionKey;
  visible: boolean;
};

/** Locul cursei, așa cum vine din document (fără `landmark` — cursa n-are). */
export type VenueConfig = Pick<Place, 'name' | 'city' | 'mapQuery' | 'zoom'>;

export type EventConfig = {
  number: number;
  launchNumber: number;
  eventName: string;
  concept: string;
  /** Override opțional pentru ordinal; `null` din DB, `undefined` din cod. */
  ordinalOverride?: string | null;
  tz: string;
  start: string;
  durationHours: number;
  checkinFrom: string;
  registrationDeadline: string;
  launchAt: string;
  showComingSoon: boolean;
  leaderboardLeadHours: number;
  nextEditionAt: string;
  venue: VenueConfig;
  slots: {
    total: number;
    waitlist: number;
    occupiedFallback: number;
  };
  layout: SectionLayoutEntry[];
  reels: ReelsConfig;
};

/** Ordinea implicită — folosită când documentul n-are `layout` sau e gol. */
export const DEFAULT_LAYOUT: SectionLayoutEntry[] = SECTION_KEYS.map((key) => ({
  key,
  visible: true,
}));

/**
 * Instantaneul de build, derivat din `EDITION`. E valoarea de pornire a
 * contextului, deci primul cadru e complet și corect pentru ediția deployată —
 * nu există ecran de încărcare pe pagina publică.
 */
export const SNAPSHOT_CONFIG: EventConfig = {
  number: EDITION.number,
  launchNumber: EDITION.launchNumber,
  eventName: EDITION.eventName,
  concept: EDITION.concept,
  // `null`, nu `undefined`: documentele venite din DB au `null`, iar instantaneul
  // trebuie să aibă aceeași formă ca ele — altfel compararea ciornă/publicat și
  // amprenta de build ar raporta o diferență care nu există.
  ordinalOverride: EDITION.ordinalOverride ?? null,
  tz: EDITION.tz,
  start: EDITION.start,
  durationHours: EDITION.durationHours,
  checkinFrom: EDITION.checkinFrom,
  registrationDeadline: EDITION.registrationDeadline,
  launchAt: EDITION.launchAt,
  showComingSoon: EDITION.showComingSoon,
  leaderboardLeadHours: EDITION.leaderboardLeadHours,
  nextEditionAt: EDITION.nextEditionAt,
  venue: {
    name: EDITION.venue.name,
    city: EDITION.venue.city,
    mapQuery: EDITION.venue.mapQuery,
    zoom: EDITION.venue.zoom,
  },
  slots: {
    total: EDITION.slots.total,
    waitlist: EDITION.slots.waitlist,
    occupiedFallback: EDITION.slots.occupiedFallback,
  },
  layout: DEFAULT_LAYOUT,
  // `.map()`, nu referința direct: `EDITION` e `as const`, deci lista lui e
  // readonly, iar `ReelsConfig.items` e mutabilă. Copia rupe și legătura, ca
  // instantaneul să nu poată fi modificat prin `EDITION`.
  reels: {
    headline: EDITION.reels.headline,
    body: EDITION.reels.body,
    items: EDITION.reels.items.map((r) => ({ ...r })),
  },
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

/**
 * Codul unui clip, așa cum îl scrie Instagram: litere, cifre, `-` și `_`.
 * Îngust deliberat — codul ajunge în `src`-ul unui iframe, iar un `/` sau un `?`
 * strecurat acolo ar schimba adresa, nu doar clipul.
 */
const REEL_CODE_RE = /^[A-Za-z0-9_-]{5,32}$/;

/**
 * `reels` din document. Tolerant ca `layout`, din același motiv: un clip
 * stricat nu e un document care nu se poate randa. Intrarea invalidă cade,
 * restul secțiunii rămâne.
 */
const parseReels = (raw: unknown): ReelsConfig => {
  if (!isRecord(raw)) return { ...DEFAULT_REELS, items: [] };

  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  const items = itemsRaw
    .filter(
      (r): r is ReelEntry =>
        isRecord(r) &&
        typeof r.code === 'string' &&
        REEL_CODE_RE.test(r.code) &&
        (r.kind === 'reel' || r.kind === 'p') &&
        typeof r.poster === 'string' &&
        typeof r.caption === 'string'
    )
    .slice(0, MAX_REELS)
    .map((r) => ({ code: r.code, kind: r.kind, poster: r.poster, caption: r.caption }));

  return {
    headline: typeof raw.headline === 'string' ? raw.headline : DEFAULT_REELS.headline,
    body: typeof raw.body === 'string' ? raw.body : DEFAULT_REELS.body,
    items,
  };
};

/**
 * Poarta dintre „ce a venit pe rețea" și `EventConfig`.
 *
 * Întoarce `null` la orice document care nu se poate randa, iar apelantul rămâne
 * pe instantaneu. Un `null` e mai bun decât o pagină pe jumătate randată: cine
 * deschide site-ul vede ediția deployată, nu o ediție ciuntită.
 *
 * `layout` e singurul câmp tolerant: cheile necunoscute se ignoră (o secțiune
 * scoasă din cod nu trebuie să strice un document deja publicat), iar o listă
 * goală sau lipsă cade pe ordinea implicită.
 */
export const parseEventConfig = (raw: unknown): EventConfig | null => {
  if (!isRecord(raw)) return null;

  const str = (k: string): string | null =>
    typeof raw[k] === 'string' && raw[k] ? (raw[k] as string) : null;
  const num = (k: string): number | null =>
    typeof raw[k] === 'number' && Number.isFinite(raw[k]) ? (raw[k] as number) : null;

  const eventName = str('eventName');
  const concept = str('concept');
  const tz = str('tz');
  const start = str('start');
  const checkinFrom = str('checkinFrom');
  const registrationDeadline = str('registrationDeadline');
  const launchAt = str('launchAt');
  const nextEditionAt = str('nextEditionAt');
  const number = num('number');
  const launchNumber = num('launchNumber');
  const durationHours = num('durationHours');
  const leaderboardLeadHours = num('leaderboardLeadHours');

  if (
    eventName === null || concept === null || tz === null || start === null ||
    checkinFrom === null || registrationDeadline === null || launchAt === null ||
    nextEditionAt === null || number === null || launchNumber === null ||
    durationHours === null || leaderboardLeadHours === null ||
    typeof raw.showComingSoon !== 'boolean'
  ) {
    return null;
  }

  const venue = raw.venue;
  if (
    !isRecord(venue) || typeof venue.name !== 'string' || typeof venue.city !== 'string' ||
    typeof venue.mapQuery !== 'string' || typeof venue.zoom !== 'number'
  ) {
    return null;
  }

  const slots = raw.slots;
  if (
    !isRecord(slots) || typeof slots.total !== 'number' ||
    typeof slots.waitlist !== 'number' || typeof slots.occupiedFallback !== 'number'
  ) {
    return null;
  }

  const layoutRaw = Array.isArray(raw.layout) ? raw.layout : [];
  const layout = layoutRaw
    .filter(
      (s): s is { key: SectionKey; visible: boolean } =>
        isRecord(s) &&
        SECTION_KEYS.includes(s.key as SectionKey) &&
        typeof s.visible === 'boolean'
    )
    .map((s) => ({ key: s.key, visible: s.visible }));

  return {
    number,
    launchNumber,
    eventName,
    concept,
    ordinalOverride: typeof raw.ordinalOverride === 'string' ? raw.ordinalOverride : null,
    tz,
    start,
    durationHours,
    checkinFrom,
    registrationDeadline,
    launchAt,
    showComingSoon: raw.showComingSoon,
    leaderboardLeadHours,
    nextEditionAt,
    venue: {
      name: venue.name,
      city: venue.city,
      mapQuery: venue.mapQuery,
      zoom: venue.zoom,
    },
    slots: {
      total: slots.total,
      waitlist: slots.waitlist,
      occupiedFallback: slots.occupiedFallback,
    },
    layout: layout.length > 0 ? layout : DEFAULT_LAYOUT,
    reels: parseReels(raw.reels),
  };
};

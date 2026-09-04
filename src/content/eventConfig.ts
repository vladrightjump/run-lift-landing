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

/**
 * Un reminder programat înainte de start.
 *
 * De ce ține DOCUMENTUL orarul, și nu `app_config`: „cu 24 de ore înainte" n-are
 * niciun sens fără `start`, iar `start` trăiește aici. Ținute separat, ar fi
 * putut ajunge să descrie ediții diferite — exact clasa de desincronizare pe
 * care documentul a venit s-o închidă. Publicarea copiază orarul în
 * `app_config.reminder_schedule`, de unde îl citește cron-ul.
 */
export type ReminderEntry = {
  /** Cu câte ore înainte de `start` pleacă. Întreg pozitiv. */
  offsetHours: number;
  /** Oprit = rămâne în listă, dar nu pleacă. Ștergerea e altceva. */
  enabled: boolean;
  /** Cheia din `email_templates`. Fiecare reminder își poate avea textul lui. */
  template: ReminderTemplateKey;
};

/**
 * Șabloanele pe care le poate folosi un reminder.
 *
 * Listă închisă, nu text liber: cheia ajunge în apelul de broadcast, iar una
 * greșit tastată ar produce un email trimis pe textul de rezervă din cod — plecat,
 * deci ireparabil. Aceleași chei există în `email_templates` (vezi migrarea
 * `remindere-si-renuntare`).
 */
export const REMINDER_TEMPLATE_KEYS = [
  'bulk_participant_reminder',
  'bulk_participant_reminder_final',
] as const;

export type ReminderTemplateKey = (typeof REMINDER_TEMPLATE_KEYS)[number];

/**
 * Plafon de remindere per ediție. Peste atât nu mai e o reamintire, e spam —
 * iar fiecare email în plus e o ocazie de dezabonare.
 */
export const MAX_REMINDERS = 5;

/**
 * Cât timp după scadență mai are voie un reminder să plece (ore).
 *
 * Fereastra veche era [start − offset, start] întreagă, deci un reminder „cu 24h
 * înainte" putea pleca oricând în acele 24 de ore — inclusiv cu 20 de minute
 * înainte de start, dacă atunci s-a nimerit prima rulare de cron. Cu grația de
 * mai jos, ori pleacă aproape de ora promisă, ori nu mai pleacă deloc: un
 * reminder „de mâine" primit în drum spre cursă e mai rău decât niciunul.
 *
 * Trebuie să rămână mai mare decât intervalul cron-ului (15 min), altfel o
 * singură rulare ratată ar sări reminderul. Aceeași valoare e codificată în
 * `runlift.maybe_send_reminder()`.
 */
export const REMINDER_GRACE_HOURS = 2;

/**
 * Orarul implicit: un singur reminder, cu o zi înainte — exact comportamentul
 * dinaintea orarului configurabil. Un document fără cheia `reminders` (publicat
 * înainte de migrare) cade pe el, deci nimic nu se schimbă tăcut.
 */
export const DEFAULT_REMINDERS: ReminderEntry[] = [
  { offsetHours: 24, enabled: true, template: 'bulk_participant_reminder' },
];

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
  /** Reminderele automate dinaintea startului. Listă goală = niciunul. */
  reminders: ReminderEntry[];
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
  // Copie, nu referința: instantaneul nu trebuie să poată fi modificat prin
  // constanta partajată — același motiv ca la `reels.items`.
  reminders: DEFAULT_REMINDERS.map((r) => ({ ...r })),
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
  // Codurile deja văzute: al doilea exemplar al aceluiași clip cade.
  //
  // Validarea (și în client, și în `event_config_validate`) respinge deja
  // duplicatele, deci aici e apărare în adâncime — dar exact asta e treaba
  // funcției. Un duplicat scurs printr-o scriere directă în DB ar da două
  // carduri cu aceeași cheie React, iar `activ === r.code` ar porni clipul în
  // amândouă odată, dintr-un singur click.
  const vazute = new Set<string>();
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
    .filter((r) => {
      if (vazute.has(r.code)) return false;
      vazute.add(r.code);
      return true;
    })
    .slice(0, MAX_REELS)
    .map((r) => ({ code: r.code, kind: r.kind, poster: r.poster, caption: r.caption }));

  return {
    headline: typeof raw.headline === 'string' ? raw.headline : DEFAULT_REELS.headline,
    body: typeof raw.body === 'string' ? raw.body : DEFAULT_REELS.body,
    items,
  };
};

/**
 * `reminders` din document. Tolerant, ca `layout` și `reels`: o intrare stricată
 * cade, restul orarului rămâne.
 *
 * Cheia LIPSĂ e altceva decât o listă GOALĂ, iar distincția contează:
 *  • lipsă  → document publicat înainte de orarul configurabil → cade pe
 *             `DEFAULT_REMINDERS` (reminderul de 24h de dinainte). Altfel
 *             migrarea ar fi oprit tăcut reminderele deja promise.
 *  • `[]`   → organizatorul a șters toate reminderele, deliberat. Se respectă.
 */
const parseReminders = (raw: unknown): ReminderEntry[] => {
  if (raw === undefined || raw === null) return DEFAULT_REMINDERS.map((r) => ({ ...r }));
  if (!Array.isArray(raw)) return [];

  const vazute = new Set<number>();
  return raw
    .filter(
      (r): r is ReminderEntry =>
        isRecord(r) &&
        typeof r.offsetHours === 'number' &&
        Number.isInteger(r.offsetHours) &&
        r.offsetHours > 0 &&
        typeof r.enabled === 'boolean' &&
        REMINDER_TEMPLATE_KEYS.includes(r.template as ReminderTemplateKey)
    )
    .filter((r) => {
      // Două remindere la același avans ar produce două emailuri identice în
      // aceeași clipă — cheia de idempotență din DB e (ediție, offset), deci
      // al doilea n-ar pleca oricum. Cade aici, ca lista să spună adevărul.
      if (vazute.has(r.offsetHours)) return false;
      vazute.add(r.offsetHours);
      return true;
    })
    .slice(0, MAX_REMINDERS)
    .map((r) => ({ offsetHours: r.offsetHours, enabled: r.enabled, template: r.template }));
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
    reminders: parseReminders(raw.reminders),
  };
};

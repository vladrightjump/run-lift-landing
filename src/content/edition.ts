/**
 * ⭐ SSOT (single source of truth) pentru ediția curentă.
 *
 * TOT ce se schimbă de la o ediție la alta trăiește aici. Restul aplicației,
 * testele și meta din `index.html` derivă din acest obiect — nu mai există
 * string-uri de ediție împrăștiate prin fișiere.
 *
 * La ediție nouă: editezi câmpurile de aici, rulezi `npm run sync-edition`
 * (SQL pentru `app_config`) și `npm run verify`. Vezi `GHID-EDITIE-NOUA.md`.
 *
 * NOTĂ: configul de backend (Supabase url/key/schema) NU stă aici — e configurare
 * de MEDIU, nu de ediție. Trăiește în `src/lib/backend.ts`.
 *
 * Datele/orele se scriu FĂRĂ offset (`start`, `registrationDeadline`, `launchAt`)
 * și se compun cu `tz` (fusul Chișinăului), ca vizitatorii din alte fusuri să
 * vadă același moment absolut.
 */
export const EDITION = {
  /** Ediția evenimentului (coloana `editie` + `public_stats`). */
  number: 4,
  /** Ediția pentru „Anunță-mă la lansare" (de regulă egală cu `number`). */
  launchNumber: 4,

  /** Branding. `ordinal(number)` derivă „a patra" în `content/format.ts`. */
  brand: 'Run + Lift',
  eventName: 'Hyrox Trial',
  concept: 'Outdoor Adaptive',
  /** Override opțional pentru ordinal (ex. dacă vrei altă formulare). */
  ordinalOverride: undefined as string | undefined,

  /** Fusul orar al evenimentului (Chișinău, UTC+3 vara). */
  tz: '+03:00',
  /** Startul cursei — local, fără offset. */
  start: '2026-08-08T06:30:00',
  /** Durata (h) — pentru EVENT_END_DATE (start + durată). */
  durationHours: 6,
  /** Ora de check-in (afișată în emailuri/landing). */
  checkinFrom: '06:00',
  /** Până când se poate înscrie cineva — local, fără offset. */
  registrationDeadline: '2026-08-08T06:30:00',
  /** Momentul anunțului de lansare (comutarea Coming Soon → landing) — local. */
  launchAt: '2026-08-04T18:00:00',
  /** `true` → homepage-ul arată Coming Soon; `false` → landing (înscrieri deschise). */
  showComingSoon: false,

  venue: {
    name: 'Parcul Râșcani',
    city: 'Chișinău',
    // Căutarea Google Maps (pinul „Новая спортплощадка" din Parcul Râșcani).
    mapQuery:
      '%D0%9D%D0%BE%D0%B2%D0%B0%D1%8F%20%D1%81%D0%BF%D0%BE%D1%80%D1%82%D0%BF%D0%BB%D0%BE%D1%89%D0%B0%D0%B4%D0%BA%D0%B0%20Chi%C8%99in%C4%83u',
  },

  slots: {
    total: 20,
    waitlist: 10,
    /** Fallback static pentru „locuri ocupate" dacă `public_stats` nu răspunde. */
    occupiedFallback: 0,
  },

  urls: {
    site: 'https://parktraining.fit',
    instagramHandle: '@we_run_and_lift',
    instagram: 'https://instagram.com/we_run_and_lift',
  },

  /** Bump la fiecare ediție ca share-preview-ul (og.png) să nu vină din cache. */
  ogImageVersion: 4,
} as const;

export type Edition = typeof EDITION;

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
  number: 5,
  /** Ediția pentru „Anunță-mă la lansare" (de regulă egală cu `number`). */
  launchNumber: 5,

  /** Branding. `ordinal(number)` derivă „a cincea" în `content/format.ts`. */
  brand: 'Run + Lift',
  eventName: 'Hyrox Trial',
  concept: 'Outdoor Adaptive',
  /** Override opțional pentru ordinal (ex. dacă vrei altă formulare). */
  ordinalOverride: undefined as string | undefined,

  /** Fusul orar al evenimentului (Chișinău, UTC+3 vara). */
  tz: '+03:00',
  /** Startul cursei — local, fără offset. */
  start: '2026-08-22T07:00:00',
  /** Durata (h) — pentru EVENT_END_DATE (start + durată). */
  durationHours: 2,
  /** Ora de check-in (afișată în emailuri/landing). */
  checkinFrom: '06:30',
  /** Până când se poate înscrie cineva — local, fără offset. */
  registrationDeadline: '2026-08-22T07:00:00',
  /** Momentul anunțului de lansare (comutarea Coming Soon → landing) — local. */
  launchAt: '2026-08-19T12:00:00',
  /** `true` → homepage-ul arată Coming Soon; `false` → landing (înscrieri deschise). */
  showComingSoon: false,

  // --- Fazele zilei de eveniment -------------------------------------------
  // Homepage-ul își schimbă singur forma de două ori în ziua cursei, fără
  // redeploy: cu `leaderboardLeadHours` înainte de start trece pe „cine vine"
  // (fără formular), iar la finalul cursei (start + durationHours) trece pe
  // countdown-ul spre `nextEditionAt`. Vezi `usePagePhase`.
  /** Cu câte ore înainte de start dispare înscrierea de pe homepage. */
  leaderboardLeadHours: 1,
  /** Următorul antrenament — ținta countdown-ului de după cursă, local. */
  nextEditionAt: '2026-08-29T07:00:00',

  /**
   * Locul CURSEI — se schimbă de la o ediție la alta (evenimentele sunt
   * flexibile). NU e locul antrenamentelor săptămânale: pentru acelea vezi
   * `training` mai jos. Confuzia dintre cele două a trimis oameni în locul
   * greșit, deci ține-le separate.
   */
  venue: {
    name: 'Scările de Granit',
    city: 'Valea Morilor',
    // Căutarea Google Maps — pinul „Granit Stairs" (scările de granit din Valea
    // Morilor). Coordonate exacte, ca embed-ul și direcțiile să cadă fix pe punct.
    mapQuery: '47.0182357,28.8213041',
  },

  /**
   * Locul ANTRENAMENTELOR săptămânale (marți și joi) — fix, NU se schimbă la
   * ediție nouă. Îl folosește doar `/despre-noi`, secțiunea „Unde ne antrenăm".
   */
  training: {
    /** Terenul exact, nu tot parcul — pinul „Teren Sportiv" din Google Maps. */
    name: 'Teren Sportiv',
    /** Reperul pentru cine nu cunoaște terenul: parcul în care se află. */
    landmark: 'Parcul Râșcani',
    city: 'Chișinău',
    days: 'Marți și joi',
    time: '06:30',
    /**
     * Coordonatele terenului de lângă terenurile de volei (str. Braniștii).
     * Punct exact, nu căutare text: „Parcul Râșcani" cădea oriunde în parc, iar
     * parcul e destul de mare cât să ratezi antrenamentul căutându-l.
     */
    mapQuery: '47.0411377,28.8714638',
  },

  slots: {
    total: 40,
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
  ogImageVersion: 5,
} as const;

export type Edition = typeof EDITION;

/**
 * INSTANTANEUL DE BUILD al ediției. NU mai e sursa de adevăr.
 *
 * Sursa de adevăr e rândul `published` din `runlift.event_config`, editabil din
 * `/admin` → tabul „Eveniment" și citit la runtime prin `public_config()`.
 * Vezi `GHID-EDITIE-NOUA.md`.
 *
 * Fișierul ăsta are exact DOUĂ roluri rămase:
 *
 *  1. randează primul cadru și acoperă cazul „backendul nu răspunde"
 *     (`SNAPSHOT_CONFIG` din `content/eventConfig.ts`);
 *  2. hrănește meta de share, injectată în `index.html` la BUILD, pentru că
 *     scraper-ele de WhatsApp/Facebook nu rulează JS (`content/meta.ts`).
 *
 * NU-l edita ca să schimbi ediția — publică din admin. Îl aliniezi doar când
 * vrei ca primul cadru și share preview-ul să prindă din urmă ediția publicată,
 * iar atunci e nevoie de deploy oricum. Backoffice-ul îți spune când e cazul.
 *
 * Câmpurile care NU trăiesc în config (rămân doar aici, pentru că nu țin de
 * ediție): `brand`, `urls`, `training` și `ogImageVersion`.
 *
 * NOTĂ: configul de backend (Supabase url/key/schema) NU stă aici — e configurare
 * de MEDIU, nu de ediție. Trăiește în `src/lib/backend.ts`.
 *
 * Datele/orele se scriu FĂRĂ offset (`start`, `registrationDeadline`, `launchAt`)
 * și se compun cu `tz` (fusul Chișinăului), ca vizitatorii din alte fusuri să
 * vadă același moment absolut.
 */
/**
 * Un loc de pe hartă. Aceeași formă pentru cursă și pentru antrenamente, ca
 * derivatele lor (rândul „Unde", embed-ul, linkul de direcții) să treacă toate
 * prin `placeStrings()` din `content/format.ts` — o singură implementare.
 *
 * De ce contează: cât timp fiecare loc își avea propriile șabloane de URL
 * copiate, se putea strecura sursa greșită într-una din copii. Așa s-a ajuns ca
 * schimbarea locului cursei să mute și antrenamentele. Acum greșeala ar fi un
 * argument greșit, la vedere, nu un `${EDITION.venue…}` pierdut într-un string.
 */
export type Place = {
  /** Numele punctului, așa cum apare pe pagină. */
  name: string;
  /** Reper opțional — parcul/zona, pentru cine nu cunoaște punctul. */
  landmark?: string;
  city: string;
  /** „lat,lng". Punct exact: căutarea text cade oriunde în zonă. */
  mapQuery: string;
  /** Zoom-ul hărții — un teren cere mai mult decât un cartier. */
  zoom: number;
};

export const EDITION = {
  /** Ediția evenimentului (coloana `editie` + `public_stats`). */
  number: 6,
  /** Ediția pentru „Anunță-mă la lansare" (de regulă egală cu `number`). */
  launchNumber: 6,

  /** Branding. `ordinal(number)` derivă „a cincea" în `content/format.ts`. */
  brand: 'Run + Lift',
  eventName: 'Hyrox Trial',
  concept: 'Outdoor Adaptive',
  /** Override opțional pentru ordinal (ex. dacă vrei altă formulare). */
  ordinalOverride: undefined as string | undefined,

  /** Fusul orar al evenimentului (Chișinău, UTC+3 vara). */
  tz: '+03:00',
  /** Startul cursei — local, fără offset. */
  start: '2026-09-05T07:00:00',
  /** Durata (h) — pentru EVENT_END_DATE (start + durată). */
  durationHours: 1,
  /** Ora de check-in (afișată în emailuri/landing). */
  checkinFrom: '06:45',
  /** Până când se poate înscrie cineva — local, fără offset. */
  registrationDeadline: '2026-09-05T06:00:00',
  /** Momentul anunțului de lansare (comutarea Coming Soon → landing) — local. */
  launchAt: '2026-09-03T12:00:00',
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
  nextEditionAt: '2026-09-12T07:00:00',

  /**
   * Locul CURSEI — se schimbă de la o ediție la alta (evenimentele sunt
   * flexibile). NU e locul antrenamentelor săptămânale: pentru acelea vezi
   * `training` mai jos. Confuzia dintre cele două a trimis oameni în locul
   * greșit, deci ține-le separate.
   */
  venue: {
    name: 'Terenul de Basketball',
    city: 'Parcul La Izvor',
    // Terenul de basket din Parcul La Izvor. Coordonate exacte, ca embed-ul și
    // direcțiile să cadă fix pe teren: parcul e destul de mare cât să ratezi
    // startul căutându-l după nume.
    mapQuery: '47.0465504,28.7854741',
    zoom: 16,
  } satisfies Place,

  /**
   * Locul ANTRENAMENTELOR săptămânale (marți și joi) — fix, NU se schimbă la
   * ediție nouă. Îl folosește doar `/despre-noi`, secțiunea „Unde ne antrenăm".
   */
  training: {
    days: 'Marți și joi',
    time: '06:30',
    /** Locul e imbricat: antrenamentul e un eveniment recurent CU un loc, nu un loc. */
    place: {
      /** Terenul exact, nu tot parcul — pinul „Teren Sportiv" din Google Maps. */
      name: 'Teren Sportiv',
      /** Reperul pentru cine nu cunoaște terenul: parcul în care se află. */
      landmark: 'Parcul Râșcani',
      city: 'Chișinău',
      /**
       * Coordonatele terenului de lângă terenurile de volei (str. Braniștii).
       * Punct exact, nu căutare text: „Parcul Râșcani" cădea oriunde în parc,
       * iar parcul e destul de mare cât să ratezi antrenamentul căutându-l.
       */
      mapQuery: '47.0411377,28.8714638',
      zoom: 17,
    } satisfies Place,
  },

  slots: {
    total: 30,
    waitlist: 10,
    /** Fallback static pentru „locuri ocupate" dacă `public_stats` nu răspunde. */
    occupiedFallback: 0,
  },

  /**
   * Secțiunea „Instagram" de pe landing. `items` gol e starea normală a
   * instantaneului: clipurile se adaugă din `/admin`, nu de aici. Cât timp lista
   * e goală, secțiunea nu se randează și nu consumă un număr de secțiune.
   */
  reels: {
    headline: 'Instagram',
    body:
      'Antrenamentele, cursele și oamenii, filmate pe teren. Dacă vrei să vezi ' +
      'cum arată un Run + Lift înainte să vii, aici e.',
    items: [] as { code: string; kind: 'reel' | 'p'; poster: string; caption: string }[],
  },

  urls: {
    site: 'https://parktraining.fit',
    instagramHandle: '@we_run_and_lift',
    instagram: 'https://instagram.com/we_run_and_lift',
  },

  /** Bump la fiecare ediție ca share-preview-ul (og.png) să nu vină din cache. */
  ogImageVersion: 6,
} as const;

export type Edition = typeof EDITION;

/**
 * Derivatele de TIMP ale ediției.
 *
 * Sursa de adevăr e rândul `published` din `runlift.event_config`, citit la
 * runtime (vezi `hooks/useEventConfig`). Fișierul ăsta nu mai ține valori: ține
 * REGULA prin care un config devine momente absolute.
 *
 * Componentele iau reperele din `useEditionDates()`. Funcțiile pure (validare,
 * calendar) primesc configul ca argument — un hook nu le poate servi.
 *
 * Configul de backend (Supabase url/key/schema) e configurare de MEDIU, nu de
 * ediție: trăiește în `src/lib/backend.ts` și se re-exportă de aici.
 */
import { EDITION } from '../content/edition';
import { SNAPSHOT_CONFIG, type EventConfig } from '../content/eventConfig';

// Re-export backend (Supabase) — configurare de mediu, nu de ediție.
export { SUPABASE, isBackendConfigured } from './backend';

// --- Social — NU ține de ediție, deci rămâne în cod (vezi `EDITION.urls`) ----
export const INSTAGRAM_HANDLE = EDITION.urls.instagramHandle;
export const INSTAGRAM_URL = EDITION.urls.instagram;

/** Compune un moment local (fără offset) cu fusul ediției → Date absolut. */
const at = (local: string, tz: string): Date => new Date(`${local}${tz}`);

export type EditionDates = {
  /** Startul cursei. */
  EVENT_DATE: Date;
  /** Finalul cursei (start + durată). */
  EVENT_END_DATE: Date;
  /** Până când se poate înscrie cineva. */
  REGISTRATION_DEADLINE: Date;
  /** Momentul în care homepage-ul trece pe „cine vine" (start − avansul din ediție). */
  LEADERBOARD_DATE: Date;
  /** Ținta countdown-ului de după cursă — următorul antrenament. */
  NEXT_EDITION_DATE: Date;
  /** Comutarea Coming Soon → landing. */
  LAUNCH_DATE: Date;
};

/** Toate reperele de timp ale unei ediții, dintr-un singur config. */
export const deriveEditionDates = (config: EventConfig): EditionDates => {
  const EVENT_DATE = at(config.start, config.tz);
  return {
    EVENT_DATE,
    EVENT_END_DATE: new Date(EVENT_DATE.getTime() + config.durationHours * 60 * 60 * 1000),
    REGISTRATION_DEADLINE: at(config.registrationDeadline, config.tz),
    LEADERBOARD_DATE: new Date(
      EVENT_DATE.getTime() - config.leaderboardLeadHours * 60 * 60 * 1000
    ),
    NEXT_EDITION_DATE: at(config.nextEditionAt, config.tz),
    LAUNCH_DATE: at(config.launchAt, config.tz),
  };
};

/**
 * Valorile instantaneului de build.
 *
 * DOAR pentru locurile care nu pot citi configul la runtime: meta de share
 * (injectată în HTML la build) și testele. O componentă care ajunge aici în loc
 * de `useEditionDates()` va îngheța pe ediția deployată — folosește hook-ul.
 */
export const SNAPSHOT_DATES = deriveEditionDates(SNAPSHOT_CONFIG);

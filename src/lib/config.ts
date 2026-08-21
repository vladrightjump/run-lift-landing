/**
 * Config derivat — NU mai edita valori aici. Sursa de adevăr pentru ediție e
 * `src/content/edition.ts` (obiectul `EDITION`); configul de backend e în
 * `src/lib/backend.ts`. Fișierul ăsta doar EXPUNE derivatele sub numele pe care
 * le folosește deja restul aplicației (compatibilitate, zero churn la consumatori).
 *
 * La ediție nouă: editezi `content/edition.ts`, nu fișierul ăsta.
 */
import { EDITION } from '../content/edition';

// Re-export backend (Supabase) — configurare de mediu, nu de ediție.
export { SUPABASE, isBackendConfigured } from './backend';

/** Compune un moment local (fără offset) cu fusul ediției → Date absolut. */
const at = (local: string): Date => new Date(`${local}${EDITION.tz}`);

// --- Ediții -----------------------------------------------------------------
export const CURRENT_EDITION = EDITION.number;
export const CURRENT_LAUNCH_EDITION = EDITION.launchNumber;

// --- Locuri -----------------------------------------------------------------
/** Fallback static — folosit doar dacă `public_stats` nu răspunde (live via useStats). */
export const OCCUPIED_SLOTS = EDITION.slots.occupiedFallback;
export const TOTAL_SLOTS = EDITION.slots.total;
export const WAITLIST_SLOTS = EDITION.slots.waitlist;

// --- Date/ore (fus Chișinău, moment absolut identic în orice fus) -----------
export const EVENT_DATE = at(EDITION.start);
export const EVENT_END_DATE = new Date(
  EVENT_DATE.getTime() + EDITION.durationHours * 60 * 60 * 1000
);
export const REGISTRATION_DEADLINE = at(EDITION.registrationDeadline);

// --- Fazele zilei de eveniment ----------------------------------------------
/** Momentul în care homepage-ul trece pe „cine vine" (start − avansul din ediție). */
export const LEADERBOARD_DATE = new Date(
  EVENT_DATE.getTime() - EDITION.leaderboardLeadHours * 60 * 60 * 1000
);
/** Ținta countdown-ului de după cursă — următorul antrenament. */
export const NEXT_EDITION_DATE = at(EDITION.nextEditionAt);

// --- Coming Soon / lansare --------------------------------------------------
export const SHOW_COMING_SOON = EDITION.showComingSoon;
export const LAUNCH_DATE = at(EDITION.launchAt);

// --- Social -----------------------------------------------------------------
export const INSTAGRAM_HANDLE = EDITION.urls.instagramHandle;
export const INSTAGRAM_URL = EDITION.urls.instagram;

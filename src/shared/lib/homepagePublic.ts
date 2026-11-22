import { rpc } from './rpc';

/**
 * Ce citește site-ul din `public_homepage()`: ordinea blocurilor de pe ecranul
 * dintre ediții, butonul pentru giveaway și locul antrenamentelor.
 *
 * Orice răspuns ciudat cade pe implicit — antrenamentul primul, iar locul `null`
 * (pagina folosește atunci locul din cod). Sunt decor, deci nu au voie să strice
 * o pagină.
 */
export type PublicHomepage = { trialFirst: boolean; trainingLocation: string | null; giveawayVisible: boolean };

export const HOMEPAGE_IMPLICIT: PublicHomepage = { trialFirst: false, trainingLocation: null, giveawayVisible: false };

/** Limita botului pentru loc (`problemeConfig`, `admin_sala_salveaza_config`). */
const LOC_MAX = 120;

export function parseHomepage(data: unknown): PublicHomepage {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return HOMEPAGE_IMPLICIT;
  const { trial_first, training_location, giveaway_visible } = data as Record<string, unknown>;
  const loc = typeof training_location === 'string' ? training_location.trim() : '';
  return {
    trialFirst: trial_first === true,
    trainingLocation: loc.length > 0 && loc.length <= LOC_MAX ? loc : null,
    giveawayVisible: giveaway_visible === true,
  };
}

export async function loadPublicHomepage(signal?: AbortSignal): Promise<PublicHomepage> {
  return parseHomepage(await rpc<unknown>('public_homepage', {}, signal));
}

import { reel } from './reels';
import { trialConfig } from './trial';

export const publicStats = (over: { count?: number; participants?: { nume: string; echipa?: string }[]; waitlist?: number } = {}) => ({
  count: 0, participants: [], waitlist: 0, ...over,
});

export const publicHomepage = (over: { trial_first?: boolean; training_location?: string | null } = {}) => ({
  trial_first: false, training_location: null, ...over,
});

export const publicReel = (over: Partial<ReturnType<typeof reel>> = {}) => {
  const { youtube, caption, url } = reel(over);
  return { youtube, caption, url };
};

export const publicTrialConfig = (over: Partial<ReturnType<typeof trialConfig>> = {}) => {
  const { enabled, bot_username, contact_text } = trialConfig(over);
  return { enabled, bot_username, contact_text };
};

/** Giveaway-ul curent, așa cum îl întoarce `public_giveaway()`. Orele sunt 10:00 și 20:00 la Chișinău. */
export const publicGiveaway = (over: { slug?: string; starts_at?: string; ends_at?: string; stare?: 'programat' | 'deschis' | 'inchis' } = {}) => ({
  slug: 'toamna', starts_at: '2026-11-01T08:00:00Z', ends_at: '2026-11-30T18:00:00Z', stare: 'deschis', ...over,
});

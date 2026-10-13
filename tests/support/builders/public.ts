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

import type { TrialConfig, TrialData } from '../../../src/features/admin/zones/antrenamente/api';

export const trialConfig = (over: Partial<TrialConfig> = {}): TrialConfig => ({
  enabled: false, bot_username: '', welcome_text: '', trial_conditions: '',
  trial_price: '', bring_text: '', continuation_conditions: '', duration_minutes: 60,
  organizer_telegram_id: null, contact_text: '', permissions_verified_at: null, ...over,
});
export const trialData = (over: Partial<TrialData> = {}): TrialData => ({
  config: trialConfig(), prospects: [], bookings: [], questions: [], messages: [],
  events: [], organizers: [], ...over,
});

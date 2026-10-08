import { rpc } from './adminApi';

export type TrialConfig = {
  message_texts?: Record<string, string>;
  enabled: boolean; bot_username: string; welcome_text: string; trial_conditions: string;
  trial_price: string; bring_text: string; continuation_conditions: string;
  duration_minutes: number; organizer_telegram_id: number | null; contact_text: string;
  permissions_verified_at: string | null;
};
export type TrialProspect = {
  id: string; telegram_user_id: number; telegram_username: string | null;
  full_name: string | null; source: string; stage: string; dm_enabled: boolean;
};
type TrialBooking = {
  id: string; prospect_id: string; status: string; version: number;
  session_start: string; session_location: string; attendance_at: string | null;
  continuation: 'yes' | 'no' | null;
};
type TrialQuestion = { id: string; prospect_id: string; body: string; response: string | null; status: string };
type TrialMessage = { id: string; prospect_id: string; kind: string; status: string; result: string | null; created_at: string };
export type TrialData = {
  config: TrialConfig; prospects: TrialProspect[]; bookings: TrialBooking[];
  questions: TrialQuestion[]; messages: TrialMessage[];
  organizers: { id: string; full_name: string; telegram_user_id: number }[];
};
export const loadTrials = async (token: string, signal?: AbortSignal): Promise<TrialData> => {
  const data = await rpc<TrialData>('admin_trial_data', { p_token: token }, signal);
  if (!data?.config || !Array.isArray(data.prospects) || !Array.isArray(data.bookings)) throw new Error('trial_data_unavailable');
  return data;
};
export const saveTrialConfig = (token: string, config: TrialConfig) => rpc<void>('admin_trial_config', { p_token: token, p_config: config });
export const trialAttendance = (token: string, booking: string, attended: boolean, version: number, correction: boolean) => rpc<void>('admin_trial_attendance', { p_token: token, p_booking: booking, p_attended: attended, p_version: version, p_correction: correction });
export const trialReply = (token: string, question: string, response: string) => rpc<void>('admin_trial_reply', { p_token: token, p_question: question, p_response: response });
export const retryTrialMessage = (token: string, message: string) => rpc<void>('admin_trial_retry', { p_token: token, p_message: message });

export function trialNeedsAttention(data: TrialData) {
  return data.bookings.filter(b => b.status === 'awaiting_attendance').length
    + data.questions.filter(q => q.status === 'open').length
    + data.messages.filter(m => m.status === 'failed' || m.status === 'ambiguous').length;
}

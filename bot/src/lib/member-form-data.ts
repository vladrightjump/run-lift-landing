import { isMissingBirthdaySchema } from './birthdays.js';
import { createAdminClient } from './supabase.js';

export const FEELINGS = ['Foarte bine', 'Bine', 'Așa și așa', 'Mai puțin bine'] as const;
export const TOPICS = {
  run: 'Alergare',
  strength: 'Forță',
  technique: 'Tehnică',
  beginners: 'Sesiuni pentru începători',
  social: 'Ieșiri de grup',
  other: 'Altceva',
} as const;
export type Topic = keyof typeof TOPICS;

export interface ProfileFields {
  display_name: string;
  training_goal: string | null;
}

export interface FeedbackFields {
  feeling: number;
  topics: Topic[];
  comment: string | null;
}

export interface FeedbackReport {
  total: number;
  feelings: number[];
  topics: number[];
  comment_count: number;
  comments: string[];
}

export interface ProfilesReport {
  total: number;
  profiles: (Pick<ProfileFields, 'display_name' | 'training_goal'> & { telegram_user_id: number; matched: boolean })[];
}

export async function ensureFormsAvailable(): Promise<void> {
  const { error } = await createAdminClient().from('telegram_feedback')
    .select('id', { head: true }).limit(1);
  if (error) throw error;
}

export async function readMemberProfile(userId: number, telegramName: string): Promise<ProfileFields> {
  const db = createAdminClient();
  const saved = await db.from('telegram_member_profiles')
    .select('display_name, training_goal')
    .eq('telegram_user_id', userId).maybeSingle();
  if (saved.error) throw saved.error;
  if (saved.data) return saved.data;
  const matched = await db.from('members').select('full_name').eq('telegram_user_id', userId).maybeSingle();
  if (matched.error) throw matched.error;
  return {
    display_name: matched.data?.full_name ?? telegramName,
    training_goal: null,
  };
}

export async function saveFeedback(id: string, fields: FeedbackFields): Promise<void> {
  const { error } = await createAdminClient().from('telegram_feedback').upsert(
    { id, ...fields }, { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function saveMemberProfile(userId: number, fields: ProfileFields): Promise<void> {
  const db = createAdminClient();
  const profile = { p_user_id: userId, p_name: fields.display_name, p_goal: fields.training_goal };
  const saved = await db.rpc('telegram_save_training_profile', profile);
  if (!saved.error) return;
  if (!isMissingBirthdaySchema(saved.error)) throw saved.error;

  // The previous RPC still requires the birthday columns until the new migration.
  const prior = await db.from('telegram_member_profiles')
    .select('birth_day, birth_month, birthday_greeting')
    .eq('telegram_user_id', userId).maybeSingle();
  if (prior.error) throw prior.error;
  const legacy = await db.rpc('telegram_save_member_profile', {
    ...profile,
    p_day: prior.data?.birth_day ?? null,
    p_month: prior.data?.birth_month ?? null,
    p_greeting: prior.data?.birthday_greeting ?? false,
  });
  if (legacy.error) throw legacy.error;
}

export async function feedbackReport(page: number): Promise<FeedbackReport> {
  const { data, error } = await createAdminClient().rpc('telegram_feedback_report', { p_page: page });
  if (error) throw error;
  return data;
}

export async function profilesReport(page: number): Promise<ProfilesReport> {
  const { data, error } = await createAdminClient().rpc('telegram_profiles_report', { p_page: page });
  if (error) throw error;
  return data;
}

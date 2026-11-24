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
  birth_day: number | null;
  birth_month: number | null;
  birthday_greeting: boolean;
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
    .select('display_name, birth_day, birth_month, birthday_greeting, training_goal')
    .eq('telegram_user_id', userId).maybeSingle();
  if (saved.error) throw saved.error;
  if (saved.data) return saved.data;
  const matched = await db.from('members').select('full_name').eq('telegram_user_id', userId).maybeSingle();
  if (matched.error) throw matched.error;
  return {
    display_name: matched.data?.full_name ?? telegramName,
    birth_day: null,
    birth_month: null,
    birthday_greeting: false,
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
  const { error } = await createAdminClient().rpc('telegram_save_member_profile', {
    p_user_id: userId,
    p_name: fields.display_name,
    p_day: fields.birth_day,
    p_month: fields.birth_month,
    p_greeting: fields.birthday_greeting,
    p_goal: fields.training_goal,
  });
  if (error) throw error;
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

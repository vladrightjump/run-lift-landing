import { withinDeadline } from './deadline.js';
import { createAdminClient } from './supabase.js';
import { getChat } from './telegram.js';

export interface BirthdayDate { day: number; month: number }
export type BirthdaySource = 'telegram' | 'manual' | 'legacy';
export type BirthdayAction = 'enable' | 'disable' | 'clear' | 'refresh';
export interface BirthdayPreference {
  day: number | null;
  month: number | null;
  source: BirthdaySource | null;
  enabled: boolean;
  import_blocked: boolean;
  revision: number;
}
export interface BirthdayCandidate {
  telegram_user_id: number;
  source: BirthdaySource;
  display_name: string | null;
  revision: number;
}
export type BirthdayOutcome = 'sent' | 'rejected' | 'uncertain';

export function isMissingBirthdaySchema(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error &&
    ['PGRST202', '42883', '42P01'].includes(String(error.code));
}

export async function readTelegramBirthday(userId: number): Promise<BirthdayDate | null> {
  const response = await getChat(userId);
  if (!response.ok || response.result?.type !== 'private' || response.result.id !== userId) {
    throw new Error('Private Telegram profile unavailable');
  }
  const date = response.result.birthdate;
  if (!date) return null;
  const { day, month } = date;
  if (!Number.isInteger(day) || !Number.isInteger(month) || day < 1 || month < 1 || month > 12 ||
      day > new Date(Date.UTC(2000, month, 0)).getUTCDate()) {
    throw new Error('Private Telegram birthday invalid');
  }
  return { day, month };
}

async function birthdayRpc<T>(fn: string, params: Record<string, unknown>): Promise<T> {
  const { data, error } = await withinDeadline(7_000, signal =>
    createAdminClient().rpc(fn, params).abortSignal(signal));
  if (error) throw error;
  return data as T;
}

export function birthdayPreference(userId: number): Promise<BirthdayPreference> {
  return birthdayRpc('telegram_birthday_preference', { p_user_id: userId });
}

export function changeBirthday(
  userId: number,
  action: BirthdayAction,
  lookup?: BirthdayDate | null,
  expectedRevision?: number,
): Promise<BirthdayPreference> {
  return birthdayRpc('telegram_change_birthday', {
    p_user_id: userId, p_action: action, p_day: lookup?.day ?? null, p_month: lookup?.month ?? null,
    p_lookup_ok: lookup !== undefined, p_expected_revision: expectedRevision ?? null,
  });
}

export function birthdayCandidates(date: string): Promise<BirthdayCandidate[]> {
  return birthdayRpc('telegram_birthday_candidates', { p_date: date });
}

export function claimBirthday(userId: number, date: string, revision: number): Promise<boolean> {
  return birthdayRpc('telegram_claim_birthday', { p_user_id: userId, p_date: date, p_revision: revision });
}

export function finishBirthday(userId: number, date: string, outcome: BirthdayOutcome): Promise<void> {
  return birthdayRpc('telegram_finish_birthday', { p_user_id: userId, p_date: date, p_outcome: outcome });
}

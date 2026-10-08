import { createAdminClient } from './supabase.js';
import { getChatMember, type TelegramMember } from './telegram.js';

export type MembershipState = 'in_group' | 'left' | 'kicked';
export function membershipState(member: TelegramMember): MembershipState {
  if (member.status === 'kicked') return 'kicked';
  if (member.status === 'left' || (member.status === 'restricted' && !member.is_member)) return 'left';
  return 'in_group';
}

export async function recordMembership(chatId: string | number, member: TelegramMember, observedAt: string): Promise<void> {
  if (String(chatId) !== process.env.TELEGRAM_GROUP_CHAT_ID || member.user.is_bot) return;
  const { error } = await createAdminClient().rpc('record_telegram_membership', {
    p_user_id: member.user.id, p_chat_id: String(chatId), p_state: membershipState(member),
    p_observed_at: observedAt, p_username: member.user.username ?? null,
    p_first_name: member.user.first_name ?? null, p_last_name: member.user.last_name ?? null,
  });
  if (error) throw error;
}

// One bounded batch per tick, including existing members who never rejoin.
// Errors never mean "left". Keep the last observation and retry later.
let running = false;
export async function syncMemberships(): Promise<void> {
  const group = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!group || running) return;
  running = true;
  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc('telegram_membership_candidates', { p_chat_id: group });
    if (error) throw error;
    for (const row of data ?? []) {
      const started = new Date().toISOString();
      try {
        const result = await getChatMember(group, Number(row.telegram_user_id));
        if (!result.ok || !result.result) throw new Error(result.description ?? 'Telegram indisponibil');
        await recordMembership(group, result.result, started);
      } catch {
        const { error: retryError } = await db.rpc('telegram_membership_retry', { p_user_id: row.telegram_user_id, p_chat_id: group });
        if (retryError) throw retryError;
      }
    }
  } finally { running = false; }
}

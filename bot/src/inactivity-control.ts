// The inactivity alert's buttons (`i:<cycle>:k|p|n`). The decision is taken
// atomically in the database — the first organizer wins — and every copy of
// the alert is then edited to show it (R7–R9, R11).
import type { CallbackIn } from './control.js';
import { createAdminClient } from './lib/supabase.js';
import { organizerIds } from './lib/organizers.js';
import { answerCallbackQuery, editMessageText } from './lib/telegram.js';
import { outcomeLine, type ReviewView } from './lib/inactivity-text.js';
import { editAll } from './jobs/inactivity-alert.js';

export type Decision = { outcome: 'decided' | 'already' | 'refused'; review: ReviewView };
export interface InactivityControlDeps {
  organizers: number[];
  group: string;
  decide(reviewId: string, action: 'kick' | 'postpone' | 'keep', actor: number, name: string): Promise<Decision>;
  edit(chatId: number, messageId: number, text: string): Promise<void>;
  answer(id: string, text?: string): Promise<void>;
}

const ACTIONS = { k: 'kick', p: 'postpone', n: 'keep' } as const;
const PATTERN = /^i:([0-9a-f-]{36}):([kpn])$/;

export async function inactivityCallback(input: CallbackIn, deps: InactivityControlDeps): Promise<void> {
  const match = PATTERN.exec(input.data);
  if (input.chatType !== 'private' || input.chatId !== input.fromId || !deps.organizers.includes(input.fromId) || !match) {
    await deps.answer(input.id);
    return;
  }
  let decision: Decision;
  try {
    decision = await deps.decide(match[1], ACTIONS[match[2] as keyof typeof ACTIONS], input.fromId, input.fromName);
  } catch (err) {
    if (String((err as { message?: string })?.message ?? err).includes('inactivity_review_missing')) {
      await deps.answer(input.id, 'Alerta nu mai există.');
      return;
    }
    throw err;
  }
  const line = outcomeLine(decision.review);
  await deps.answer(input.id, decision.outcome === 'already' ? `Deja decis: ${line}`.slice(0, 190) : undefined);
  await editAll(decision.review, deps.edit);
}

export const inactivityControlDeps = (): InactivityControlDeps => ({
  organizers: organizerIds(),
  group: process.env.TELEGRAM_GROUP_CHAT_ID ?? '',
  async decide(reviewId, action, actor, name) {
    const { data, error } = await createAdminClient().rpc('inactivity_decide', {
      p_review: reviewId, p_action: action, p_actor: actor, p_name: name,
      p_chat_id: process.env.TELEGRAM_GROUP_CHAT_ID ?? '',
    });
    if (error) throw error;
    return data as Decision;
  },
  async edit(chatId, messageId, text) {
    const r = await editMessageText(chatId, messageId, text);
    if (!r.ok) throw new Error(r.description ?? 'editMessageText failed');
  },
  async answer(id, text) { await answerCallbackQuery(id, text); },
});

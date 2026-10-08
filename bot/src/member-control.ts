import { randomUUID } from 'node:crypto';
import type { CallbackIn, TextIn } from './control.js';
import { createAdminClient } from './lib/supabase.js';
import { organizerIds } from './lib/organizers.js';
import { answerCallbackQuery, sendMessage, type InlineKeyboard } from './lib/telegram.js';

export interface MemberChoice { id: string; full_name: string; telegram_user_id: number | null; telegram_username: string | null; is_admin: boolean }
export interface MemberControlDeps {
  organizers: number[]; group: string; now(): number;
  members(): Promise<MemberChoice[]>;
  queue(member: MemberChoice, actor: number, name: string, group: string): Promise<unknown>;
  send(chat: number, text: string, keyboard?: InlineKeyboard): Promise<unknown>;
  answer(id: string): Promise<unknown>;
}
interface Choice { owner: number; group: string; expires: number; members: MemberChoice[]; confirm: boolean }
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
export const matchMembers = (members: MemberChoice[], query: string) => {
  const q = fold(query.trim().replace(/^@/, ''));
  return members.filter((m) => fold(`${m.full_name} ${m.telegram_username ?? ''}`).includes(q));
};
const label = (m: MemberChoice) => `${m.full_name} · ${m.telegram_username ? '@' + m.telegram_username : 'fără @utilizator'} · ID ${m.telegram_user_id ?? 'nelegat'}`;

export class MemberControl {
  private choices = new Map<string, Choice>();
  private put(choice: Choice, now: number): string {
    for (const [key, row] of this.choices) if (row.expires <= now || row.owner === choice.owner) this.choices.delete(key);
    const key = randomUUID().slice(0, 16);
    this.choices.set(key, choice);
    return key;
  }
  async text(input: TextIn, deps: MemberControlDeps): Promise<boolean> {
    const match = /^\/scoate(?:@\w+)?(?:\s+(.*))?$/is.exec(input.text.trim());
    if (!match) return false;
    if (input.chatType !== 'private' || input.chatId !== input.fromId || !deps.organizers.includes(input.fromId)) return true;
    const query = match[1]?.trim();
    if (!query || query.length < 2) {
      await deps.send(input.chatId, 'Scrie /scoate Nume sau /scoate @utilizator. Vei alege contul și confirma înainte de scoatere.');
      return true;
    }
    if (!deps.group) { await deps.send(input.chatId, 'Grupul nu este configurat.'); return true; }
    const matches = matchMembers(await deps.members(), query);
    if (!matches.length) { await deps.send(input.chatId, 'Nu găsesc persoana. Verifică numele sau leagă contul din dashboard.'); return true; }
    if (matches.length > 10) { await deps.send(input.chatId, 'Sunt mai mult de 10 potriviri. Scrie numele mai complet sau @utilizatorul.'); return true; }
    const eligible = matches.filter((m) => m.telegram_user_id && !m.is_admin && !deps.organizers.includes(m.telegram_user_id));
    if (!eligible.length) { await deps.send(input.chatId, 'Conturile găsite sunt administratori/organizatori sau nu au Telegram legat.'); return true; }
    const key = this.put({ owner: input.fromId, group: deps.group, expires: deps.now() + 15 * 60_000, members: eligible, confirm: false }, deps.now());
    await deps.send(input.chatId, `Alege persoana din grupul de antrenament (${deps.group}):\n${eligible.map(label).join('\n')}`,
      eligible.map((m, i) => [{ text: label(m), callback_data: `m:${key}:${i}` }]));
    return true;
  }
  async callback(input: CallbackIn, deps: MemberControlDeps): Promise<void> {
    await deps.answer(input.id);
    if (input.chatType !== 'private' || input.chatId !== input.fromId || !deps.organizers.includes(input.fromId)) return;
    const [, key, action] = input.data.split(':');
    const choice = this.choices.get(key);
    if (!choice || choice.owner !== input.fromId || choice.expires <= deps.now() || choice.group !== deps.group) {
      await deps.send(input.chatId, 'Alegerea a expirat. Pornește din nou cu /scoate Nume.'); return;
    }
    if (action === 'cancel') { this.choices.delete(key); await deps.send(input.chatId, 'Scoaterea a fost anulată.'); return; }
    if (choice.confirm && action === 'yes') {
      this.choices.delete(key); // consume before awaiting: double taps cannot enqueue twice
      try {
        await deps.queue(choice.members[0], input.fromId, input.fromName, choice.group);
        await deps.send(input.chatId, 'Scoaterea este în coadă. Botul verifică drepturile și îți trimite rezultatul după executare. Istoricul rămâne.');
      } catch {
        await deps.send(input.chatId, 'Nu am putut confirma scoaterea. Verifică persoana în dashboard și pornește din nou /scoate.');
      }
      return;
    }
    if (choice.confirm || !/^\d+$/.test(action ?? '')) return;
    const member = choice.members[Number(action)];
    if (!member) return;
    this.choices.delete(key);
    const next = this.put({ ...choice, members: [member], confirm: true }, deps.now());
    await deps.send(input.chatId, `Îl scoți pe ${label(member)} din grupul de antrenament (${choice.group})?\nIstoricul rămâne. Persoana va putea fi invitată din nou.`,
      [[{ text: 'Confirmă scoaterea', callback_data: `m:${next}:yes` }, { text: 'Renunță', callback_data: `m:${next}:cancel` }]]);
  }
}

export const memberControl = new MemberControl();
export const memberControlDeps = (): MemberControlDeps => ({
  organizers: organizerIds(), group: process.env.TELEGRAM_GROUP_CHAT_ID ?? '', now: Date.now,
  async members() {
    const { data, error } = await createAdminClient().from('members').select('id, full_name, telegram_user_id, telegram_username, is_admin');
    if (error) throw error;
    return data ?? [];
  },
  async queue(m, actor, name, group) {
    const { data, error } = await createAdminClient().rpc('queue_telegram_kick', {
      p_member: m.id, p_expected_id: m.telegram_user_id, p_chat_id: group, p_actor: actor, p_name: name,
    });
    if (error) throw error;
    return data;
  },
  send(chat, text, kb) { return sendMessage(chat, text, kb ? { reply_markup: { inline_keyboard: kb } } : undefined); },
  answer(id) { return answerCallbackQuery(id); },
});

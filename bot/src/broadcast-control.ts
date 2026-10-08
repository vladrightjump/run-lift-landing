// One expiring preview per organizer, like the existing training controls.
// Tokens are consumed before I/O: an ambiguous Telegram response is never retried.
import { randomUUID } from 'node:crypto';
import type { TextIn, CallbackIn } from './control.js';
import { organizerIds } from './lib/organizers.js';
import { sendMessage, sendGeneralPoll, getChat, answerCallbackQuery, type InlineKeyboard } from './lib/telegram.js';

type Content = { kind: 'message'; text: string } | { kind: 'poll'; question: string; options: string[] };
interface Destination { id: string; title: string }
interface Deps {
  authorized(id: number): boolean;
  destination(): Promise<Destination>;
  reply(id: number, text: string, keyboard?: InlineKeyboard): Promise<unknown>;
  answer(id: string, text?: string): Promise<unknown>;
  publish(group: string, content: Content): Promise<{ ok: boolean }>;
  now(): number;
}
const USAGE = '/mesaj Salut! Ne vedem la antrenament.\n/poll Ce preferați? | Alergare | Forță';
export function parseBroadcast(text: string): Content | string | null {
  const match = /^\/(mesaj|poll)(?:@\w+)?(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;
  const body = (match[2] ?? '').trim();
  if (match[1].toLowerCase() === 'mesaj') {
    if (!body || body.length > 3500) return `Mesajul trebuie să aibă între 1 și 3500 de caractere.\n${USAGE}`;
    return { kind: 'message', text: body };
  }
  const [question, ...options] = body.split('|').map(part => part.trim());
  if (!question || question.length > 300 || options.length < 2 || options.length > 12 || options.some(o => !o || o.length > 100)) {
    return `Scrie o întrebare de maximum 300 de caractere și 2–12 variante distincte de maximum 100 de caractere, separate prin |.\n${USAGE}`;
  }
  if (new Set(options.map(o => o.normalize('NFC').toLowerCase())).size !== options.length) return 'Variantele trebuie să fie diferite.';
  return { kind: 'poll', question, options };
}

export function createBroadcastControl(deps: Deps) {
  const drafts = new Map<number, { token: string; expires: number; destination: Destination; content: Content }>();
  const allowed = (m: {chatType: string; chatId: number; fromId: number}) => m.chatType === 'private' && m.chatId === m.fromId && deps.authorized(m.fromId);
  return {
    async text(m: TextIn): Promise<boolean> {
      const content = parseBroadcast(m.text);
      if (content === null) return false;
      if (!allowed(m)) {
        if (m.chatType === 'private') await deps.reply(m.chatId, 'Comandă disponibilă numai organizatorilor, în privat.');
        return true;
      }
      // Even an invalid replacement invalidates the older preview.
      drafts.delete(m.fromId);
      if (typeof content === 'string') { await deps.reply(m.chatId, content); return true; }
      const destination = await deps.destination();
      const token = randomUUID();
      drafts.set(m.fromId, { token, expires: deps.now() + 15 * 60_000, destination, content });
      const preview = content.kind === 'message' ? content.text : `${content.question}\n${content.options.map((o,i) => `${i+1}. ${o}`).join('\n')}\n\nSondaj anonim · un singur răspuns · nu modifică prezențele.`;
      await deps.reply(m.chatId, `Publicare în grupul „${destination.title.slice(0, 128)}”, din partea botului:\n\n${preview}\n\nConfirmarea expiră în 15 minute.`, [[{text:'Trimite în grup',callback_data:`b:ok:${token}`},{text:'Renunță',callback_data:`b:no:${token}`}]]);
      return true;
    },
    async callback(m: CallbackIn): Promise<void> {
      if (!allowed(m)) { await deps.answer(m.id, 'Acțiune disponibilă numai organizatorului, în privat.'); return; }
      const match = /^b:(ok|no):([\w-]+)$/.exec(m.data);
      const draft = drafts.get(m.fromId);
      if (!match || !draft || draft.token !== match[2] || draft.expires <= deps.now()) {
        await deps.answer(m.id, 'Previzualizare expirată, înlocuită sau deja folosită.'); return;
      }
      // Consume synchronously before the first await (also protects double taps).
      drafts.delete(m.fromId);
      await deps.answer(m.id).catch(() => {});
      if (match[1] === 'no') { await deps.reply(m.chatId, 'Publicarea a fost anulată.'); return; }
      const current = await deps.destination();
      if (current.id !== draft.destination.id) { await deps.reply(m.chatId, 'Grupul configurat s-a schimbat. Scrie din nou comanda.'); return; }
      let status: string;
      try {
        const result = await deps.publish(current.id, draft.content);
        status = result.ok ? '✅ Publicat în grup.' : 'Telegram a refuzat publicarea. Verifică drepturile botului și scrie din nou comanda.';
      } catch {
        status = '⚠️ Livrare neconfirmată. Verifică grupul înainte să repeți comanda: mesajul sau sondajul poate fi deja publicat.';
      }
      await deps.reply(m.chatId, status);
    },
  };
}

export const broadcastControl = createBroadcastControl({
  authorized: id => organizerIds().includes(id),
  now: Date.now,
  async destination() {
    const id = process.env.TELEGRAM_GROUP_CHAT_ID;
    if (!id) throw new Error('Grupul nu este configurat');
    const r = await getChat(id);
    if (!r.ok || !r.result || !['group','supergroup'].includes(r.result.type)) throw new Error('Grupul nu poate fi verificat');
    return {id, title:r.result.title ?? id};
  },
  reply: (id,text,kb) => sendMessage(id,text,kb ? {reply_markup:{inline_keyboard:kb}} : undefined),
  answer: answerCallbackQuery,
  publish: (group,c) => c.kind === 'message' ? sendMessage(group,c.text) : sendGeneralPoll(group,c.question,c.options),
});

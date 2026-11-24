// One expiring preview per organizer, like the existing training controls.
// Tokens are consumed before I/O: an ambiguous Telegram response is never retried.
import { randomUUID } from 'node:crypto';
import type { TextIn, CallbackIn } from './control.js';
import { ensureFormsAvailable } from './lib/member-form-data.js';
import { organizerIds } from './lib/organizers.js';
import { sendMessage, sendGeneralPoll, getChat, getMe, answerCallbackQuery, type InlineKeyboard } from './lib/telegram.js';

type InviteLinks = { text: string; url: string }[][];
type Content = { kind: 'message'; text: string; links?: InviteLinks }
  | { kind: 'poll'; question: string; options: string[] };
type BroadcastRequest = Content | { kind: 'form-invite' };
interface Destination { id: string; title: string }
interface Deps {
  authorized(id: number): boolean;
  destination(): Promise<Destination>;
  prepareFormInvite?(): Promise<{ text: string; links: InviteLinks } | undefined>;
  reply(id: number, text: string, keyboard?: InlineKeyboard): Promise<unknown>;
  answer(id: string, text?: string): Promise<unknown>;
  publish(group: string, content: Content): Promise<{ ok: boolean }>;
  now(): number;
}
const USAGE = '/mesaj Salut! Ne vedem la antrenament.\n/poll Ce preferați? | Alergare | Forță';
export function parseBroadcast(text: string): BroadcastRequest | string | null {
  if (/^\/feedback_grup(?:@\w+)?$/i.test(text.trim())) return { kind: 'form-invite' };
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
  type Preview = { token: string; expires: number; destination: Destination; content: Content };
  const drafts = new Map<number, Preview | { token: string }>();
  const allowed = (m: {chatType: string; chatId: number; fromId: number}) => m.chatType === 'private' && m.chatId === m.fromId && deps.authorized(m.fromId);
  return {
    async text(m: TextIn): Promise<boolean> {
      const request = parseBroadcast(m.text);
      if (request === null) return false;
      if (!allowed(m)) {
        if (m.chatType === 'private') await deps.reply(m.chatId, 'Comandă disponibilă numai organizatorilor, în privat.');
        return true;
      }
      // An older request may still be waiting on a database or Telegram read.
      const preparing = { token: randomUUID() };
      drafts.set(m.fromId, preparing);
      try {
        if (typeof request === 'string') { await deps.reply(m.chatId, request); return true; }
        let content: Content;
        if (request.kind === 'form-invite') {
          const prepared = await deps.prepareFormInvite?.();
          if (drafts.get(m.fromId) !== preparing) return true;
          if (!prepared) {
            await deps.reply(m.chatId, 'Formularele nu sunt disponibile momentan.');
            return true;
          }
          content = { kind: 'message', ...prepared };
        } else content = request;
        const destination = await deps.destination();
        if (drafts.get(m.fromId) !== preparing) return true;
        const { token } = preparing;
        drafts.set(m.fromId, { token, expires: deps.now() + 15 * 60_000, destination, content });
        const preview = content.kind === 'message'
          ? [content.text, ...(content.links?.flat().map(link => 'Buton: ' + link.text) ?? [])].join('\n')
          : [
            content.question,
            ...content.options.map((option, i) => (i + 1) + '. ' + option),
            '',
            'Sondaj anonim · un singur răspuns · nu modifică prezențele.',
          ].join('\n');
        await deps.reply(m.chatId, [
          'Publicare în grupul „' + destination.title.slice(0, 128) + '”, din partea botului:',
          '',
          preview,
          '',
          'Confirmarea expiră în 15 minute.',
        ].join('\n'), [[
          { text: 'Trimite în grup', callback_data: 'b:ok:' + token },
          { text: 'Renunță', callback_data: 'b:no:' + token },
        ]]);
        return true;
      } finally {
        if (drafts.get(m.fromId) === preparing) drafts.delete(m.fromId);
      }
    },
    async callback(m: CallbackIn): Promise<void> {
      if (!allowed(m)) { await deps.answer(m.id, 'Acțiune disponibilă numai organizatorului, în privat.'); return; }
      const match = /^b:(ok|no):([\w-]+)$/.exec(m.data);
      const draft = drafts.get(m.fromId);
      if (!match || !draft || !('destination' in draft) || draft.token !== match[2] || draft.expires <= deps.now()) {
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
  async prepareFormInvite() {
    try {
      await ensureFormsAvailable();
      const bot = await getMe();
      const username = bot.result?.username;
      if (!bot.ok || !username || !/^[a-z][\w]{4,31}$/i.test(username)) return undefined;
      const url = 'https://t.me/' + username + '?start=';
      return {
        text: 'Salut! Vrem să aflăm cum te simți în grup și ce ți-ar plăcea să facem mai des. Poți să ne lași feedback sau să îți completezi profilul de antrenament. Ambele se deschid în privat.',
        links: [
          [{ text: 'Dă feedback', url: url + 'feedback' }],
          [{ text: 'Completează profilul', url: url + 'profil' }],
        ],
      };
    } catch {
      console.error('[member-forms] group invitation unavailable');
      return undefined;
    }
  },
  reply: (id,text,kb) => sendMessage(id,text,kb ? {reply_markup:{inline_keyboard:kb}} : undefined),
  answer: answerCallbackQuery,
  publish: (group, content) => content.kind === 'message'
    ? sendMessage(group, content.text, content.links ? { reply_markup: { inline_keyboard: content.links } } : undefined)
    : sendGeneralPoll(group, content.question, content.options),
});

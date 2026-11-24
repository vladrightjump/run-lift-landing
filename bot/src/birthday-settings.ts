import { randomUUID } from 'node:crypto';
import { sendFormText } from './member-forms.js';
import {
  birthdayPreference, changeBirthday, isMissingBirthdaySchema, readTelegramBirthday,
  type BirthdayPreference,
} from './lib/birthdays.js';
import { DRAFT_TTL_MS } from './lib/drafts.js';
import { currentTelegramMember } from './lib/membership.js';
import { answerCallbackQuery, type InlineKeyboard } from './lib/telegram.js';

const UNAVAILABLE = 'Setările pentru aniversare sunt indisponibile momentan.';
const MEMBERS_ONLY = 'Setările pentru aniversare sunt disponibile membrilor grupului de antrenament.';
const LOOKUP_UNAVAILABLE = 'Verificarea datei din Telegram nu este disponibilă momentan.';

type SettingAction = 'enable' | 'disable' | 'clear';
interface Callback {
  id: string;
  fromId: number;
  chatId?: number;
  chatType?: string;
  data: string;
}
interface Card {
  token: string;
  group: string | undefined;
  revision: number;
  expires: number;
}

const cards = new Map<number, Card>();
const pending = new Map<number, Promise<void>>();

function inOrder(userId: number, work: () => Promise<void>): Promise<void> {
  const next = (pending.get(userId) ?? Promise.resolve()).then(async () => {
    try {
      await work();
    } catch (error) {
      if (!isMissingBirthdaySchema(error)) console.error('[birthday-settings] operation unavailable');
      await sendFormText(userId, UNAVAILABLE).catch(() => {});
    }
  });
  pending.set(userId, next);
  return next.finally(() => {
    if (pending.get(userId) === next) pending.delete(userId);
  });
}

function usesTelegram(preference: BirthdayPreference): boolean {
  return preference.source === null || preference.source === 'telegram';
}

function showSettings(userId: number, group: string | undefined, preference: BirthdayPreference, note?: string): Promise<unknown> {
  const now = Date.now();
  for (const [id, card] of cards) {
    if (card.expires <= now) cards.delete(id);
  }
  const token = randomUUID();
  const button = (text: string, action: SettingAction) => ({ text, callback_data: 'bd:' + token + ':' + action });
  const keyboard: InlineKeyboard = preference.enabled
    ? [[button('Oprește urările', 'disable')]]
    : [[button('Activează urările', 'enable')]];
  if (preference.day !== null) keyboard.push([button('Șterge data', 'clear')]);
  if (preference.enabled && preference.import_blocked) {
    keyboard.push([button('Folosește din nou data din Telegram', 'enable')]);
  }

  const lines = [
    'Urări de ziua de naștere',
    preference.enabled ? 'Urările în grup sunt active.' : 'Urările în grup sunt oprite.',
  ];
  if (preference.day !== null && preference.month !== null) {
    const date = [preference.day, preference.month].map(n => String(n).padStart(2, '0')).join('.');
    lines.push('Data salvată: ' + date);
  } else if (preference.enabled) {
    lines.push('Data de naștere nu este disponibilă. O poate adăuga un organizator.');
  }
  if (!preference.enabled || preference.import_blocked) {
    lines.push('La activare, botul poate folosi ziua și luna din profilul Telegram, dacă sunt vizibile.');
  }
  if (note) lines.push(note);

  cards.set(userId, { token, group, revision: preference.revision, expires: now + DRAFT_TTL_MS });
  return sendFormText(userId, lines.join('\n\n'), keyboard);
}

export const birthdaySettings = {
  open(userId: number): Promise<void> {
    return inOrder(userId, async () => {
      cards.delete(userId);
      const group = process.env.TELEGRAM_GROUP_CHAT_ID;
      let preference = await birthdayPreference(userId);
      const saved = preference.revision > 0 || preference.day !== null || preference.import_blocked;
      const shouldRefresh = preference.enabled && !preference.import_blocked && usesTelegram(preference);
      let note: string | undefined;
      if (!saved || shouldRefresh) {
        if (!group && !saved) throw new Error('Park group unavailable');
        const member = group ? await currentTelegramMember(group, userId).catch(error => {
          if (!saved) throw error;
          return null;
        }) : null;
        if (!saved && !member) {
          await sendFormText(userId, MEMBERS_ONLY);
          return;
        }
        if (shouldRefresh && member) {
          const lookup = await readTelegramBirthday(userId).catch(() => undefined);
          if (lookup === undefined) note = LOOKUP_UNAVAILABLE;
          else if ((lookup?.day ?? null) !== preference.day || (lookup?.month ?? null) !== preference.month) {
            preference = await changeBirthday(userId, 'refresh', lookup, preference.revision);
          }
        }
      }
      await showSettings(userId, group, preference, note);
    });
  },

  async callback({ id, fromId, chatId, chatType, data }: Callback): Promise<void> {
    if (chatType !== 'private' || chatId !== fromId) {
      await answerCallbackQuery(id).catch(() => {});
      return;
    }
    await inOrder(fromId, async () => {
      const match = /^bd:([0-9a-f-]{36}):(enable|disable|clear)$/.exec(data);
      const card = cards.get(fromId);
      if (!match || !card || card.token !== match[1] || card.expires <= Date.now()) {
        await answerCallbackQuery(id, 'Setările au expirat. Redeschide /aniversare.').catch(() => {});
        return;
      }
      cards.delete(fromId);
      await answerCallbackQuery(id).catch(() => {});
      const action = match[2] as SettingAction;
      if (action !== 'enable') {
        await showSettings(fromId, card.group, await changeBirthday(fromId, action));
        return;
      }
      if (!card.group || card.group !== process.env.TELEGRAM_GROUP_CHAT_ID ||
          !(await currentTelegramMember(card.group, fromId))) {
        await sendFormText(fromId, MEMBERS_ONLY);
        return;
      }

      const preference = await birthdayPreference(fromId);
      const updated = 'Setările s-au schimbat. Verifică-le și încearcă din nou.';
      if (preference.revision !== card.revision) {
        await showSettings(fromId, card.group, preference, updated);
        return;
      }
      const usesProfile = usesTelegram(preference);
      const lookup = usesProfile ? await readTelegramBirthday(fromId).catch(() => undefined) : undefined;
      const next = await changeBirthday(fromId, 'enable', lookup, preference.revision);
      const note = !next.enabled ? updated : usesProfile && lookup === undefined ? LOOKUP_UNAVAILABLE : undefined;
      await showSettings(fromId, card.group, next, note);
    });
  },
};

import { randomUUID } from 'node:crypto';
import { DRAFT_TTL_MS } from './lib/drafts.js';
import { membershipState } from './lib/membership.js';
import {
  ensureFormsAvailable, FEELINGS, readMemberProfile, saveFeedback, saveMemberProfile, TOPICS,
  type FeedbackFields, type ProfileFields, type Topic,
} from './lib/member-form-data.js';
import { answerCallbackQuery, editMessageText, getChatMember, sendMessage, type InlineKeyboard } from './lib/telegram.js';

export const MEMBER_COMMANDS = [
  { command: 'feedback', description: 'Spune-ne cum e în grup' },
  { command: 'profil', description: 'Completează sau editează profilul de antrenament' },
];

const PRIVACY = 'Răspunsurile se salvează fără nume și fără legătură cu profilul. Evită detaliile care te pot identifica.';
const UNAVAILABLE = 'Formularul e indisponibil momentan. Încearcă din nou mai târziu.';
const MEMBERS_ONLY = 'Formularul este disponibil membrilor grupului de antrenament.';
const TOPIC_KEYS = Object.keys(TOPICS) as Topic[];

interface DraftBase {
  group: string;
  token: string;
  expires: number;
  promptId?: number;
  lastMessageId?: number;
}

type FeedbackDraft = DraftBase & {
  kind: 'feedback';
  step: 'feeling' | 'topics' | 'comment' | 'preview';
  submissionId: string;
  fields: FeedbackFields;
};
type ProfileDraft = DraftBase & {
  kind: 'profil';
  step: 'name' | 'birthday' | 'greeting' | 'goal' | 'preview';
  fields: ProfileFields;
};
type Draft = FeedbackDraft | ProfileDraft;

interface PrivateText {
  chatId: number;
  fromId: number;
  fromName: string;
  chatType: string;
  text: string;
  messageId?: number;
}

interface FormCallback {
  id: string;
  chatId: number | undefined;
  chatType: string | undefined;
  fromId: number;
  data: string;
}

const drafts = new Map<number, Draft>();
const pending = new Map<number, Promise<void>>();

function runInOrder(id: number, work: () => Promise<void>): Promise<void> {
  const next = (pending.get(id) ?? Promise.resolve()).catch(() => {}).then(work);
  pending.set(id, next);
  return next.finally(() => {
    if (pending.get(id) === next) pending.delete(id);
  });
}

setInterval(() => {
  const now = Date.now();
  for (const [id, draft] of drafts) {
    if (draft.expires <= now && !pending.has(id)) drafts.delete(id);
  }
}, 60_000).unref();

function liveDraft(id: number): Draft | undefined {
  const draft = drafts.get(id);
  if (draft && draft.expires <= Date.now()) {
    drafts.delete(id);
    return undefined;
  }
  return draft;
}

export function sendFormText(chatId: number | string, text: string, keyboard?: InlineKeyboard) {
  return sendMessage(chatId, text, {
    link_preview_options: { is_disabled: true },
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

function birthday(fields: ProfileFields): string {
  if (fields.birth_day == null || fields.birth_month == null) return 'nespecificată';
  return [fields.birth_day, fields.birth_month].map(n => String(n).padStart(2, '0')).join('.');
}

function profilePreview(fields: ProfileFields): string {
  return [
    'Verifică profilul înainte de salvare.',
    'Nume: ' + fields.display_name,
    'Zi de naștere: ' + birthday(fields),
    'Urare în grup: ' + (fields.birthday_greeting ? 'Da' : 'Nu'),
    'Obiectiv: ' + (fields.training_goal ?? 'nespecificat'),
  ].join('\n');
}

function prompt(draft: Draft): { text: string; keyboard: InlineKeyboard } {
  const key = (text: string, action: string) => ({ text, callback_data: 'f:' + draft.token + ':' + action });
  const show = (text: string, keyboard: InlineKeyboard = []) => ({
    text, keyboard: [...keyboard, [key('Renunță', 'cancel')]],
  });
  if (draft.kind === 'feedback') {
    const { fields } = draft;
    switch (draft.step) {
      case 'feeling':
        return show(PRIVACY + '\n\nCum te simți în grup în ultima perioadă?',
          FEELINGS.map((label, i) => [key(label, String(i + 1))]));
      case 'topics':
        return show('Ce ai vrea să facem mai des? Poți alege mai multe.', [
          ...TOPIC_KEYS.map(topic => [key((fields.topics.includes(topic) ? '✓ ' : '') + TOPICS[topic], topic)]),
          [key('Continuă', 'next')],
        ]);
      case 'comment':
        return show('Ce am putea schimba ca să vii mai ușor sau cu mai mult drag la antrenament?\n\nScrie aici sau sari peste.',
          [[key('Sari peste', 'skip')]]);
      case 'preview':
        return show([
          'Verifică răspunsurile.',
          'Cum te simți: ' + FEELINGS[fields.feeling - 1],
          'Ce vrei mai des: ' + fields.topics.map(topic => TOPICS[topic]).join(', '),
          'Sugestie: ' + (fields.comment ?? '—'),
          '',
          PRIVACY,
        ].join('\n'), [[key('Trimite feedbackul', 'save')]]);
    }
  }

  const { fields } = draft;
  switch (draft.step) {
    case 'name':
      return show('Cum vrei să îți spunem? Scrie numele aici.' +
        (fields.display_name ? '\n\nNumele propus: ' + fields.display_name : ''),
      fields.display_name.trim().length >= 2 && fields.display_name.length <= 80
        ? [[key('Păstrează numele', 'keep')]] : []);
    case 'birthday':
      return show('Când e ziua ta de naștere? Scrie ziua și luna (de exemplu 27.11). Poți lăsa câmpul gol.', [
        ...(fields.birth_day !== null ? [[key('Păstrează ' + birthday(fields), 'keep')]] : []),
        [key('Fără zi de naștere', 'skip')],
      ]);
    case 'greeting':
      return show('Vrei ca botul să îți ureze „La mulți ani” în grup?', [
        [key('Da, urează-mi în grup', 'yes'), key('Fără urare', 'no')],
      ]);
    case 'goal':
      return show('Ce vrei să obții prin antrenament? Scrie în cuvintele tale sau sari peste.\n\nDe exemplu, „Vreau să alerg 5 km fără să mă opresc”.',
        [...(fields.training_goal ? [[key('Păstrează obiectivul', 'keep')]] : []), [key('Fără obiectiv', 'skip')]]);
    case 'preview':
      return show(profilePreview(fields), [[key('Salvează profilul', 'save'), key('Modifică', 'edit')]]);
  }
}

async function showPrompt(id: number, draft: Draft, options?: { edit?: boolean; note?: string }): Promise<void> {
  draft.token = randomUUID();
  draft.expires = Date.now() + DRAFT_TTL_MS;
  const { text, keyboard } = prompt(draft);
  const message = options?.note ? options.note + '\n\n' + text : text;
  if (options?.edit && draft.promptId !== undefined) {
    const edited = await editMessageText(id, draft.promptId, message, {
      reply_markup: { inline_keyboard: keyboard },
      link_preview_options: { is_disabled: true },
    }).catch(() => null);
    if (edited?.ok) return;
  }
  const sent = await sendFormText(id, message, keyboard);
  if (!sent.ok) throw new Error('Form prompt refused');
  draft.promptId = sent.result?.message_id;
}

async function isGroupMember(group: string, id: number): Promise<boolean> {
  const result = await getChatMember(group, id);
  if (!result.ok || !result.result || result.result.user.id !== id) throw new Error('Membership unavailable');
  return !result.result.user.is_bot && membershipState(result.result) === 'in_group';
}

async function openForm(input: PrivateText, kind: Draft['kind']): Promise<void> {
  const id = input.fromId;
  drafts.delete(id);
  const group = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!group) throw new Error('Park group unavailable');
  if (!(await isGroupMember(group, id))) {
    await sendFormText(id, MEMBERS_ONLY);
    return;
  }
  await ensureFormsAvailable();
  const base: DraftBase = { group, token: '', expires: Date.now() + DRAFT_TTL_MS, lastMessageId: input.messageId };
  const draft: Draft = kind === 'feedback'
    ? { ...base, kind, step: 'feeling', submissionId: randomUUID(), fields: { feeling: 0, topics: [], comment: null } }
    : { ...base, kind, step: 'name', fields: await readMemberProfile(id, input.fromName) };
  drafts.set(id, draft);
  await showPrompt(id, draft);
}

function parseBirthday(text: string): { day: number; month: number } | null {
  const match = /^(\d{1,2})[.\/-](\d{1,2})\.?$/.exec(text);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(Date.UTC(2000, month - 1, day));
  return date.getUTCDate() === day && date.getUTCMonth() === month - 1 ? { day, month } : null;
}

async function applyText(id: number, draft: Draft, value: string): Promise<void> {
  let note: string | undefined;
  if (draft.kind === 'feedback' && draft.step === 'comment') {
    if (value.length > 600) note = 'Scrie cel mult 600 de caractere.';
    else {
      draft.fields.comment = value;
      draft.step = 'preview';
    }
  } else if (draft.kind === 'profil') {
    if (draft.step === 'name') {
      const name = value.replace(/\s+/g, ' ');
      if (name.length < 2 || name.length > 80) note = 'Numele trebuie să aibă între 2 și 80 de caractere.';
      else {
        draft.fields.display_name = name;
        draft.step = 'birthday';
      }
    } else if (draft.step === 'birthday') {
      const date = parseBirthday(value);
      if (!date) note = 'Scrie o dată validă în formatul ZZ.LL, de exemplu 27.11.';
      else {
        draft.fields.birth_day = date.day;
        draft.fields.birth_month = date.month;
        draft.step = 'greeting';
      }
    } else if (draft.step === 'goal') {
      if (value.length > 500) note = 'Scrie cel mult 500 de caractere.';
      else {
        draft.fields.training_goal = value;
        draft.step = 'preview';
      }
    } else return;
  } else return;
  await showPrompt(id, draft, { note });
}

function advanceFeedback(draft: FeedbackDraft, action: string): string | undefined {
  if (draft.step === 'feeling' && /^[1-4]$/.test(action)) {
    draft.fields.feeling = Number(action);
    draft.step = 'topics';
  } else if (draft.step === 'topics') {
    const topic = TOPIC_KEYS.find(key => key === action);
    if (topic) {
      const selected = draft.fields.topics;
      draft.fields.topics = selected.includes(topic) ? selected.filter(key => key !== topic) : [...selected, topic];
    } else if (action === 'next') {
      if (!draft.fields.topics.length) return 'Alege cel puțin o opțiune ca să continui.';
      draft.step = 'comment';
    }
  } else if (draft.step === 'comment' && action === 'skip') draft.step = 'preview';
  return undefined;
}

function advanceProfile(draft: ProfileDraft, action: string): void {
  const { fields } = draft;
  if (draft.step === 'name' && action === 'keep') draft.step = 'birthday';
  else if (draft.step === 'birthday' && action === 'keep') draft.step = 'greeting';
  else if (draft.step === 'birthday' && action === 'skip') {
    fields.birth_day = null;
    fields.birth_month = null;
    fields.birthday_greeting = false;
    draft.step = 'goal';
  } else if (draft.step === 'greeting' && (action === 'yes' || action === 'no')) {
    fields.birthday_greeting = action === 'yes';
    draft.step = 'goal';
  } else if (draft.step === 'goal' && (action === 'keep' || action === 'skip')) {
    if (action === 'skip') fields.training_goal = null;
    draft.step = 'preview';
  } else if (draft.step === 'preview' && action === 'edit') draft.step = 'name';
}

async function submit(id: number, draft: Draft): Promise<void> {
  try {
    if (draft.group !== process.env.TELEGRAM_GROUP_CHAT_ID || !(await isGroupMember(draft.group, id))) {
      drafts.delete(id);
      await sendFormText(id, MEMBERS_ONLY);
      return;
    }
    if (draft.kind === 'feedback') await saveFeedback(draft.submissionId, draft.fields);
    else await saveMemberProfile(id, draft.fields);
  } catch {
    console.error('[member-forms] submission unavailable');
    await showPrompt(id, draft, { note: 'Salvarea nu a putut fi confirmată. Încearcă din nou.' });
    return;
  }
  drafts.delete(id);
  await sendFormText(id, draft.kind === 'feedback' ? 'Mulțumim pentru feedback!' : 'Profilul a fost salvat. Îl poți edita oricând cu /profil.');
}

async function safely(id: number, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch {
    console.error('[member-forms] form operation unavailable');
    await sendFormText(id, UNAVAILABLE).catch(() => {});
  }
}

async function closeForm(id: number): Promise<void> {
  if (drafts.has(id) || pending.has(id)) {
    await runInOrder(id, async () => { drafts.delete(id); });
  }
}

function expectsText(draft: Draft): boolean {
  return draft.kind === 'feedback' ? draft.step === 'comment'
    : draft.step === 'name' || draft.step === 'birthday' || draft.step === 'goal';
}

export const memberForms = {
  close: closeForm,
  async text(input: PrivateText): Promise<boolean> {
    const { chatId, fromId, chatType, text, messageId } = input;
    if (chatType !== 'private' || chatId !== fromId) return false;
    const command = /^\/(feedback|profil)(?:@\w+)?$/i.exec(text);
    const start = /^\/start(?:@\w+)?\s+(feedback|profil)$/i.exec(text);
    const entry = command ?? start;
    if (entry) {
      await runInOrder(chatId, () => safely(chatId, () => openForm(input, entry[1].toLowerCase() as Draft['kind'])));
      return true;
    }
    if (text.startsWith('/')) {
      await closeForm(chatId);
      return false;
    }
    if (!text || !drafts.has(chatId)) return false;
    let handled = true;
    await runInOrder(chatId, () => safely(chatId, async () => {
      const draft = liveDraft(chatId);
      if (!draft) {
        await sendFormText(chatId, 'Formularul a expirat. Redeschide-l cu /feedback sau /profil.');
        return;
      }
      if (!expectsText(draft)) { handled = false; return; }
      if (messageId !== undefined) {
        if (messageId <= (draft.lastMessageId ?? 0)) return;
        draft.lastMessageId = messageId;
      }
      await applyText(chatId, draft, text);
    }));
    return handled;
  },
  async callback(input: FormCallback): Promise<void> {
    const { id, chatId, chatType, fromId, data } = input;
    if (chatType !== 'private' || chatId !== fromId) {
      await answerCallbackQuery(id).catch(() => {});
      return;
    }
    await runInOrder(fromId, () => safely(fromId, async () => {
      const [, token, action] = data.split(':');
      const draft = liveDraft(fromId);
      if (!draft || draft.token !== token) {
        await answerCallbackQuery(id, 'Butonul a expirat sau a fost deja folosit.').catch(() => {});
        return;
      }
      await answerCallbackQuery(id).catch(() => {});
      if (action === 'cancel') {
        drafts.delete(fromId);
        await sendFormText(fromId, 'Formular închis.');
      } else if (action === 'save' && draft.step === 'preview') {
        await submit(fromId, draft);
      } else {
        let note: string | undefined;
        if (draft.kind === 'feedback') note = advanceFeedback(draft, action);
        else advanceProfile(draft, action);
        await showPrompt(fromId, draft, { edit: true, note });
      }
    }));
  },
};

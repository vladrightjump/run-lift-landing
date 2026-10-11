import { createAdminClient } from "../lib/supabase.js";
import { editMessageText, getChatMember, sendMessage, type InlineKeyboard, type TelegramMember } from "../lib/telegram.js";
import { todayInTz } from "../lib/tz.js";
import { organizerIds } from "../lib/organizers.js";
import { membershipState, recordMembership } from "../lib/membership.js";
import { alertKeyboard, alertText, settledText, type ReviewView } from "../lib/inactivity-text.js";

export interface Candidate {
  member_id: string;
  full_name: string;
  telegram_user_id: number | null;
  telegram_username: string | null;
  last_yes: string | null;
  join_date: string;
  anchor_date: string;
  weeks_missed: number;
}
export interface Change { change: "returned" | "left" | "reopened" | "settled"; review: ReviewView }
export type SentMessage = { chat_id: number; message_id: number };

export interface InactivityPorts {
  organizers: number[];
  group: string;
  today: string;
  maintain(today: string): Promise<Change[]>;
  candidates(today: string): Promise<Candidate[]>;
  open(c: Candidate): Promise<string | null>;
  setMessages(reviewId: string, messages: SentMessage[]): Promise<void>;
  discard(reviewId: string): Promise<void>;
  inspect(telegramId: number): Promise<TelegramMember>;
  record(member: TelegramMember): Promise<void>;
  send(chatId: number, text: string, keyboard: InlineKeyboard): Promise<number | null>;
  edit(chatId: number, messageId: number, text: string): Promise<void>;
}

// editMessageText that throws on a refused edit (the shared adapter for every
// place that edits an alert).
export async function editOrThrow(chatId: number, messageId: number, text: string): Promise<void> {
  const r = await editMessageText(chatId, messageId, text);
  if (!r.ok) throw new Error(r.description ?? "editMessageText failed");
}

// Edits every copy of a settled alert. A copy the organizer deleted only logs.
export async function editAll(
  review: ReviewView,
  edit: (chatId: number, messageId: number, text: string) => Promise<void>,
): Promise<void> {
  const text = settledText(review);
  for (const m of review.messages ?? []) {
    await edit(m.chat_id, m.message_id, text).catch((err) =>
      console.error(`[inactivity] edit ${m.chat_id}/${m.message_id}:`, err),
    );
  }
}

async function sendAlert(review: ReviewView, ports: InactivityPorts): Promise<SentMessage[]> {
  const sent: SentMessage[] = [];
  for (const chatId of ports.organizers) {
    const messageId = await ports.send(chatId, alertText(review), alertKeyboard(review.id)).catch((err) => {
      console.error(`[inactivity] send to ${chatId}:`, err);
      return null;
    });
    if (messageId != null) sent.push({ chat_id: chatId, message_id: messageId });
  }
  return sent;
}

// Opens one alert cycle per inactive member and sends it to every organizer;
// first settles the cycles whose situation changed (came back, left the group,
// postponement over). Runs once a day (R5). Idempotent: one active cycle per
// member is enforced in the database.
export async function runInactivity(ports: InactivityPorts): Promise<{ ok: boolean; detail: string }> {
  if (ports.organizers.length === 0 || !ports.group) return { ok: false, detail: "config" };

  let settled = 0;
  let reopened = 0;
  for (const { change, review } of await ports.maintain(ports.today)) {
    if (change !== "reopened") {
      await editAll(review, ports.edit);
      settled++;
      continue;
    }
    const sent = await sendAlert(review, ports);
    if (sent.length === 0) await ports.discard(review.id);
    else {
      await ports.setMessages(review.id, sent);
      reopened++;
    }
  }

  let opened = 0;
  for (const c of await ports.candidates(ports.today)) {
    if (!c.telegram_user_id || ports.organizers.includes(c.telegram_user_id)) continue;

    // Live check before alerting (R4): group admins are never alerted, and
    // someone who already left is recorded instead. A failed check retries tomorrow.
    let live: TelegramMember;
    try {
      live = await ports.inspect(c.telegram_user_id);
    } catch (err) {
      console.error(`[inactivity] getChatMember ${c.telegram_user_id}:`, err);
      continue;
    }
    if (live.status === "administrator" || live.status === "creator") continue;
    if (membershipState(live) !== "in_group") {
      await ports.record(live).catch((err) => console.error("[inactivity] record:", err));
      continue;
    }

    const id = await ports.open(c);
    if (!id) continue;
    const review: ReviewView = { id, status: "open", ...c };
    const sent = await sendAlert(review, ports);
    if (sent.length === 0) await ports.discard(id);
    else {
      await ports.setMessages(id, sent);
      opened++;
    }
  }

  console.log(`[inactivity] ${opened} new, ${reopened} reopened, ${settled} settled`);
  return { ok: true, detail: `${opened} new, ${reopened} reopened, ${settled} settled` };
}

const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
  const { data, error } = await createAdminClient().rpc(name, args);
  if (error) throw error;
  return data as T;
};

export const inactivityPorts = (): InactivityPorts => {
  const group = process.env.TELEGRAM_GROUP_CHAT_ID ?? "";
  return {
    organizers: organizerIds(),
    group,
    today: todayInTz(),
    maintain: (today) => rpc<Change[]>("inactivity_maintain", { p_today: today }),
    candidates: (today) => rpc<Candidate[]>("inactivity_candidates", { p_today: today }),
    open: (c) => rpc<string | null>("inactivity_open", { p_member: c.member_id, p_anchor: c.anchor_date, p_weeks: c.weeks_missed }),
    setMessages: (id, messages) => rpc<void>("inactivity_set_messages", { p_review: id, p_messages: messages }),
    discard: (id) => rpc<void>("inactivity_discard", { p_review: id }),
    async inspect(telegramId) {
      const r = await getChatMember(group, telegramId);
      if (!r.ok || !r.result) throw new Error(r.description ?? "getChatMember failed");
      return r.result;
    },
    record: (member) => recordMembership(group, member, new Date().toISOString()),
    async send(chatId, text, keyboard) {
      const r = await sendMessage(chatId, text, { reply_markup: { inline_keyboard: keyboard } });
      return r.ok && r.result ? r.result.message_id : null;
    },
    edit: editOrThrow,
  };
};

export const inactivityAlert = () => runInactivity(inactivityPorts());

import { birthdaySettings } from './birthday-settings.js';
import { broadcastControl } from './broadcast-control.js';
import { FORM_ORGANIZER_COMMANDS, handleFormReport } from './member-form-reports.js';
import { MEMBER_COMMANDS, memberForms } from './member-forms.js';
import { trialCallback, trialJoinRequest, trialPrivateMessage, trialOrganizerText, missingTrialSchema } from './lib/trial.js';
import { recordMembership } from "./lib/membership.js";
import { memberControl, memberControlDeps } from "./member-control.js";
import { inactivityCallback, inactivityControlDeps } from "./inactivity-control.js";
import type { TelegramMember } from "./lib/telegram.js";
import { withinDeadline } from "./lib/deadline.js";
import { botEvent, botFailure, observeDatabase, unreportedFailure } from "./lib/log.js";
import { createAdminClient } from "./lib/supabase.js";
import {
  answerCallbackQuery,
  editMessageText,
  isUnchangedEdit,
  sendMessage,
  setMyCommands,
} from "./lib/telegram.js";
import { realPorts, renderSessionPoll } from "./jobs/day-ops.js";
import {
  ORGANIZER_COMMANDS,
  defaultDeps,
  handleControlCallback,
  handleOrganizerText,
  type ControlDeps,
} from "./control.js";
import { organizerIds } from "./lib/organizers.js";
import type { SessionRow } from "./lib/sessions.js";

// ── Telegram update payload (only the fields we use) ──────────────────────────
interface TgUser {
  is_bot?: boolean;
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TgChat {
  id: number;
  type: string; // "private" | "group" | "supergroup" | "channel"
}

export interface TgUpdate {
  update_id?: number;
  chat_join_request?: { chat: TgChat; from: TgUser; invite_link?: { invite_link: string } };
  chat_member?: { chat: TgChat; date: number; new_chat_member: TelegramMember };
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: { message_id: number; chat: TgChat };
  };
  message?: {
    message_id?: number;
    from?: TgUser;
    chat: TgChat;
    text?: string;
    new_chat_members?: TgUser[];
  };
}

// Throttled admin alert for vote-pipeline failures (max one DM / 10 min so a
// DB outage doesn't flood the admins).
let lastFailAlertAt = 0;
async function voteFailureAlert(detail: string) {
  const now = Date.now();
  if (now - lastFailAlertAt < 10 * 60_000) return;
  lastFailAlertAt = now;
  const { alertAdmins } = await import("./lib/notify.js");
  await alertAdmins(`⚠️ Problemă la înregistrarea voturilor: ${detail}. Telegram reîncearcă automat.`);
}

// The organizers' private chat, wired to the real database and Telegram.
function controlDeps(): ControlDeps {
  return defaultDeps(
    realPorts(),
    {
      async send(chatId, text, kb) {
        const r = await sendMessage(
          chatId,
          text,
          kb?.length ? { reply_markup: { inline_keyboard: kb } } : undefined,
        );
        return r.ok && r.result ? r.result.message_id : null;
      },
      async edit(chatId, messageId, text, kb) {
        const r = await editMessageText(chatId, messageId, text, {
          reply_markup: { inline_keyboard: kb ?? [] },
        });
        if (!r.ok && !isUnchangedEdit(r)) {
          // An old card can't be edited (deleted, too old): send a new one.
          await sendMessage(chatId, text, kb?.length ? { reply_markup: { inline_keyboard: kb } } : undefined);
        }
      },
      async answer(id, text) {
        // Best effort: a lost spinner answer must not abort the action.
        try {
          await answerCallbackQuery(id, text);
        } catch (err) {
          console.error("[control] answerCallbackQuery failed:", err);
        }
      },
    },
    organizerIds(),
  );
}

// Shows the command menu in one organizer's private chat (KTD13). Best effort.
export async function registerOrganizerMenu(chatId: number): Promise<void> {
  try {
    const r = await setMyCommands([...ORGANIZER_COMMANDS, ...MEMBER_COMMANDS, ...FORM_ORGANIZER_COMMANDS], {
      type: "chat", chat_id: chatId,
    });
    if (!r.ok) console.error(`[menu] setMyCommands for ${chatId} failed:`, r.description);
  } catch (err) {
    console.error("[menu]", err);
  }
}

export async function registerMemberMenu(): Promise<void> {
  try {
    const result = await setMyCommands(MEMBER_COMMANDS, { type: "all_private_chats" });
    if (!result.ok) console.error("[menu] member command registration refused");
  } catch {
    console.error("[menu] member command registration failed");
  }
}

// The organizers' private chat is never retried by Telegram: a failure there
// is logged and told to the organizer, who simply taps or writes again.
// Redelivering a Confirm would only answer "E deja făcut" (KTD5).
async function organizerSafely(chatId: number, work: () => Promise<void>): Promise<void> {
  const started = performance.now();
  try {
    await work();
  } catch (err) {
    unreportedFailure("control.handle_action", started, err);
    try {
      await sendMessage(chatId, `⚠️ Nu s-a putut face acum (${String(err).slice(0, 200)}). Încearcă din nou.`);
    } catch (sendErr) {
      console.error("[control] could not report the error:", sendErr);
    }
  }
}

// Process a single Telegram update. Returns false ONLY on a transient failure
// (e.g. DB write failed) — the server then answers non-2xx and Telegram
// REDELIVERS the update, so no vote is ever silently dropped. The attendance
// upsert is idempotent, which makes redelivery safe.
export async function handleUpdate(update: TgUpdate): Promise<boolean> {
  const started = performance.now();
  try {
    if (update.chat_join_request) { await trialJoinRequest(update.chat_join_request); return true; }
    if (update.chat_member) {
      const change = update.chat_member;
      await recordMembership(change.chat.id, change.new_chat_member, new Date(change.date * 1000).toISOString());
      return true;
    }
    const cb = update.callback_query;
    if (cb?.data?.startsWith('bd:')) {
      await birthdaySettings.callback({
        id: cb.id, fromId: cb.from.id, data: cb.data,
        chatId: cb.message?.chat.id, chatType: cb.message?.chat.type,
      });
      return true;
    }
    if (cb?.data?.startsWith('f:')) {
      await memberForms.callback({
        id: cb.id, fromId: cb.from.id, data: cb.data,
        chatId: cb.message?.chat.id, chatType: cb.message?.chat.type,
      });
      return true;
    }
    if (cb?.message?.chat.type === 'private' && cb.message.chat.id === cb.from.id &&
        /^[btmic]:/.test(cb.data ?? '')) {
      await memberForms.close(cb.from.id);
    }
    if (cb?.data?.startsWith('b:')) {
      await organizerSafely(cb.from.id, () => broadcastControl.callback({
        id: cb.id, fromId: cb.from.id, fromName: cb.from.first_name ?? String(cb.from.id),
        chatId: cb.message?.chat.id ?? cb.from.id, chatType: cb.message?.chat.type ?? 'unknown',
        messageId: cb.message?.message_id ?? null, data: cb.data!,
      }));
      return true;
    }
    if (cb?.data?.startsWith("t:")) {
      await organizerSafely(cb.from.id, () => trialCallback({ ...cb, data: cb.data! }));
      return true;
    }
    if (cb?.data?.startsWith("m:")) {
      await organizerSafely(cb.message?.chat.id ?? cb.from.id, () => memberControl.callback({
        id: cb.id, fromId: cb.from.id, fromName: cb.from.first_name ?? String(cb.from.id),
        chatId: cb.message?.chat.id ?? cb.from.id, chatType: cb.message?.chat.type ?? 'private',
        messageId: cb.message?.message_id ?? null, data: cb.data!,
      }, memberControlDeps()));
      return true;
    }
    if (cb?.data?.startsWith("i:")) {
      // The inactivity alert's buttons (Scoate / Amână / Nu scoate).
      await organizerSafely(cb.message?.chat.id ?? cb.from.id, () => inactivityCallback({
        id: cb.id, fromId: cb.from.id, fromName: cb.from.first_name ?? cb.from.username ?? String(cb.from.id),
        chatId: cb.message?.chat.id ?? cb.from.id, chatType: cb.message?.chat.type ?? 'unknown',
        messageId: cb.message?.message_id ?? null, data: cb.data!,
      }, inactivityControlDeps()));
      return true;
    }
    if (cb?.data?.startsWith("c:")) {
      // The organizers' control buttons (see organizerSafely).
      const data = cb.data;
      await organizerSafely(cb.message?.chat.id ?? cb.from.id, () =>
        handleControlCallback(
          {
            id: cb.id,
            fromId: cb.from.id,
            fromName: cb.from.first_name ?? cb.from.username ?? String(cb.from.id),
            chatId: cb.message?.chat.id ?? cb.from.id,
            chatType: cb.message?.chat.type ?? "private",
            messageId: cb.message?.message_id ?? null,
            data,
          },
          controlDeps(),
        ),
      );
      return true;
    }
    if (update.callback_query) {
      return await handleCallbackQuery(update.callback_query, update.update_id);
    } else if (update.message) {
      await handleMessage(update.message);
    }
    return true;
  } catch (err) {
    unreportedFailure("webhook.handle_update", started, err, "retry", { updateId: update?.update_id });
    void voteFailureAlert("procesarea actualizării a eșuat");
    return false; // transient — let Telegram retry
  }
}

async function handleCallbackQuery(
  cb: NonNullable<TgUpdate["callback_query"]>,
  updateId?: number,
): Promise<boolean> {
  const started = performance.now();
  const context = { updateId };
  const data = cb.data ?? "";
  // Expected: "att:yes:<session_id>" / "att:no:<session_id>"
  const match = /^att:(yes|no):(.+)$/.exec(data);
  if (!match) {
    await answerCallbackQuery(cb.id);
    return true; // garbage callback — nothing to retry
  }
  const response = match[1] as "yes" | "no";
  const sessionId = match[2];

  const supabase = createAdminClient();
  const from = cb.from;

  // A cancelled training takes no votes, not even from an older copy of its
  // poll that still has buttons (R14).
  const { data: sess, error: sessErr } = await supabase
    .from("training_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessErr) {
    botFailure("vote.read_session", "supabase", started, sessErr, "retry", context);
    void voteFailureAlert("nu pot citi antrenamentul");
    return false;
  }
  if (!voteAccepted(sess?.status ?? null)) {
    await answerCallbackQuery(cb.id, "Antrenamentul e anulat.");
    return true;
  }

  let member = await resolveMember(supabase, from, updateId);

  if (!member) {
    // Unknown Telegram account — auto-create a member from the Telegram name so
    // their vote counts immediately and shows on the live board. The admin can
    // rename / merge duplicates later from the dashboard.
    const autoName =
      [from.first_name, from.last_name].filter(Boolean).join(" ").trim() ||
      (from.username ? `@${from.username}` : `Membru ${from.id}`);
    const ins = await supabase
      .from("members")
      .insert({
        full_name: autoName.slice(0, 80),
        status: "active",
        telegram_user_id: from.id,
        telegram_username: from.username ?? null,
        bot_dm_enabled: false,
      })
      .select("id")
      .maybeSingle();
    if (ins.data) {
      member = ins.data as { id: string };
      botEvent("info", "vote_member_created", { operation: "vote.create_member" }, context);
    } else {
      // Insert failed (likely a concurrent create / race) — re-resolve so the
      // vote is never dropped.
      if (ins.error && ins.error.code !== "23505") {
        botFailure("vote.create_member", "supabase", started, ins.error, "failed", context);
      }
      member = await resolveMember(supabase, from, updateId);
    }
    // Clear any earlier "unmatched" parking row for them.
    await supabase
      .from("telegram_unmatched")
      .delete()
      .eq("telegram_user_id", from.id);
    if (!member) {
      // Last resort: park the identity so nothing about the person is lost,
      // alert the admins (throttled), and let Telegram redeliver the vote.
      botFailure("vote.resolve_member", "supabase", started, null, "retry", context);
      await supabase.from("telegram_unmatched").upsert(
        {
          telegram_user_id: from.id,
          username: from.username ?? null,
          first_name: from.first_name ?? null,
          last_name: from.last_name ?? null,
        },
        { onConflict: "telegram_user_id" },
      );
      void voteFailureAlert("nu pot crea membrul");
      await acknowledgeVote(cb.id, "Moment — se reîncearcă automat", updateId);
      return false;
    }
  }

  // First training = member has never confirmed a 'yes' before (any earlier
  // session). Only meaningful for a positive answer.
  let isFirstTraining = false;
  if (response === "yes") {
    const countStarted = performance.now();
    const { count, error } = await supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("member_id", member.id)
      .eq("response", "yes")
      .neq("session_id", sessionId);
    if (error) {
      botFailure("vote.count_prior_yes", "supabase", countStarted, error, "retry", context);
      void voteFailureAlert("nu pot verifica prezențele anterioare");
      return false;
    }
    isFirstTraining = (count ?? 0) === 0;
  }

  // Upsert on (session_id, member_id) — changing one's mind is allowed.
  const saveStarted = performance.now();
  const attRes = await supabase.from("attendance").upsert(
    {
      session_id: sessionId,
      member_id: member.id,
      response,
      is_first_training: isFirstTraining,
      responded_at: new Date().toISOString(),
    },
    { onConflict: "session_id,member_id" },
  );
  if (attRes.error) {
    botFailure("vote.save", "supabase", saveStarted, attRes.error, "retry", context);
    void voteFailureAlert("nu pot salva votul");
    await acknowledgeVote(cb.id, "Moment — se reîncearcă automat", updateId);
    return false;
  }
  botEvent("info", "vote_recorded", {
    operation: "vote.save", dependency: "supabase", outcome: "saved",
    duration_ms: Math.round(performance.now() - saveStarted),
  }, context);

  // The attendance upsert determines the webhook result. Each follow-up
  // starts independently and has the same deadline measured from the save.
  const auditStarted = performance.now();
  const audit = withinDeadline(FOLLOW_UP_MS, async (signal) => {
    const { error } = await supabase.from("attendance_log").insert({
      session_id: sessionId,
      member_id: member.id,
      telegram_user_id: from.id,
      response,
      source: "telegram",
    }).abortSignal(signal);
    if (error) throw error;
  }).catch((error) => botFailure("vote.audit", "supabase", auditStarted, error, "unconfirmed", context));
  const ack = acknowledgeVote(cb.id, response === "yes" ? "Notat ✅" : "Notat ❌", updateId);
  const refresh = cb.message && refreshPollMessage(
    supabase, cb.message.chat.id, cb.message.message_id, sessionId, updateId,
  );
  await Promise.all([audit, ack, refresh]);
  return true;
}

const FOLLOW_UP_MS = 4_000;

async function acknowledgeVote(id: string, text: string, updateId?: number): Promise<void> {
  const started = performance.now();
  try {
    const result = await withinDeadline(FOLLOW_UP_MS, (signal) => answerCallbackQuery(id, text, signal));
    if (!result.ok) throw result;
  } catch (error) {
    botFailure("vote.acknowledge", "telegram", started, error, "failed", { updateId });
  }
}

// Whether a vote on a session with this status is recorded. A missing session
// (deleted, or a garbage id) is left to the attendance insert, as before.
export function voteAccepted(status: string | null): boolean {
  return status !== "cancelled";
}

// Redraws the poll message that was tapped, from the session's current state:
// its time and place, the wording it went out with, and the live tally.
// Editing a message does NOT notify group members, so this is silent.
async function refreshPollMessage(
  supabase: ReturnType<typeof createAdminClient>,
  chatId: number,
  messageId: number,
  sessionId: string,
  updateId?: number,
): Promise<void> {
  let operation = "vote.refresh_read";
  let dependency: "supabase" | "telegram" = "supabase";
  let started = performance.now();
  try {
    await withinDeadline(FOLLOW_UP_MS, async (signal) => {
      const { data, error } = await supabase
        .from("training_sessions")
        .select("id, session_date, starts_at, location, status, poll_message_id, poll_wording")
        .eq("id", sessionId)
        .abortSignal(signal)
        .maybeSingle();
      if (error) throw error;
      if (!data) return;
      operation = "vote.refresh_tally";
      started = performance.now();
      const { text, keyboard } = await renderSessionPoll(supabase, data as SessionRow, signal);
      signal.throwIfAborted();
      operation = "vote.refresh_edit";
      dependency = "telegram";
      started = performance.now();
      const result = await editMessageText(chatId, messageId, text, {
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      }, signal);
      if (!result.ok && !isUnchangedEdit(result)) throw result;
    });
  } catch (error) {
    botFailure(operation, dependency, started, error, "failed", { updateId });
  }
}

// Resolve a Telegram user to a member. Primary key is telegram_user_id; falls
// back to a case-insensitive telegram_username match, persisting the numeric id
// on the member for next time.
async function resolveMember(
  supabase: ReturnType<typeof createAdminClient>,
  from: TgUser,
  updateId?: number,
): Promise<{ id: string } | null> {
  const context = { updateId };
  const byId = await observeDatabase("vote.read_member_id", () => supabase
    .from("members")
    .select("id")
    .eq("telegram_user_id", from.id)
    .maybeSingle(), "retry", context);
  if (byId) return byId;

  const username = from.username;
  if (username) {
    const byUsername = await observeDatabase("vote.read_member_username", () => supabase
      .from("members")
      .select("id")
      .ilike("telegram_username", username)
      .is("telegram_user_id", null)
      .maybeSingle(), "retry", context);
    if (byUsername) {
      // Remember the numeric id so future lookups hit the primary path.
      await observeDatabase("vote.link_member", () => supabase
        .from("members")
        .update({ telegram_user_id: from.id })
        .eq("id", byUsername.id), "failed", context).catch(() => {});
      return byUsername;
    }
  }

  return null;
}

// Normalize a free-text name reply: collapse inner whitespace and trim.
export function cleanName(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Whether a cleaned string is a plausible full name to auto-register with.
export function isValidName(name: string): boolean {
  return !name.startsWith("/") && name.length >= 2 && name.length <= 80;
}

// Handles private-chat messages: the /start onboarding + the name reply that
// creates a member. Group messages are ignored.
async function handleMessage(msg: NonNullable<TgUpdate["message"]>) {
  // Group join capture: anyone added to the group lands in the unmatched list
  // automatically (unless already a linked member), so admins see newcomers.
  if (msg.new_chat_members?.length && msg.chat.type !== "private") {
    if (String(msg.chat.id) !== process.env.TELEGRAM_GROUP_CHAT_ID) return;
    const supabase = createAdminClient();
    for (const u of msg.new_chat_members) {
      if (!u?.id || u.is_bot) continue;
      const { data: existing } = await supabase
        .from("members")
        .select("id")
        .eq("telegram_user_id", u.id)
        .maybeSingle();
      if (existing) continue; // already known
      await supabase.from("telegram_unmatched").upsert(
        {
          telegram_user_id: u.id,
          username: u.username ?? null,
          first_name: u.first_name ?? null,
          last_name: u.last_name ?? null,
        },
        { onConflict: "telegram_user_id" },
      );
      console.log(
        `[join] captured new group member tg ${u.id} (@${u.username ?? "-"})`,
      );
    }
    return;
  }

  if (msg.chat.type !== "private") return;
  if (!msg.from) return;
  const text = (msg.text ?? "").trim();
  if (await memberForms.text({
    chatId: msg.chat.id, chatType: msg.chat.type, fromId: msg.from.id,
    fromName: [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" "),
    text, messageId: msg.message_id,
  })) return;
  if (msg.chat.id === msg.from.id && /^\/aniversare(?:@\w+)?$/i.test(text)) {
    await birthdaySettings.open(msg.from.id);
    return;
  }
  if (await handleFormReport(msg.chat.id, msg.from.id, text)) return;
  if (/^\/stop(?:@\w+)?$/i.test(text)) {
    const db = createAdminClient();
    const memberResult = await db.from('members').update({ bot_dm_enabled: false }).eq('telegram_user_id', msg.from.id);
    if (memberResult.error) throw memberResult.error;
    const prospectResult = await db.from('trial_prospects').update({ dm_enabled: false }).eq('telegram_user_id', msg.from.id);
    if (prospectResult.error && !missingTrialSchema(prospectResult.error)) throw prospectResult.error;
    await sendMessage(msg.chat.id, 'Am oprit mesajele automate. Scrie /start pentru a le relua.');
    return;
  }

  if (/^\/(mesaj|poll|feedback_grup)(?:@\w+)?(?:\s|$)/i.test(text)) {
    await organizerSafely(msg.chat.id, () => broadcastControl.text({
      chatId: msg.chat.id, chatType: msg.chat.type, fromId: msg.from!.id,
      fromName: msg.from!.first_name ?? String(msg.from!.id), text,
    }).then(() => {}));
    return;
  }

  // A question reply has a persisted, expiring context and requires explicit confirmation.
  if (text && await trialOrganizerText(msg.from.id, text)) return;

  // An organizer's command, or the answer to the bot's question (U4).
  if (text) {
    const from = msg.from;
    let handled = false;
    await organizerSafely(msg.chat.id, async () => {
      handled = await memberControl.text({ chatId: msg.chat.id, chatType: msg.chat.type,
        fromId: from.id, fromName: from.first_name ?? String(from.id), text }, memberControlDeps());
    });
    if (handled || /^\/scoate(?:@\w+)?(?:\s|$)/i.test(text)) return;
    await organizerSafely(msg.chat.id, async () => {
      handled = await handleOrganizerText(
        {
          chatId: msg.chat.id,
          chatType: msg.chat.type,
          fromId: from.id,
          fromName: from.first_name ?? from.username ?? String(from.id),
          text,
        },
        controlDeps(),
      );
    });
    // A failure on an organizer's command is reported above, not retried.
    if (handled || (organizerIds().includes(from.id) && text.startsWith("/") && !text.startsWith("/start"))) {
      return;
    }
  }

  const supabase = createAdminClient();
  const { data: existing, error: memberError } = await supabase
    .from("members")
    .select("id, full_name")
    .eq("telegram_user_id", msg.from.id)
    .maybeSingle();
  if (memberError) throw memberError;
  const member = existing as { id: string; full_name: string } | null;
  const { data: membership, error: membershipError } = await supabase.from('telegram_group_memberships')
    .select('state').eq('telegram_user_id', msg.from.id).eq('chat_id', process.env.TELEGRAM_GROUP_CHAT_ID ?? '').maybeSingle();
  if (membershipError) throw membershipError;

  // ── /start ──────────────────────────────────────────────────────────────
  if (text === "/start" || text.startsWith("/start")) {
    // An organizer who opens the chat after the bot started gets the menu now.
    if (organizerIds().includes(msg.from.id)) {
      await registerOrganizerMenu(msg.chat.id);
      await sendMessage(msg.chat.id, "Ca organizator: /antrenament deschide cardul, /ajutor arată comenzile.");
    }
    if (membership?.state === 'kicked') {
      await sendMessage(msg.chat.id, 'Accesul tău în grup este restricționat. Contactează organizatorul; botul nu poate anula excluderea.');
      return;
    }
    if ((member && membership?.state !== 'left') || membership?.state === 'in_group') {
      // Already registered — just (re)enable DMs and greet.
      if (member) await supabase
        .from("members")
        .update({ bot_dm_enabled: true })
        .eq("id", member.id);
      const resumed = await supabase.from('trial_prospects').update({ dm_enabled: true }).eq('telegram_user_id', msg.from.id);
      if (resumed.error && !missingTrialSchema(resumed.error)) throw resumed.error;
      const firstName = member?.full_name.split(/\s+/)[0] || msg.from.first_name || 'prietene';
      await sendMessage(
        msg.chat.id,
        `Salut, ${firstName}! 👋 Ești deja înscris. Îți voi trimite aici mesaje despre antrenamente.`,
      );
      return;
    }
    await trialPrivateMessage(msg.from, text, msg.message_id);
    return;
  }

  if (membership?.state === 'in_group' || membership?.state === 'kicked' || (member && membership?.state !== 'left')) return;
  await trialPrivateMessage(msg.from, text, msg.message_id);
}

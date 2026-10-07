import { createAdminClient } from "./lib/supabase.js";
import {
  answerCallbackQuery,
  editMessageText,
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
  callback_query?: {
    id: string;
    from: TgUser;
    data?: string;
    message?: { message_id: number; chat: TgChat };
  };
  message?: {
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
        if (!r.ok && r.description !== "Bad Request: message is not modified") {
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
    const r = await setMyCommands(ORGANIZER_COMMANDS, { type: "chat", chat_id: chatId });
    if (!r.ok) console.error(`[menu] setMyCommands for ${chatId} failed:`, r.description);
  } catch (err) {
    console.error("[menu]", err);
  }
}

// The organizers' private chat is never retried by Telegram: a failure there
// is logged and told to the organizer, who simply taps or writes again.
// Redelivering a Confirm would only answer "E deja făcut" (KTD5).
async function organizerSafely(chatId: number, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (err) {
    console.error("[control] handler error:", err);
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
  try {
    const cb = update.callback_query;
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
      return await handleCallbackQuery(update.callback_query);
    } else if (update.message) {
      await handleMessage(update.message);
    }
    return true;
  } catch (err) {
    console.error("[telegram/webhook] handler error:", err);
    void voteFailureAlert(String(err));
    return false; // transient — let Telegram retry
  }
}

async function handleCallbackQuery(
  cb: NonNullable<TgUpdate["callback_query"]>,
): Promise<boolean> {
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
  if (sessErr) throw new Error(sessErr.message); // transient — Telegram retries
  if (!voteAccepted(sess?.status ?? null)) {
    await answerCallbackQuery(cb.id, "Antrenamentul e anulat.");
    return true;
  }

  let member = await resolveMember(supabase, from);

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
      console.log(
        `[vote] auto-created member "${autoName}" (tg ${from.id} @${from.username ?? "-"})`,
      );
    } else {
      // Insert failed (likely a concurrent create / race) — re-resolve so the
      // vote is never dropped.
      if (ins.error) console.error("[vote] member insert error:", ins.error.message);
      member = await resolveMember(supabase, from);
    }
    // Clear any earlier "unmatched" parking row for them.
    await supabase
      .from("telegram_unmatched")
      .delete()
      .eq("telegram_user_id", from.id);
    if (!member) {
      // Last resort: park the identity so nothing about the person is lost,
      // alert the admins (throttled), and let Telegram redeliver the vote.
      console.error(
        `[vote] RETRY: could not resolve/create member for tg ${from.id} (@${from.username ?? "-"}), response=${response}`,
      );
      await supabase.from("telegram_unmatched").upsert(
        {
          telegram_user_id: from.id,
          username: from.username ?? null,
          first_name: from.first_name ?? null,
          last_name: from.last_name ?? null,
        },
        { onConflict: "telegram_user_id" },
      );
      void voteFailureAlert(`nu pot crea membrul pentru @${from.username ?? from.id}`);
      await answerCallbackQuery(cb.id, "Moment — se reîncearcă automat");
      return false;
    }
  }

  // First training = member has never confirmed a 'yes' before (any earlier
  // session). Only meaningful for a positive answer.
  let isFirstTraining = false;
  if (response === "yes") {
    const { count } = await supabase
      .from("attendance")
      .select("id", { count: "exact", head: true })
      .eq("member_id", member.id)
      .eq("response", "yes")
      .neq("session_id", sessionId);
    isFirstTraining = (count ?? 0) === 0;
  }

  // Upsert on (session_id, member_id) — changing one's mind is allowed.
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
    console.error(
      `[vote] FAILED to record: member ${member.id} → ${response} (session ${sessionId}): ${attRes.error.message}`,
    );
    void voteFailureAlert(attRes.error.message);
    await answerCallbackQuery(cb.id, "Moment — se reîncearcă automat");
    return false; // Telegram redelivers; upsert is idempotent
  }
  console.log(
    `[vote] recorded: member ${member.id} → ${response} (session ${sessionId})`,
  );

  // Append-only audit trail — every tap (incl. changes of mind) kept forever.
  const logRes = await supabase.from("attendance_log").insert({
    session_id: sessionId,
    member_id: member.id,
    telegram_user_id: from.id,
    response,
    source: "telegram",
  });
  if (logRes.error) console.error("[vote-log]", logRes.error.message);

  await answerCallbackQuery(cb.id, response === "yes" ? "Notat ✅" : "Notat ❌");

  // Refresh the poll message in place with the live tally. Editing a message
  // does NOT notify group members, so this updates silently on every vote.
  if (cb.message) {
    await refreshPollMessage(
      supabase,
      cb.message.chat.id,
      cb.message.message_id,
      sessionId,
    );
  }
  return true;
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
) {
  try {
    const { data } = await supabase
      .from("training_sessions")
      .select("id, session_date, starts_at, location, status, poll_message_id, poll_wording")
      .eq("id", sessionId)
      .maybeSingle();
    if (!data) return;
    const { text, keyboard } = await renderSessionPoll(supabase, data as SessionRow);
    const res = await editMessageText(chatId, messageId, text, {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: keyboard },
    });
    if (!res.ok && res.description !== "Bad Request: message is not modified") {
      console.error("[refresh-poll] edit failed:", res.description);
    }
  } catch (err) {
    console.error("[refresh-poll]", err);
  }
}

// Resolve a Telegram user to a member. Primary key is telegram_user_id; falls
// back to a case-insensitive telegram_username match, persisting the numeric id
// on the member for next time.
async function resolveMember(
  supabase: ReturnType<typeof createAdminClient>,
  from: TgUser,
): Promise<{ id: string } | null> {
  const byId = await supabase
    .from("members")
    .select("id")
    .eq("telegram_user_id", from.id)
    .maybeSingle();
  if (byId.data) return byId.data as { id: string };

  if (from.username) {
    const byUsername = await supabase
      .from("members")
      .select("id")
      .ilike("telegram_username", from.username)
      .is("telegram_user_id", null)
      .maybeSingle();
    if (byUsername.data) {
      const m = byUsername.data as { id: string };
      // Remember the numeric id so future lookups hit the primary path.
      await supabase
        .from("members")
        .update({ telegram_user_id: from.id })
        .eq("id", m.id);
      return m;
    }
  }

  return null;
}

// Prompt shown to an unknown user so they can self-register by typing their name.
// force_reply pops the keyboard straight into a reply, so it feels like a form field.
const NAME_PROMPT =
  "Salut! 👋 Ca să te înscriu la antrenamente, scrie-mi numele și prenumele tău complet (ex. Vlad Filip).";

async function askForName(chatId: number) {
  await sendMessage(chatId, NAME_PROMPT, { reply_markup: { force_reply: true } });
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
    const supabase = createAdminClient();
    for (const u of msg.new_chat_members) {
      if (!u?.id) continue;
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

  // An organizer's command, or the answer to the bot's question (U4).
  if (text) {
    const from = msg.from;
    let handled = false;
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
  const { data: existing } = await supabase
    .from("members")
    .select("id, full_name")
    .eq("telegram_user_id", msg.from.id)
    .maybeSingle();
  const member = existing as { id: string; full_name: string } | null;

  // ── /start ──────────────────────────────────────────────────────────────
  if (text === "/start" || text.startsWith("/start")) {
    // An organizer who opens the chat after the bot started gets the menu now.
    if (organizerIds().includes(msg.from.id)) {
      await registerOrganizerMenu(msg.chat.id);
      await sendMessage(msg.chat.id, "Ca organizator: /antrenament deschide cardul, /ajutor arată comenzile.");
    }
    if (member) {
      // Already registered — just (re)enable DMs and greet.
      await supabase
        .from("members")
        .update({ bot_dm_enabled: true })
        .eq("id", member.id);
      const firstName = member.full_name.split(/\s+/)[0] || member.full_name;
      await sendMessage(
        msg.chat.id,
        `Salut, ${firstName}! 👋 Ești deja înscris. Îți voi trimite aici mesaje despre antrenamente.`,
      );
      return;
    }
    // Unknown → start the name form.
    await askForName(msg.chat.id);
    return;
  }

  // ── Any other private message ─────────────────────────────────────────────
  if (member) return; // registered members: nothing to do here.

  // Unknown user typing (expected: their name, in reply to the prompt).
  const name = cleanName(text);
  if (!isValidName(name)) {
    await askForName(msg.chat.id);
    return;
  }

  // Create the member, linked to this Telegram account, and clear any earlier
  // "unmatched" parking row for them.
  const { data: created } = await supabase
    .from("members")
    .insert({
      full_name: name,
      status: "active",
      telegram_user_id: msg.from.id,
      telegram_username: msg.from.username ?? null,
      bot_dm_enabled: true,
    })
    .select("id")
    .maybeSingle();

  await supabase
    .from("telegram_unmatched")
    .delete()
    .eq("telegram_user_id", msg.from.id);

  if (!created) {
    await sendMessage(
      msg.chat.id,
      "Ceva n-a mers la înscriere. Mai încearcă o dată, te rog.",
    );
    return;
  }

  const firstName = name.split(/\s+/)[0] || name;
  await sendMessage(
    msg.chat.id,
    `Gata, ${firstName}! ✅ Ești înscris. Vei primi aici mesajele despre antrenamente și poți răspunde la sondaje.`,
  );
}

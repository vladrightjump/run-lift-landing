import { createAdminClient } from "../lib/supabase.js";
import { sendMessage } from "../lib/telegram.js";
import { tomorrowInTz } from "../lib/tz.js";
import {
  buildPollText,
  effectiveWording,
  pollHeader,
  pollKeyboard,
} from "../lib/poll-text.js";
import { getBotConfig } from "../lib/config.js";

// Creates (idempotently) tomorrow's training session and posts the attendance
// poll into the Telegram group. Skips if tomorrow's session is cancelled or the
// poll was already sent. Training time / location come from bot_config, and so
// does the editable text; the text it went out with is copied onto the session.
export async function sendPoll(): Promise<{ ok: boolean; detail?: string }> {
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!groupChatId) {
    console.error("[send-poll] Missing TELEGRAM_GROUP_CHAT_ID");
    return { ok: false, detail: "config" };
  }

  const supabase = createAdminClient();
  const cfg = await getBotConfig();
  const sessionDate = tomorrowInTz();

  const { data: existing, error: selErr } = await supabase
    .from("training_sessions")
    .select("id, poll_message_id, status")
    .eq("session_date", sessionDate)
    .maybeSingle();
  if (selErr) {
    console.error("[send-poll] select error:", selErr);
    return { ok: false, detail: "select" };
  }

  if (existing?.status === "cancelled") {
    console.log(`[send-poll] ${sessionDate} is cancelled — skipping.`);
    return { ok: true, detail: "cancelled" };
  }
  if (existing?.poll_message_id) {
    return { ok: true, detail: "already-sent" };
  }

  let sessionId = existing?.id as string | undefined;
  if (!sessionId) {
    const { data: inserted, error: insErr } = await supabase
      .from("training_sessions")
      .insert({
        session_date: sessionDate,
        starts_at: cfg.trainingTime,
        location: cfg.location,
        status: "scheduled",
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      console.error("[send-poll] insert error:", insErr);
      return { ok: false, detail: "insert" };
    }
    sessionId = inserted.id as string;
  }

  const wording = effectiveWording({
    title: cfg.pollTitle,
    yes: cfg.pollYesLabel,
    no: cfg.pollNoLabel,
  });
  const keyboard = pollKeyboard(sessionId, wording);

  // Initial message with a friendly call-to-action; edited live as people vote.
  const text = buildPollText(
    pollHeader(sessionDate, cfg.trainingTime, cfg.location, wording.title),
    [],
    [],
  );

  const sent = await sendMessage(groupChatId, text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  });

  if (!sent.ok || !sent.result) {
    console.error("[send-poll] sendMessage failed:", sent.description);
    return { ok: false, detail: "telegram" };
  }

  const { error: updErr } = await supabase
    .from("training_sessions")
    // The copy makes every redraw use the text this poll went out with, even
    // if the settings change while it is in the group.
    .update({ poll_message_id: sent.result.message_id, poll_wording: wording })
    .eq("id", sessionId);
  if (updErr) {
    console.error("[send-poll] poll_message_id update error:", updErr);
  }

  console.log(
    `[send-poll] posted poll for ${sessionDate} (session ${sessionId}, msg ${sent.result.message_id})`,
  );
  return { ok: true, detail: "sent" };
}

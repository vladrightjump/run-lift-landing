import { createAdminClient } from "../lib/supabase.js";
import { sendMessage } from "../lib/telegram.js";
import { todayInTz, tomorrowInTz } from "../lib/tz.js";
import {
  buildPollText,
  effectiveWording,
  pollHeader,
  pollKeyboard,
  pollTitleFor,
} from "../lib/poll-text.js";
import { getBotConfig } from "../lib/config.js";
import { hhmm } from "../lib/sessions.js";

// Creates (idempotently) a training session and posts its attendance poll into
// the Telegram group — tomorrow's by default, or `date` (an extra, or a poll
// asked for from the organizer card). Skips a cancelled session, and one whose
// poll already went out unless `force` (then a new poll goes out and the old
// one stays). Time and place come from the session's row when it has one (it
// may have been moved; KTD10), otherwise from bot_config. The title depends on
// the day it goes out (KTD9); the text it went out with is copied onto the row.
export async function sendPoll(
  opts: { date?: string; force?: boolean } = {},
): Promise<{ ok: boolean; detail?: string }> {
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!groupChatId) {
    console.error("[send-poll] Missing TELEGRAM_GROUP_CHAT_ID");
    return { ok: false, detail: "config" };
  }

  const supabase = createAdminClient();
  const cfg = await getBotConfig();
  const sessionDate = opts.date ?? tomorrowInTz();

  let { data: existing, error: selErr } = await supabase
    .from("training_sessions")
    .select("id, poll_message_id, status, starts_at, location")
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
  if (existing?.poll_message_id && !opts.force) {
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
    if (insErr?.code === '23505') {
      const winner = await supabase.from('training_sessions').select('id, poll_message_id, status, starts_at, location').eq('session_date', sessionDate).single();
      if (winner.error || !winner.data) return { ok: false, detail: 'select' };
      existing = winner.data;
      if (existing.status === 'cancelled') return { ok: true, detail: 'cancelled' };
      if (existing.poll_message_id && !opts.force) return { ok: true, detail: 'already-sent' };
      sessionId = existing.id;
    } else if (insErr || !inserted) {
      console.error("[send-poll] insert error:", insErr);
      return { ok: false, detail: "insert" };
    }
    else sessionId = inserted.id as string;
  }

  if (!sessionId) return { ok: false, detail: 'select' };
  const configured = effectiveWording({
    title: cfg.pollTitle,
    yes: cfg.pollYesLabel,
    no: cfg.pollNoLabel,
  });
  const wording = {
    ...configured,
    title: pollTitleFor(sessionDate, todayInTz(), configured.title),
  };
  const keyboard = pollKeyboard(sessionId, wording);
  const time = existing?.starts_at ? hhmm(String(existing.starts_at)) : cfg.trainingTime;
  const location = existing?.location ?? cfg.location;

  // Initial message with a friendly call-to-action; edited live as people vote.
  const text = buildPollText(pollHeader(sessionDate, time, location, wording.title), [], []);

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

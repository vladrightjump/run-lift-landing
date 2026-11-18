import { createAdminClient } from "../lib/supabase.js";
import { botEvent, botFailure, observeTelegram } from "../lib/log.js";
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

// A database write can fail after Telegram confirms delivery. Keep evidence
// for active sessions across all callers (cron, admin queue, organizer chat).
const pollDeliveries = new Map<string, { sessionId: string; accepted: boolean }>();
const UNCONFIRMED = "livrare neconfirmată. Verifică grupul înainte de retrimitere";

export function wasPollAccepted(date: string, sessionId?: string): boolean {
  const evidence = pollDeliveries.get(date);
  return evidence?.accepted === true && (sessionId === undefined || evidence.sessionId === sessionId);
}

function rememberDelivery(date: string, sessionId: string, accepted: boolean): void {
  if (accepted || !wasPollAccepted(date, sessionId)) pollDeliveries.set(date, { sessionId, accepted });
  const today = todayInTz();
  for (const day of pollDeliveries.keys()) if (day < today) pollDeliveries.delete(day);
}

// Posts tomorrow's attendance poll by default. A forced send intentionally
// publishes a new poll even if one is already in the group.
export async function sendPoll(
  opts: { date?: string; force?: boolean } = {},
): Promise<{ ok: boolean; detail?: string }> {
  const sessionDate = opts.date ?? tomorrowInTz();
  const context = { sessionDate };
  let started = performance.now();
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!groupChatId) {
    botFailure("poll.read_group_config", "bot", started, null, "failed", context);
    return { ok: false, detail: "config" };
  }

  const supabase = createAdminClient();
  const cfg = await getBotConfig();
  started = performance.now();
  let { data: existing, error: selErr } = await supabase
    .from("training_sessions")
    .select("id, poll_message_id, status, starts_at, location")
    .eq("session_date", sessionDate)
    .maybeSingle();
  if (selErr) {
    botFailure("poll.read_session", "supabase", started, selErr, "failed", context);
    return { ok: false, detail: "select" };
  }

  let sessionId = existing?.id as string | undefined;
  if (!sessionId) {
    started = performance.now();
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
      started = performance.now();
      const winner = await supabase.from('training_sessions').select('id, poll_message_id, status, starts_at, location').eq('session_date', sessionDate).single();
      if (winner.error || !winner.data) {
        botFailure("poll.read_session", "supabase", started, winner.error, "failed", context);
        return { ok: false, detail: "select" };
      }
      existing = winner.data;
      sessionId = existing.id;
    } else if (insErr || !inserted) {
      botFailure("poll.create_session", "supabase", started, insErr, "failed", context);
      return { ok: false, detail: "insert" };
    }
    else sessionId = inserted.id as string;
  }

  if (!sessionId) return { ok: false, detail: 'select' };
  if (existing?.status === "cancelled") {
    botEvent("info", "poll_skipped", { operation: "poll.publish", outcome: "cancelled" }, context);
    return { ok: true, detail: "cancelled" };
  }
  if (!opts.force) {
    if (existing?.poll_message_id || wasPollAccepted(sessionDate, sessionId)) {
      return { ok: true, detail: "already-sent" };
    }
    if (pollDeliveries.get(sessionDate)?.sessionId === sessionId) {
      botEvent("warn", "poll_skipped", { operation: "poll.publish", outcome: "unconfirmed" }, context);
      return { ok: false, detail: UNCONFIRMED };
    }
  }
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

  started = performance.now();
  const sent = await observeTelegram("poll.send_message", () => sendMessage(groupChatId, text, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  }), "unconfirmed", undefined, context).catch(() => null);

  if (sent && !sent.ok) return { ok: false, detail: "telegram" };
  if (!sent?.result) {
    if (sent) botFailure("poll.send_message", "telegram", started, null, "unconfirmed", context);
    rememberDelivery(sessionDate, sessionId, false);
    return { ok: false, detail: UNCONFIRMED };
  }

  rememberDelivery(sessionDate, sessionId, true);
  started = performance.now();
  try {
    const { error } = await supabase
      .from("training_sessions")
      // Keep the wording used by the published poll for later redraws.
      .update({ poll_message_id: sent.result.message_id, poll_wording: wording })
      .eq("id", sessionId);
    if (error) throw error;
    botEvent("info", "poll_posted", { operation: "poll.publish", outcome: "confirmed" }, context);
  } catch (error) {
    botFailure("poll.save_message_id", "supabase", started, error, "posted_metadata_unconfirmed", context);
  }
  return { ok: true, detail: "sent" };
}

import { executeKick, kickPorts } from "../lib/kick-member.js";
import { organizerIds } from "../lib/organizers.js";
import { createAdminClient } from "../lib/supabase.js";
import { sendMessage } from "../lib/telegram.js";
import { tomorrowInTz } from "../lib/tz.js";
import { alertAdmins } from "../lib/notify.js";
import { sendPoll } from "./send-poll.js";
import { morningSummary } from "./morning-summary.js";
import { realPorts, runQueuedNotice } from "./day-ops.js";

interface ActionRow {
  id: string;
  action: string;
  member_id: string | null;
  telegram_user_id: number | null;
  payload: ({ html?: string } & Record<string, unknown>) | null;
}

// Drains pending rows from bot_actions and executes them. Called every tick.
//   kick_member — removes a user from the group (bot must be group admin)
//   send_poll   — posts a fresh poll to the group immediately ("send now")
//   cancel_session / reactivate_session — a day cancelled or reactivated in
//                 /admin: the row is already written; announce it in the group
//                 if its poll is out and the day is still in that state (KTD4)
// Failures are recorded in the row AND DM'd to the admins.
let running = false;
export async function processCommands(): Promise<void> {
  if (running) return;
  running = true;
  try { await drainCommands(); } finally { running = false; }
}
async function drainCommands(): Promise<void> {
  const groupChatId = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!groupChatId) return;

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bot_actions")
    .select("id, action, member_id, telegram_user_id, payload")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(20);
  if (error || !data || data.length === 0) return;

  for (const cmd of data as ActionRow[]) {
    let ok = false;
    let result = "";

    if (cmd.action === "kick_member" && cmd.telegram_user_id) {
      try {
        result = await executeKick(cmd, kickPorts(groupChatId));
        ok = true;
      } catch (err) { result = err instanceof Error ? err.message : 'Scoaterea a eșuat.'; }
    } else if (cmd.action === "send_reminder") {
      // Gentle group nudge listing active members who haven't voted yet on
      // tomorrow's session.
      const { data: sess } = await supabase
        .from("training_sessions")
        .select("id")
        .eq("session_date", tomorrowInTz())
        .maybeSingle();
      if (!sess) {
        result = "no session for tomorrow";
      } else {
        const [{ data: att }, { data: act }] = await Promise.all([
          supabase.from("attendance").select("member_id").eq("session_id", sess.id),
          supabase.from("telegram_training_members").select("id, full_name").eq("status", "active"),
        ]);
        const voted = new Set((att ?? []).map((a) => a.member_id));
        const missing = (act ?? []).filter((m) => !voted.has(m.id));
        if (missing.length === 0) {
          result = "everyone voted";
          ok = true;
        } else {
          const names = missing.map((m) => m.full_name).join(", ");
          const r = await sendMessage(
            groupChatId,
            `👋 Reamintire — încă n-au răspuns la sondaj (${missing.length}): ${names}. Apăsați ✅/❌ pe sondajul de mai sus!`,
          );
          ok = r.ok;
          result = r.ok ? `reminded ${missing.length}` : (r.description ?? "send failed");
        }
      }
    } else if (cmd.action === "send_message") {
      // Custom admin message to the group. payload.html is pre-built and
      // pre-escaped by the gym-app (plain text escaped + tg://user mentions).
      const html = cmd.payload?.html?.trim();
      if (!html) {
        result = "empty message";
      } else {
        const r = await sendMessage(groupChatId, html, { parse_mode: "HTML" });
        ok = r.ok;
        result = r.ok ? "message sent" : (r.description ?? "send failed");
      }
    } else if (cmd.action === "send_summary") {
      const r = await morningSummary();
      ok = r.ok;
      result = r.ok ? "summary sent" : `failed: ${r.detail ?? "?"}`;
    } else if (cmd.action === "send_poll") {
      // Force a fresh poll for tomorrow, even if one is already in the group.
      const r = await sendPoll({ force: true });
      ok = r.ok;
      result = r.ok ? "poll sent" : `failed: ${r.detail ?? "?"}`;
    } else if (cmd.action === "cancel_session" || cmd.action === "reactivate_session") {
      const r = await runQueuedNotice(cmd, realPorts());
      ok = r.ok;
      result = r.result;
    } else {
      result = "unsupported or missing data";
    }

    const { error: saveError } = await supabase
      .from("bot_actions")
      .update({
        status: ok ? "done" : "failed",
        result,
        processed_at: new Date().toISOString(),
      })
      .eq("id", cmd.id);
    if (saveError) throw saveError;
    const actor = Number(cmd.payload?.organizator_id);
    if (cmd.action === 'kick_member' && organizerIds().includes(actor)) {
      await sendMessage(actor, `${ok ? '✅' : '⚠️'} Scoatere Telegram ID ${cmd.telegram_user_id}: ${result}`).catch(() => {});
    }

    console.log(`[commands] ${cmd.action} #${cmd.id} → ${ok ? "done" : "failed"} (${result})`);
    if (!ok) {
      await alertAdmins(`⚠️ Acțiune eșuată: ${cmd.action} — ${result}`);
    }
  }
}

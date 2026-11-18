import { processTrialMessages } from './jobs/trial-messages.js';
import "dotenv/config";
import { botFailure, unreportedFailure } from "./lib/log.js";
import { syncMemberships } from "./lib/membership.js";
import express from "express";
import cron from "node-cron";
import { handleUpdate, registerOrganizerMenu, type TgUpdate } from "./webhook.js";
import { organizerIds } from "./lib/organizers.js";
import { sendPoll, wasPollAccepted } from "./jobs/send-poll.js";
import { morningSummary } from "./jobs/morning-summary.js";
import { processCommands } from "./jobs/process-commands.js";
import { inactivityAlert } from "./jobs/inactivity-alert.js";
import { GYM_TZ, localMinuteInstant, localWeekdayAndTime, ymdInTz } from "./lib/tz.js";
import { readBotConfig } from "./lib/config.js";
import { inactivityDue, isDue, localScheduleClaims, reminderDue, schedulerEnabled, summaryDue } from "./lib/schedule.js";
import { alertAdmins } from "./lib/notify.js";
import { autoReminder, todaysSession } from "./jobs/auto-reminder.js";
import { getWebhookInfo } from "./lib/telegram.js";
import { createAdminClient } from "./lib/supabase.js";
import { createBotMonitor, monitorStatusRoute } from "./lib/monitor-status.js";

const PORT = Number(process.env.PORT ?? 3000);
const monitorToken = process.env.BOT_MONITOR_TOKEN;
const monitor = createBotMonitor({
  schedulerEnabled: schedulerEnabled(),
  wasPollAccepted,
  async readSessions(dates, signal) {
    const { data, error } = await createAdminClient().from("training_sessions")
      .select("id, session_date, status, poll_message_id")
      .in("session_date", dates).abortSignal(signal);
    if (error) throw error;
    return data ?? [];
  },
});

// ── Webhook HTTP server ───────────────────────────────────────────────────────
// Telegram POSTs updates here. We verify the secret-token header. Successful /
// ignorable updates get 200; a TRANSIENT processing failure (e.g. DB write
// error) gets 500 so Telegram REDELIVERS the update — no vote is ever silently
// dropped. The attendance upsert is idempotent, so redelivery is safe.
const app = express();

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "parkgym-telegram-bot" });
});

app.get("/monitoring/status", monitorStatusRoute(monitorToken, monitor.status));

app.post("/telegram/webhook", express.json(), async (req, res) => {
  const secret = req.header("x-telegram-bot-api-secret-token");
  if (!secret || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false });
  }

  const ok = await handleUpdate(req.body as TgUpdate);
  if (!ok) return res.status(500).json({ ok: false }); // Telegram will retry
  return res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`[server] webhook listening on :${PORT}`);
  // The organizers' command menu (KTD13). Without a bot token (CI) there is
  // nothing to register.
  if (process.env.TELEGRAM_BOT_TOKEN) {
    for (const id of organizerIds()) void registerOrganizerMenu(id);
  }
});

// ── Scheduled jobs — DB-driven (config editable from the gym-app admin UI) ────
// A single tick fires every minute (in GYM_TZ). It always drains the command
// queue; then, if the master switch is on, it reads the live bot_config row and
// today's training and runs whatever is due. Schedule changes therefore take
// effect within a minute, no redeploy needed. BOT_SCHEDULER=off skips the tick
// entirely (local rehearsal).
//
//   send-poll        — posts tomorrow's attendance poll (idempotent)
//   morning-summary  — DMs the organizers today's roster, with action buttons;
//                      also on a day with an extra training (summaryDue)
//   auto-reminder    — 2h before today's training, by its own start time
//                      (reminderDue), at most once per training
const claimScheduledRun = localScheduleClaims();
// Trainings already auto-reminded while this process runs (KTD12).
const remindedSessions = new Set<string>();
// The local day the inactivity check last ran in this process.
let lastInactivityRun: string | null = null;
let inactivityRetryAt = 0;
let inactivityAlertedOn: string | null = null;

// An all-minute cron trigger needs no timezone. node-cron would compare
// local clock times and skip the repeated hour after the autumn clock change.
// The jobs below still use the Chișinău calendar.
if (schedulerEnabled()) cron.schedule(
  "* * * * *",
  async () => {
    try {
      // Always drain the command queue (kick, etc.), even if scheduling is off.
      await processCommands().catch((err) => console.error("[commands]", err));

      const trialStarted = performance.now();
      await processTrialMessages().catch((err) => unreportedFailure("trial.run_worker", trialStarted, err));
      void syncMemberships().catch((err) => console.error("[membership]", err));
      const configReadAt = Date.now();
      const read = await readBotConfig();
      const cfg = read.config;
      if (!cfg.enabled) {
        if (monitorToken) void monitor.recordTick(read, configReadAt);
        return;
      }

      const localNow = new Date();
      const localToday = ymdInTz(localNow);
      const { weekday, hhmm } = localWeekdayAndTime(GYM_TZ, localNow);
      const claim = (action: string) => claimScheduledRun(localToday, hhmm, action);

      if (
        isDue(cfg.pollDays, cfg.pollTime, weekday, hhmm) &&
        localMinuteInstant(localToday, hhmm) === Math.floor(localNow.getTime() / 60_000) * 60_000 &&
        claim("poll")
      ) {
        const pollStarted = performance.now();
        void sendPoll()
          .then((r) => {
            if (!r.ok)
              void alertAdmins(`⚠️ Sondajul automat cere verificare — ${r.detail ?? "?"}`);
          })
          .catch((err) => {
            unreportedFailure("poll.run_scheduled", pollStarted, err);
            void alertAdmins("⚠️ Eroare la sondajul automat. Verifică grupul înainte de retrimitere.");
          });
      }

      // Today's training: a moved or extra one drives the reminder and the
      // summary, not the global schedule (R22, R23).
      const today = await todaysSession().catch((err) => {
        console.error("[cron/today]", err);
        return null;
      });

      if (summaryDue(cfg, weekday, hhmm, today) && claim("summary")) {
        void morningSummary()
          .then((r) => {
            if (!r.ok)
              void alertAdmins(`⚠️ Raportul de dimineață n-a plecat — ${r.detail ?? "?"}`);
          })
          .catch((err) => {
            console.error("[cron/morning-summary]", err);
            void alertAdmins(`⚠️ Eroare la raportul de dimineață: ${err}`);
          });
      }

      // Inactivity alerts with action buttons — once a day from 09:00 local.
      // A failed run retries every 15 minutes the same day; the organizers hear
      // about it once a day.
      if (inactivityDue(hhmm, localToday, lastInactivityRun) && Date.now() >= inactivityRetryAt) {
        lastInactivityRun = localToday;
        const started = performance.now();
        void inactivityAlert()
          .then((r) => {
            if (!r.ok) botFailure("alert.inactivity_config", "bot", started, null);
          })
          .catch((err) => {
            unreportedFailure("alert.run_inactivity", started, err);
            lastInactivityRun = null;
            inactivityRetryAt = Date.now() + 15 * 60_000;
            if (inactivityAlertedOn !== localToday) {
              inactivityAlertedOn = localToday;
              void alertAdmins("⚠️ Eroare la alertele de inactivitate. Reîncerc la 15 minute.");
            }
          });
      }

      // Auto-reminder 2h before today's training, if confirmations are still
      // below the configured threshold.
      if (
        cfg.autoReminderEnabled &&
        reminderDue(today, hhmm, remindedSessions) &&
        claim("autorem")
      ) {
        remindedSessions.add(today!.id);
        void autoReminder(cfg.reminderThreshold).catch((err) =>
          console.error("[cron/auto-reminder]", err),
        );
      }

      // Weekly webhook self-check — Monday 09:05. Alerts only on problems.
      if (
        weekday === 1 &&
        hhmm === "09:05" &&
        claim("webhookcheck")
      ) {
        void (async () => {
          const info = await getWebhookInfo();
          const i = info.result;
          if (!info.ok || !i) {
            return alertAdmins("⚠️ Verificare webhook: nu am putut citi starea de la Telegram.");
          }
          const expected =
            (process.env.PUBLIC_URL ?? "").replace(/\/$/, "") + "/telegram/webhook";
          const probs: string[] = [];
          if (process.env.PUBLIC_URL && i.url !== expected) {
            probs.push(`URL greșit (${i.url || "gol"})`);
          }
          if ((i.pending_update_count ?? 0) > 20) {
            probs.push(`${i.pending_update_count} update-uri în așteptare`);
          }
          if (
            i.last_error_message &&
            i.last_error_date &&
            Date.now() / 1000 - i.last_error_date < 3 * 86400
          ) {
            probs.push(`eroare recentă: ${i.last_error_message}`);
          }
          if (probs.length) {
            await alertAdmins(`⚠️ Webhook Telegram: ${probs.join("; ")}`);
          } else {
            console.log("[webhook-check] OK");
          }
        })().catch((err) => console.error("[cron/webhook-check]", err));
      }
      if (monitorToken) void monitor.recordTick(read, configReadAt);
    } catch (err) {
      console.error("[cron/tick]", err);
    }
  },
);

console.log(
  schedulerEnabled()
    ? `[cron] DB-driven scheduler running (tz=${GYM_TZ}, tick=1m)`
    : "[cron] off (BOT_SCHEDULER=off): webhook only, no ticks, no queue",
);

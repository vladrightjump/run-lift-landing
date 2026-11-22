import { createHash, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";
import type { BotConfigRead } from "./config.js";
import { withinDeadline } from "./deadline.js";
import { botEvent, botFailure } from "./log.js";
import { localMinuteInstant, shiftLocalDate, ymdInTz } from "./tz.js";

const FRESH_MS = 5 * 60_000;
const POLL_GRACE_MS = 10 * 60_000;
const READ_DEADLINE_MS = 3_000;

interface SessionEvidence {
  id: string;
  session_date: string;
  status: string;
  poll_message_id: number | null;
}

interface Dependencies {
  schedulerEnabled: boolean;
  readSessions: (dates: string[], signal: AbortSignal) => Promise<SessionEvidence[]>;
  wasPollAccepted: (date: string, sessionId?: string) => boolean;
  now?: () => number;
}

type ScheduleNotice = "poll_local_minute_skipped" | "schedule_history_unknown";
type Reason = "starting" | "scheduler_disabled" | "scheduler_stale" | "poll_check_unavailable" | "poll_unconfirmed";
type Issue = { reason: Reason; sessionDate?: string };

// Healthy observations come from completed ticks. A probe never performs work
// against Telegram or Supabase, even when the cached observations are stale.
export function createBotMonitor(deps: Dependencies) {
  const now = deps.now ?? Date.now;
  const bootedAt = now();
  let lastTick: number | null = null;
  let newestConfigRead = Number.NEGATIVE_INFINITY;
  let scheduleKey: string | undefined;
  let scheduleKnownSince = Number.POSITIVE_INFINITY;
  let dueDates: string[] = [];
  let snapshot: { at: number; dates: string[]; rows: SessionEvidence[] } | null = null;
  let scheduleNotices = new Set<string>();
  let lastIssues: Issue[] | undefined;

  function issues(at: number): Issue[] {
    if (!deps.schedulerEnabled) return [{ reason: "scheduler_disabled" }];
    if (lastTick === null) return [{ reason: at - bootedAt >= FRESH_MS ? "scheduler_stale" : "starting" }];
    if (at - lastTick >= FRESH_MS) return [{ reason: "scheduler_stale" }];
    const today = ymdInTz(new Date(at));
    return dueDates.flatMap((sessionDate): Issue[] => {
      if (sessionDate < today) return []; // The expectation expired without proving delivery.
      if (!snapshot || at - snapshot.at >= FRESH_MS || !snapshot.dates.includes(sessionDate)) {
        if (deps.wasPollAccepted(sessionDate)) return [];
        return [{ reason: "poll_check_unavailable", sessionDate }];
      }
      const session = snapshot.rows.find((row) => row.session_date === sessionDate);
      if (session && (session.status === "cancelled" || session.poll_message_id !== null || deps.wasPollAccepted(sessionDate, session.id))) return [];
      return [{ reason: "poll_unconfirmed", sessionDate }];
    });
  }

  function status() {
    const current = issues(now());
    const same = current.length === lastIssues?.length && current.every((issue, i) =>
      issue.reason === lastIssues?.[i].reason && issue.sessionDate === lastIssues[i].sessionDate);
    if (!same) {
      for (const issue of current) {
        botEvent("warn", "bot_monitor_status", { reason: issue.reason, outcome: "degraded" }, issue);
      }
      if (!current.length) botEvent("info", "bot_monitor_status", { outcome: "healthy" });
      lastIssues = current;
    }
    return { ok: !current.length, reasons: [...new Set(current.map((issue) => issue.reason))] };
  }

  async function recordTick(read: BotConfigRead, configReadAt: number): Promise<void> {
    // Ignore a delayed tick when a newer config read has already finished.
    if (configReadAt <= newestConfigRead) return;
    newestConfigRead = configReadAt;
    if (read.updatedAt === null) {
      status();
      return;
    }
    const observedAt = now();
    lastTick = observedAt;
    const { enabled, pollDays, pollTime } = read.config;
    const key = JSON.stringify([enabled, [...pollDays].sort(), pollTime]);
    if (key !== scheduleKey) {
      scheduleKey = key;
      scheduleKnownSince = read.updatedAt;
      snapshot = null;
    }

    const notices = new Set<string>();
    function note(reason: ScheduleNotice, sessionDate: string) {
      const notice = `${reason}:${sessionDate}`;
      notices.add(notice);
      if (!scheduleNotices.has(notice)) botEvent("warn", reason, { operation: "monitor.poll_schedule" }, { sessionDate });
    }

    const today = ymdInTz(new Date(observedAt));
    const knownDates: string[] = [];
    const unknownDates: string[] = [];
    if (enabled) {
      for (const day of [shiftLocalDate(today, -1), today]) {
        if (!pollDays.includes(new Date(`${day}T00:00:00Z`).getUTCDay())) continue;
        const sessionDate = shiftLocalDate(day, 1);
        const due = localMinuteInstant(day, pollTime);
        if (due === null) {
          note("poll_local_minute_skipped", sessionDate);
        } else if (observedAt - due >= POLL_GRACE_MS) {
          (scheduleKnownSince <= due ? knownDates : unknownDates).push(sessionDate);
        }
      }
    }
    dueDates = knownDates;
    const dates = [...knownDates, ...unknownDates];
    if (dates.length) {
      const started = performance.now();
      try {
        const rows = await withinDeadline(READ_DEADLINE_MS, (signal) => deps.readSessions(dates, signal));
        if (configReadAt !== newestConfigRead) return;
        snapshot = { at: now(), dates, rows };
        for (const date of unknownDates) {
          const row = rows.find((session) => session.session_date === date);
          if (!row || (row.status !== "cancelled" && row.poll_message_id === null && !deps.wasPollAccepted(date, row.id))) {
            note("schedule_history_unknown", date);
          }
        }
      } catch (error) {
        botFailure("monitor.read_poll_evidence", "supabase", started, error);
        if (configReadAt !== newestConfigRead) return;
        snapshot = null;
      }
    } else {
      snapshot = null;
    }
    scheduleNotices = notices;
    status();
  }

  return { recordTick, status };
}

export function monitorStatusRoute(token: string | undefined, status: ReturnType<typeof createBotMonitor>["status"]): RequestHandler {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  const expected = token ? digest(`Bearer ${token}`) : undefined;
  return (req, res) => {
    res.set("Cache-Control", "no-store");
    const authorization = req.get("authorization");
    if (!expected || !authorization || !timingSafeEqual(expected, digest(authorization))) {
      res.status(404).json({ ok: false });
      return;
    }
    const result = status();
    res.status(result.ok ? 200 : 503).json(result);
  };
}

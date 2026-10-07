import { hhmm as hhmmOf, trainingDays } from "./sessions.js";

// Pure scheduling predicate, kept separate so it can be unit-tested without a
// timer or DB. Returns true when a job configured for `days` at `time` is due
// at the given local `weekday`/`hhmm`.
//   days    — allowed weekdays, 0=Sun … 6=Sat
//   time    — "HH:MM"
//   weekday — current local weekday (0=Sun … 6=Sat)
//   hhmm    — current local time "HH:MM"
// "HH:MM" minus N minutes, wrapping over midnight.
export function minusMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  let t = h * 60 + m - mins;
  while (t < 0) t += 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

export function isDue(
  days: number[],
  time: string,
  weekday: number,
  hhmm: string,
): boolean {
  return Array.isArray(days) && days.includes(weekday) && hhmm === time;
}

// ── The day's training drives the automations (KTD12 in the training-day plan)

// The auto-reminder goes two hours before today's training — its own time, so
// a moved or extra training pulls it along (R22) — and at most once per
// training while the process runs: a move after the reminder doesn't repeat it.
export function reminderDue(
  today: { id: string; startsAt: string; status: string } | null,
  hhmm: string,
  reminded: ReadonlySet<string>,
): boolean {
  if (!today || today.status !== "scheduled" || reminded.has(today.id)) return false;
  return hhmm === minusMinutes(hhmmOf(today.startsAt), 120);
}

// The morning summary goes on its configured days and, at its usual time, on a
// day with a training outside the schedule (an extra; R23). With no summary
// days configured, summaries are off — extras included.
export function summaryDue(
  cfg: { summaryDays: number[]; summaryTime: string; pollDays: number[] },
  weekday: number,
  hhmm: string,
  today: { status: string } | null,
): boolean {
  if (isDue(cfg.summaryDays, cfg.summaryTime, weekday, hhmm)) return true;
  if (cfg.summaryDays.length === 0 || hhmm !== cfg.summaryTime) return false;
  const scheduleDay = trainingDays(cfg.pollDays).includes(weekday);
  return today?.status === "scheduled" && !scheduleDay;
}

// BOT_SCHEDULER=off starts only the webhook: no ticks, no queue (KTD15). For a
// local rehearsal against the real database; never set on Railway.
export function schedulerEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.BOT_SCHEDULER !== "off";
}

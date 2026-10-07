// Which training a command is about. Pure: callers load the rows and settings,
// these functions only decide (KTD7 in the training-day plan).
//
// A training is either a row in `training_sessions` or a day from the
// schedule that has no row yet (the poll for it hasn't gone out). A row always
// wins over the schedule day with the same date.

export interface SessionRow {
  id: string;
  session_date: string; // YYYY-MM-DD
  starts_at: string; // HH:MM or HH:MM:SS
  location: string;
  status: "scheduled" | "done" | "cancelled";
  poll_message_id: number | null;
  poll_wording: unknown;
}

// What the logic needs to know about "now" and the schedule.
export interface Snapshot {
  today: string; // YYYY-MM-DD in the gym's timezone
  now: string; // HH:MM in the gym's timezone
  pollDays: number[]; // 0=Sun … 6=Sat; training is the day after
  trainingTime: string; // HH:MM, default for schedule days
  location: string; // default for schedule days
  sessions: SessionRow[]; // rows from today on (older ones are ignored)
}

export interface Target {
  date: string;
  row: SessionRow | null; // null = a schedule day without a row yet
  time: string; // HH:MM
  location: string;
  status: "scheduled" | "cancelled";
  pollSent: boolean;
}

// How far ahead the card and Extra look.
export const HORIZON_DAYS = 14;

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const hhmm = (t: string): string => (t || "").slice(0, 5);

// The poll asks "coming tomorrow?", so training days are poll days + 1.
export function trainingDays(pollDays: number[]): number[] {
  return pollDays.map((d) => (d + 1) % 7);
}

function fromRow(r: SessionRow): Target {
  return {
    date: r.session_date,
    row: r,
    time: hhmm(r.starts_at),
    location: r.location,
    status: r.status === "cancelled" ? "cancelled" : "scheduled",
    pollSent: r.poll_message_id != null,
  };
}

// The training on a given day, from today on: its row, or the schedule day.
// `done` rows are history and never a target.
export function sessionOn(s: Snapshot, date: string): Target | null {
  if (date < s.today) return null;
  const r = s.sessions.find((x) => x.session_date === date);
  if (r) return r.status === "done" ? null : fromRow(r);
  if (!trainingDays(s.pollDays).includes(weekdayOf(date))) return null;
  return {
    date,
    row: null,
    time: hhmm(s.trainingTime),
    location: s.location,
    status: "scheduled",
    pollSent: false,
  };
}

// The nearest training that hasn't started yet, cancelled or not (R8); or the
// training on `explicitDate` when given.
export function targetSession(s: Snapshot, explicitDate?: string | null): Target | null {
  if (explicitDate) return sessionOn(s, explicitDate);
  for (let n = 0; n <= HORIZON_DAYS; n += 1) {
    const t = sessionOn(s, addDays(s.today, n));
    if (!t) continue;
    if (n === 0 && t.time <= s.now) continue; // today's already started
    return t;
  }
  return null;
}

// Days Extra can offer: the next HORIZON_DAYS days, from today, with no
// training on them (R19).
export function extraDays(s: Snapshot): string[] {
  const out: string[] = [];
  for (let n = 0; n < HORIZON_DAYS; n += 1) {
    const d = addDays(s.today, n);
    if (!sessionOn(s, d)) out.push(d);
  }
  return out;
}

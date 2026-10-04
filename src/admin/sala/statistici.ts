// Portat neschimbat din gym-app (lib/attendance-stats.ts), cu testele lui
// (tests/unit/salaStatistici.test.ts). Ecranul „Analiza” trebuie să arate exact
// ce arăta gym-app (R10), deci calculele nu se rescriu, doar se mută.
//
// Pure, dependency-free attendance statistics used by the Prezențe page.
// Everything here is deterministic and unit-tested (see tests/unit/salaStatistici.test.ts).
// No Next.js / Supabase imports so it can run under a plain node test runner.

export type Period = "month" | "quarter" | "year";

export interface StatMember {
  id: string;
  full_name: string;
}
interface StatAtt {
  response: "yes" | "no";
  is_first_training?: boolean;
  member: { id: string; full_name: string } | null;
}
export interface StatSession {
  id: string;
  session_date: string; // YYYY-MM-DD
  starts_at: string;
  location: string;
  status: string; // scheduled | done | cancelled
  attendance: StatAtt[];
}

// ── Period windows ────────────────────────────────────────────────────────────
const MS_DAY = 86_400_000;

// Inclusive lower bound (YYYY-MM-DD) for a period ending "now".
// month = last 30 days, quarter = last 90, year = last 365.
export function periodDays(period: Period): number {
  return period === "month" ? 30 : period === "quarter" ? 90 : 365;
}

function isoOffset(now: Date, days: number): string {
  return new Date(now.getTime() - days * MS_DAY).toISOString().slice(0, 10);
}

// Sessions within the current period (inclusive), excluding cancelled ones.
export function filterByPeriod(
  sessions: StatSession[],
  period: Period,
  now: Date,
): StatSession[] {
  const from = isoOffset(now, periodDays(period));
  const today = now.toISOString().slice(0, 10);
  return sessions.filter(
    (s) =>
      s.status !== "cancelled" &&
      s.session_date >= from &&
      s.session_date <= today,
  );
}

// The immediately-preceding equal-length window (for trend comparison).
export function filterPrevPeriod(
  sessions: StatSession[],
  period: Period,
  now: Date,
): StatSession[] {
  const len = periodDays(period);
  const from = isoOffset(now, len * 2);
  const to = isoOffset(now, len);
  return sessions.filter(
    (s) => s.status !== "cancelled" && s.session_date >= from && s.session_date < to,
  );
}

// ── Per-session breakdown ─────────────────────────────────────────────────────
export interface Breakdown {
  yes: number;
  no: number;
  none: number;
  total: number; // active roster size used as denominator
  yesPct: number;
  noPct: number;
  nonePct: number;
}

// Counts distinct members per response. A member can end up with more than one
// row for the same session (duplicate votes, leftovers from a merge); those must
// not inflate the tally past the roster size.
//
// Deduplication is on the member alone, not on member+response: the merge case
// is exactly where the two rows tend to disagree (one identity voted "yes", the
// other "no"), and counting such a member in both buckets pushes yes+no past the
// roster and collapses `none` to zero. The first row wins, so the result is
// stable for a given query order. Rows with no member are kept individually —
// there is no identity to deduplicate on.
function countResponses(session: StatSession): { yes: number; no: number } {
  const seen = new Set<string>();
  let yes = 0;
  let no = 0;
  session.attendance.forEach((a, i) => {
    const key = a.member?.id ?? `row${i}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (a.response === "yes") yes += 1;
    else if (a.response === "no") no += 1;
  });
  return { yes, no };
}

export function sessionBreakdown(
  session: StatSession,
  activeCount: number,
): Breakdown {
  const { yes, no } = countResponses(session);
  const total = Math.max(activeCount, yes + no);
  const none = Math.max(0, total - yes - no);
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  return {
    yes,
    no,
    none,
    total,
    yesPct: pct(yes),
    noPct: pct(no),
    nonePct: pct(none),
  };
}

// ── Aggregate stats ───────────────────────────────────────────────────────────

// Average "fullness" across sessions, as a percent. Uses the same denominator
// as sessionBreakdown — which grows to fit the responders — so a session with
// more confirmations than active members reads 100%, not 120%.
export function averageAttendancePct(
  sessions: StatSession[],
  activeCount: number,
): number {
  if (sessions.length === 0 || activeCount <= 0) return 0;
  const sum = sessions.reduce((acc, s) => {
    const b = sessionBreakdown(s, activeCount);
    return acc + (b.total > 0 ? b.yes / b.total : 0);
  }, 0);
  return Math.round((sum / sessions.length) * 100);
}

// Average number of non-responders per session.
export function avgNoResponse(
  sessions: StatSession[],
  activeCount: number,
): number {
  if (sessions.length === 0) return 0;
  const sum = sessions.reduce(
    (acc, s) => acc + sessionBreakdown(s, activeCount).none,
    0,
  );
  return Math.round(sum / sessions.length);
}

// The session with the most confirmations ("record").
export function recordSession(
  sessions: StatSession[],
): { date: string; count: number } | null {
  let best: { date: string; count: number } | null = null;
  for (const s of sessions) {
    const { yes } = countResponses(s);
    if (!best || yes > best.count) best = { date: s.session_date, count: yes };
  }
  return best;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
export interface LeaderRow {
  id: string;
  name: string;
  attended: number;
  total: number;
  pct: number;
}

// Ranks members by how many of the given sessions they confirmed (yes).
// `total` is the number of sessions considered. Sorted by attended desc,
// then name asc for stable ties. Members with zero attendance are included
// only if `includeZero` is true.
export function leaderboard(
  sessions: StatSession[],
  opts: { includeZero?: boolean; roster?: StatMember[] } = {},
): LeaderRow[] {
  const total = sessions.length;
  const counts = new Map<string, { name: string; attended: number }>();
  if (opts.roster) {
    for (const m of opts.roster) counts.set(m.id, { name: m.full_name, attended: 0 });
  }
  for (const s of sessions) {
    // Per session, a member counts at most once — duplicate rows would
    // otherwise push `attended` above the number of sessions considered.
    const credited = new Set<string>();
    for (const a of s.attendance) {
      if (a.response !== "yes" || !a.member) continue;
      if (credited.has(a.member.id)) continue;
      credited.add(a.member.id);
      const cur = counts.get(a.member.id) ?? { name: a.member.full_name, attended: 0 };
      cur.attended += 1;
      cur.name = a.member.full_name;
      counts.set(a.member.id, cur);
    }
  }
  const rows: LeaderRow[] = [];
  for (const [id, v] of counts) {
    if (!opts.includeZero && v.attended === 0) continue;
    rows.push({
      id,
      name: v.name,
      attended: v.attended,
      total,
      pct: total > 0 ? Math.round((v.attended / total) * 100) : 0,
    });
  }
  rows.sort((a, b) => b.attended - a.attended || a.name.localeCompare(b.name));
  return rows;
}

// ── Summary bundle for the 4 stat chips ──────────────────────────────────────
export interface Summary {
  avgPct: number;
  trendPct: number; // current avg minus previous-period avg (percentage points)
  // False when the previous window holds no sessions at all. Without it a gym
  // with no history reads "▲ 62% vs. anterior", because an empty window
  // averages to 0% and every current value looks like a full-strength gain.
  hasPrevious: boolean;
  sessionCount: number;
  record: { date: string; count: number } | null;
  avgNoResponse: number;
}

export function summarize(
  current: StatSession[],
  previous: StatSession[],
  activeCount: number,
): Summary {
  const avgPct = averageAttendancePct(current, activeCount);
  const hasPrevious = previous.length > 0;
  const prevPct = averageAttendancePct(previous, activeCount);
  return {
    avgPct,
    trendPct: hasPrevious ? avgPct - prevPct : 0,
    hasPrevious,
    sessionCount: current.length,
    record: recordSession(current),
    avgNoResponse: avgNoResponse(current, activeCount),
  };
}

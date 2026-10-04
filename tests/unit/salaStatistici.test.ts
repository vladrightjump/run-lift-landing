// Testele din gym-app, portate neschimbat (doar runnerul: node:test → vitest).
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  periodDays,
  filterByPeriod,
  filterPrevPeriod,
  sessionBreakdown,
  averageAttendancePct,
  avgNoResponse,
  recordSession,
  leaderboard,
  summarize,
  type StatSession,
} from "../../src/admin/sala/statistici";

// Helper to build a session with yes/no counts by member id.
function sess(
  id: string,
  date: string,
  yes: string[],
  no: string[] = [],
  status = "done",
): StatSession {
  return {
    id,
    session_date: date,
    starts_at: "06:30",
    location: "Parc",
    status,
    attendance: [
      ...yes.map((m) => ({
        response: "yes" as const,
        member: { id: m, full_name: m.toUpperCase() },
      })),
      ...no.map((m) => ({
        response: "no" as const,
        member: { id: m, full_name: m.toUpperCase() },
      })),
    ],
  };
}

const NOW = new Date("2026-07-30T09:00:00Z");

// ── periodDays ────────────────────────────────────────────────────────────────
test("periodDays: month/quarter/year windows", () => {
  assert.equal(periodDays("month"), 30);
  assert.equal(periodDays("quarter"), 90);
  assert.equal(periodDays("year"), 365);
});

// ── filterByPeriod ────────────────────────────────────────────────────────────
test("filterByPeriod: keeps only non-cancelled sessions inside the window", () => {
  const sessions = [
    sess("a", "2026-07-28", ["x"]), // 2 days ago — in month
    sess("b", "2026-06-15", ["x"]), // ~45 days ago — out of month, in quarter
    sess("c", "2026-07-10", ["x"], [], "cancelled"), // cancelled — excluded
    sess("d", "2026-07-01", ["x"]), // 29 days ago — in month
  ];
  const month = filterByPeriod(sessions, "month", NOW).map((s) => s.id);
  assert.deepEqual(month.sort(), ["a", "d"]);
  const quarter = filterByPeriod(sessions, "quarter", NOW).map((s) => s.id);
  assert.deepEqual(quarter.sort(), ["a", "b", "d"]);
});

test("filterByPeriod: excludes future-dated sessions", () => {
  const sessions = [sess("future", "2026-08-05", ["x"]), sess("past", "2026-07-20", ["x"])];
  const ids = filterByPeriod(sessions, "month", NOW).map((s) => s.id);
  assert.deepEqual(ids, ["past"]);
});

// ── filterPrevPeriod ──────────────────────────────────────────────────────────
test("filterPrevPeriod: the window immediately before the current one", () => {
  const sessions = [
    sess("cur", "2026-07-20", ["x"]), // in current month
    sess("prev", "2026-06-20", ["x"]), // ~40 days ago — previous month window
    sess("older", "2026-05-01", ["x"]), // too old
  ];
  const ids = filterPrevPeriod(sessions, "month", NOW).map((s) => s.id);
  assert.deepEqual(ids, ["prev"]);
});

// ── sessionBreakdown ──────────────────────────────────────────────────────────
test("sessionBreakdown: yes/no/none against active roster", () => {
  const b = sessionBreakdown(sess("s", "2026-07-20", ["a", "b", "c"], ["d"]), 10);
  assert.equal(b.yes, 3);
  assert.equal(b.no, 1);
  assert.equal(b.none, 6);
  assert.equal(b.total, 10);
  assert.equal(b.yesPct, 30);
  assert.equal(b.nonePct, 60);
});

test("sessionBreakdown: never negative when responses exceed roster", () => {
  const b = sessionBreakdown(sess("s", "2026-07-20", ["a", "b", "c"], ["d", "e"]), 2);
  assert.equal(b.none, 0);
  assert.equal(b.total, 5); // grows to fit responders
});

// ── averageAttendancePct ──────────────────────────────────────────────────────
test("averageAttendancePct: mean fullness across sessions", () => {
  const sessions = [
    sess("s1", "2026-07-10", ["a", "b"]), // 2/10 = 20%
    sess("s2", "2026-07-12", ["a", "b", "c", "d"]), // 4/10 = 40%
  ];
  assert.equal(averageAttendancePct(sessions, 10), 30);
});

test("averageAttendancePct: zero when no sessions or empty roster", () => {
  assert.equal(averageAttendancePct([], 10), 0);
  assert.equal(averageAttendancePct([sess("s", "2026-07-10", ["a"])], 0), 0);
});

// ── avgNoResponse ─────────────────────────────────────────────────────────────
test("avgNoResponse: mean non-responders per session", () => {
  const sessions = [
    sess("s1", "2026-07-10", ["a", "b"]), // none = 8
    sess("s2", "2026-07-12", ["a", "b", "c", "d", "e", "f"]), // none = 4
  ];
  assert.equal(avgNoResponse(sessions, 10), 6);
});

// ── recordSession ─────────────────────────────────────────────────────────────
test("recordSession: session with most confirmations", () => {
  const sessions = [
    sess("s1", "2026-07-10", ["a", "b"]),
    sess("s2", "2026-07-20", ["a", "b", "c", "d"]),
    sess("s3", "2026-07-22", ["a"]),
  ];
  assert.deepEqual(recordSession(sessions), { date: "2026-07-20", count: 4 });
  assert.equal(recordSession([]), null);
});

// ── leaderboard ───────────────────────────────────────────────────────────────
test("leaderboard: ranks by attendance, computes pct over session count", () => {
  const sessions = [
    sess("s1", "2026-07-10", ["a", "b"]),
    sess("s2", "2026-07-12", ["a", "b"]),
    sess("s3", "2026-07-14", ["a"]),
    sess("s4", "2026-07-16", ["a"]),
  ];
  const lb = leaderboard(sessions);
  assert.equal(lb.length, 2);
  assert.deepEqual(
    lb.map((r) => [r.id, r.attended, r.total, r.pct]),
    [
      ["a", 4, 4, 100],
      ["b", 2, 4, 50],
    ],
  );
});

test("leaderboard: 'no' votes never count as attendance", () => {
  const sessions = [sess("s1", "2026-07-10", ["a"], ["b"])];
  const lb = leaderboard(sessions);
  assert.deepEqual(lb.map((r) => r.id), ["a"]);
});

test("leaderboard: includeZero + roster surfaces never-present members", () => {
  const sessions = [sess("s1", "2026-07-10", ["a"])];
  const lb = leaderboard(sessions, {
    includeZero: true,
    roster: [
      { id: "a", full_name: "A" },
      { id: "z", full_name: "Z" },
    ],
  });
  const z = lb.find((r) => r.id === "z");
  assert.ok(z);
  assert.equal(z!.attended, 0);
  assert.equal(z!.pct, 0);
});

// ── summarize ─────────────────────────────────────────────────────────────────
test("summarize: bundles avg, trend vs previous, count, record, no-response", () => {
  const current = [
    sess("c1", "2026-07-10", ["a", "b", "c", "d", "e"]), // 5/10 = 50%
    sess("c2", "2026-07-20", ["a", "b", "c"]), // 3/10 = 30%
  ];
  const previous = [
    sess("p1", "2026-06-10", ["a", "b"]), // 2/10 = 20%
  ];
  const s = summarize(current, previous, 10);
  assert.equal(s.avgPct, 40); // (50+30)/2
  assert.equal(s.trendPct, 20); // 40 - 20
  assert.equal(s.sessionCount, 2);
  assert.deepEqual(s.record, { date: "2026-07-10", count: 5 });
});

// ── Edge cases ────────────────────────────────────────────────────────────────
test("periodDays: unknown period falls back to the year window", () => {
  // The signature only allows the three known periods, but the branch defaults
  // to 365 for anything that isn't month/quarter.
  assert.equal(periodDays("year"), 365);
  assert.equal(periodDays("something" as never), 365);
});

test("filterByPeriod: today is inside the window; the far edge is inclusive", () => {
  const from = "2026-06-30"; // exactly 30 days before NOW (2026-07-30)
  const sessions = [
    sess("edge", from, ["x"]),
    sess("today", "2026-07-30", ["x"]),
  ];
  const ids = filterByPeriod(sessions, "month", NOW).map((s) => s.id).sort();
  assert.deepEqual(ids, ["edge", "today"]);
});

test("filterPrevPeriod: excludes cancelled sessions", () => {
  const sessions = [
    sess("prev", "2026-06-20", ["x"]),
    sess("prevCancelled", "2026-06-21", ["x"], [], "cancelled"),
  ];
  const ids = filterPrevPeriod(sessions, "month", NOW).map((s) => s.id);
  assert.deepEqual(ids, ["prev"]);
});

test("sessionBreakdown: empty roster and no responses yields all zeros", () => {
  const b = sessionBreakdown(sess("s", "2026-07-20", []), 0);
  assert.deepEqual(
    [b.yes, b.no, b.none, b.total, b.yesPct, b.noPct, b.nonePct],
    [0, 0, 0, 0, 0, 0, 0],
  );
});

test("sessionBreakdown: noPct is computed against the roster total", () => {
  const b = sessionBreakdown(sess("s", "2026-07-20", ["a"], ["b", "c"]), 10);
  assert.equal(b.no, 2);
  assert.equal(b.noPct, 20);
});

test("recordSession: keeps the first session on a tie", () => {
  const sessions = [
    sess("first", "2026-07-10", ["a", "b"]),
    sess("second", "2026-07-20", ["c", "d"]), // same count, later date
  ];
  assert.deepEqual(recordSession(sessions), { date: "2026-07-10", count: 2 });
});

test("leaderboard: empty input yields an empty board", () => {
  assert.deepEqual(leaderboard([]), []);
});

test("leaderboard: includeZero without a roster only surfaces voters", () => {
  // Without a roster there is no source for never-present members, so the board
  // still contains only those who appear in attendance.
  const lb = leaderboard([sess("s1", "2026-07-10", ["a"])], { includeZero: true });
  assert.deepEqual(lb.map((r) => r.id), ["a"]);
});

test("leaderboard: ties break alphabetically by name", () => {
  const sessions = [sess("s1", "2026-07-10", ["b", "a"])];
  const lb = leaderboard(sessions);
  assert.deepEqual(lb.map((r) => r.id), ["a", "b"]); // names A, B from uppercased ids
});

test("summarize: negative trend when the previous window was stronger", () => {
  const current = [sess("c1", "2026-07-10", ["a"])]; // 1/10 = 10%
  const previous = [sess("p1", "2026-06-10", ["a", "b", "c", "d"])]; // 4/10 = 40%
  const s = summarize(current, previous, 10);
  assert.equal(s.trendPct, -30);
});

test("summarize: empty current window is all zeros with a null record", () => {
  const s = summarize([], [], 10);
  assert.equal(s.avgPct, 0);
  assert.equal(s.trendPct, 0);
  assert.equal(s.sessionCount, 0);
  assert.equal(s.record, null);
  assert.equal(s.avgNoResponse, 0);
});

// ── Corner cases: over-full sessions ─────────────────────────────────────────
test("averageAttendancePct: never exceeds 100% when responders outnumber the roster", () => {
  // Guests / stale roster: 12 confirmations against 10 active members. The
  // denominator has to grow the same way sessionBreakdown grows it, otherwise
  // the KPI reads "120% prezență medie".
  const many = Array.from({ length: 12 }, (_, i) => `m${i}`);
  assert.equal(averageAttendancePct([sess("s", "2026-07-10", many)], 10), 100);
});

test("averageAttendancePct: agrees with sessionBreakdown for a single session", () => {
  const s = sess("s", "2026-07-10", ["a", "b", "c"], ["d", "e"]);
  assert.equal(averageAttendancePct([s], 2), sessionBreakdown(s, 2).yesPct);
  assert.equal(averageAttendancePct([s], 10), sessionBreakdown(s, 10).yesPct);
});

// ── Corner cases: trend without history ──────────────────────────────────────
test("summarize: flags an empty previous window instead of faking a full-strength trend", () => {
  const current = [sess("c1", "2026-07-10", ["a", "b", "c", "d", "e"])]; // 50%
  const s = summarize(current, [], 10);
  assert.equal(s.avgPct, 50);
  assert.equal(s.hasPrevious, false);
  assert.equal(s.trendPct, 0); // nothing to compare against
});

test("summarize: a non-empty previous window is flagged and compared", () => {
  const current = [sess("c1", "2026-07-10", ["a", "b", "c", "d", "e"])]; // 50%
  const previous = [sess("p1", "2026-06-10", ["a", "b"])]; // 20%
  const s = summarize(current, previous, 10);
  assert.equal(s.hasPrevious, true);
  assert.equal(s.trendPct, 30);
});

// ── Corner cases: duplicate attendance rows ──────────────────────────────────
test("sessionBreakdown: a member counted twice for one session counts once", () => {
  // Duplicate rows can exist after a merge; they must not inflate the tally.
  const s = sess("s", "2026-07-10", ["a", "a", "b"]);
  const b = sessionBreakdown(s, 10);
  assert.equal(b.yes, 2);
  assert.equal(b.none, 8);
});

test("sessionBreakdown: conflicting rows for one member count once, not in both buckets", () => {
  // The merge case: one identity voted "yes", the other "no". Counting the
  // member in both would make yes+no exceed the roster and zero out `none`.
  const s: StatSession = {
    id: "s",
    session_date: "2026-07-10",
    starts_at: "06:30",
    location: "Parc",
    status: "done",
    attendance: [
      { response: "yes", member: { id: "a", full_name: "A" } },
      { response: "no", member: { id: "a", full_name: "A" } },
    ],
  };
  const b = sessionBreakdown(s, 4);
  assert.equal(b.yes + b.no, 1);
  assert.equal(b.total, 4); // not inflated past the roster
  assert.equal(b.none, 3);
});

test("sessionBreakdown: rows without a member are each counted", () => {
  // No id to deduplicate on — two anonymous "yes" rows are two confirmations.
  const s: StatSession = {
    id: "s",
    session_date: "2026-07-10",
    starts_at: "06:30",
    location: "Parc",
    status: "done",
    attendance: [
      { response: "yes", member: null },
      { response: "yes", member: null },
    ],
  };
  assert.equal(sessionBreakdown(s, 10).yes, 2);
});

test("leaderboard: duplicate yes rows never push a member above the session count", () => {
  const sessions = [sess("s1", "2026-07-10", ["a", "a"])];
  const lb = leaderboard(sessions);
  assert.deepEqual(
    lb.map((r) => [r.id, r.attended, r.pct]),
    [["a", 1, 100]],
  );
});

// ── Corner cases: period boundaries ──────────────────────────────────────────
test("filterPrevPeriod: the boundary day belongs to the current window, not the previous", () => {
  const boundary = "2026-06-30"; // exactly 30 days before NOW
  const sessions = [sess("edge", boundary, ["x"])];
  assert.deepEqual(filterByPeriod(sessions, "month", NOW).map((s) => s.id), ["edge"]);
  assert.deepEqual(filterPrevPeriod(sessions, "month", NOW).map((s) => s.id), []);
});

test("filterByPeriod: a session dated today at the far edge of the year window is kept", () => {
  const sessions = [sess("old", "2025-07-31", ["x"]), sess("tooOld", "2025-07-29", ["x"])];
  const ids = filterByPeriod(sessions, "year", NOW).map((s) => s.id);
  assert.deepEqual(ids, ["old"]);
});

test("recordSession: sessions with zero confirmations still yield a record of 0", () => {
  assert.deepEqual(recordSession([sess("s", "2026-07-10", [])]), {
    date: "2026-07-10",
    count: 0,
  });
});

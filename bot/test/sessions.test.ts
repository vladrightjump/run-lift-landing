import { test } from "node:test";
import assert from "node:assert/strict";

import {
  addDays,
  extraDays,
  sessionOn,
  targetSession,
  type SessionRow,
  type Snapshot,
} from "../src/lib/sessions.js";

// Wednesday 7 Oct 2026; polls Mon/Wed → training Tue/Thu.
const row = (date: string, over: Partial<SessionRow> = {}): SessionRow => ({
  id: `s-${date}`,
  session_date: date,
  starts_at: "06:30:00",
  location: "Parcul Dumitru Râșcanu",
  status: "scheduled",
  poll_message_id: null,
  poll_wording: null,
  ...over,
});

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  today: "2026-10-07",
  now: "21:00",
  pollDays: [1, 3],
  trainingTime: "06:30",
  location: "Parcul Dumitru Râșcanu",
  sessions: [],
  ...over,
});

test("addDays crosses month ends", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-10-07", -7), "2026-09-30");
});

test("target: Wednesday evening, Thursday has a row with a poll → Thursday", () => {
  const t = targetSession(snap({ sessions: [row("2026-10-08", { poll_message_id: 9 })] }));
  assert.equal(t?.date, "2026-10-08");
  assert.equal(t?.pollSent, true);
  assert.equal(t?.row?.id, "s-2026-10-08");
});

test("target: today's session already started → the next one", () => {
  const t = targetSession(
    snap({ today: "2026-10-08", now: "07:00", sessions: [row("2026-10-08")] }),
  );
  assert.equal(t?.date, "2026-10-13"); // Tuesday, from the schedule
  assert.equal(t?.row, null);
});

test("target: today's session not started yet → today", () => {
  const t = targetSession(
    snap({ today: "2026-10-08", now: "06:00", sessions: [row("2026-10-08")] }),
  );
  assert.equal(t?.date, "2026-10-08");
});

test("target: the nearest day is cancelled → that cancelled day (R8)", () => {
  const t = targetSession(snap({ sessions: [row("2026-10-08", { status: "cancelled" })] }));
  assert.equal(t?.date, "2026-10-08");
  assert.equal(t?.status, "cancelled");
});

test("target: no rows → the next scheduled day, with time and place from settings", () => {
  const t = targetSession(snap({ today: "2026-10-09", now: "10:00" })); // Friday
  assert.deepEqual(
    { date: t?.date, time: t?.time, location: t?.location, row: t?.row, pollSent: t?.pollSent },
    { date: "2026-10-13", time: "06:30", location: "Parcul Dumitru Râșcanu", row: null, pollSent: false },
  );
});

test("target: a row wins over the schedule day with the same date", () => {
  const t = targetSession(
    snap({ sessions: [row("2026-10-08", { starts_at: "07:30:00", location: "Valea Morilor" })] }),
  );
  assert.deepEqual([t?.time, t?.location], ["07:30", "Valea Morilor"]);
});

test("target: an extra row on a non-schedule day is a candidate", () => {
  const t = targetSession(snap({ today: "2026-10-09", now: "10:00", sessions: [row("2026-10-10")] }));
  assert.equal(t?.date, "2026-10-10");
});

test("target: an explicit date wins, even a schedule day without a row", () => {
  const t = targetSession(snap(), "2026-10-15");
  assert.equal(t?.date, "2026-10-15");
  assert.equal(t?.row, null);
});

test("target: an explicit date with no training → null", () => {
  assert.equal(targetSession(snap(), "2026-10-10"), null);
});

test("target: 'done' sessions are history, never a target", () => {
  const t = targetSession(snap({ sessions: [row("2026-10-08", { status: "done" })] }));
  assert.equal(t?.date, "2026-10-13");
});

test("target: no poll days and no rows → null", () => {
  assert.equal(targetSession(snap({ pollDays: [] })), null);
});

test("sessionOn: past dates have no training to act on", () => {
  assert.equal(sessionOn(snap(), "2026-10-06"), null);
});

test("extraDays: the next 14 days that have no training, from today", () => {
  const days = extraDays(snap({ sessions: [row("2026-10-10", { status: "cancelled" })] }));
  assert.equal(days.length, 14 - 4 - 1); // 4 schedule days + the cancelled Saturday
  assert.equal(days[0], "2026-10-07"); // today is free (Wednesday)
  assert.ok(!days.includes("2026-10-08")); // Thursday: schedule
  assert.ok(!days.includes("2026-10-10")); // cancelled row
  assert.ok(days.includes("2026-10-11"));
});

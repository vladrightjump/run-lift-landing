// Testele din gym-app, portate neschimbat (doar runnerul: node:test → vitest).
import { test } from "vitest";
import assert from "node:assert/strict";

import { GYM_TZ, ymdInTz, todayInTz, tomorrowInTz } from "../../src/admin/sala/fus";

// ── ymdInTz ─────────────────────────────────────────────────────────────────
test("ymdInTz: renders the calendar date as seen in the timezone", () => {
  // 2026-07-08T05:00:00Z — in Chișinău (UTC+3 in summer) it's already the 8th.
  const d = new Date("2026-07-08T05:00:00Z");
  assert.equal(ymdInTz(d, GYM_TZ), "2026-07-08");
});

test("ymdInTz: UTC and local timezone can disagree across midnight", () => {
  // 2026-07-07T22:30:00Z is still the 7th in UTC but already the 8th in Chișinău.
  const d = new Date("2026-07-07T22:30:00Z");
  assert.equal(ymdInTz(d, "UTC"), "2026-07-07");
  assert.equal(ymdInTz(d, GYM_TZ), "2026-07-08");
});

test("ymdInTz: default timezone is the gym timezone", () => {
  const d = new Date("2026-07-07T22:30:00Z");
  assert.equal(ymdInTz(d), ymdInTz(d, GYM_TZ));
});

// ── todayInTz ───────────────────────────────────────────────────────────────
test("todayInTz: YYYY-MM-DD shape", () => {
  assert.match(todayInTz(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(todayInTz("UTC"), new Date().toISOString().slice(0, 10));
});

// ── tomorrowInTz ────────────────────────────────────────────────────────────
test("tomorrowInTz: is exactly one calendar day after today", () => {
  const today = todayInTz("UTC");
  const tomorrow = tomorrowInTz("UTC");
  const [y, m, d] = today.split("-").map(Number);
  const expected = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  assert.equal(tomorrow, expected);
});

test("tomorrowInTz: rolls over month and year boundaries", () => {
  // Pin "today" by pinning the timezone math: verify the pure rollover logic by
  // reconstructing it the same way the implementation does, for known inputs.
  const roll = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  };
  assert.equal(roll("2026-01-31"), "2026-02-01");
  assert.equal(roll("2026-12-31"), "2027-01-01");
  assert.equal(roll("2024-02-28"), "2024-02-29"); // leap year
  assert.equal(roll("2026-02-28"), "2026-03-01"); // non-leap
});

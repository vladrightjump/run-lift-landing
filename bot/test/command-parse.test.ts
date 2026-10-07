import { test } from "node:test";
import assert from "node:assert/strict";

import { parseCommand } from "../src/lib/command-parse.js";

// Wednesday 7 Oct 2026, 21:00. No session today, so "miercuri" means today.
const ctx = { today: "2026-10-07", now: "21:00", todayStart: null as string | null };
const p = (text: string, c = ctx) => parseCommand(text, c);

test("not a command → null", () => {
  assert.equal(p("salut"), null);
  assert.equal(p("/start"), null); // the onboarding flow keeps /start
  assert.equal(p("/necunoscut"), null);
});

test("/muta 7:30 → time 07:30, no date, no place", () => {
  assert.deepEqual(p("/muta 7:30"), { cmd: "muta", date: null, time: "07:30", text: null });
});

test("/muta 07.30 Parcul Valea Morilor → time and place", () => {
  assert.deepEqual(p("/muta 07.30 Parcul Valea Morilor"), {
    cmd: "muta",
    date: null,
    time: "07:30",
    text: "Parcul Valea Morilor",
  });
});

test("/muta with only a place", () => {
  assert.deepEqual(p("/muta Parcul Valea Morilor"), {
    cmd: "muta",
    date: null,
    time: null,
    text: "Parcul Valea Morilor",
  });
});

test("/muta joi 07:30 → that day's session", () => {
  assert.deepEqual(p("/muta joi 07:30"), { cmd: "muta", date: "2026-10-08", time: "07:30", text: null });
});

test("/anuleaza ploaie → no date, the reason", () => {
  assert.deepEqual(p("/anuleaza ploaie"), { cmd: "anuleaza", date: null, time: null, text: "ploaie" });
});

test("/anuleaza joi ploaie mare → Thursday and the reason", () => {
  assert.deepEqual(p("/anuleaza joi ploaie mare"), {
    cmd: "anuleaza",
    date: "2026-10-08",
    time: null,
    text: "ploaie mare",
  });
});

test("/extra sâmbătă 08:00 and /extra sambata 08:00 → same day and time", () => {
  const a = p("/extra sâmbătă 08:00");
  const b = p("/extra sambata 08:00");
  assert.deepEqual(a, { cmd: "extra", date: "2026-10-10", time: "08:00", text: null });
  assert.deepEqual(b, a);
});

test("/extra 15.10 and /extra 15 oct → 15 October", () => {
  assert.equal((p("/extra 15.10") as { date: string }).date, "2026-10-15");
  assert.equal((p("/extra 15 oct") as { date: string }).date, "2026-10-15");
  assert.equal((p("/extra 15 octombrie 08:00") as { date: string }).date, "2026-10-15");
  assert.equal((p("/extra 15/10/2026") as { date: string }).date, "2026-10-15");
});

test("a day.month already passed this year means next year", () => {
  assert.equal((p("/extra 5.01") as { date: string }).date, "2027-01-05");
});

test("azi, mâine, maine", () => {
  assert.equal((p("/extra azi 19:00") as { date: string }).date, "2026-10-07");
  assert.equal((p("/anuleaza mâine") as { date: string }).date, "2026-10-08");
  assert.equal((p("/anuleaza maine") as { date: string }).date, "2026-10-08");
});

test("a weekday on that same day: today before the session starts, next week after", () => {
  const thu = { today: "2026-10-08", now: "06:00", todayStart: "06:30" };
  assert.equal((p("/anuleaza joi", thu) as { date: string }).date, "2026-10-08");
  const late = { ...thu, now: "07:00" };
  assert.equal((p("/anuleaza joi", late) as { date: string }).date, "2026-10-15");
});

test("/muta 25:00 → an error with an example", () => {
  const r = p("/muta 25:00");
  assert.ok(r && "error" in r);
  assert.match((r as { error: string }).error, /\/muta 07:30/);
});

test("a past explicit date → an error", () => {
  const r = p("/extra 1.10.2026");
  assert.ok(r && "error" in r);
});

test("commands addressed to the bot by username still parse", () => {
  assert.deepEqual(p("/maine@parkgym_bot"), { cmd: "maine", date: null, time: null, text: null });
});

test("the card, help, poll and reminder commands", () => {
  for (const c of ["antrenament", "ajutor", "sondaj", "reaminteste", "reactiveaza"]) {
    assert.equal((p(`/${c}`) as { cmd: string }).cmd, c);
  }
});

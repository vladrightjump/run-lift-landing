import { test } from "node:test";
import assert from "node:assert/strict";

import { isDue, reminderDue, schedulerEnabled, summaryDue } from "../src/lib/schedule.js";
import { summaryKeyboard } from "../src/control.js";
import { normalizeTime, normalizeDays, textOrNull } from "../src/lib/config.js";
import { fmtDate } from "../src/lib/format.js";
import { cleanName, isValidName, voteAccepted } from "../src/webhook.js";

// ── Schedule matching ────────────────────────────────────────────────────────
test("isDue: fires only on a configured day at the exact time", () => {
  assert.equal(isDue([1, 3], "20:00", 1, "20:00"), true); // Mon 20:00
  assert.equal(isDue([1, 3], "20:00", 3, "20:00"), true); // Wed 20:00
});

test("isDue: does not fire on the wrong day", () => {
  assert.equal(isDue([1, 3], "20:00", 2, "20:00"), false); // Tue
  assert.equal(isDue([1, 3], "20:00", 0, "20:00"), false); // Sun
});

test("isDue: does not fire at the wrong minute", () => {
  assert.equal(isDue([1, 3], "20:00", 1, "20:01"), false);
  assert.equal(isDue([1, 3], "20:00", 1, "19:59"), false);
});

test("isDue: empty day list never fires", () => {
  assert.equal(isDue([], "20:00", 1, "20:00"), false);
});

// ── Config normalization ─────────────────────────────────────────────────────
test("normalizeTime: pads and trims to HH:MM", () => {
  assert.equal(normalizeTime("20:00"), "20:00");
  assert.equal(normalizeTime("9:05"), "09:05");
  assert.equal(normalizeTime("06:30:00"), "06:30");
  assert.equal(normalizeTime(" 7:15 "), "07:15");
});

test("normalizeTime: rejects junk", () => {
  assert.equal(normalizeTime("abc"), null);
  assert.equal(normalizeTime("9:5"), null); // minutes need 2 digits
  assert.equal(normalizeTime(123 as unknown), null);
  assert.equal(normalizeTime(null), null);
});

test("normalizeDays: keeps valid 0..6, drops the rest, falls back", () => {
  assert.deepEqual(normalizeDays([1, 3], []), [1, 3]);
  assert.deepEqual(normalizeDays(["1", "3"], []), [1, 3]);
  assert.deepEqual(normalizeDays([7, 1, -2, 6], []), [1, 6]);
  assert.deepEqual(normalizeDays("nope", [2, 4]), [2, 4]);
});

test("textOrNull: a saved poll text stays, empty or non-text means today's text", () => {
  assert.equal(textOrNull("Alergăm!"), "Alergăm!");
  assert.equal(textOrNull("   "), null);
  assert.equal(textOrNull(null), null);
  assert.equal(textOrNull(42), null);
});

// ── Romanian date formatting ─────────────────────────────────────────────────
test("fmtDate: short RO month, year only when not current", () => {
  const y = new Date().getFullYear();
  assert.equal(fmtDate(`${y}-07-08`), "8 iul");
  assert.equal(fmtDate("2024-01-01"), "1 ian 2024");
});

// ── Onboarding name handling ─────────────────────────────────────────────────
test("cleanName: collapses whitespace and trims", () => {
  assert.equal(cleanName("  Vlad   Filip  "), "Vlad Filip");
  assert.equal(cleanName("Ana\tMaria"), "Ana Maria");
});

test("isValidName: accepts real names, rejects commands and edge lengths", () => {
  assert.equal(isValidName("Vlad Filip"), true);
  assert.equal(isValidName("/start"), false);
  assert.equal(isValidName("V"), false);
  assert.equal(isValidName("x".repeat(81)), false);
  assert.equal(isValidName("x".repeat(80)), true);
});

// ── Votes on a cancelled training (R14) ─────────────────────────────────────
test("voteAccepted: a cancelled training takes no votes; scheduled ones do", () => {
  assert.equal(voteAccepted("cancelled"), false);
  assert.equal(voteAccepted("scheduled"), true);
  assert.equal(voteAccepted(null), true); // unknown session: the insert decides, as before
});

// ── Automations follow the day's training (R22, R23, KTD12, KTD15) ──────────

const session = (startsAt: string, status = "scheduled") => ({ id: "s1", startsAt, status });

test("reminderDue: a training at 07:30 → due at 05:30 and only then", () => {
  assert.equal(reminderDue(session("07:30:00"), "05:30", new Set()), true);
  assert.equal(reminderDue(session("07:30:00"), "04:30", new Set()), false);
  assert.equal(reminderDue(session("07:30:00"), "05:31", new Set()), false);
});

test("reminderDue: cancelled or missing training → never", () => {
  assert.equal(reminderDue(session("06:30", "cancelled"), "04:30", new Set()), false);
  assert.equal(reminderDue(null, "04:30", new Set()), false);
});

test("reminderDue: a training already reminded is not reminded again, even after a move", () => {
  const reminded = new Set(["s1"]);
  assert.equal(reminderDue(session("07:30"), "05:30", reminded), false);
});

const cfg = { summaryDays: [2, 4], summaryTime: "06:00", pollDays: [1, 3] };

test("Covers AE6. summaryDue: an extra Saturday with summaries Tue/Thu → due Saturday 06:00", () => {
  assert.equal(summaryDue(cfg, 6, "06:00", { status: "scheduled" }), true);
  assert.equal(summaryDue(cfg, 6, "06:01", { status: "scheduled" }), false);
});

test("summaryDue: Saturday without a training → not due; empty summary days → never", () => {
  assert.equal(summaryDue(cfg, 6, "06:00", null), false);
  assert.equal(summaryDue(cfg, 6, "06:00", { status: "cancelled" }), false);
  assert.equal(summaryDue({ ...cfg, summaryDays: [] }, 6, "06:00", { status: "scheduled" }), false);
});

test("summaryDue: an ordinary Tuesday → due, as today", () => {
  assert.equal(summaryDue(cfg, 2, "06:00", null), true);
});

test("summaryKeyboard: the day's actions; Reactivează on a cancelled one; nothing without a training", () => {
  const flat = (k: ReturnType<typeof summaryKeyboard>) => k.flat().map((b) => b.text);
  assert.deepEqual(flat(summaryKeyboard({ session_date: "2026-10-08", status: "scheduled" })), [
    "Cine vine",
    "Anulează",
    "Mută",
  ]);
  assert.deepEqual(flat(summaryKeyboard({ session_date: "2026-10-08", status: "cancelled" })), ["Reactivează"]);
  assert.deepEqual(summaryKeyboard(null), []);
});

test("schedulerEnabled: BOT_SCHEDULER=off turns off the ticks (local rehearsal)", () => {
  assert.equal(schedulerEnabled({ BOT_SCHEDULER: "off" }), false);
  assert.equal(schedulerEnabled({}), true);
});

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_WORDING,
  buildPollText,
  dayLabel,
  mentionList,
  pollTitleFor,
  renderPoll,
  effectiveWording,
  esc,
  pollHeader,
  pollKeyboard,
  wordingFromCopy,
} from "../src/lib/poll-text.js";

// ── esc ──────────────────────────────────────────────────────────────────────
test("esc: escapes Telegram-HTML special chars", () => {
  assert.equal(esc("A <B> & C"), "A &lt;B&gt; &amp; C");
});

// ── pollHeader ───────────────────────────────────────────────────────────────
test("pollHeader: bold title with RO weekday+date, time and location", () => {
  assert.equal(
    pollHeader("2026-07-22", "06:30", "Parcul Dumitru Râșcanu"),
    "🏃 <b>Antrenament mâine — Miercuri, 22 iul</b>\n🕕 06:30 · 📍 Parcul Dumitru Râșcanu",
  );
});

test("pollHeader: no date / no location fallbacks", () => {
  assert.equal(
    pollHeader("", "08:00", ""),
    "🏃 <b>Antrenament mâine</b>\n🕕 08:00",
  );
  assert.equal(
    pollHeader("", "06:30:00", "Parc"),
    "🏃 <b>Antrenament mâine</b>\n🕕 06:30 · 📍 Parc",
  );
});

// ── buildPollText ────────────────────────────────────────────────────────────
test("buildPollText: call-to-action when nobody voted", () => {
  const out = buildPollText("H", [], []);
  assert.equal(out, "H\n\nCine vine? Apasă mai jos 👇");
});

test("buildPollText: bulleted names, only non-empty sections, escaping", () => {
  const out = buildPollText("H", ["Ana", "V<lad"], []);
  assert.equal(out, "H\n\n✅ <b>Vin (2)</b>\n• Ana\n• V&lt;lad");
  assert.ok(!out.includes("Nu pot"));
});

test("buildPollText: both sections separated by a blank line", () => {
  const out = buildPollText("H", ["Ana"], ["Ion"]);
  assert.equal(
    out,
    "H\n\n✅ <b>Vin (1)</b>\n• Ana\n\n❌ <b>Nu pot (1)</b>\n• Ion",
  );
});

// ── Textul editabil (U10, KTD6 din planul botului) ──────────────────────────

test("characterization: no saved wording → today's header and buttons, byte for byte", () => {
  const w = effectiveWording({ title: null, yes: null, no: null });
  assert.deepEqual(w, { title: "Antrenament mâine", yes: "✅ Vin!", no: "❌ Nu pot" });
  assert.equal(
    pollHeader("2026-07-22", "06:30", "Parcul Dumitru Râșcanu", w.title),
    "🏃 <b>Antrenament mâine — Miercuri, 22 iul</b>\n🕕 06:30 · 📍 Parcul Dumitru Râșcanu",
  );
  assert.deepEqual(pollKeyboard("s-1", w), [
    [
      { text: "✅ Vin!", callback_data: "att:yes:s-1" },
      { text: "❌ Nu pot", callback_data: "att:no:s-1" },
    ],
  ]);
});

test("effectiveWording: blank or whitespace-only fields fall back, others are trimmed", () => {
  assert.deepEqual(effectiveWording({ title: "  Alergăm!  ", yes: " \t ", no: "Nu" }), {
    title: "Alergăm!",
    yes: DEFAULT_WORDING.yes,
    no: "Nu",
  });
});

test("custom labels show on the buttons; callback data stays att:yes / att:no", () => {
  const kb = pollKeyboard("abc", { title: "x", yes: "Da!", no: "Nu" });
  assert.deepEqual(kb[0].map((b) => b.text), ["Da!", "Nu"]);
  assert.deepEqual(kb[0].map((b) => b.callback_data), ["att:yes:abc", "att:no:abc"]);
});

test("a custom title is HTML-escaped in the header", () => {
  assert.equal(
    pollHeader("", "06:30", "", "Vii <azi> & mâine?"),
    "🏃 <b>Vii &lt;azi&gt; &amp; mâine?</b>\n🕕 06:30",
  );
});

test("wordingFromCopy: a session copy wins; a missing or broken copy means today's text", () => {
  assert.deepEqual(wordingFromCopy({ title: "A", yes: "B", no: "C" }), { title: "A", yes: "B", no: "C" });
  assert.deepEqual(wordingFromCopy(null), DEFAULT_WORDING);
  assert.deepEqual(wordingFromCopy({ title: 3 }), DEFAULT_WORDING);
  assert.deepEqual(wordingFromCopy({ title: "A" }), { ...DEFAULT_WORDING, title: "A" });
});

// ── Ziua de antrenament din Telegram (KTD9–KTD11) ───────────────────────────

test("pollTitleFor: day before → configured title; same day → azi; otherwise plain", () => {
  assert.equal(pollTitleFor("2026-10-08", "2026-10-07", "Alergăm mâine!"), "Alergăm mâine!");
  assert.equal(pollTitleFor("2026-10-10", "2026-10-10", "Alergăm mâine!"), "Antrenament azi");
  assert.equal(pollTitleFor("2026-10-10", "2026-10-07", "Alergăm mâine!"), "Antrenament");
});

test("Covers AE6. an extra Saturday posted Wednesday names the day, not 'mâine'", () => {
  const { text } = renderPoll({
    sessionId: "s",
    date: "2026-10-10",
    time: "08:00",
    location: "Parc",
    wording: { ...DEFAULT_WORDING, title: pollTitleFor("2026-10-10", "2026-10-07", DEFAULT_WORDING.title) },
    yes: [],
    no: [],
    cancelled: false,
  });
  assert.ok(text.startsWith("🏃 <b>Antrenament — Sâmbătă, 10 oct</b>"));
  assert.ok(!text.includes("mâine"));
});

test("renderPoll: active poll = today's text plus the vote buttons", () => {
  const r = renderPoll({
    sessionId: "s-1",
    date: "2026-07-22",
    time: "06:30",
    location: "Parc",
    wording: DEFAULT_WORDING,
    yes: ["Ana"],
    no: [],
    cancelled: false,
  });
  assert.equal(r.text, buildPollText(pollHeader("2026-07-22", "06:30", "Parc"), ["Ana"], []));
  assert.deepEqual(r.keyboard, pollKeyboard("s-1", DEFAULT_WORDING));
});

test("renderPoll: a cancelled poll says ANULAT, keeps the names, drops the call to action and the buttons", () => {
  const r = renderPoll({
    sessionId: "s-1",
    date: "2026-07-22",
    time: "06:30",
    location: "Parc",
    wording: DEFAULT_WORDING,
    yes: [],
    no: [],
    cancelled: true,
  });
  assert.ok(r.text.startsWith("❌ <b>ANULAT</b>\n🏃 <b>Antrenament mâine"));
  assert.ok(!r.text.includes("Apasă mai jos"));
  assert.deepEqual(r.keyboard, []);
  const withNames = renderPoll({ ...{ sessionId: "s", date: "", time: "06:30", location: "", wording: DEFAULT_WORDING }, yes: ["Ana"], no: ["Ion"], cancelled: true });
  assert.ok(withNames.text.includes("• Ana") && withNames.text.includes("• Ion"));
});

test("dayLabel: lowercase weekday, day and short month", () => {
  assert.equal(dayLabel("2026-10-08"), "joi, 8 oct");
});

test("mentionList: links for Telegram accounts, escaped plain names otherwise", () => {
  assert.equal(
    mentionList([
      { name: "Ana <A>", telegramId: 11 },
      { name: "Ion & Co", telegramId: null },
    ]),
    '<a href="tg://user?id=11">Ana &lt;A&gt;</a>, Ion &amp; Co',
  );
});

test("mentionList: over the budget → cut, ending with 'și încă N'", () => {
  const people = Array.from({ length: 50 }, (_, i) => ({ name: `Membru ${i}`, telegramId: 1000 + i }));
  const out = mentionList(people, 300);
  assert.ok(out.length <= 300);
  assert.match(out, /și încă \d+$/);
});

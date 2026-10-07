import { test } from "node:test";
import assert from "node:assert/strict";

import { decide, queuedNotice, type People } from "../src/lib/day-actions.js";
import type { SessionRow, Snapshot } from "../src/lib/sessions.js";

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

// Wednesday 7 Oct 2026, 21:00; training Tue/Thu.
const snap = (sessions: SessionRow[] = [], over: Partial<Snapshot> = {}): Snapshot => ({
  today: "2026-10-07",
  now: "21:00",
  pollDays: [1, 3],
  trainingTime: "06:30",
  location: "Parcul Dumitru Râșcanu",
  sessions,
  ...over,
});

const nine: People = {
  yes: Array.from({ length: 9 }, (_, i) => ({ name: `Vin ${i + 1}`, telegramId: 100 + i })),
  no: [{ name: "Nu 1", telegramId: 200 }, { name: "Nu 2", telegramId: 201 }],
  silent: ["Tace 1"],
};
const nobody: People = { yes: [], no: [], silent: ["Tace 1"] };

const withPoll = (date = "2026-10-08", over: Partial<SessionRow> = {}) =>
  row(date, { poll_message_id: 77, ...over });

const ok = (d: ReturnType<typeof decide>) => {
  assert.equal(d.ok, true, d.ok ? "" : d.message);
  return d as Extract<ReturnType<typeof decide>, { ok: true }>;
};
const refused = (d: ReturnType<typeof decide>) => {
  assert.equal(d.ok, false);
  return d as Extract<ReturnType<typeof decide>, { ok: false }>;
};

test("Covers AE1. cancel after the poll: cancelled, poll redrawn, notice mentions the 9 and the reason", () => {
  const d = ok(decide({ kind: "cancel", date: null, reason: "ploaie" }, snap([withPoll()]), nine));
  assert.deepEqual(d.effects.map((e) => e.kind), ["write", "redrawPoll", "send"]);
  assert.deepEqual(d.effects[0], { kind: "write", date: "2026-10-08", fields: { status: "cancelled" }, insert: null });
  const send = d.effects[2] as { kind: "send"; html: string };
  assert.equal((send.html.match(/tg:\/\/user\?id=/g) ?? []).length, 9);
  assert.match(send.html, /ploaie/);
  assert.match(d.preview, /9/);
  assert.equal(d.audit.action, "cancel_session");
  assert.equal(d.audit.date, "2026-10-08");
});

test("Covers AE2. cancel before the poll: only the row, nothing in the group", () => {
  const d = ok(decide({ kind: "cancel", date: "2026-10-15", reason: null }, snap(), nobody));
  assert.deepEqual(d.effects, [
    {
      kind: "write",
      date: "2026-10-15",
      fields: { status: "cancelled" },
      insert: { starts_at: "06:30", location: "Parcul Dumitru Râșcanu", status: "cancelled" },
    },
  ]);
  assert.match(d.preview, /nu pleacă nimic/i);
});

test("cancelling a cancelled training is refused and points to Reactivează", () => {
  const d = refused(decide({ kind: "cancel", date: null, reason: null }, snap([withPoll("2026-10-08", { status: "cancelled" })]), nine));
  assert.equal(d.suggest, "reactivate");
});

test("Covers AE3. reactivate after the poll: scheduled, poll redrawn, notice mentions the 9", () => {
  const d = ok(decide({ kind: "reactivate", date: null }, snap([withPoll("2026-10-08", { status: "cancelled" })]), nine));
  assert.deepEqual(d.effects.map((e) => e.kind), ["write", "redrawPoll", "send"]);
  assert.deepEqual((d.effects[0] as { fields: unknown }).fields, { status: "scheduled" });
  assert.equal(((d.effects[2] as { html: string }).html.match(/tg:\/\/user/g) ?? []).length, 9);
  assert.equal(d.audit.action, "reactivate_session");
});

test("reactivating a training that isn't cancelled is refused", () => {
  refused(decide({ kind: "reactivate", date: null }, snap([withPoll()]), nine));
});

test("Covers AE4. move after the poll: votes kept, row updated, poll redrawn, notice mentions the 9", () => {
  const d = ok(decide({ kind: "move", date: null, time: "07:30", location: null }, snap([withPoll()]), nine));
  assert.deepEqual(d.effects.map((e) => e.kind), ["write", "redrawPoll", "send"]);
  assert.deepEqual((d.effects[0] as { fields: unknown }).fields, { starts_at: "07:30" });
  const html = (d.effects[2] as { html: string }).html;
  assert.match(html, /06:30 → 07:30/);
  assert.match(html, /❌/);
  assert.equal((html.match(/tg:\/\/user/g) ?? []).length, 9);
  assert.equal(d.audit.action, "move_session");
});

test("Covers AE4. move before the poll: a scheduled row with the new time, nothing in the group", () => {
  const d = ok(decide({ kind: "move", date: null, time: "07:30", location: "Valea Morilor" }, snap(), nobody));
  assert.deepEqual(d.effects, [
    {
      kind: "write",
      date: "2026-10-08",
      fields: { starts_at: "07:30", location: "Valea Morilor" },
      insert: { starts_at: "07:30", location: "Valea Morilor", status: "scheduled" },
    },
  ]);
});

test("moving a cancelled training is refused and points to Reactivează (R17)", () => {
  const d = refused(decide({ kind: "move", date: null, time: "07:30", location: null }, snap([row("2026-10-08", { status: "cancelled" })]), nobody));
  assert.equal(d.suggest, "reactivate");
});

test("a move that changes nothing is refused", () => {
  refused(decide({ kind: "move", date: null, time: "06:30", location: "Parcul Dumitru Râșcanu" }, snap([withPoll()]), nine));
});

test("moving today's training to an hour already passed is refused", () => {
  const s = snap([row("2026-10-08")], { today: "2026-10-08", now: "05:00" });
  refused(decide({ kind: "move", date: null, time: "04:30", location: null }, s, nobody));
});

test("extra on a free day: a new scheduled row, then the poll right away", () => {
  const d = ok(decide({ kind: "extra", date: "2026-10-10", time: "08:00", location: null }, snap(), nobody));
  assert.deepEqual(d.effects, [
    {
      kind: "write",
      date: "2026-10-10",
      fields: { starts_at: "08:00", location: "Parcul Dumitru Râșcanu", status: "scheduled" },
      insert: { starts_at: "08:00", location: "Parcul Dumitru Râșcanu", status: "scheduled" },
    },
    { kind: "postPoll", date: "2026-10-10" },
  ]);
  assert.equal(d.audit.action, "add_session");
});

test("Covers AE5. extra on a day with a cancelled training → refused, offers Reactivează", () => {
  const d = refused(decide({ kind: "extra", date: "2026-10-10", time: "08:00", location: null }, snap([row("2026-10-10", { status: "cancelled" })]), nobody));
  assert.equal(d.suggest, "reactivate");
});

test("extra on a schedule day without a row → refused, offers Mută", () => {
  const d = refused(decide({ kind: "extra", date: "2026-10-08", time: "08:00", location: null }, snap(), nobody));
  assert.equal(d.suggest, "move");
});

test("extra today at an hour already passed → refused", () => {
  refused(decide({ kind: "extra", date: "2026-10-07", time: "20:00", location: null }, snap(), nobody));
});

test("poll on a cancelled training is refused; on one already in the group the preview warns", () => {
  refused(decide({ kind: "poll", date: null }, snap([row("2026-10-08", { status: "cancelled" })]), nobody));
  const d = ok(decide({ kind: "poll", date: null }, snap([withPoll()]), nine));
  assert.deepEqual(d.effects, [{ kind: "postPoll", date: "2026-10-08" }]);
  assert.match(d.preview, /unul nou/);
});

test("reminder: names the silent members; refused before the poll or on a cancelled training", () => {
  const d = ok(decide({ kind: "remind", date: null }, snap([withPoll()]), nine));
  assert.match((d.effects[0] as { html: string }).html, /Tace 1/);
  refused(decide({ kind: "remind", date: null }, snap([row("2026-10-08")]), nine));
  refused(decide({ kind: "remind", date: null }, snap([withPoll("2026-10-08", { status: "cancelled" })]), nine));
});

test("no training on the asked day → refused", () => {
  refused(decide({ kind: "cancel", date: "2026-10-10", reason: null }, snap(), nobody));
});

// ── Anunțul anulării făcute din /admin (KTD4) ───────────────────────────────

test("queued admin cancel, still cancelled, poll in the group → redraw + notice", () => {
  const s = snap([withPoll("2026-10-08", { status: "cancelled" })]);
  const q = queuedNotice("cancel", s, nine, "2026-10-08", "ploaie");
  assert.deepEqual(q.effects.map((e) => e.kind), ["redrawPoll", "send"]);
  assert.match((q.effects[1] as { html: string }).html, /ploaie/);
});

test("queued admin cancel, reactivated meanwhile → nothing, 'depășită'", () => {
  const q = queuedNotice("cancel", snap([withPoll()]), nine, "2026-10-08", null);
  assert.deepEqual(q.effects, []);
  assert.match(q.result, /depășită/);
});

test("queued admin cancel without a poll in the group → nothing to announce", () => {
  const q = queuedNotice("cancel", snap([row("2026-10-08", { status: "cancelled" })]), nobody, "2026-10-08", null);
  assert.deepEqual(q.effects, []);
  assert.match(q.result, /fără sondaj/);
});

test("queued admin reactivation, still scheduled, poll in the group → redraw + notice", () => {
  const q = queuedNotice("reactivate", snap([withPoll()]), nine, "2026-10-08", null);
  assert.deepEqual(q.effects.map((e) => e.kind), ["redrawPoll", "send"]);
});

// ── Organizer-typed text is escaped in the group HTML ───────────────────────
test("a reason, a place and a silent member's name with '<' and '&' are escaped", () => {
  const c = ok(decide({ kind: "cancel", date: null, reason: "ploaie <mare> & vânt" }, snap([withPoll()]), nine));
  assert.match((c.effects[2] as { html: string }).html, /ploaie &lt;mare&gt; &amp; vânt/);
  const m = ok(decide({ kind: "move", date: null, time: null, location: "Parc <Nord>" }, snap([withPoll()]), nine));
  assert.match((m.effects[2] as { html: string }).html, /Parc &lt;Nord&gt;/);
  const r = ok(decide({ kind: "remind", date: null }, snap([withPoll()]), { ...nine, silent: ["Ana <A>"] }));
  assert.match((r.effects[0] as { html: string }).html, /Ana &lt;A&gt;/);
});

test("every confirmed action has its own 'done' text", () => {
  const texts = [
    decide({ kind: "cancel", date: null, reason: null }, snap([withPoll()]), nine),
    decide({ kind: "move", date: null, time: "07:30", location: null }, snap([withPoll()]), nine),
    decide({ kind: "extra", date: "2026-10-10", time: "08:00", location: null }, snap(), nobody),
    decide({ kind: "poll", date: null }, snap([withPoll()]), nine),
    decide({ kind: "remind", date: null }, snap([withPoll()]), nine),
    decide({ kind: "reactivate", date: null }, snap([withPoll("2026-10-08", { status: "cancelled" })]), nine),
  ].map((d) => ok(d).done);
  assert.ok(texts.every((t) => t.length > 0 && !t.includes("?")));
  assert.equal(new Set(texts).size, texts.length);
});

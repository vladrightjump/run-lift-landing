import { test } from "node:test";
import assert from "node:assert/strict";

import { execute, runQueuedNotice, type AuditRow, type Ports } from "../src/jobs/day-ops.js";
import { decide, type People } from "../src/lib/day-actions.js";
import type { SessionRow, Snapshot } from "../src/lib/sessions.js";

const row = (date: string, over: Partial<SessionRow> = {}): SessionRow => ({
  id: `s-${date}`,
  session_date: date,
  starts_at: "06:30:00",
  location: "Parc",
  status: "scheduled",
  poll_message_id: 77,
  poll_wording: null,
  ...over,
});
const snap = (sessions: SessionRow[]): Snapshot => ({
  today: "2026-10-07",
  now: "21:00",
  pollDays: [1, 3],
  trainingTime: "06:30",
  location: "Parc",
  sessions,
});
const nine: People = {
  yes: Array.from({ length: 9 }, (_, i) => ({ name: `Vin ${i}`, telegramId: 100 + i })),
  no: [],
  silent: [],
};

// Records every call; `fail` makes one port report an error.
function fakePorts(state: { snapshot: Snapshot; people: People }, fail: Partial<Record<keyof Ports, string>> = {}) {
  const calls: string[] = [];
  const audits: AuditRow[] = [];
  const ports: Ports = {
    state: async () => state,
    write: async (e) => (calls.push(`write:${JSON.stringify(e.fields)}`), fail.write ?? null),
    postPoll: async (d) => (calls.push(`postPoll:${d}`), fail.postPoll ?? null),
    redrawPoll: async (d) => (calls.push(`redraw:${d}`), fail.redrawPoll ?? null),
    send: async () => (calls.push("send"), fail.send ?? null),
    audit: async (a) => {
      audits.push(a);
      if (fail.audit) throw new Error(fail.audit);
    },
  };
  return { ports, calls, audits };
}

const okDecision = (d: ReturnType<typeof decide>) => {
  assert.ok(d.ok);
  return d;
};

test("Covers AE1. a cancel runs write → redraw → notice, then a done audit row with the organizer", async () => {
  const s = snap([row("2026-10-08")]);
  const { ports, calls, audits } = fakePorts({ snapshot: s, people: nine });
  const r = await execute(okDecision(decide({ kind: "cancel", date: null, reason: "ploaie" }, s, nine)), ports, {
    source: "telegram",
    organizer: "Vlad",
  });
  assert.deepEqual(r, { ok: true, failures: [] });
  assert.deepEqual(calls, ['write:{"status":"cancelled"}', "redraw:2026-10-08", "send"]);
  assert.deepEqual(audits, [
    {
      action: "cancel_session",
      status: "done",
      result: "ok",
      payload: { sursa: "telegram", organizator: "Vlad", data: "2026-10-08", motiv: "ploaie" },
    },
  ]);
});

test("the notice is refused by Telegram → the row stays written, audit failed, the reason comes back (R26)", async () => {
  const s = snap([row("2026-10-08")]);
  const { ports, calls, audits } = fakePorts({ snapshot: s, people: nine }, { send: "Bad Request: chat not found" });
  const r = await execute(okDecision(decide({ kind: "cancel", date: null, reason: null }, s, nine)), ports, {
    source: "telegram",
    organizer: "Vlad",
  });
  assert.equal(r.ok, false);
  assert.match(r.failures[0], /anunțul.*chat not found/);
  assert.equal(calls[0], 'write:{"status":"cancelled"}'); // not undone
  assert.equal(audits[0].status, "failed");
});

test("a failed write stops everything after it", async () => {
  const s = snap([row("2026-10-08")]);
  const { ports, calls, audits } = fakePorts({ snapshot: s, people: nine }, { write: "db down" });
  const r = await execute(okDecision(decide({ kind: "cancel", date: null, reason: null }, s, nine)), ports, {
    source: "telegram",
    organizer: "Vlad",
  });
  assert.equal(r.ok, false);
  assert.deepEqual(calls, ['write:{"status":"cancelled"}']);
  assert.equal(audits[0].status, "failed");
});

test("the audit row fails to insert → the action still reports done", async () => {
  const s = snap([row("2026-10-08")]);
  const { ports } = fakePorts({ snapshot: s, people: nine }, { audit: "violates check constraint" });
  const r = await execute(okDecision(decide({ kind: "cancel", date: null, reason: null }, s, nine)), ports, {
    source: "telegram",
    organizer: "Vlad",
  });
  assert.deepEqual(r, { ok: true, failures: [] });
});

test("an extra writes the row, then posts the poll", async () => {
  const s = snap([]);
  const { ports, calls } = fakePorts({ snapshot: s, people: nine });
  await execute(okDecision(decide({ kind: "extra", date: "2026-10-10", time: "08:00", location: null }, s, nine)), ports, {
    source: "telegram",
    organizer: "Roma",
  });
  assert.deepEqual(calls, [
    'write:{"starts_at":"08:00","location":"Parc","status":"scheduled"}',
    "postPoll:2026-10-10",
  ]);
});

test("queued admin cancel, still cancelled → redraw and notice, done", async () => {
  const s = snap([row("2026-10-08", { status: "cancelled" })]);
  const { ports, calls } = fakePorts({ snapshot: s, people: nine });
  const r = await runQueuedNotice(
    { action: "cancel_session", payload: { data: "2026-10-08", motiv: "ploaie" } },
    ports,
  );
  assert.deepEqual(calls, ["redraw:2026-10-08", "send"]);
  assert.deepEqual(r, { ok: true, result: "anunțat" });
});

test("queued admin cancel, reactivated meanwhile → no Telegram call, done 'depășită'", async () => {
  const s = snap([row("2026-10-08")]);
  const { ports, calls } = fakePorts({ snapshot: s, people: nine });
  const r = await runQueuedNotice({ action: "cancel_session", payload: { data: "2026-10-08" } }, ports);
  assert.deepEqual(calls, []);
  assert.equal(r.ok, true);
  assert.match(r.result, /depășită/);
});

test("queued row without a date → failed, nothing sent", async () => {
  const { ports, calls } = fakePorts({ snapshot: snap([]), people: nine });
  const r = await runQueuedNotice({ action: "cancel_session", payload: null }, ports);
  assert.deepEqual(calls, []);
  assert.equal(r.ok, false);
});

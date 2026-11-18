import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { DEFAULT_CONFIG, type BotConfigRead } from "../src/lib/config.js";
import { createBotMonitor, monitorStatusRoute } from "../src/lib/monitor-status.js";
import { localMinuteInstant } from "../src/lib/tz.js";

const base: BotConfigRead = {
  config: { ...DEFAULT_CONFIG, pollDays: [3], pollTime: "11:20" },
  updatedAt: Date.parse("2026-11-01T00:00:00Z"),
};
const session = { id: "s1", session_date: "2026-11-19", status: "scheduled", poll_message_id: null as number | null };
const ms = (value: string) => Date.parse(value);

function harness(iso = "2026-11-18T09:31:00Z", enabled = true) {
  let now = ms(iso);
  let sequence = now;
  let rows: typeof session[] = [];
  let error: Error | undefined;
  const queries: string[][] = [];
  const accepted = new Set<string>();
  const monitor = createBotMonitor({
    schedulerEnabled: enabled,
    now: () => now,
    async readSessions(dates) {
      queries.push(dates);
      if (error) throw error;
      return rows.filter((row) => dates.includes(row.session_date));
    },
    wasPollAccepted: (date, id) => id
      ? accepted.has(`${date}:${id}`)
      : [...accepted].some((entry) => entry.startsWith(`${date}:`)),
  });
  return {
    ...monitor, accepted, queries,
    advance: (minutes: number) => { now += minutes * 60_000; },
    setRows: (...value: typeof session[]) => { rows = value; },
    failReads: (value?: Error) => { error = value; },
    tick: (read = base) => monitor.recordTick(read, sequence++),
  };
}

test("the heartbeat only advances for authoritative completed scheduler ticks", async () => {
  const h = harness("2026-11-18T08:00:00Z");
  assert.deepEqual(h.status(), { ok: false, reasons: ["starting"] });
  await h.tick();
  assert.equal(h.status().ok, true);
  h.advance(5);
  await h.tick({ config: DEFAULT_CONFIG, updatedAt: null });
  assert.deepEqual(h.status(), { ok: false, reasons: ["scheduler_stale"] });
  await h.tick();
  assert.equal(h.status().ok, true);
  assert.deepEqual(h.queries, []);
  assert.deepEqual(harness(undefined, false).status(), { ok: false, reasons: ["scheduler_disabled"] });
});

test("due poll remains pending through grace and absent evidence is unconfirmed", async () => {
  const h = harness("2026-11-18T09:28:00Z");
  await h.tick();
  assert.equal(h.status().ok, true);
  assert.deepEqual(h.queries, []);
  h.advance(2);
  await h.tick();
  assert.deepEqual(h.queries, [["2026-11-19"]]);
  assert.deepEqual(h.status(), { ok: false, reasons: ["poll_unconfirmed"] });
  h.failReads(new TypeError("Database unreachable"));
  await h.tick();
  assert.deepEqual(h.status(), { ok: false, reasons: ["poll_check_unavailable"] });
  h.failReads();
  h.setRows({ ...session, poll_message_id: 42 });
  await h.tick();
  assert.equal(h.status().ok, true);
});

test("a cancelled poll or intentional automation pause stays quiet", async () => {
  const h = harness();
  h.setRows({ ...session, status: "cancelled" });
  await h.tick();
  assert.equal(h.status().ok, true);
  h.setRows();
  await h.tick({ ...base, config: { ...base.config, enabled: false } });
  assert.equal(h.status().ok, true);
  assert.equal(h.queries.length, 1);
});

test("Telegram acceptance confirms posting until restart even when metadata is missing", async () => {
  const h = harness();
  h.setRows(session);
  await h.tick();
  assert.deepEqual(h.status().reasons, ["poll_unconfirmed"]);
  h.accepted.add("2026-11-19:s1");
  assert.equal(h.status().ok, true);
  h.failReads(new TypeError("Evidence unavailable"));
  await h.tick();
  assert.equal(h.status().ok, true);
  const afterRestart = harness("2026-11-18T23:01:00Z");
  afterRestart.setRows(session);
  await afterRestart.tick();
  assert.deepEqual(afterRestart.queries, [["2026-11-19"]]);
  assert.deepEqual(afterRestart.status().reasons, ["poll_unconfirmed"]);
  afterRestart.advance(24 * 60);
  await afterRestart.tick();
  assert.equal(afterRestart.status().ok, true);
});

test("an edit after a slot cannot manufacture a historic poll expectation", async (t) => {
  const warn = t.mock.method(console, "warn", () => {});
  const h = harness();
  await h.tick({ ...base, updatedAt: ms("2026-11-18T09:25:00Z") });
  assert.equal(h.status().ok, true);
  assert.ok(warn.mock.calls.some((call) => JSON.parse(String(call.arguments[0])).message === "schedule_history_unknown"));
});

test("a stuck poll evidence read is bounded even if the client ignores abort", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const now = ms("2026-11-18T09:31:00Z");
  const started = Promise.withResolvers<AbortSignal>();
  const monitor = createBotMonitor({
    schedulerEnabled: true,
    now: () => now,
    readSessions: (_dates, signal) => {
      started.resolve(signal);
      return new Promise(() => {});
    },
    wasPollAccepted: () => false,
  });
  const tick = monitor.recordTick(base, now);
  const signal = await started.promise;
  t.mock.timers.tick(3_000);
  await tick;
  assert.equal(signal.aborted, true);
  assert.deepEqual(monitor.status(), { ok: false, reasons: ["poll_check_unavailable"] });
});

test("local schedule time round-trips through normal dates and DST changes", () => {
  assert.equal(localMinuteInstant("2026-11-18", "11:20"), ms("2026-11-18T09:20:00Z"));
  assert.equal(localMinuteInstant("2026-03-29", "03:30"), null);
  assert.equal(localMinuteInstant("2026-10-25", "03:30"), ms("2026-10-25T00:30:00Z"));
});

test("the real status handler is private and only uses cached state", async (t) => {
  const h = harness("2026-11-18T08:00:00Z");
  const app = express();
  app.get("/monitoring/status", monitorStatusRoute("unit-monitor-token", h.status));
  app.get("/monitoring/dormant", monitorStatusRoute(undefined, h.status));
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}/monitoring`;
  const options = { headers: { Authorization: "Bearer unit-monitor-token" } };
  const unauthorized = await fetch(`${baseUrl}/status`);
  assert.equal(unauthorized.status, 404);
  assert.deepEqual(await unauthorized.json(), { ok: false });
  assert.equal((await fetch(`${baseUrl}/status`, { headers: { Authorization: "Bearer wrong-token" } })).status, 404);
  assert.equal((await fetch(`${baseUrl}/dormant`, options)).status, 404);
  const starting = await fetch(`${baseUrl}/status`, options);
  assert.equal(starting.status, 503);
  assert.equal(starting.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(await starting.json(), { ok: false, reasons: ["starting"] });
  await h.tick();
  assert.equal((await fetch(`${baseUrl}/status`, options)).status, 200);
  h.advance(5);
  assert.equal((await fetch(`${baseUrl}/status`, options)).status, 503);
  assert.deepEqual(h.queries, []);
});

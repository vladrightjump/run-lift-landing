import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { botFailure } from "../src/lib/log.js";
import { alertAdmins } from "../src/lib/notify.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test("failure logs keep operation and codes while excluding content and credentials", (t) => {
  const log = t.mock.method(console, "error", () => {});
  const error = new TypeError("https://api.telegram.org/bot<secret>/private", {
    cause: Object.assign(new Error("private message"), { code: "ECONNRESET" }),
  });
  botFailure("trial.send_message", "telegram", performance.now(), error, "unconfirmed", { updateId: 78 });
  const line = String(log.mock.calls[0].arguments[0]);
  const event = JSON.parse(line);
  assert.equal(event.error_code, "ECONNRESET");
  assert.equal(event.error_category, "transport");
  assert.equal(event.outcome, "unconfirmed");
  assert.equal(event.update_id, 78);
  assert.equal(typeof event.duration_ms, "number");
  assert.doesNotMatch(line, /secret|private|telegram\.org/);
});

test("a resolved Telegram rejection is logged without affecting other admin alerts", async (t) => {
  t.mock.method(console, "log", () => {});
  const log = t.mock.method(console, "error", () => {});
  process.env.TELEGRAM_ADMIN_CHAT_IDS = "17,18";
  process.env.TELEGRAM_BOT_TOKEN = "fake-token";
  const delivered: number[] = [];
  globalThis.fetch = async (_, init) => {
    const { chat_id: recipient } = JSON.parse(String(init?.body));
    delivered.push(recipient);
    return Response.json(recipient === 17
      ? { ok: false, error_code: 403, description: "secret recipient data" }
      : { ok: true, result: { message_id: 1 } });
  };
  await alertAdmins("private alert");
  assert.deepEqual(delivered, [17, 18]);
  assert.equal(log.mock.callCount(), 1);
  const line = String(log.mock.calls[0].arguments[0]);
  assert.equal(JSON.parse(line).operation, "alert.send_admin_dm");
  assert.equal(JSON.parse(line).error_code, 403);
  assert.doesNotMatch(line, /secret|private|chat_id/);
});

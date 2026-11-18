import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { handleUpdate } from "../src/webhook.js";

process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.TELEGRAM_BOT_TOKEN = "test-token";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

const update = {
  update_id: 42,
  callback_query: {
    id: "callback",
    from: { id: 5 },
    data: "att:no:session",
    message: { message_id: 6, chat: { id: -100, type: "supergroup" } },
  },
};

function stub(overrides: (path: string, init: RequestInit | undefined) => unknown = () => undefined) {
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const path = url.pathname.split("/").at(-1)!;
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path}`);
    const override = await overrides(path, init);
    if (override instanceof Response) return override;
    const result = override !== undefined ? override
      : url.hostname === "api.telegram.org" ? { ok: true }
      : path === "members" ? { id: "member" }
      : path === "training_sessions" ? {
        id: "session", session_date: "2026-11-19", starts_at: "06:30",
        location: "Park", status: "scheduled", poll_message_id: 6,
      }
      : path === "attendance" && method === "GET" ? [] : null;
    return Response.json(result);
  };
  return calls;
}

test("a saved vote still refreshes the poll after a thrown acknowledgment", async () => {
  const calls = stub((path) => {
    if (path === "answerCallbackQuery") throw new TypeError("fetch failed");
  });
  assert.equal(await handleUpdate(update), true);
  assert.equal(calls.filter((call) => call === "POST attendance").length, 1);
  assert.ok(calls.includes("POST attendance_log"));
  assert.ok(calls.includes("POST editMessageText"));
});

test("a saved vote stays successful after a rejected acknowledgment or failed audit", async () => {
  const calls = stub((path) => {
    if (path === "answerCallbackQuery") return { ok: false, error_code: 400 };
    if (path === "attendance_log") return Response.json({ code: "42501" }, { status: 403 });
  });
  assert.equal(await handleUpdate(update), true);
  assert.ok(calls.includes("POST editMessageText"));
});

test("a database failure before saving a vote still requests redelivery", async () => {
  const calls = stub((path) => {
    if (path === "attendance") return Response.json({ code: "08006" }, { status: 503 });
  });
  assert.equal(await handleUpdate(update), false);
  assert.ok(!calls.includes("POST attendance_log"));
  assert.ok(!calls.includes("POST editMessageText"));
});

test("a failed member lookup retries without attempting to create a member", async (t) => {
  const log = t.mock.method(console, "error", () => {});
  const calls = stub((path) => path === "members"
    ? Response.json({ code: "08006" }, { status: 503 })
    : undefined);
  assert.equal(await handleUpdate(update), false);
  assert.ok(!calls.includes("POST members"));
  assert.ok(!calls.includes("POST attendance"));
  assert.equal(log.mock.callCount(), 1);
  assert.equal(JSON.parse(String(log.mock.calls[0].arguments[0])).operation, "vote.read_member_id");
});

test("a Telegram no-op edit is not logged as a failure", async (t) => {
  const errorLog = t.mock.method(console, "error", () => {});
  const calls = stub((path) => path === "editMessageText" ? {
    ok: false, error_code: 400,
    description: "Bad Request: message is not modified: the content already matches",
  } : undefined);
  assert.equal(await handleUpdate(update), true);
  assert.ok(calls.includes("POST editMessageText"));
  assert.equal(errorLog.mock.callCount(), 0);
});

test("a stalled acknowledgment cannot delay the webhook beyond the follow-up budget", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { promise: started, resolve } = Promise.withResolvers<AbortSignal>();
  const edit = Promise.withResolvers<void>();
  const calls = stub((path, init) => {
    if (path === "answerCallbackQuery") {
      assert.ok(init?.signal);
      resolve(init.signal);
      return new Promise(() => {});
    }
    if (path === "editMessageText") edit.resolve();
  });
  const result = handleUpdate(update);
  const signal = await started;
  await edit.promise;
  t.mock.timers.tick(4_000);
  assert.equal(await result, true);
  assert.equal(signal.aborted, true);
  assert.ok(calls.includes("POST editMessageText"));
});

test("duplicate deliveries still upsert attendance, and unrelated edit rejections are logged", async (t) => {
  const errorLog = t.mock.method(console, "error", () => {});
  const calls = stub((path) => path === "editMessageText" ? {
    ok: false, error_code: 400, description: "Bad Request: message to edit not found",
  } : undefined);
  assert.equal(await handleUpdate(update), true);
  assert.equal(await handleUpdate(update), true);
  assert.equal(calls.filter((call) => call === "POST attendance").length, 2);
  assert.equal(calls.filter((call) => call === "POST attendance_log").length, 2);
  assert.equal(errorLog.mock.callCount(), 2);
  assert.equal(JSON.parse(String(errorLog.mock.calls[0].arguments[0])).operation, "vote.refresh_edit");
});

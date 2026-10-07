import { test } from "node:test";
import assert from "node:assert/strict";

import { DRAFT_TTL_MS, DraftStore } from "../src/lib/drafts.js";
import { organizerIds } from "../src/lib/organizers.js";

test("organizerIds: only valid ids, spaces and empty entries ignored", () => {
  assert.deepEqual(organizerIds(" 111, ,222,abc, -5 "), [111, 222, -5]);
  assert.deepEqual(organizerIds(undefined), []);
  assert.deepEqual(organizerIds(""), []);
});

test("a draft lives 15 minutes, then reads as expired", () => {
  let now = 0;
  const store = new DraftStore(() => now);
  const d = store.create(1, "confirm", { kind: "poll", date: null }, null);
  now = DRAFT_TTL_MS - 1;
  assert.equal(store.get(d.token).found, true);
  now = DRAFT_TTL_MS;
  assert.deepEqual(store.get(d.token), { found: false, why: "expired" });
});

test("consume: the first tap gets the draft, the second reads 'used'", () => {
  const store = new DraftStore(() => 0);
  const d = store.create(1, "confirm", { kind: "poll", date: null }, null);
  assert.equal(store.consume(d.token).found, true);
  assert.deepEqual(store.consume(d.token), { found: false, why: "used" });
});

test("one live draft per chat; other chats keep theirs", () => {
  const store = new DraftStore(() => 0);
  const a = store.create(1, "reason", { kind: "cancel", date: null }, null);
  const b = store.create(2, "reason", { kind: "cancel", date: null }, null);
  const a2 = store.create(1, "time", { kind: "move", date: null }, null);
  assert.equal(store.get(a.token).found, false);
  assert.equal(store.get(b.token).found, true);
  assert.equal(store.waitingIn(1)?.token, a2.token);
});

test("waitingIn: only drafts waiting for typed text", () => {
  const store = new DraftStore(() => 0);
  store.create(1, "confirm", { kind: "poll", date: null }, null);
  assert.equal(store.waitingIn(1), null);
});

import { test } from "node:test";
import assert from "node:assert/strict";

import { handleControlCallback, handleOrganizerText, type ControlDeps } from "../src/control.js";
import { DraftStore } from "../src/lib/drafts.js";
import type { Ports } from "../src/jobs/day-ops.js";
import type { People } from "../src/lib/day-actions.js";
import type { SessionRow, Snapshot } from "../src/lib/sessions.js";

const VLAD = 111;
const STRANGER = 999;

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

interface Sent {
  chatId: number;
  text: string;
  buttons: string[]; // callback data, flattened
  labels: string[];
}

function harness(sessions: SessionRow[] = [row("2026-10-08")]) {
  const state = {
    snapshot: {
      today: "2026-10-07",
      now: "21:00",
      pollDays: [1, 3],
      trainingTime: "06:30",
      location: "Parc",
      sessions,
    } as Snapshot,
    people: {
      yes: [{ name: "Ana", telegramId: 1 }],
      no: [{ name: "Ion", telegramId: 2 }],
      silent: ["Dan"],
    } as People,
  };
  const writes: string[] = [];
  const out: Sent[] = [];
  const answers: string[] = [];
  let nextId = 500;
  const flat = (kb?: { text: string; callback_data: string }[][]) => ({
    buttons: (kb ?? []).flat().map((b) => b.callback_data),
    labels: (kb ?? []).flat().map((b) => b.text),
  });
  const ports: Ports = {
    state: async () => state,
    write: async (e) => (writes.push(`write:${JSON.stringify(e.fields)}`), null),
    postPoll: async (d) => (writes.push(`postPoll:${d}`), null),
    redrawPoll: async (d) => (writes.push(`redraw:${d}`), null),
    send: async () => (writes.push("send"), null),
    audit: async (a) => void writes.push(`audit:${a.action}:${a.status}`),
  };
  const deps: ControlDeps = {
    ports,
    organizers: [VLAD],
    drafts: new DraftStore(() => 0),
    tg: {
      send: async (chatId, text, kb) => (out.push({ chatId, text, ...flat(kb) }), nextId++),
      edit: async (chatId, _id, text, kb) => void out.push({ chatId, text, ...flat(kb) }),
      answer: async (_id, text) => void answers.push(text ?? ""),
    },
  };
  const last = () => out[out.length - 1];
  const tap = (data: string, from = VLAD) =>
    handleControlCallback({ id: "cb", fromId: from, fromName: "Vlad", chatId: from, chatType: "private", messageId: 500, data }, deps);
  const say = (text: string, from = VLAD) =>
    handleOrganizerText({ chatId: from, chatType: "private", fromId: from, fromName: "Vlad", text }, deps);
  return { state, deps, out, writes, answers, last, tap, say };
}

const button = (h: ReturnType<typeof harness>, prefix: string) => {
  const b = h.last().buttons.find((x) => x.startsWith(prefix));
  assert.ok(b, `no button ${prefix} in ${h.last().buttons.join(" ")}`);
  return b!;
};

test("Covers AE7. a non-organizer's /anuleaza in private: not handled, no message, no write", async () => {
  const h = harness();
  assert.equal(await h.say("/anuleaza", STRANGER), false);
  assert.deepEqual(h.out, []);
  assert.deepEqual(h.writes, []);
});

test("a control button tapped by a non-organizer only gets the technical answer", async () => {
  const h = harness();
  await h.tap("c:anul:2026-10-08", STRANGER);
  assert.deepEqual(h.out, []);
  assert.deepEqual(h.writes, []);
  assert.equal(h.answers.length, 1);
});

test("an organizer's message in the group is not handled (R2)", async () => {
  const h = harness();
  assert.equal(
    await handleOrganizerText({ chatId: -100, chatType: "supergroup", fromId: VLAD, fromName: "Vlad", text: "/anuleaza" }, h.deps),
    false,
  );
  assert.deepEqual(h.out, []);
});

test("/antrenament shows the card of the target with the R4 buttons", async () => {
  const h = harness();
  assert.equal(await h.say("/antrenament"), true);
  assert.match(h.last().text, /joi, 8 oct, 06:30/);
  assert.match(h.last().text, /1 vin/);
  assert.deepEqual(h.last().labels, ["Cine vine", "Anulează", "Mută", "Extra", "Sondaj", "Reamintește"]);
});

test("on a cancelled target the card offers Reactivează, without Anulează and Mută", async () => {
  const h = harness([row("2026-10-08", { status: "cancelled" })]);
  await h.say("/antrenament");
  assert.match(h.last().text, /ANULAT/);
  assert.ok(h.last().labels.includes("Reactivează"));
  assert.ok(!h.last().labels.includes("Anulează") && !h.last().labels.includes("Mută"));
});

test("Covers AE8. Anulează, Fără motiv, then Renunță → no write", async () => {
  const h = harness();
  await h.tap("c:anul:2026-10-08");
  await h.tap(button(h, "c:r:"));
  assert.match(h.last().text, /Anulezi/);
  await h.tap(button(h, "c:no:"));
  assert.deepEqual(h.writes, []);
});

test("Covers F1. Anulează, a typed reason, Confirmă → cancelled and announced, audit with the organizer", async () => {
  const h = harness();
  await h.tap("c:anul:2026-10-08");
  await h.say("ploaie");
  assert.match(h.last().text, /Motiv: ploaie/);
  await h.tap(button(h, "c:ok:"));
  assert.deepEqual(h.writes, ['write:{"status":"cancelled"}', "redraw:2026-10-08", "send", "audit:cancel_session:done"]);
  assert.match(h.last().text, /Gata/);
});

test("Confirmă with an expired draft → 'a expirat' and a fresh card, nothing executed", async () => {
  const h = harness();
  await h.tap("c:ok:nuexista");
  assert.match(h.out[0].text, /expirat/);
  assert.deepEqual(h.writes, []);
});

test("two taps on Confirmă → executed once, the second says it is already done", async () => {
  const h = harness();
  await h.say("/sondaj");
  const ok = button(h, "c:ok:");
  await h.tap(ok);
  await h.tap(ok);
  assert.equal(h.writes.filter((w) => w.startsWith("postPoll")).length, 1);
  assert.match(h.answers[h.answers.length - 1], /deja/);
});

test("Confirmă after the other organizer changed the training → a new preview, no action", async () => {
  const h = harness();
  await h.say("/muta 07:30");
  const ok = button(h, "c:ok:");
  h.state.snapshot.sessions = [row("2026-10-08", { status: "cancelled" })]; // Roma cancelled meanwhile
  await h.tap(ok);
  assert.deepEqual(h.writes, []);
  assert.match(h.last().text, /anulat/);
});

test("/muta 07:30 → straight to the preview (R5)", async () => {
  const h = harness();
  await h.say("/muta 07:30");
  assert.match(h.last().text, /06:30 → 07:30/);
  assert.ok(h.last().buttons.some((b) => b.startsWith("c:ok:")));
});

test("Mută → Altă oră → '7:45' → preview with 07:45; text without an hour → asked again with an example", async () => {
  const h = harness();
  await h.tap("c:muta:2026-10-08");
  await h.tap(button(h, "c:t:") && h.last().buttons.find((b) => b.endsWith(":alt"))!);
  await h.say("pe la șapte");
  assert.match(h.last().text, /07:45/); // the example
  await h.say("7:45");
  await h.tap(h.last().buttons.find((b) => b.endsWith(":same"))!);
  assert.match(h.last().text, /06:30 → 07:45/);
});

test("Extra offers only free days, then the settings' time is ready to pick", async () => {
  const h = harness();
  await h.tap("c:extra");
  const days = h.last().buttons.filter((b) => b.startsWith("c:d:"));
  assert.ok(days.length > 0);
  assert.ok(!days.some((b) => b.endsWith("20261008")), "Thursday is a training day");
  await h.tap(days.find((b) => b.endsWith("20261010"))!);
  assert.ok(h.last().buttons.some((b) => b.endsWith(":0630")));
});

test("/maine → vin, nu vin and n-au răspuns", async () => {
  const h = harness();
  await h.say("/maine");
  assert.match(h.last().text, /Ana/);
  assert.match(h.last().text, /Ion/);
  assert.match(h.last().text, /Dan/);
});

test("a shortcut the parser can't read → its error with examples", async () => {
  const h = harness();
  await h.say("/muta 25:00");
  assert.match(h.last().text, /Exemple/);
});

test("plain text with no draft waiting is not handled (the member flow decides)", async () => {
  const h = harness();
  assert.equal(await h.say("salut"), false);
});

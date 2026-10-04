// Testele din gym-app, portate neschimbat (doar runnerul: node:test → vitest).
import { test } from "vitest";
import assert from "node:assert/strict";

import {
  escHtml,
  buildCustomMessageHtml,
  type MentionInput,
} from "../../src/admin/sala/mesaj";

function mention(over: Partial<MentionInput> & { fullName: string }): MentionInput {
  return {
    telegramUserId: null,
    telegramUsername: null,
    ...over,
  };
}

// ── escHtml ─────────────────────────────────────────────────────────────────
test("escHtml: escapes &, <, > (ampersand first)", () => {
  assert.equal(escHtml("a & b"), "a &amp; b");
  assert.equal(escHtml("<b>"), "&lt;b&gt;");
  // Ampersand must be escaped before < / > so entities aren't double-escaped.
  assert.equal(escHtml("<&>"), "&lt;&amp;&gt;");
});

test("escHtml: leaves plain text untouched", () => {
  assert.equal(escHtml("Salut echipa"), "Salut echipa");
});

// ── buildCustomMessageHtml ──────────────────────────────────────────────────
test("buildCustomMessageHtml: trims and escapes the base text", () => {
  assert.equal(buildCustomMessageHtml("  hello <x> & y  ", []), "hello &lt;x&gt; &amp; y");
});

test("buildCustomMessageHtml: id mention becomes a tg://user link", () => {
  const html = buildCustomMessageHtml("Salut @Vlad Filip!", [
    mention({ fullName: "Vlad Filip", telegramUserId: 12345 }),
  ]);
  assert.equal(html, 'Salut <a href="tg://user?id=12345">Vlad Filip</a>!');
});

test("buildCustomMessageHtml: username mention strips a leading @", () => {
  const withAt = buildCustomMessageHtml("hey @Roma", [
    mention({ fullName: "Roma", telegramUsername: "@roma_x" }),
  ]);
  assert.equal(withAt, "hey @roma_x");
  const noAt = buildCustomMessageHtml("hey @Roma", [
    mention({ fullName: "Roma", telegramUsername: "roma_x" }),
  ]);
  assert.equal(noAt, "hey @roma_x");
});

test("buildCustomMessageHtml: id wins over username when both present", () => {
  const html = buildCustomMessageHtml("@Ana", [
    mention({ fullName: "Ana", telegramUserId: 999, telegramUsername: "ana" }),
  ]);
  assert.equal(html, '<a href="tg://user?id=999">Ana</a>');
});

test("buildCustomMessageHtml: unmatchable mention is left as literal text", () => {
  const html = buildCustomMessageHtml("bun @Necunoscut venit", [
    mention({ fullName: "Necunoscut" }), // no id, no username
  ]);
  assert.equal(html, "bun @Necunoscut venit");
});

test("buildCustomMessageHtml: replaces every occurrence of the token", () => {
  const html = buildCustomMessageHtml("@Vlad @Vlad @Vlad", [
    mention({ fullName: "Vlad", telegramUserId: 1 }),
  ]);
  assert.equal(
    html,
    '<a href="tg://user?id=1">Vlad</a> <a href="tg://user?id=1">Vlad</a> <a href="tg://user?id=1">Vlad</a>',
  );
});

test("buildCustomMessageHtml: token matches the escaped name", () => {
  // A name containing special chars still matches once both sides are escaped.
  const html = buildCustomMessageHtml("hi @A&B", [
    mention({ fullName: "A&B", telegramUserId: 7 }),
  ]);
  assert.equal(html, 'hi <a href="tg://user?id=7">A&amp;B</a>');
});

test("buildCustomMessageHtml: applies multiple distinct mentions", () => {
  const html = buildCustomMessageHtml("@Vlad and @Roma", [
    mention({ fullName: "Vlad", telegramUserId: 1 }),
    mention({ fullName: "Roma", telegramUsername: "roma" }),
  ]);
  assert.equal(html, '<a href="tg://user?id=1">Vlad</a> and @roma');
});

// ── Corner cases ────────────────────────────────────────────────────────────
test("buildCustomMessageHtml: a name that prefixes another is not consumed first", () => {
  // "Ana" is a prefix of "Ana Maria". Replacing the short token first would turn
  // "@Ana Maria" into '<a…>Ana</a> Maria' and lose the longer mention entirely.
  const html = buildCustomMessageHtml("salut @Ana Maria", [
    mention({ fullName: "Ana", telegramUserId: 1 }),
    mention({ fullName: "Ana Maria", telegramUserId: 2 }),
  ]);
  assert.equal(html, 'salut <a href="tg://user?id=2">Ana Maria</a>');
});

test("buildCustomMessageHtml: both a name and its longer variant still resolve", () => {
  const html = buildCustomMessageHtml("@Ana și @Ana Maria", [
    mention({ fullName: "Ana", telegramUserId: 1 }),
    mention({ fullName: "Ana Maria", telegramUserId: 2 }),
  ]);
  assert.equal(
    html,
    '<a href="tg://user?id=1">Ana</a> și <a href="tg://user?id=2">Ana Maria</a>',
  );
});

test("buildCustomMessageHtml: username fallback is HTML-escaped", () => {
  // Usernames come from the DB and are admin-editable, so they must not be able
  // to inject raw markup into the Telegram-HTML payload.
  const html = buildCustomMessageHtml("hey @Rau", [
    mention({ fullName: "Rau", telegramUsername: "<b>x</b>" }),
  ]);
  assert.equal(html, "hey @&lt;b&gt;x&lt;/b&gt;");
});

test("buildCustomMessageHtml: a blank name is skipped, not applied as '@'", () => {
  // token would be a bare "@", which would replace every @ in the message.
  const html = buildCustomMessageHtml("scrie la @Vlad sau @Roma", [
    mention({ fullName: "   ", telegramUserId: 5 }),
  ]);
  assert.equal(html, "scrie la @Vlad sau @Roma");
});

test("buildCustomMessageHtml: no mentions leaves the escaped text alone", () => {
  assert.equal(buildCustomMessageHtml("@Cineva & co", []), "@Cineva &amp; co");
});

test("buildCustomMessageHtml: an anchor inserted earlier is not re-escaped", () => {
  // The second mention runs over a string that already contains an <a> tag.
  const html = buildCustomMessageHtml("@A @B", [
    mention({ fullName: "A", telegramUserId: 1 }),
    mention({ fullName: "B", telegramUserId: 2 }),
  ]);
  assert.equal(
    html,
    '<a href="tg://user?id=1">A</a> <a href="tg://user?id=2">B</a>',
  );
});

test("escHtml: empty string stays empty", () => {
  assert.equal(escHtml(""), "");
});

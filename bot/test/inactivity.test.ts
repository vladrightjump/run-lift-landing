import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInactivity, type Candidate, type Change, type InactivityPorts, type SentMessage } from '../src/jobs/inactivity-alert.js';
import { inactivityDue } from '../src/lib/schedule.js';
import { alertText, callbackData, settledText, type ReviewView } from '../src/lib/inactivity-text.js';
import type { InlineKeyboard, TelegramMember } from '../src/lib/telegram.js';

const ion: Candidate = {
  member_id: 'm1', full_name: 'Ion Ștefan', telegram_user_id: 200, telegram_username: 'ion_run',
  last_yes: '2026-09-02', join_date: '2026-01-01', anchor_date: '2026-09-02', weeks_missed: 3,
};
const member = (id: number, status: TelegramMember['status'] = 'member'): TelegramMember => ({ status, user: { id } });

function fixture(over: Partial<InactivityPorts> = {}) {
  const sent: { chat: number; text: string; kb: InlineKeyboard }[] = [];
  const edits: { chat: number; msg: number; text: string }[] = [];
  const saved: Record<string, SentMessage[]> = {};
  const discarded: string[] = [];
  const recorded: number[] = [];
  let nextMsg = 10;
  let nextReview = 0;
  const ports: InactivityPorts = {
    organizers: [100, 101], group: '-123', today: '2026-10-12',
    maintain: async () => [],
    candidates: async () => [ion],
    open: async () => `r${++nextReview}`,
    setMessages: async (id, m) => { saved[id] = m; },
    discard: async (id) => { discarded.push(id); },
    inspect: async (id) => member(id),
    record: async (m) => { recorded.push(m.user.id); },
    send: async (chat, text, kb) => { sent.push({ chat, text, kb }); return nextMsg++; },
    edit: async (chat, msg, text) => { edits.push({ chat, msg, text }); },
    ...over,
  };
  return { ports, sent, edits, saved, discarded, recorded };
}

test('one candidate, two organizers: two messages with three buttons, ids saved on the cycle', async () => {
  const f = fixture();
  const r = await runInactivity(f.ports);
  assert.equal(r.ok, true);
  assert.deepEqual(f.sent.map((s) => s.chat), [100, 101]);
  const buttons = f.sent[0].kb.flat().map((b) => b.callback_data);
  assert.deepEqual(buttons, ['i:r1:k', 'i:r1:p', 'i:r1:n']);
  assert.ok(Buffer.byteLength(callbackData('6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b', 'k')) <= 64);
  assert.deepEqual(f.saved.r1, [{ chat_id: 100, message_id: 10 }, { chat_id: 101, message_id: 11 }]);
  assert.match(f.sent[0].text, /Ion Ștefan \(@ion_run\)/);
  assert.match(f.sent[0].text, /3 săptămâni cu antrenamente fără „Da"/);
  assert.match(f.sent[0].text, /Ultimul „Da": 2 sep/);
});

test('a member who never said yes: the text gives the join date', () => {
  const text = alertText({ id: 'r', status: 'open', ...ion, last_yes: null, telegram_username: null, join_date: '2026-09-10' });
  assert.match(text, /Niciun „Da" de la intrarea în grup \(10 sep\)/);
  assert.match(text, /fără @utilizator/);
});

test('an organizer is never alerted about themselves', async () => {
  const f = fixture({ candidates: async () => [{ ...ion, telegram_user_id: 101 }] });
  await runInactivity(f.ports);
  assert.equal(f.sent.length, 0);
});

test('a Telegram group admin is skipped after the live check, without a cycle', async () => {
  let opened = 0;
  const f = fixture({ inspect: async (id) => member(id, 'administrator'), open: async () => { opened++; return 'r1'; } });
  await runInactivity(f.ports);
  assert.equal(opened, 0);
  assert.equal(f.sent.length, 0);
});

test('someone who already left is recorded, not alerted', async () => {
  const f = fixture({ inspect: async (id) => member(id, 'left') });
  await runInactivity(f.ports);
  assert.deepEqual(f.recorded, [200]);
  assert.equal(f.sent.length, 0);
});

test('a failed live check skips today (retried tomorrow)', async () => {
  const f = fixture({ inspect: async () => { throw new Error('timeout'); } });
  const r = await runInactivity(f.ports);
  assert.equal(r.ok, true);
  assert.equal(f.sent.length, 0);
});

test('sending fails for every organizer: the cycle is discarded; for one: the cycle keeps one message', async () => {
  const all = fixture({ send: async () => null });
  await runInactivity(all.ports);
  assert.deepEqual(all.discarded, ['r1']);

  const one = fixture({ send: async (chat) => (chat === 100 ? 7 : null) });
  await runInactivity(one.ports);
  assert.deepEqual(one.discarded, []);
  assert.deepEqual(one.saved.r1, [{ chat_id: 100, message_id: 7 }]);
});

test('an already-open cycle (open returns null) sends nothing', async () => {
  const f = fixture({ open: async () => null });
  await runInactivity(f.ports);
  assert.equal(f.sent.length, 0);
});

const review = (over: Partial<ReviewView> = {}): ReviewView => ({
  id: 'r9', status: 'returned', weeks_missed: 3, full_name: 'Ion Ștefan', telegram_user_id: 200,
  telegram_username: 'ion_run', last_yes: '2026-10-07', join_date: '2026-01-01',
  messages: [{ chat_id: 100, message_id: 5 }, { chat_id: 101, message_id: 6 }], ...over,
});

test('a cycle closed as returned: both copies edited, without buttons', async () => {
  const changes: Change[] = [{ change: 'returned', review: review() }];
  const f = fixture({ maintain: async () => changes, candidates: async () => [] });
  await runInactivity(f.ports);
  assert.deepEqual(f.edits.map((e) => [e.chat, e.msg]), [[100, 5], [101, 6]]);
  assert.match(f.edits[0].text, /A revenit/);
  assert.equal(f.sent.length, 0);
});

test('a reopened cycle after postponement: new messages sent and the list replaced', async () => {
  const changes: Change[] = [{ change: 'reopened', review: review({ status: 'open', id: 'r9' }) }];
  const f = fixture({ maintain: async () => changes, candidates: async () => [] });
  await runInactivity(f.ports);
  assert.equal(f.sent.length, 2);
  assert.deepEqual(f.sent[0].kb.flat().map((b) => b.callback_data), ['i:r9:k', 'i:r9:p', 'i:r9:n']);
  assert.deepEqual(f.saved.r9, [{ chat_id: 100, message_id: 10 }, { chat_id: 101, message_id: 11 }]);
});

test('an edit failing on a deleted message does not stop the run', async () => {
  const changes: Change[] = [{ change: 'left', review: review({ status: 'left' }) }];
  const f = fixture({ maintain: async () => changes, candidates: async () => [], edit: async () => { throw new Error('message to edit not found'); } });
  const r = await runInactivity(f.ports);
  assert.equal(r.ok, true);
});

test('without organizers or group the job reports config and does nothing', async () => {
  const f = fixture({ organizers: [] });
  assert.deepEqual(await runInactivity(f.ports), { ok: false, detail: 'config' });
  assert.equal(f.sent.length, 0);
});

test('schedule: not at 08:59, yes at 09:00, not again the same day, yes after a restart at 10:00', () => {
  assert.equal(inactivityDue('08:59', '2026-10-12', null), false);
  assert.equal(inactivityDue('09:00', '2026-10-12', null), true);
  assert.equal(inactivityDue('09:01', '2026-10-12', '2026-10-12'), false);
  assert.equal(inactivityDue('10:00', '2026-10-12', null), true);
  assert.equal(inactivityDue('09:00', '2026-10-13', '2026-10-12'), true);
});

test('settled texts name who decided', () => {
  const at = '2026-10-12T06:05:00Z';
  assert.match(settledText(review({ status: 'kick_queued', decided_by_name: 'Vlad', decided_at: at })), /Scoatere cerută de Vlad, 12 oct, 09:05 — se execută/);
  assert.match(settledText(review({ status: 'kept', decided_by_name: 'Roma', decided_at: at })), /Păstrat de Roma/);
  assert.match(settledText(review({ status: 'postponed', decided_by_name: 'Roma', snooze_until: '2026-10-19T06:05:00Z' })), /Amânat de Roma până pe 19 oct, 09:05/);
  assert.match(settledText(review({ status: 'refused', result: 'returned' })), /a confirmat un antrenament după alertă/);
  assert.match(settledText(review({ status: 'refused', result: 'left' })), /nu mai e în grup/);
  assert.match(settledText(review({ status: 'kick_failed', decided_by_name: 'Vlad', result: 'Organizatorii nu pot fi scoși.' })), /a eșuat: Organizatorii nu pot fi scoși\./);
});

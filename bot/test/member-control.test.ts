import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemberControl, matchMembers, type MemberChoice, type MemberControlDeps } from '../src/member-control.js';
import { executeKick, type KickPorts } from '../src/lib/kick-member.js';
import { membershipState } from '../src/lib/membership.js';
import type { InlineKeyboard, TelegramMember } from '../src/lib/telegram.js';

const ion: MemberChoice = { id: 'm1', full_name: 'Ion Ștefan', telegram_user_id: 200, telegram_username: 'ion_run', is_admin: false };
const text = { chatId: 100, fromId: 100, fromName: 'Vlad', chatType: 'private', text: '/scoate Ion' };
function fixture() {
  const messages: { text: string; kb?: InlineKeyboard }[] = [];
  const queued: unknown[] = [];
  let now = 1000;
  const deps: MemberControlDeps = {
    organizers: [100], group: '-123', now: () => now,
    members: async () => [ion, { ...ion, id: 'm2', telegram_user_id: 201, telegram_username: 'ion_other' }],
    queue: async (...args) => { queued.push(args); },
    send: async (_, message, kb) => { messages.push({ text: message, kb }); }, answer: async () => {},
  };
  const controller = new MemberControl();
  const callback = (data: string, over = {}) => controller.callback({ ...text, id: 'cb', data, messageId: 1, ...over }, deps);
  const button = (i = 0) => messages.at(-1)!.kb![0][i].callback_data;
  return { controller, deps, messages, queued, callback, button, expire: () => { now += 900001; } };
}

test('name folding, username and duplicate matches keep distinct identities', () => {
  assert.equal(matchMembers([ion], 'stefan')[0].id, 'm1');
  assert.equal(matchMembers([ion], '@ion_run')[0].id, 'm1');
});
test('selection + explicit confirmation queues once with numeric identity and actor', async () => {
  const f = fixture();
  await f.controller.text(text, f.deps);
  assert.equal(f.messages[0].kb?.length, 2);
  assert.equal(f.queued.length, 0);
  await f.callback(f.button());
  assert.match(f.messages.at(-1)!.text, /ID 200/);
  const confirm = f.button();
  await Promise.all([f.callback(confirm), f.callback(confirm)]);
  assert.equal(f.queued.length, 1);
  assert.deepEqual(f.queued[0], [ion, 100, 'Vlad', '-123']);
});
test('unauthorized callers, group chats, foreign callbacks, stale buttons cannot remove anyone', async () => {
  const f = fixture();
  await f.controller.text({ ...text, fromId: 999 }, f.deps);
  await f.controller.text({ ...text, chatType: 'group' }, f.deps);
  assert.equal(f.messages.length, 0);
  await f.controller.text(text, f.deps);
  await f.callback(f.button(), { fromId: 999 });
  await f.callback(f.button());
  const confirm = f.button();
  f.expire();
  await f.callback(confirm);
  assert.equal(f.queued.length, 0);
});
test('cancel and changed configured group invalidate the confirmation', async () => {
  const f = fixture();
  await f.controller.text(text, f.deps);
  await f.callback(f.button());
  const confirm = f.button();
  await f.callback(f.button(1));
  await f.callback(confirm);
  assert.equal(f.queued.length, 0);
  await f.controller.text(text, f.deps);
  await f.callback(f.button());
  const changed = f.button();
  f.deps.group = '-other';
  await f.callback(changed);
  assert.equal(f.queued.length, 0);
});
test('database failure gives no success and consumes the confirmation', async () => {
  const f = fixture();
  f.deps.queue = async () => { throw new Error('down'); };
  await f.controller.text(text, f.deps);
  await f.callback(f.button());
  await f.callback(f.button());
  assert.match(f.messages.at(-1)!.text, /Nu am putut/);
});

function kickFixture(status: TelegramMember['status'] = 'member') {
  const effects: string[] = [];
  const ports: KickPorts = {
    group: '-123', organizers: [100], member: async () => ion,
    inspect: async () => ({ status, user: { id: 200 } }),
    ban: async () => { effects.push('ban'); }, unban: async () => { effects.push('unban'); },
    record: async (_, m) => { effects.push(membershipState(m)); },
  };
  return { ports, effects, cmd: { member_id: 'm1', telegram_user_id: 200, payload: { chat_id: '-123' } } };
}
test('kick verifies live rights then records removal, allowing a future invitation', async () => {
  const f = kickFixture();
  await executeKick(f.cmd, f.ports);
  assert.deepEqual(f.effects, ['ban', 'unban', 'left']);
});
for (const status of ['administrator', 'creator'] as const) test(`live ${status} is protected`, async () => {
  const f = kickFixture(status);
  await assert.rejects(executeKick(f.cmd, f.ports), /Administratorii/);
  assert.deepEqual(f.effects, []);
});
test('relinked account and protected organizer are rejected before Telegram mutation', async () => {
  const f = kickFixture();
  f.ports.member = async () => ({ ...ion, telegram_user_id: 999 });
  await assert.rejects(executeKick(f.cmd, f.ports), /schimbat/);
  f.ports.member = async () => ion;
  f.ports.organizers.push(200);
  await assert.rejects(executeKick(f.cmd, f.ports), /Organizatorii/);
  assert.deepEqual(f.effects, []);
});
test('already banned member is not unbanned by a remove request', async () => {
  const f = kickFixture('kicked');
  await executeKick(f.cmd, f.ports);
  assert.deepEqual(f.effects, ['kicked']);
});
test('verification or ban failure never records a false departure', async () => {
  const f = kickFixture();
  f.ports.ban = async () => { throw new Error('rights'); };
  await assert.rejects(executeKick(f.cmd, f.ports));
  assert.deepEqual(f.effects, []);
});
test('restricted users remain members only when Telegram says is_member', () => {
  assert.equal(membershipState({ status: 'restricted', is_member: true, user: { id: 200 } }), 'in_group');
  assert.equal(membershipState({ status: 'restricted', is_member: false, user: { id: 200 } }), 'left');
});

test('database outage after removal cannot prevent unban', async () => {
  const f = kickFixture();
  f.ports.record = async () => { throw new Error('db down'); };
  await assert.rejects(executeKick(f.cmd, f.ports));
  assert.deepEqual(f.effects, ['ban', 'unban']);
});
test('unban failure is not reported as a successful reversible removal', async () => {
  const f = kickFixture();
  f.ports.unban = async () => { throw new Error('unban down'); };
  await assert.rejects(executeKick(f.cmd, f.ports), /unban down/);
  assert.deepEqual(f.effects, ['ban', 'kicked']);
});

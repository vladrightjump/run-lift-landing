import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { handleUpdate } from '../src/webhook.js';
import { syncMemberships } from '../src/lib/membership.js';

process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-no-key';
process.env.TELEGRAM_GROUP_CHAT_ID = '-100';
process.env.TELEGRAM_BOT_TOKEN = 'test-no-token';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

test('membership webhook writes the configured group only, with the event timestamp', async () => {
  const writes: Record<string, unknown>[] = [];
  globalThis.fetch = async (_, init) => {
    writes.push(JSON.parse(String(init?.body)));
    return new Response('null', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const member = { chat: { id: -100, type: 'supergroup' }, date: 1791446400,
    new_chat_member: { status: 'left' as const, user: { id: 1234 } } };
  assert.equal(await handleUpdate({ chat_member: { ...member, chat: { ...member.chat, id: -999 } } }), true);
  assert.equal(writes.length, 0);
  assert.equal(await handleUpdate({ chat_member: member }), true);
  assert.equal(writes[0].p_state, 'left');
  assert.equal(writes[0].p_observed_at, new Date(member.date * 1000).toISOString());
  assert.equal(writes[0].p_chat_id, '-100');
});
test('failed membership checks schedule retries without fabricating a departure', async () => {
  const calls: string[] = [];
  globalThis.fetch = async (url) => {
    const u = String(url); calls.push(u);
    const result = u.includes('telegram_membership_candidates') ? [{ telegram_user_id: 1234 }]
      : u.includes('getChatMember') ? { ok: false, error_code: 403, description: 'Forbidden' } : null;
    return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await syncMemberships();
  assert.ok(calls.some((url) => url.includes('telegram_membership_retry')));
  assert.ok(!calls.some((url) => url.includes('record_telegram_membership')));
});

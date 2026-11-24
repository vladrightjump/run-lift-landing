import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createBirthdayScheduler, runBirthdayGreetings } from '../src/jobs/birthday-greetings.js';

const DAY = '2026-11-27';
const NOW = new Date('2026-11-27T07:00:00Z');
const GROUP = '-100019781';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-role';
process.env.TELEGRAM_BOT_TOKEN = 'test-bot';

type Candidate = {
  telegram_user_id: number;
  source: 'telegram' | 'manual' | 'legacy';
  display_name: string | null;
  revision: number;
};
type Call = { operation: string; body: Record<string, unknown> };
function fixture(candidates: Candidate[], options: {
  member?: (id: number) => 'member' | 'left';
  lookup?: (id: number) => { day: number; month: number; year: number } | null;
  stale?: number;
  refuse?: boolean;
  timeout?: boolean;
  missingSchema?: boolean;
} = {}) {
  const calls: Call[] = [];
  const claimed = new Set<number>();
  const json = (value: unknown) => new Response(JSON.stringify(value), {
    headers: { 'Content-Type': 'application/json' },
  });
  globalThis.fetch = async (input, init) => {
    const operation = String(input).split('/').at(-1) ?? '';
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ operation, body });
    switch (operation) {
      case 'telegram_birthday_candidates':
        if (options.missingSchema) {
          return new Response(JSON.stringify({ code: 'PGRST202' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return json(candidates.filter(c => !claimed.has(c.telegram_user_id)));
      case 'getChatMember': {
        const id = Number(body.user_id);
        return json({ ok: true, result: { status: options.member?.(id) ?? 'member', user: { id, first_name: 'Ana' } } });
      }
      case 'getChat': {
        const id = Number(body.chat_id);
        const birthdate = options.lookup?.(id);
        return json({ ok: true, result: { id, type: 'private', ...(birthdate && { birthdate }) } });
      }
      case 'telegram_claim_birthday': {
        const id = Number(body.p_user_id);
        const won = id !== options.stale && !claimed.has(id);
        if (won) claimed.add(id);
        return json(won);
      }
      case 'sendMessage':
        if (options.timeout) throw new DOMException('Contains no production data', 'TimeoutError');
        if (options.refuse) return json({ ok: false, error_code: 403 });
        return json({ ok: true, result: { message_id: 123 } });
      case 'telegram_change_birthday':
        return json({ enabled: true, revision: 3 });
      case 'telegram_finish_birthday':
        return json(null);
      default:
        throw new Error('Unexpected test operation ' + operation);
    }
  };
  return calls;
}

const candidate = (id: number, source: Candidate['source'] = 'manual'): Candidate => ({
  telegram_user_id: id, source, display_name: 'Ana', revision: 2,
});

test('scheduler waits for 09:00 local, catches up today and retries only an unfinished day', async () => {
  let now = NOW.getTime();
  const calls: string[] = [];
  const tick = createBirthdayScheduler({
    now: () => new Date(now),
    async run(group, day) {
      assert.equal(group, GROUP);
      calls.push(day);
      return calls.length !== 1;
    },
  });

  await tick(GROUP, DAY, '08:59');
  await tick(undefined, DAY, '09:00');
  assert.deepEqual(calls, []);
  await tick(GROUP, DAY, '09:20');
  await tick(GROUP, DAY, '09:21');
  assert.deepEqual(calls, [DAY]);
  now += 15 * 60_000;
  await tick(GROUP, DAY, '09:35');
  await tick(GROUP, DAY, '09:36');
  await tick(GROUP, '2026-11-28', '09:00');
  assert.deepEqual(calls, [DAY, DAY, '2026-11-28']);
});

test('greetings require current group membership, fresh date and the current preference revision', async () => {
  const calls = fixture([
    candidate(11),
    candidate(12, 'telegram'),
    candidate(13, 'telegram'),
    candidate(14, 'telegram'),
    candidate(15, 'legacy'),
    candidate(16),
  ], {
    member: id => id === 15 ? 'left' : 'member',
    lookup: id => id === 12 ? { day: 27, month: 11, year: 1990 }
      : id === 13 ? { day: 28, month: 11, year: 1990 }
      : null,
    stale: 16,
  });
  assert.equal(await runBirthdayGreetings(GROUP, DAY, () => NOW), false);
  assert.deepEqual(calls.filter(c => c.operation === 'getChat').map(c => c.body.chat_id), [12, 13, 14]);
  assert.deepEqual(calls.filter(c => c.operation === 'telegram_claim_birthday').map(c => c.body), [
    { p_user_id: 11, p_date: DAY, p_revision: 2 },
    { p_user_id: 12, p_date: DAY, p_revision: 2 },
    { p_user_id: 16, p_date: DAY, p_revision: 2 },
  ]);
  assert.deepEqual(calls.filter(c => c.operation === 'telegram_change_birthday').map(c => c.body), [
    { p_user_id: 13, p_action: 'refresh', p_day: 28, p_month: 11, p_lookup_ok: true, p_expected_revision: 2 },
    { p_user_id: 14, p_action: 'refresh', p_day: null, p_month: null, p_lookup_ok: true, p_expected_revision: 2 },
  ]);
  assert.deepEqual(calls.filter(c => c.operation === 'sendMessage').map(c => c.body), Array(2).fill({
    chat_id: GROUP,
    text: 'La mulți ani, Ana! 🎉 Ne bucurăm că faci parte din Run + Lift!',
    link_preview_options: { is_disabled: true },
  }));
});

test('an ambiguous send is recorded and never repeated on another run', async () => {
  const calls = fixture([candidate(11)], { timeout: true });
  assert.equal(await runBirthdayGreetings(GROUP, DAY, () => NOW), true);
  assert.equal(await runBirthdayGreetings(GROUP, DAY, () => NOW), true);
  assert.equal(calls.filter(c => c.operation === 'sendMessage').length, 1);
  assert.equal(calls.find(c => c.operation === 'telegram_finish_birthday')?.body.p_outcome, 'uncertain');
});

test('a definitive refusal stays rejected, and an expired day never starts a new send', async () => {
  const calls = fixture([candidate(11)], { refuse: true });
  assert.equal(await runBirthdayGreetings(GROUP, DAY, () => new Date('2026-11-27T22:01:00Z')), true);
  assert.deepEqual(calls, []);
  assert.equal(await runBirthdayGreetings(GROUP, DAY, () => NOW), true);
  assert.equal(calls.find(c => c.operation === 'telegram_finish_birthday')?.body.p_outcome, 'rejected');
});

test('the worker stays available before the optional migration and retries later that day', async () => {
  const calls = fixture([candidate(11)], { missingSchema: true });
  assert.equal(await runBirthdayGreetings(GROUP, DAY, () => NOW), false);
  assert.deepEqual(calls.map(call => call.operation), ['telegram_birthday_candidates']);
});

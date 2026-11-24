import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { handleUpdate } from '../src/webhook.js';
import type { BirthdayPreference } from '../src/lib/birthdays.js';

process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-no-key';
process.env.TELEGRAM_GROUP_CHAT_ID = '-100';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_ADMIN_CHAT_IDS = '42';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

type Body = { text?: string; reply_markup?: { inline_keyboard: { text: string; callback_data: string }[][] } }
  & Record<string, unknown>;

function fixture(user: number) {
  let messageId = 0;
  let membership = 'member';
  let schema = true;
  let lookupAvailable = true;
  let birthdate: { day: number; month: number; year?: number } | undefined;
  let preference: BirthdayPreference = {
    day: null, month: null, source: null, enabled: false, import_blocked: false, revision: 0,
  };
  const calls: { name: string; body: Body }[] = [];
  const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    const name = parsed.pathname.split('/').at(-1)!;
    const body = JSON.parse(String(init?.body ?? '{}')) as Body;
    calls.push({ name, body });
    if (parsed.hostname === 'api.telegram.org') {
      if (name === 'getChat' && !lookupAvailable) return response({ ok: false });
      const result = name === 'getChatMember' ? { status: membership, user: { id: body.user_id } }
        : name === 'getChat' ? { id: body.chat_id, type: 'private', birthdate } : { message_id: 200 + calls.length };
      return response({ ok: true, result });
    }
    if (name === 'telegram_birthday_preference') {
      return schema ? response(preference) : response({ code: 'PGRST202', message: 'missing function' }, 404);
    }
    if (name === 'telegram_change_birthday') {
      const enabled = body.p_action === 'enable' || (body.p_action === 'refresh' && preference.enabled);
      const clear = body.p_action === 'clear';
      const useLookup = enabled && body.p_lookup_ok && (!preference.source || preference.source === 'telegram');
      const day = clear ? null : useLookup ? Number(body.p_day) || null : preference.day;
      const month = clear ? null : useLookup ? Number(body.p_month) || null : preference.month;
      preference = {
        day, month, enabled, revision: preference.revision + 1, import_blocked: clear,
        source: clear ? null : useLookup ? day === null ? null : 'telegram' : preference.source,
      };
      return response(preference);
    }
    return response([]);
  };
  const message = (text: string, fromId = user, type = 'private') => handleUpdate({
    message: { text, message_id: ++messageId, chat: { type, id: type === 'private' ? fromId : -100 },
      from: { id: fromId, first_name: 'Ana' } },
  });
  const latest = () => calls.findLast(call => call.name === 'sendMessage')!;
  const pick = (label: string) => {
    const button = latest().body.reply_markup?.inline_keyboard.flat().find(entry => entry.text === label);
    assert.ok(button?.callback_data, label + ' in ' + JSON.stringify(latest()));
    return button.callback_data;
  };
  const tap = (data: string, fromId = user, type = 'private') => handleUpdate({
    callback_query: { id: 'callback-' + ++messageId, from: { id: fromId }, data,
      message: { message_id: 300, chat: { type, id: type === 'private' ? fromId : -100 } } },
  });
  return {
    calls, message, latest, pick, tap,
    writes: () => calls.filter(call => call.name === 'telegram_change_birthday').map(call => call.body),
    depart: () => { membership = 'left'; },
    disableBirthdaySchema: () => { schema = false; },
    setBirthdate: (value?: typeof birthdate) => { birthdate = value; },
    setLookupAvailable: (value: boolean) => { lookupAvailable = value; },
    setPreference: (value: BirthdayPreference) => { preference = value; },
  };
}

test('birthday settings stay private, import only on opt-in, and discard the birth year', async () => {
  const f = fixture(48);
  f.setBirthdate({ day: 29, month: 2, year: 2000 });
  await f.message('/aniversare', 48, 'supergroup');
  assert.ok(!f.calls.some(call => call.name === 'telegram_birthday_preference'));
  await f.message('/aniversare');
  const enable = f.pick('Activează urările');
  assert.ok(!f.calls.some(call => call.name === 'getChat'));
  await f.tap(enable, 49);
  await f.tap(enable, 48, 'supergroup');
  assert.deepEqual(f.writes(), []);
  await f.tap(enable);
  await f.tap(enable);
  assert.deepEqual(f.writes(), [{
    p_user_id: 48, p_action: 'enable', p_day: 29, p_month: 2, p_lookup_ok: true, p_expected_revision: 0,
  }]);
  assert.match(f.latest().body.text!, /29\.02/);
  assert.doesNotMatch(f.latest().body.text!, /2000/);
  await f.tap(f.pick('Șterge data'));
  assert.match(f.latest().body.text!, /oprite/);
  await f.message('/aniversare');
  assert.equal(f.calls.filter(call => call.name === 'getChat').length, 1);
});

test('birthday settings refresh changed and hidden dates while preserving them when lookup fails', async () => {
  const f = fixture(50);
  f.setPreference({ enabled: true, day: 27, month: 11, source: 'telegram', import_blocked: false, revision: 5 });
  f.setBirthdate({ day: 26, month: 11 });
  await f.message('/aniversare');
  assert.match(f.latest().body.text!, /26\.11/);
  f.setLookupAvailable(false);
  await f.message('/aniversare');
  assert.equal(f.writes().length, 1);
  assert.match(f.latest().body.text!, /26\.11/);
  f.setBirthdate();
  f.setLookupAvailable(true);
  await f.message('/aniversare');
  assert.match(f.latest().body.text!, /nu este disponibilă/);
  assert.deepEqual(f.writes(), [{
    p_user_id: 50, p_action: 'refresh', p_day: 26, p_month: 11, p_lookup_ok: true, p_expected_revision: 5,
  }, {
    p_user_id: 50, p_action: 'refresh', p_day: null, p_month: null, p_lookup_ok: true, p_expected_revision: 6,
  }]);
});

test('manual and legacy dates bypass lookup and former members can revoke or remove them', async () => {
  for (const [id, source] of [[51, 'manual'], [52, 'legacy']] as const) {
    const f = fixture(id);
    f.setPreference({ enabled: false, day: 27, month: 11, source, import_blocked: false, revision: 1 });
    await f.message('/aniversare');
    await f.tap(f.pick('Activează urările'));
    assert.ok(!f.calls.some(call => call.name === 'getChat'));
    assert.match(f.latest().body.text!, /27\.11/);
    const disable = f.pick('Oprește urările');
    f.depart();
    await f.tap(disable);
    assert.equal(f.writes().at(-1)?.p_action, 'disable');
    assert.match(f.latest().body.text!, /oprite/);
    await f.message('/aniversare');
    await f.tap(f.pick('Activează urările'));
    assert.equal(f.writes().length, 2);
    assert.match(f.latest().body.text!, /membrilor grupului/);
    await f.message('/aniversare');
    await f.tap(f.pick('Șterge data'));
    assert.equal(f.writes().at(-1)?.p_action, 'clear');
    assert.doesNotMatch(f.latest().body.text!, /27\.11/);
  }
});

test('the birthday settings command explains pre-migration unavailability', async () => {
  const f = fixture(53);
  f.disableBirthdaySchema();
  assert.equal(await f.message('/aniversare'), true);
  assert.match(f.latest().body.text!, /indisponibile/);
  assert.ok(!f.calls.some(call => call.name === 'getChat'));
});

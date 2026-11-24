import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { handleUpdate, registerMemberMenu, registerOrganizerMenu } from '../src/webhook.js';

process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-no-key';
process.env.TELEGRAM_GROUP_CHAT_ID = '-100';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_ADMIN_CHAT_IDS = '42';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

type Button = {text: string; callback_data?: string; url?: string};
type Call = {
  name: string;
  body: { text?: string; chat_id?: number | string; reply_markup?: { inline_keyboard: Button[][] } } & Record<string, unknown>;
};

function fixture(user: number) {
  let messageId = 0;
  let membership = 'member';
  let storage = true;
  let failSave = false;
  let birthdaySchema = true;
  let priorProfile: Record<string, unknown> | undefined;
  const calls: Call[] = [];
  const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json' },
  });
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(String(url));
    const name = parsed.pathname.split('/').at(-1)!;
    const body = JSON.parse(String(init?.body ?? '{}')) as Call['body'];
    calls.push({ name, body });
    if (parsed.hostname === 'api.telegram.org') {
      const result = name === 'getChatMember' ? { status: membership, user: { id: body.user_id } }
        : name === 'getMe' ? { id: 10, username: 'RunLiftBot' }
        : name === 'getChat' ? { id: -100, type: 'supergroup', title: 'Parc' }
        : { message_id: 200 + calls.length };
      return response({ ok: true, result });
    }
    if (!storage) return response({ code: '42P01', message: 'missing relation' }, 404);
    if (!birthdaySchema && name === 'telegram_save_training_profile') {
      return response({ code: 'PGRST202', message: 'missing function' }, 404);
    }
    if (name === 'telegram_member_profiles' && priorProfile) return response([priorProfile]);
    if (failSave && name === 'telegram_feedback' && init?.method === 'POST') {
      failSave = false;
      return response({ code: 'XX001', message: 'write interrupted' }, 500);
    }
    if (name === 'telegram_feedback_report') {
      return response({ total: 17, feelings: [3, 4, 5, 5], topics: [8, 2, 3, 7, 0, 1],
        comment_count: 6, comments: ['Program mai devreme'] });
    }
    if (name === 'telegram_profiles_report') {
      return response({ total: 1, profiles: [{ telegram_user_id: 43, display_name: 'Ana',
        birth_day: 29, birth_month: 2, birthday_greeting: false, training_goal: '5 km', matched: false }] });
    }
    if (name === 'members' && init?.method === 'GET') return response([{ full_name: 'Ana Popescu' }]);
    return response([]);
  };
  const message = (text: string, fromId = user, type = 'private') => handleUpdate({
    message: { text, message_id: ++messageId, chat: { type, id: type === 'private' ? fromId : -100 },
      from: { id: fromId, first_name: 'Ana' } },
  });
  const latest = () => calls.findLast(call => ['sendMessage', 'editMessageText'].includes(call.name))!;
  const pick = (label: string) => {
    const button = latest().body.reply_markup?.inline_keyboard.flat().find(entry => entry.text === label);
    assert.ok(button?.callback_data, label + ' in ' + JSON.stringify(latest()));
    return button.callback_data;
  };
  const tap = (data: string, fromId = user, type = 'private') => handleUpdate({
    callback_query: { id: 'callback-' + ++messageId, from: { id: fromId }, data,
      message: { message_id: 300, chat: { type, id: type === 'private' ? fromId : -100 } } },
  });
  return { calls, message, latest, pick, tap, depart: () => { membership = 'left'; },
    disableStorage: () => { storage = false; }, failNextFeedbackSave: () => { failSave = true; },
    disableBirthdaySchema: () => { birthdaySchema = false; },
    setPriorProfile: (value: Record<string, unknown>) => { priorProfile = value; },
  };
}

test('submits feedback without identity and ignores stale or repeated save taps', async () => {
  const f = fixture(43);
  assert.equal(await f.message('/feedback'), true);
  assert.match(f.latest().body.text!, /fără nume/);
  const oldChoice = f.pick('Bine');
  await f.tap(oldChoice);
  await f.tap(oldChoice);
  await f.tap(f.pick('Alergare'));
  await f.tap(f.pick('Tehnică'));
  await f.tap(f.pick('Continuă'));
  await f.message('Mai devreme, vă rog.');
  const submit = f.pick('Trimite feedbackul');
  await f.tap(submit, 44);
  await f.tap(submit, 43, 'supergroup');
  f.failNextFeedbackSave();
  await f.tap(submit);
  await f.tap(f.pick('Trimite feedbackul'));
  await f.tap(submit);
  const writes = f.calls.filter(call => call.name === 'telegram_feedback' && 'feeling' in call.body);
  assert.equal(writes.length, 2);
  const id = writes[0].body.id;
  assert.equal(typeof id, 'string');
  assert.deepEqual(writes.map(call => call.body), [
    { id, feeling: 2, topics: ['run', 'technique'], comment: 'Mai devreme, vă rog.' },
    { id, feeling: 2, topics: ['run', 'technique'], comment: 'Mai devreme, vă rog.' },
  ]);
  assert.match(f.latest().body.text!, /Mulțumim/);
});

test('prefills the name and asks only for the training goal before saving', async () => {
  const f = fixture(44);
  await f.message('/start profil');
  await f.tap(f.pick('Păstrează numele'));
  assert.match(f.latest().body.text!, /Ce vrei să obții/);
  await f.message('5 km fără oprire');
  assert.match(f.latest().body.text!, /Ana Popescu/);
  assert.ok(!f.calls.some(call => call.name === 'telegram_save_training_profile'));
  await f.tap(f.pick('Salvează profilul'));
  assert.deepEqual(f.calls.find(call => call.name === 'telegram_save_training_profile')?.body, {
    p_user_id: 44, p_name: 'Ana Popescu', p_goal: '5 km fără oprire',
  });
  assert.ok(!f.calls.some(call => ['telegram_save_member_profile', 'getChat'].includes(call.name)));
});

test('pre-migration profile saves preserve a previously entered birthday and consent', async () => {
  const f = fixture(47);
  f.disableBirthdaySchema();
  f.setPriorProfile({
    display_name: 'Ana Popescu', training_goal: null, birth_day: 29, birth_month: 2, birthday_greeting: true,
  });
  await f.message('/profil');
  await f.tap(f.pick('Păstrează numele'));
  await f.message('5 km fără oprire');
  await f.tap(f.pick('Salvează profilul'));
  assert.deepEqual(f.calls.find(call => call.name === 'telegram_save_member_profile')?.body, {
    p_user_id: 47, p_name: 'Ana Popescu', p_day: 29, p_month: 2, p_greeting: true, p_goal: '5 km fără oprire',
  });
  assert.match(f.latest().body.text!, /a fost salvat/);
});

test('members who leave cannot submit and the schema can be absent before rollout', async () => {
  const f = fixture(45);
  await f.message('/start feedback');
  await f.tap(f.pick('Foarte bine'));
  await f.tap(f.pick('Forță'));
  await f.tap(f.pick('Continuă'));
  await f.tap(f.pick('Sari peste'));
  f.depart();
  await f.tap(f.pick('Trimite feedbackul'));
  assert.match(f.latest().body.text!, /membrilor grupului/);
  assert.ok(!f.calls.some(call => 'feeling' in call.body));
  const missing = fixture(46);
  missing.disableStorage();
  assert.equal(await missing.message('/profil'), true);
  assert.match(missing.latest().body.text!, /indisponibil/);
});

test('an organizer can leave a form using an existing private action', async () => {
  const f = fixture(42);
  await f.message('/feedback_grup');
  const cancel = f.pick('Renunță');
  await f.message('/profil');
  const profileButton = f.pick('Păstrează numele');
  await f.tap(cancel);
  assert.equal(f.latest().body.text, 'Publicarea a fost anulată.');
  await f.tap(profileButton);
  assert.match(f.calls.findLast(call => call.name === 'answerCallbackQuery')?.body.text ?? '', /expirat/);
});

test('publishes an invitation only after organizer confirmation and keeps reports private', async () => {
  const f = fixture(42);
  await f.message('/feedback_rezultate', 43);
  assert.ok(!f.calls.some(call => call.name === 'telegram_feedback_report'));
  await f.message('/feedback_grup');
  assert.ok(!f.calls.some(call => call.name === 'sendMessage' && call.body.chat_id === '-100'));
  const confirm = f.pick('Trimite în grup');
  await f.tap(confirm, 43);
  await f.tap(confirm);
  await f.tap(confirm);
  const sent = f.calls.filter(call => call.name === 'sendMessage' && call.body.chat_id === '-100');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.reply_markup?.inline_keyboard.flat().map(button => button.url), [
    'https://t.me/RunLiftBot?start=feedback', 'https://t.me/RunLiftBot?start=profil',
  ]);
  await f.message('/feedback_rezultate 2');
  assert.match(f.latest().body.text!, /17 răspunsuri/);
  assert.match(f.latest().body.text!, /Program mai devreme/);
  await f.message('/profiluri');
  assert.match(f.latest().body.text!, /5 km/);
  assert.match(f.latest().body.text!, /De legat/i);
  await registerMemberMenu();
  assert.deepEqual(f.calls.findLast(call => call.name === 'setMyCommands')?.body.scope, { type: 'all_private_chats' });
  assert.deepEqual(
    (f.calls.findLast(call => call.name === 'setMyCommands')?.body.commands as { command: string }[]).map(item => item.command),
    ['feedback', 'profil', 'aniversare'],
  );
  await registerOrganizerMenu(42);
  const commands = f.calls.findLast(call => call.name === 'setMyCommands')!.body.commands as {command:string}[];
  for (const command of ['antrenament', 'feedback', 'profil', 'aniversare', 'feedback_grup']) {
    assert.ok(commands.some(item => item.command === command), command);
  }
});

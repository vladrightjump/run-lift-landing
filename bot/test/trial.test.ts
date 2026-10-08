import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { trialSessions, type Snapshot } from '../src/lib/sessions.js';
import { eligibleForInvite, trialPrivateMessage, trialCallback, trialJoinRequest, type Booking, type TrialConfig, type Prospect } from '../src/lib/trial.js';
import { messageStillRelevant, renderTrialMessage } from '../src/jobs/trial-messages.js';
import { handleUpdate } from '../src/webhook.js';

process.env.SUPABASE_URL = 'http://127.0.0.1:9';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-key';
process.env.TELEGRAM_BOT_TOKEN = 'fake-token';
process.env.TELEGRAM_GROUP_CHAT_ID = '-100';
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const config: TrialConfig = { enabled:true, bot_username:'training_bot', welcome_text:'Bun venit', trial_price:'50 lei', trial_conditions:'Vino cu 10 minute înainte', bring_text:'Apă', continuation_conditions:'Condițiile continuării', duration_minutes:60, organizer_telegram_id:99, contact_text:'Contact organizator', permissions_verified_at:null };
const p: Prospect = { id:'p1', telegram_user_id:11, full_name:'Ana Maria', conversation_step:'choose_session', dm_enabled:true, stage:'scheduled' };
const b: Booking = { id:'00000000-0000-0000-0000-000000000001', prospect_id:'p1', version:2, status:'attended', attendance_at:'2026-10-08T08:00:00Z', continuation:'yes', session_start:'2026-10-08T06:00:00Z', session_location:'Parc', duration_minutes:60, conditions_snapshot:{trial_price:'50 lei',trial_conditions:'Condiții',bring_text:'Apă'}, session_id:'s1' };
function mock(handler: (url:URL, body:Record<string,unknown>, method:string) => unknown | Promise<unknown>) {
  const calls: { url:URL; body:Record<string,unknown>; method:string }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const method = init?.method ?? 'GET';
    calls.push({url,body,method});
    const data = await handler(url, body, method);
    return new Response(JSON.stringify(data), { status:200, headers:{'Content-Type':'application/json'} });
  };
  return calls;
}
const telegram = {ok:true,result:{message_id:1}};
const cb = (data:string, id=11) => ({id:'cb',from:{id},data,message:{chat:{id,type:'private'}}});

test('trial schedule uses concrete overrides, excludes started/cancelled/done, includes extra and DST-day choices', () => {
  const snapshot: Snapshot = {today:'2026-10-25',now:'06:30',pollDays:[6,1,3],trainingTime:'06:30',location:'Parc',sessions:[
    {id:'cancel',session_date:'2026-10-27',starts_at:'07:00',location:'Gym',status:'cancelled',poll_message_id:null,poll_wording:null},
    {id:'extra',session_date:'2026-10-28',starts_at:'08:00',location:'Extra',status:'scheduled',poll_message_id:null,poll_wording:null},
    {id:'done',session_date:'2026-10-29',starts_at:'07:00',location:'Gym',status:'done',poll_message_id:null,poll_wording:null},
  ]};
  const choices = trialSessions(snapshot);
  assert.ok(!choices.some(x => ['2026-10-25','2026-10-27','2026-10-29'].includes(x.date)));
  assert.equal(choices.find(x => x.date==='2026-10-28')?.location,'Extra');
  assert.ok(choices.every(x => x.date < '2026-11-08'));
});
test('only attendance plus explicit continuation permits invitation; initial booking never qualifies', () => {
  assert.equal(eligibleForInvite(b),true);
  for (const change of [{status:'scheduled'},{status:'absent'},{attendance_at:null},{continuation:null},{continuation:'no'}]) assert.equal(eligibleForInvite({...b,...change}),false);
});
test('stale jobs, cancellation, old reminders and already answered continuation are suppressed', () => {
  assert.equal(messageStillRelevant({kind:'invite',booking_version:1},b),false);
  assert.equal(messageStillRelevant({kind:'continuation',booking_version:2},b),false);
  assert.equal(messageStillRelevant({kind:'reminder',booking_version:2},{...b,status:'scheduled'},Date.parse('2026-10-09')),false);
  assert.equal(messageStillRelevant({kind:'attendance_request',booking_version:2},{...b,status:'awaiting_attendance'},Date.parse('2026-10-08T07:01Z')),true);
  assert.equal(messageStillRelevant({kind:'attendance_request',booking_version:2},{...b,status:'awaiting_attendance'},Date.parse('2026-10-08T06:30Z')),false);
});
test('attendance and continuation keyboards are distinct; every Telegram callback fits 64 bytes', () => {
  for (const kind of ['attendance_request','continuation','booking_confirmed','cancelled','rebook']) {
    const rendered = renderTrialMessage({kind,payload:{}},p,b,config);
    for (const button of rendered.keyboard?.flat() ?? []) assert.ok(Buffer.byteLength(button.callback_data) <= 64);
  }
  assert.match(renderTrialMessage({kind:'continuation',payload:{}},p,b,config).text,/Condițiile continuării/);
  assert.match(renderTrialMessage({kind:'booking_confirmed',payload:{}},p,b,config).text,/50 lei/);
});
test('unknown Start creates only a prospect; repeated Start preserves name and journey', async () => {
  let person: Prospect | null = null;
  const calls = mock((url,body,method) => {
    if(url.hostname==='api.telegram.org') return telegram;
    if(url.pathname.endsWith('/trial_config')) return config;
    if(url.pathname.endsWith('/trial_prospects')) {
      if(method==='POST') {person={...p,full_name:null,conversation_step:'name'};return null;}
      if(method==='PATCH') return null;
      return person;
    }
    if(url.pathname.endsWith('/trial_bookings')) return null;
    return null;
  });
  await trialPrivateMessage({id:11},'/start trial_home');
  await trialPrivateMessage({id:11},'/start trial_home');
  assert.equal(calls.filter(x=>x.url.pathname.endsWith('/trial_prospects')&&x.method==='POST').length,1);
  assert.ok(!calls.some(x=>x.url.pathname.endsWith('/members')));
  assert.ok(calls.some(x=>String(x.body.text).includes('50 lei')));
});
test('disabled direct link explains availability without creating a person', async () => {
  const calls=mock(url=>url.pathname.endsWith('/trial_config')?{...config,enabled:false}:telegram);
  await trialPrivateMessage({id:11},'/start trial_home');
  assert.ok(!calls.some(x=>x.url.pathname.endsWith('/trial_prospects')));
  assert.ok(calls.some(x=>String(x.body.text).includes('Contact organizator')));
});
test('stop suppresses automation through persisted preference and start resumes it', async () => {
  const calls=mock(url=>url.pathname.endsWith('/trial_config')?config:url.pathname.endsWith('/trial_prospects')?p:url.pathname.endsWith('/trial_bookings')?null:telegram);
  await trialPrivateMessage({id:11},'/stop');
  await trialPrivateMessage({id:11},'/start');
  assert.deepEqual(calls.filter(x=>x.method==='PATCH').map(x=>x.body.dm_enabled),[false,true]);
});
test('stale accept cannot book an unreviewed date, and duplicate book shows existing reservation', async () => {
  let booking: Booking | null = null;
  const calls=mock(url=>url.pathname.endsWith('/trial_config')?config:url.pathname.endsWith('/trial_prospects')?p:url.pathname.endsWith('/trial_bookings')?booking:telegram);
  await trialCallback(cb('t:book:2026-10-10'));
  booking={...b,status:'scheduled',session_start:'2099-10-08T06:00Z'};
  await trialCallback(cb('t:book:2026-10-10'));
  assert.ok(!calls.some(x=>x.url.pathname.includes('/rpc/trial_book')));
  assert.ok(calls.some(x=>String(x.body.text).includes('Alege din nou ziua')));
  assert.ok(calls.some(x=>String(x.body.text).includes('Proba ta este programată')));
});
test('attendance callbacks require private identity and organizer authorization', async () => {
  const calls=mock(url=>url.pathname.endsWith('/trial_config')?config:url.pathname.endsWith('/members')?null:telegram);
  await trialCallback(cb(`t:present:${b.id}:2`));
  await trialCallback({...cb(`t:present:${b.id}:2`),message:{chat:{id:-100,type:'supergroup'}}});
  assert.ok(!calls.some(x=>x.url.pathname.includes('/rpc/trial_attendance')));
});
test('forwarded trial invitation declines the wrong identity; unrelated links/groups stay untouched', async () => {
  const calls=mock(url=>url.pathname.endsWith('/trial_config')?config:url.pathname.endsWith('/trial_invitations')?{booking_id:b.id,booking_version:2,telegram_user_id:11,expires_at:'2099-01-01',revoked_at:null}:url.pathname.endsWith('/trial_bookings')?b:telegram);
  await trialJoinRequest({chat:{id:-999},from:{id:12},invite_link:{invite_link:'link'}});
  assert.equal(calls.length,0);
  await trialJoinRequest({chat:{id:-100},from:{id:12},invite_link:{invite_link:'link'}});
  assert.ok(calls.some(x=>x.url.pathname.endsWith('/declineChatJoinRequest')));
  assert.ok(!calls.some(x=>x.url.pathname.endsWith('/approveChatJoinRequest')));
});
test('excluded or version-invalidated invitation never approves or unbans', async () => {
  const calls=mock(url=>url.pathname.endsWith('/trial_config')?config:url.pathname.endsWith('/trial_invitations')?{booking_id:b.id,booking_version:2,telegram_user_id:11,expires_at:'2099-01-01',revoked_at:null}:url.pathname.endsWith('/trial_bookings')?b:url.pathname.endsWith('/getChatMember')?{ok:true,result:{status:'kicked',user:{id:11}}}:url.pathname.endsWith('/telegram_group_memberships')?{state:'kicked'}:telegram);
  await trialJoinRequest({chat:{id:-100},from:{id:11},invite_link:{invite_link:'link'}});
  assert.ok(calls.some(x=>x.url.pathname.endsWith('/declineChatJoinRequest')));
  assert.ok(!calls.some(x=>/approveChatJoinRequest|unbanChatMember/.test(x.url.pathname)));
});
test('eligible join is approved but not converted before Telegram confirms actual membership', async () => {
  const calls=mock(url=>url.pathname.endsWith('/trial_config')?config:url.pathname.endsWith('/trial_invitations')?{booking_id:b.id,booking_version:2,telegram_user_id:11,expires_at:'2099-01-01',revoked_at:null}:url.pathname.endsWith('/trial_bookings')?b:url.pathname.endsWith('/getChatMember')?{ok:true,result:{status:'left',user:{id:11}}}:url.pathname.endsWith('/telegram_group_memberships')?{state:'left'}:telegram);
  await trialJoinRequest({chat:{id:-100},from:{id:11},invite_link:{invite_link:'link'}});
  assert.ok(calls.some(x=>x.url.pathname.endsWith('/approveChatJoinRequest')));
  assert.ok(!calls.some(x=>x.url.pathname.includes('trial_convert')));
});
test('verified membership event invokes transactional conversion, never from invitation delivery', async () => {
  const calls=mock(()=>null);
  assert.equal(await handleUpdate({chat_member:{chat:{id:-100,type:'supergroup'},date:1791446400,new_chat_member:{status:'member',user:{id:11}}}}),true);
  assert.equal(calls[0].url.pathname.split('/').pop(),'record_telegram_membership');
  assert.equal(calls[1].url.pathname.split('/').pop(),'trial_convert');
});

test('handleUpdate onboarding books a prospect through conditions without creating an active member', async () => {
  let person: Prospect | null = null;
  let booking: Booking | null = null;
  const date = new Date(Date.now() + 86400_000).toISOString().slice(0,10);
  const calls=mock((url,body,method)=> {
    if(url.hostname==='api.telegram.org') return telegram;
    if(url.pathname.endsWith('/trial_config')) return config;
    if(url.pathname.endsWith('/members') || url.pathname.endsWith('/telegram_group_memberships') || url.pathname.endsWith('/trial_reply_drafts')) return null;
    if(url.pathname.endsWith('/trial_prospects')) {
      if(method==='POST') person={...p,full_name:null,conversation_step:'name'};
      if(method==='PATCH'&&person) person={...person,...body};
      return person;
    }
    if(url.pathname.endsWith('/trial_bookings')) return booking;
    if(url.pathname.endsWith('/bot_config')) return {poll_days:[],training_time:'09:00',location:'Parc'};
    if(url.pathname.endsWith('/training_sessions')) return [{id:'extra',session_date:date,starts_at:'09:00',location:'Parc',status:'scheduled'}];
    if(url.pathname.endsWith('/rpc/trial_book')) {booking={...b,status:'scheduled',session_start:`${date}T06:00Z`,continuation:null,attendance_at:null};return booking;}
    return null;
  });
  for (const text of ['/start trial_home','Ana Maria']) assert.equal(await handleUpdate({message:{message_id:1,chat:{id:11,type:'private'},from:{id:11},text}}),true);
  assert.equal(await handleUpdate({callback_query:cb(`t:date:${date}`)}),true);
  assert.equal(await handleUpdate({callback_query:cb(`t:book:${date}`)}),true);
  assert.equal(calls.filter(x=>x.url.pathname.endsWith('/rpc/trial_book')).length,1);
  assert.ok(!calls.some(x=>x.url.pathname.endsWith('/members')&&x.method==='POST'));
  const booked=calls.find(x=>x.url.pathname.endsWith('/rpc/trial_book'))!;
  assert.equal((booked.body.p_conditions as Record<string,string>).trial_price,'50 lei');
  assert.ok(!calls.some(x=>/createChatInviteLink|approveChatJoinRequest/.test(x.url.pathname)));
});
test('plain configurable messages preserve markup literally and split long text with keyboard only on final chunk', async () => {
  const {sendTrialText,splitTelegramText}=await import('../src/lib/telegram.js');
  const text='<a href="evil">Ana</a> '+ '🙂'.repeat(5000);
  const calls=mock(()=>telegram);
  await sendTrialText(11,text,[[{text:'Continuă',callback_data:'t:dates'}]]);
  assert.equal(calls.map(x=>x.body.text).join(''),text);
  assert.ok(calls.every(x=>String(x.body.text).length <= 3600 && !x.body.parse_mode));
  assert.ok(!calls[0].body.reply_markup);
  assert.ok(calls.at(-1)!.body.reply_markup);
  assert.equal(splitTelegramText(text).join(''),text);
});
test('outbox reports successful, blocked and ambiguous deliveries distinctly and cancels stale versions', async () => {
  const {processTrialMessages}=await import('../src/jobs/trial-messages.js');
  let scenario='success';
  let claimed=false;
  const booked={...b,status:'scheduled',session_start:'2099-10-08T06:00Z',attendance_at:null,continuation:null};
  const calls=mock((url,body,method)=> {
    if(url.pathname.endsWith('/trial_config')) return method==='PATCH'?null:config;
    if(url.pathname.endsWith('/members')) return {id:'organizer'};
    if(url.pathname.endsWith('/getMe')) return {ok:true,result:{id:7,username:'training_bot'}};
    if(url.pathname.endsWith('/getChatMember')) return {ok:true,result:{status:'administrator',can_invite_users:true,user:{id:7}}};
    if(url.pathname.endsWith('/rpc/trial_claim_messages')) {
      if(claimed) return [];
      claimed=true;
      return [{id:scenario,prospect_id:p.id,booking_id:b.id,booking_version:scenario==='stale'?1:2,kind:'booking_confirmed',recipient_telegram_id:11,status:'processing',attempts:1,payload:{}}];
    }
    if(url.pathname.endsWith('/trial_prospects')) return p;
    if(url.pathname.endsWith('/trial_bookings')) return booked;
    if(url.pathname.endsWith('/trial_messages')) return {status:'processing'};
    if(url.pathname.endsWith('/sendMessage')) {
      if(scenario==='timeout') throw new Error('Simulated network timeout after send');
      if(scenario==='blocked') return {ok:false,error_code:403,description:'bot blocked'};
      return telegram;
    }
    return null;
  });
  for (const value of ['success','blocked','timeout','stale']) {scenario=value;claimed=false;await processTrialMessages();}
  assert.deepEqual(calls.filter(x=>x.url.pathname.endsWith('/rpc/trial_complete_message')).map(x=>[x.body.p_message,x.body.p_status]),[['success','sent'],['blocked','failed'],['timeout','ambiguous'],['stale','cancelled']]);
  assert.ok(calls.some(x=>x.url.pathname.endsWith('/trial_prospects')&&x.method==='PATCH'&&x.body.dm_enabled===false));
  assert.equal(calls.filter(x=>x.url.pathname.endsWith('/sendMessage')).length,3);
});

test('handleUpdate attendance and explicit continuation use separate authorized RPC transitions', async () => {
  const calls=mock(url=>url.pathname.endsWith('/trial_config')?config:url.pathname.endsWith('/members')?{id:'organizer'}:url.pathname.endsWith('/trial_prospects')?p:url.pathname.startsWith('/rest/v1/rpc/')?b:telegram);
  assert.equal(await handleUpdate({callback_query:cb(`t:present:${b.id}:1`,99)}),true);
  assert.equal(await handleUpdate({callback_query:cb(`t:yes:${b.id}:2`,11)}),true);
  const attendance=calls.find(x=>x.url.pathname.endsWith('/rpc/trial_attendance'))!;
  const continuation=calls.find(x=>x.url.pathname.endsWith('/rpc/trial_continue'))!;
  assert.deepEqual(attendance.body,{p_booking:b.id,p_version:1,p_attended:true,p_actor:99});
  assert.deepEqual(continuation.body,{p_telegram_id:11,p_booking:b.id,p_version:2,p_continue:true});
  assert.ok(!calls.some(x=>/createChatInviteLink|approveChatJoinRequest/.test(x.url.pathname)));
});
test('organizer answer is persisted as a draft, never queued until confirmation', async () => {
  const {trialOrganizerText}=await import('../src/lib/trial.js');
  let draft: Record<string,unknown>|null=null;
  const calls=mock((url,body,method)=> {
    if(url.hostname==='api.telegram.org') return telegram;
    if(url.pathname.endsWith('/trial_config')) return config;
    if(url.pathname.endsWith('/members')) return {id:'organizer'};
    if(url.pathname.endsWith('/trial_questions')) return {id:'q1',body:'Cât costă?',status:'open',trial_prospects:{full_name:'Ana'}};
    if(url.pathname.endsWith('/trial_reply_drafts')) {
      if(method==='POST') draft=body;
      if(method==='PATCH') draft={...draft,...body};
      if(method==='DELETE') draft=null;
      return draft;
    }
    return null;
  });
  await trialCallback(cb('t:reply:q1',99));
  assert.equal(await trialOrganizerText(99,'Proba costă 50 lei.'),true);
  assert.ok(!calls.some(x=>x.url.pathname.endsWith('/rpc/trial_reply')));
  await trialCallback(cb('t:sendanswer:q1',99));
  assert.deepEqual(calls.find(x=>x.url.pathname.endsWith('/rpc/trial_reply'))?.body,{p_question:'q1',p_response:'Proba costă 50 lei.',p_actor:99});
  assert.ok(calls.some(x=>String(x.body.text).includes('Destinatar: Ana')));
});


test('converted members can stop both trial and regular private messages', async () => {
  const calls = mock(url => url.hostname === 'api.telegram.org' ? telegram : null);
  await handleUpdate({message:{message_id: 50, chat:{id:11,type:'private'},from:{id:11},text:'/stop'}});
  assert.ok(calls.some(c => c.url.pathname.endsWith('/members') && c.method === 'PATCH' && c.body.bot_dm_enabled === false));
  assert.ok(calls.some(c => c.url.pathname.endsWith('/trial_prospects') && c.method === 'PATCH' && c.body.dm_enabled === false));
});

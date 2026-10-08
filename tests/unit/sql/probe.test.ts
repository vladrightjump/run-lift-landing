// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest';
import { porneste, reseteaza, caRol, ADMIN_TOKEN, type BazaTest } from './db';
let db: BazaTest;
beforeAll(async () => { db = await porneste(); }, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
 await reseteaza(db);
 await db.exec(`insert into public.trial_config(id,enabled,organizer_telegram_id) values(1,true,900);
 insert into public.bot_config(id,poll_days) values(1,'{0,1,2,3,4,5,6}');
 insert into public.members(full_name,telegram_user_id,is_admin) values('Organizer',900,true);
 insert into public.trial_prospects(full_name,telegram_user_id) values('Maria',100);`);
});
const book = async () => (await db.query<{b: {id:string;version:number;prospect_id:string}}>(`select public.trial_book(100,(now() at time zone 'Europe/Chisinau')::date+1,'{"accepted":true}') b`)).rows[0].b;
const finish = async (id:string) => db.query(`update public.trial_bookings set session_start=now()-interval '2 hours' where id=$1`,[id]);
describe('trial onboarding transactions', () => {
 it('isolates prospects, deduplicates booking/outbox and rejects public writes', async () => {
  const a=await book(); const b=await book(); expect(a.id).toBe(b.id);
  expect((await db.query(`select * from public.members where telegram_user_id=100`)).rows).toHaveLength(0);
  expect((await db.query(`select * from public.trial_messages`)).rows).toHaveLength(4);
  await expect(db.query(`select public.trial_book(100,(now() at time zone 'Europe/Chisinau')::date+2,'{"accepted":true}')`)).rejects.toThrow('trial_booking_exists');
  await expect(caRol(db,'anon',()=>db.query(`select * from public.trial_prospects`))).rejects.toThrow('permission denied');
  await expect(caRol(db,'anon',()=>db.query(`select public.trial_book(100,current_date,'{}')`))).rejects.toThrow('permission denied');
 });
 it('requires actual attendance and an explicit later yes before invite and conversion', async () => {
  const b=await book();
  await expect(db.query(`select public.trial_continue(100,$1,1,true)`,[b.id])).rejects.toThrow('trial_attendance_required');
  await expect(db.query(`select public.trial_attendance($1,1,true,100)`,[b.id])).rejects.toThrow('trial_unauthorized_organizer');
  await expect(db.query(`select public.trial_attendance($1,1,true,900)`,[b.id])).rejects.toThrow('trial_not_finished');
  await finish(b.id);
  await db.query(`select public.trial_attendance($1,1,true,900)`,[b.id]);
  await db.query(`select public.trial_attendance($1,1,true,900)`,[b.id]);
  expect((await db.query(`select * from public.trial_messages where kind='continuation'`)).rows).toHaveLength(1);
  expect((await db.query(`select * from public.trial_messages where kind='invite'`)).rows).toHaveLength(0);
  await expect(db.query(`select public.trial_continue(101,$1,2,true)`,[b.id])).rejects.toThrow('trial_wrong_person');
  await db.query(`select public.trial_continue(100,$1,2,true)`,[b.id]);
  await db.query(`select public.trial_continue(100,$1,2,true)`,[b.id]);
  expect((await db.query(`select * from public.trial_messages where kind='invite'`)).rows).toHaveLength(1);
  expect((await db.query<{trial_convert:null}>(`select public.trial_convert(100)`)).rows[0].trial_convert).toBeNull();
  await db.exec(`insert into public.telegram_group_memberships(telegram_user_id,chat_id,state) values(100,'-1','in_group')`);
  const x=await db.query(`select public.trial_convert(100)`); const y=await db.query(`select public.trial_convert(100)`); expect(x.rows).toEqual(y.rows);
  expect((await db.query(`select * from public.members where telegram_user_id=100`)).rows).toHaveLength(1);
  await db.exec(`update public.telegram_group_memberships set state='left' where telegram_user_id=100; select public.trial_convert(100);`);
  expect((await db.query<{stage:string}>(`select stage from public.trial_prospects where telegram_user_id=100`)).rows[0].stage).toBe('closed');
  expect((await db.query(`select * from public.members where telegram_user_id=100`)).rows).toHaveLength(1);
 });
 it('preserves first attendance answer; admin corrections revoke eligibility without sending contradictory messages', async () => {
  const b=await book(); await finish(b.id);
  await db.query(`select public.trial_attendance($1,1,true,900)`,[b.id]);
  await expect(db.query(`select public.trial_attendance($1,1,false,900)`,[b.id])).rejects.toThrow('trial_stale_booking');
  await db.query(`select public.trial_continue(100,$1,2,true)`,[b.id]);
  await db.query(`select runlift.admin_trial_attendance($1,$2,false)`,[ADMIN_TOKEN,b.id]);
  expect((await db.query(`select * from public.trial_messages where status='pending' and kind in ('invite','rebook')`)).rows).toHaveLength(0);
  await expect(db.query(`select public.trial_continue(100,$1,3,true)`,[b.id])).rejects.toThrow('trial_attendance_required');
 });
 it('rejects cancelled and started sessions; cancellation invalidates old jobs and allows rebooking', async () => {
  await db.exec(`insert into public.training_sessions(session_date,status) values((now() at time zone 'Europe/Chisinau')::date+1,'cancelled')`);
  await expect(book()).rejects.toThrow('trial_session_unavailable');
  await db.exec(`update public.training_sessions set status='scheduled'`); const b=await book();
  await db.query(`select public.trial_cancel(100,$1,1)`,[b.id]);
  expect((await db.query(`select * from public.trial_messages where booking_version=1 and status='pending'`)).rows).toHaveLength(0);
  expect((await book()).id).not.toBe(b.id);
 });
 it('reconciles session changes and cancellations with versioned jobs', async () => {
  const b=await book();
  await db.exec(`update public.training_sessions set location='New park'`); await db.exec(`select public.trial_sync_sessions()`);
  expect((await db.query<{version:number}>(`select version from public.trial_bookings where id=$1`,[b.id])).rows[0].version).toBe(2);
  expect((await db.query(`select * from public.trial_messages where kind='session_changed'`)).rows).toHaveLength(1);
  await db.exec(`update public.training_sessions set status='cancelled'; select public.trial_sync_sessions(); select public.trial_sync_sessions();`);
  expect((await db.query(`select * from public.trial_messages where kind='cancelled'`)).rows).toHaveLength(1);
  expect((await db.query(`select * from public.trial_messages where status='pending' and kind in ('reminder','attendance_request')`)).rows).toHaveLength(0);
 });
 it('claims once and leaves expired leases ambiguous instead of automatically duplicating sends', async () => {
  await book(); const first=await db.query(`select * from public.trial_claim_messages(10)`); expect(first.rows).toHaveLength(2);
  expect((await db.query(`select * from public.trial_claim_messages(10)`)).rows).toHaveLength(0);
  await db.exec(`update public.trial_messages set lease_until=now()-interval '1 minute' where status='processing'; select public.trial_claim_messages(10)`);
  expect((await db.query(`select * from public.trial_messages where status='ambiguous'`)).rows).toHaveLength(2);
 });
 it('keeps question response queued until actual successful delivery', async () => {
  const q=(await db.query<{q:{id:string}}>(`select public.trial_question(100,'Where?') q`)).rows[0].q;
  await db.query(`select runlift.admin_trial_reply($1,$2,'At the park')`,[ADMIN_TOKEN,q.id]);
  await db.query(`select runlift.admin_trial_reply($1,$2,'At the park')`,[ADMIN_TOKEN,q.id]);
  const m=(await db.query<{id:string}>(`select * from public.trial_claim_messages(10)`)).rows;
  const answer=(await db.query<{id:string}>(`select id from public.trial_messages where kind='answer'`)).rows[0]; expect(m.length).toBe(2);
  expect((await db.query<{status:string}>(`select status from public.trial_questions`)).rows[0].status).toBe('queued');
  await db.query(`select public.trial_complete_message($1,'sent',null)`,[answer.id]);
  expect((await db.query<{status:string}>(`select status from public.trial_questions`)).rows[0].status).toBe('answered');
 });
 it('does not invite after absence, a negative answer, or a ban', async () => {
  const b=await book(); await finish(b.id);
  await db.query(`select public.trial_attendance($1,1,false,900)`,[b.id]);
  await expect(db.query(`select public.trial_continue(100,$1,2,true)`,[b.id])).rejects.toThrow('trial_attendance_required');
  await db.query(`select runlift.admin_trial_attendance($1,$2,true)`,[ADMIN_TOKEN,b.id]);
  await db.query(`select public.trial_continue(100,$1,3,false)`,[b.id]);
  await expect(db.query(`select public.trial_continue(100,$1,3,true)`,[b.id])).rejects.toThrow('trial_continuation_already_recorded');
  expect((await db.query(`select * from public.trial_messages where kind='invite'`)).rows).toHaveLength(0);
  await db.exec(`insert into public.telegram_group_memberships(telegram_user_id,chat_id,state) values(100,'-1','kicked')`);
  await expect(book()).rejects.toThrow('trial_membership_ineligible');
 });
 it('suspends all automation while disabled and participant messages when opted out', async () => {
  await book(); await db.exec(`update public.trial_prospects set dm_enabled=false`);
  const organizerOnly=await db.query<{recipient_telegram_id:number}>(`select * from public.trial_claim_messages(10)`);
  expect(organizerOnly.rows).toHaveLength(1); expect(Number(organizerOnly.rows[0].recipient_telegram_id)).toBe(900);
  await db.exec(`update public.trial_config set enabled=false`);
  expect((await db.query(`select * from public.trial_claim_messages(10)`)).rows).toHaveLength(0);
  await expect(book()).rejects.toThrow('trial_disabled');
 });
 it('guards renewal and explicitly renews only eligible invitations', async () => {
  const b=await book();
  await expect(db.query(`select public.trial_request_invite(100,$1)`,[b.id])).rejects.toThrow('trial_invitation_ineligible');
  await finish(b.id); await db.query(`select public.trial_attendance($1,1,true,900)`,[b.id]);
  await db.query(`select public.trial_continue(100,$1,2,true)`,[b.id]);
  await db.query(`select public.trial_request_invite(100,$1)`,[b.id]);
  expect((await db.query(`select * from public.trial_messages where kind='invite'`)).rows).toHaveLength(1);
  await db.exec(`update public.trial_messages set status='sent' where kind='invite'`);
  await db.query(`select public.trial_request_invite(100,$1)`,[b.id]);
  expect((await db.query(`select * from public.trial_messages where kind='invite'`)).rows).toHaveLength(2);
 });
 it('invalidates permission verification when changing bot identity or organizer', async () => {
  await db.exec(`update public.trial_config set enabled=false,permissions_verified_at=now(),bot_username='test_bot'`);
  await db.query(`select runlift.admin_trial_config($1,'{"bot_username":"other_bot"}')`,[ADMIN_TOKEN]);
  expect((await db.query<{permissions_verified_at:null}>(`select permissions_verified_at from public.trial_config`)).rows[0].permissions_verified_at).toBeNull();
 });
 it('records stable administrator identity without exposing the session credential', async () => {
  const b=await book(); await finish(b.id);
  await db.query(`select runlift.admin_trial_attendance($1,$2,true)`,[ADMIN_TOKEN,b.id]);
  const actor=(await db.query<{attendance_actor:string}>(`select attendance_actor from public.trial_bookings where id=$1`,[b.id])).rows[0].attendance_actor;
  const user=(await db.query<{user_id:number}>(`select user_id from runlift.admin_sessions where token=$1`,[ADMIN_TOKEN])).rows[0].user_id;
  expect(actor).toBe(`admin:${user}`);
  expect(JSON.stringify((await db.query(`select runlift.admin_trial_data($1)`,[ADMIN_TOKEN])).rows)).not.toContain(ADMIN_TOKEN);
 });
 it('deduplicates questions using the Telegram message identity', async () => {
  const first=await db.query(`select public.trial_question(100,'Where?',123)`);
  const again=await db.query(`select public.trial_question(100,'Where?',123)`);
  expect(first.rows).toEqual(again.rows);
  expect((await db.query(`select * from public.trial_questions`)).rows).toHaveLength(1);
  expect((await db.query(`select * from public.trial_messages where kind='question'`)).rows).toHaveLength(1);
 });
 it('bounds configuration text on the server and requires a public contact at activation', async () => {
  await expect(db.query(`select runlift.admin_trial_config($1,$2::jsonb)`,[ADMIN_TOKEN,JSON.stringify({enabled:false,welcome_text:'x'.repeat(1501)})])).rejects.toThrow('trial_config_text_too_long');
  await db.exec(`update public.trial_config set bot_username='trial_bot',welcome_text='Welcome',trial_conditions='Terms',trial_price='10 EUR',bring_text='Shoes',continuation_conditions='Terms',permissions_verified_at=now()`);
  await expect(db.query(`select runlift.admin_trial_config($1,'{"enabled":true}')`,[ADMIN_TOKEN])).rejects.toThrow('trial_config_incomplete');
  await db.query(`select runlift.admin_trial_config($1,'{"enabled":true,"contact_text":"@organizer"}')`,[ADMIN_TOKEN]);
 });
 it('exposes only public config and requires service permission proof before activation', async () => {
  const x=await caRol(db,'anon',()=>db.query<{c:object}>(`select runlift.public_trial_config() c`));
  expect(Object.keys(x.rows[0].c).sort()).toEqual(['bot_username','contact_text','enabled']);
  await expect(db.query(`select runlift.admin_trial_config($1,'{"enabled":true}')`,[ADMIN_TOKEN])).rejects.toThrow('trial_config_incomplete');
  await db.query(`select runlift.admin_trial_config($1,'{"enabled":false,"welcome_text":""}')`,[ADMIN_TOKEN]);
  await expect(db.query(`select runlift.admin_trial_data('00000000-0000-0000-0000-000000000000')`)).rejects.toThrow('invalid_token');
 });
});

it('validează și păstrează mesajele personalizate numai pentru admini', async () => {
 await db.exec('update public.trial_config set enabled=false');
 const save = (messages: unknown, token = ADMIN_TOKEN) => db.query('select runlift.admin_trial_config($1,$2::jsonb)', [token, JSON.stringify({message_texts: messages})]);
 await expect(save({reminder: 'Salut!'}, '00000000-0000-0000-0000-000000000000')).rejects.toThrow('invalid_token');
 for (const invalid of [null, [], {reminder: 3}, {reminder: ' '}, {reminder: 'a'.repeat(1501)}, {unknown: 'text'}]) await expect(save(invalid)).rejects.toThrow('invalid_trial_messages');
 await save({reminder: 'Salut!\nVino cu apă.'});
 expect((await db.query<{message_texts: unknown}>('select message_texts from public.trial_config')).rows[0].message_texts).toEqual({reminder: 'Salut!\nVino cu apă.'});
 const publicConfig = (await db.query<{c: object}>('select runlift.public_trial_config() c')).rows[0].c;
 expect(publicConfig).not.toHaveProperty('message_texts');
 await save({});
 expect((await db.query<{message_texts: unknown}>('select message_texts from public.trial_config')).rows[0].message_texts).toEqual({});
});

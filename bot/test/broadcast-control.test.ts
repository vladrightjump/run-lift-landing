import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBroadcastControl, parseBroadcast } from '../src/broadcast-control.js';
import { sendGeneralPoll } from '../src/lib/telegram.js';

function fixture() {
 let now=0, group='-100', authorized=true, throws=false, ok=true;
 const replies: {text:string; kb?:{text:string;callback_data:string}[][]}[]=[];
 const sent: unknown[]=[];
 const c=createBroadcastControl({authorized:id=>authorized && [1,2].includes(id),now:()=>now,
  destination:async()=>({id:group,title:'Run + Lift'}),reply:async(_id,text,kb)=>{replies.push({text,kb});},answer:async()=>{},
  publish:async(g,content)=>{sent.push({g,content}); if(throws)throw new Error('timeout');return {ok};}});
 const text=(s:string,id=1,chatType='private')=>c.text({chatId:id,fromId:id,chatType,fromName:'Vlad',text:s});
 const token=()=>replies.at(-1)!.kb![0][0].callback_data;
 const callback=(data:string,id=1,chatType='private')=>c.callback({id:'cb',chatId:id,fromId:id,chatType,fromName:'Vlad',messageId:10,data});
 return {c,text,token,callback,replies,sent,expire:()=>{now=900001},changeGroup:()=>{group='-200'},revoke:()=>{authorized=false},fail:(ambiguous:boolean)=>{throws=ambiguous;ok=false}};
}
test('parses multiline Romanian/Russian plain text, validates poll and boundaries',()=>{
 assert.deepEqual(parseBroadcast('/mesaj Привет!\nApă <b>doar text</b>'),{kind:'message',text:'Привет!\nApă <b>doar text</b>'});
 assert.deepEqual(parseBroadcast('/poll@bot Întrebare? | Da | Nu'),{kind:'poll',question:'Întrebare?',options:['Da','Nu']});
 for(const s of ['/mesaj','/mesaj '+ 'a'.repeat(3501),'/poll Q | A','/poll Q | A | a','/poll Q | | B','/poll '+ 'Q'.repeat(301)+' | A | B','/poll Q | '+ 'a'.repeat(101)+' | B','/poll Q | '+Array.from({length:13},(_,i)=>i).join('|')])assert.equal(typeof parseBroadcast(s),'string');
 assert.equal(parseBroadcast('/sondaj'),null);
 assert.equal(parseBroadcast('/pollution'),null);
 assert.equal(typeof parseBroadcast('/mesaj '+ 'a'.repeat(3500)),'object');
});
test('requires private organizer and publishes exact preview only after confirmation',async()=>{
 const f=fixture();await f.text('/mesaj text',3);await f.text('/mesaj text',1,'supergroup');assert.equal(f.sent.length,0);
 await f.text('/mesaj Salut!');const token=f.token();assert.match(f.replies.at(-1)!.text,/Run \+ Lift/);assert.equal(f.sent.length,0);
 await f.callback(token,2);await f.callback(token,1,'supergroup');assert.equal(f.sent.length,0);
 await Promise.all([f.callback(token),f.callback(token)]);assert.deepEqual(f.sent,[{g:'-100',content:{kind:'message',text:'Salut!'}}]);
});
test('replacement and old cancel cannot publish or discard a newer draft',async()=>{
 const f=fixture();await f.text('/mesaj Old');const old=f.token();await f.text('/mesaj New');const next=f.token();
 await f.callback(old);await f.callback(old.replace(':ok:',':no:'));assert.equal(f.sent.length,0);
 await f.callback(next);assert.deepEqual(f.sent,[{g:'-100',content:{kind:'message',text:'New'}}]);
});
test('invalid command replacement invalidates previous confirmation',async()=>{
 const f=fixture();await f.text('/mesaj Old');const old=f.token();await f.text('/poll');await f.callback(old);assert.equal(f.sent.length,0);
});
test('cancel, expiry, lost authorization and changed group all prevent publishing',async()=>{
 for(const scenario of ['cancel','expire','revoke','group']){
  const f=fixture();await f.text('/poll Q | A | B');const token=f.token();
  if(scenario==='cancel')await f.callback(token.replace(':ok:',':no:'));
  if(scenario==='expire')f.expire();if(scenario==='revoke')f.revoke();if(scenario==='group')f.changeGroup();
  await f.callback(token);assert.equal(f.sent.length,0,scenario);
 }
});
test('explicit failure and ambiguous timeout are truthful and cannot replay',async()=>{
 for(const ambiguous of [false,true]){
  const f=fixture();await f.text('/mesaj Hi');const token=f.token();f.fail(ambiguous);
  await f.callback(token);assert.match(f.replies.at(-1)!.text,ambiguous?/Livrare neconfirmată/:/refuzat/);
  await f.callback(token);assert.equal(f.sent.length,1);
 }
});
test('poll remains separate and sends native anonymous single-answer options',async()=>{
 const f=fixture();await f.text('/poll Q | A | B');assert.match(f.replies.at(-1)!.text,/anonim/);await f.callback(f.token());
 assert.deepEqual(f.sent,[{g:'-100',content:{kind:'poll',question:'Q',options:['A','B']}}]);
 const previous=globalThis.fetch, oldToken=process.env.TELEGRAM_BOT_TOKEN;process.env.TELEGRAM_BOT_TOKEN='test';
 try{
  globalThis.fetch=async(url,init)=>{assert.ok(String(url).endsWith('/sendPoll'));assert.deepEqual(JSON.parse(String(init?.body)),{chat_id:'-100',question:'Q',options:[{text:'A'},{text:'B'}],type:'regular',is_anonymous:true,allows_multiple_answers:false});return new Response(JSON.stringify({ok:true,result:{message_id:4}}));};
  assert.equal((await sendGeneralPoll('-100','Q',['A','B'])).ok,true);
 }finally{globalThis.fetch=previous;if(oldToken===undefined)delete process.env.TELEGRAM_BOT_TOKEN;else process.env.TELEGRAM_BOT_TOKEN=oldToken;}
});

test('webhook routes private commands and native poll callbacks without attendance/database writes',async()=>{
 const {handleUpdate}=await import('../src/webhook.js');
 const keys=['TELEGRAM_BOT_TOKEN','TELEGRAM_GROUP_CHAT_ID','TELEGRAM_ADMIN_CHAT_IDS'] as const;
 const old=keys.map(k=>process.env[k]);const original=globalThis.fetch;
 process.env.TELEGRAM_BOT_TOKEN='test';process.env.TELEGRAM_GROUP_CHAT_ID='-100';process.env.TELEGRAM_ADMIN_CHAT_IDS='1';
 const calls:{method:string;body:Record<string,any>}[]=[];
 try{
  globalThis.fetch=async(url,init)=>{
   assert.ok(String(url).startsWith('https://api.telegram.org/'));
   const method=String(url).split('/').at(-1)!;const body=JSON.parse(String(init?.body));calls.push({method,body});
   return new Response(JSON.stringify({ok:true,result:method==='getChat'?{id:-100,type:'supergroup',title:'Group'}:{message_id:7}}));
  };
  const message=(id:number,type:string,text:string)=>({message:{message_id:1,chat:{id,type},from:{id,first_name:'Vlad'},text}});
  await handleUpdate(message(-100,'supergroup','/mesaj ignored'));assert.equal(calls.length,0);
  await handleUpdate(message(3,'private','/poll Q | A | B'));assert.ok(!calls.some(c=>c.method==='getChat'));
  await handleUpdate(message(1,'private','/poll Q | A | B'));
  assert.ok(!calls.some(c=>c.method==='sendPoll'));
  const preview=calls.findLast(c=>c.body.reply_markup)!;const data=preview.body.reply_markup.inline_keyboard[0][0].callback_data;
  const cb={callback_query:{id:'cb',from:{id:1},message:{message_id:7,chat:{id:1,type:'private'}},data}};
  assert.equal(await handleUpdate(cb),true);assert.equal(await handleUpdate(cb),true);
  assert.equal(calls.filter(c=>c.method==='sendPoll').length,1);
 }finally{globalThis.fetch=original;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});}
});

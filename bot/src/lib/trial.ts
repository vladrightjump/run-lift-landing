import { randomUUID } from 'node:crypto';
import { trialCopy } from './trial-copy.js';
import { createAdminClient } from './supabase.js';
import { trialSessions, type SessionRow } from './sessions.js';
import { GYM_TZ, todayInTz, localWeekdayAndTime } from './tz.js';
import { sendTrialText, answerCallbackQuery, getChatMember, getMe, getBotGroupPermissions,
  approveJoinRequest, declineJoinRequest, type InlineKeyboard } from './telegram.js';
import { membershipState, recordMembership } from './membership.js';

export type TrialDb = ReturnType<typeof createAdminClient>;
export interface TrialConfig {
  message_texts?: Record<string, string>;
  enabled: boolean; bot_username: string; welcome_text: string; trial_conditions: string;
  trial_price: string; bring_text: string; continuation_conditions: string; duration_minutes: number;
  organizer_telegram_id: number | null; contact_text: string; permissions_verified_at: string | null;
}
export interface Prospect { id: string; telegram_user_id: number; full_name: string | null; conversation_step: string; dm_enabled: boolean; stage: string }
export interface Booking { id: string; prospect_id: string; version: number; status: string; session_start: string; session_location: string; duration_minutes: number; conditions_snapshot: Record<string,string>; attendance_at: string | null; continuation: string | null; session_id: string }
export interface TrialUser { id: number; username?: string; first_name?: string; last_name?: string }
export const button = (text: string, callback_data: string) => ({ text, callback_data });
export const mainKeyboard: InlineKeyboard = [[button('Alege antrenamentul de probă', 't:dates')], [button('Am o întrebare', 't:question')]];
export function missingTrialSchema(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === 'PGRST202';
}
export async function trialConfig(db: TrialDb = createAdminClient()): Promise<TrialConfig | null> {
  const { data, error } = await db.from('trial_config').select('*').eq('id', 1).maybeSingle();
  if (missingTrialSchema(error)) return null;
  if (error) throw error;
  return data as TrialConfig | null;
}
async function send(id: number, text: string, kb?: InlineKeyboard) {
  const r = await sendTrialText(id, text, kb);
  if (!r.ok) throw new Error(r.description ?? 'Mesajul nu a putut fi trimis');
}
function intakeReady(c: TrialConfig): boolean { return !!c.permissions_verified_at && Date.now() - Date.parse(c.permissions_verified_at) < 24 * 3600_000; }
export function trialConditions(c: TrialConfig) {
  return { trial_price: c.trial_price, trial_conditions: c.trial_conditions, bring_text: c.bring_text };
}
export function conditionsText(c: Record<string, string>): string {
  return `Cost: ${c.trial_price}\n${c.trial_conditions}\nCe aduci: ${c.bring_text}`;
}
export function bookingText(b: Booking): string {
  const when = new Intl.DateTimeFormat('ro-RO', { timeZone: GYM_TZ, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(b.session_start));
  return `${when} (Chișinău)\nLocație: ${b.session_location}`;
}
export async function currentBooking(db: TrialDb, id: string): Promise<Booking | null> {
  const { data, error } = await db.from('trial_bookings').select('*').eq('prospect_id', id)
    .in('status', ['scheduled', 'awaiting_attendance', 'attended']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data as Booking | null;
}
async function step(db: TrialDb, p: Prospect, value: string) {
  const { error } = await db.from('trial_prospects').update({ conversation_step: value, updated_at: new Date().toISOString() }).eq('id', p.id);
  if (error) throw error;
}
export async function eligibleTrialDates(db: TrialDb) {
  // Unlike general poll fallback, public bookings fail closed when config cannot be read.
  const { data: cfg, error: configError } = await db.from('bot_config').select('poll_days,training_time,location').eq('id', 1).single();
  if (configError) throw configError;
  const today = todayInTz();
  const { data, error } = await db.from('training_sessions').select('*').gte('session_date', today).order('session_date').limit(40);
  if (error) throw error;
  return trialSessions({ today, now: localWeekdayAndTime().hhmm, pollDays: cfg.poll_days,
    trainingTime: cfg.training_time, location: cfg.location, sessions: (data ?? []) as SessionRow[] });
}
async function showDates(db: TrialDb, p: Prospect, c: TrialConfig) {
  const booking = await currentBooking(db, p.id);
  if (booking) return showProgress(p.telegram_user_id, booking, c);
  if (!intakeReady(c)) return send(p.telegram_user_id, `Înscrierile sunt suspendate temporar. ${c.contact_text}`);
  if (!p.full_name) {
    await step(db, p, 'name');
    return send(p.telegram_user_id, trialCopy(c, 'name_prompt'));
  }
  const dates = await eligibleTrialDates(db);
  await step(db, p, 'choose_session');
  await send(p.telegram_user_id, dates.length ? trialCopy(c, 'choose_session') : trialCopy(c, 'no_sessions'),
    [...dates.map(t => [button(`${t.date}, ${t.time} · ${t.location}`.slice(0, 120), `t:date:${t.date}`)]),
      [button('Reîncarcă programul', 't:dates'), button('Am o întrebare', 't:question')]]);
}
async function showProgress(id: number, b: Booking, c: TrialConfig) {
  if (b.status === 'attended') {
    if (b.continuation === 'yes') return send(id, 'Ai confirmat continuarea. Invitația este trimisă separat; poți cere un link nou dacă a expirat.', [[button('Primește invitația', `t:invite:${b.id}:${b.version}`)]]);
    return send(id, `${trialCopy(c, 'continuation')}\n\n${c.continuation_conditions}`, [[button('Da, vreau să continui', `t:yes:${b.id}:${b.version}`)], [button('Nu acum', `t:no:${b.id}:${b.version}`)]]);
  }
  if (b.status === 'awaiting_attendance' || new Date(b.session_start).getTime() <= Date.now()) return send(id, trialCopy(c, 'awaiting_attendance'));
  return send(id, `${trialCopy(c, 'booking_confirmed')}\n${bookingText(b)}\n\n${conditionsText(b.conditions_snapshot)}`, [[button('Anulează / alege altă zi', `t:cancel:${b.id}:${b.version}`)], [button('Am o întrebare', 't:question')]]);
}
async function prospect(db: TrialDb, id: number): Promise<Prospect | null> {
  const { data, error } = await db.from('trial_prospects').select('*').eq('telegram_user_id', id).maybeSingle();
  if (error) throw error;
  return data as Prospect | null;
}
async function organizer(db: TrialDb, id: number): Promise<boolean> {
  const { data, error } = await db.from('members').select('id').eq('telegram_user_id', id).eq('is_admin', true).maybeSingle();
  if (error) throw error;
  return !!data;
}
export async function trialPrivateMessage(from: TrialUser, text: string, messageId?: number): Promise<void> {
  const db = createAdminClient();
  const c = await trialConfig(db);
  if (!c) { await send(from.id, 'Înscrierea la proba de antrenament nu este disponibilă momentan.'); return; }
  if (/^\/stop(?:@\w+)?$/i.test(text)) {
    const { error } = await db.from('trial_prospects').update({ dm_enabled: false }).eq('telegram_user_id', from.id);
    if (error) throw error;
    await send(from.id, 'Am oprit mesajele automate. Scrie /start pentru a le relua.'); return;
  }
  if (!c.enabled) { await send(from.id, `Înscrierea la proba de antrenament nu este disponibilă momentan.\n${c.contact_text}`); return; }
  let p = await prospect(db, from.id);
  const start = /^\/start(?:@\w+)?(?:\s|$)/i.test(text);
  if (!p) {
    if (!intakeReady(c)) return send(from.id, `Înscrierile sunt suspendate temporar. ${c.contact_text}`);
    const source = /^\/start(?:@\w+)?\s+(trial_home|trial_share|trial_instagram)$/.exec(text)?.[1] ?? 'direct';
    const { error } = await db.from('trial_prospects').upsert({ telegram_user_id: from.id, telegram_username: from.username ?? null, source }, { onConflict: 'telegram_user_id', ignoreDuplicates: true });
    if (error) throw error;
    p = await prospect(db, from.id);
    if (!p) throw new Error('Nu s-a putut crea înscrierea');
    await send(from.id, `${c.welcome_text}\n\n${conditionsText(trialConditions(c))}\n\n${trialCopy(c, 'name_prompt')}\nPoți opri mesajele cu /stop.`); return;
  }
  if (start) {
    const { error } = await db.from('trial_prospects').update({ dm_enabled: true }).eq('id', p.id);
    if (error) throw error;
    const b = await currentBooking(db, p.id);
    if (b) return showProgress(from.id, b, c);
    if (p.stage === 'closed') return send(from.id, 'Ai încheiat înscrierea. Dacă te răzgândești, poți alege o nouă probă.', mainKeyboard);
    if (!p.full_name) return send(from.id, `${c.welcome_text}\n\n${conditionsText(trialConditions(c))}\n\n${trialCopy(c, 'name_prompt')}`);
    return send(from.id, `${c.welcome_text}\n\n${conditionsText(trialConditions(c))}`, mainKeyboard);
  }
  if (!p.dm_enabled) return send(from.id, 'Mesajele sunt oprite. Scrie /start pentru a relua.');
  if (p.conversation_step === 'question') {
    if (!text || text.startsWith('/') || text.length > 4000) return send(from.id, 'Scrie întrebarea în maximum 4000 de caractere sau /start pentru a reveni.');
    const { error } = await db.rpc('trial_question', { p_telegram_id: from.id, p_body: text, p_message_id: messageId ?? null });
    if (error) throw error;
    await step(db, p, p.full_name ? 'choose_session' : 'name');
    return send(from.id, trialCopy(c, 'question_received'), mainKeyboard);
  }
  if (!p.full_name) {
    const name = text.replace(/\s+/g, ' ').trim();
    if (name.startsWith('/') || name.length < 2 || name.length > 80) return send(from.id, 'Scrie un nume între 2 și 80 de caractere.');
    const { error } = await db.from('trial_prospects').update({ full_name: name, conversation_step: 'choose_session' }).eq('id', p.id);
    if (error) throw error;
    p.full_name = name;
    return showDates(db, p, c);
  }
  await send(from.id, 'Alege o opțiune. Pentru o întrebare, apasă mai întâi „Am o întrebare”.', mainKeyboard);
}

export async function trialCallback(cb: { id: string; from: TrialUser; data: string; message?: { chat: { id: number; type: string } } }): Promise<void> {
  if (cb.message?.chat.type !== 'private' || cb.message.chat.id !== cb.from.id) { await answerCallbackQuery(cb.id, 'Folosește conversația privată cu botul.'); return; }
  await answerCallbackQuery(cb.id);
  const db = createAdminClient();
  const c = await trialConfig(db);
  if (!c?.enabled) return send(cb.from.id, `Înscrierile sunt oprite momentan. ${c?.contact_text ?? ''}`);
  const [, action, id, rawVersion] = cb.data.split(':');
  if (action === 'present' || action === 'absent') {
    if (!await organizer(db, cb.from.id)) return send(cb.from.id, 'Această acțiune este disponibilă organizatorilor.');
    const { error } = await db.rpc('trial_attendance', { p_booking: id, p_version: Number(rawVersion), p_attended: action === 'present', p_actor: cb.from.id });
    if (error) return send(cb.from.id, 'Prezența nu a fost modificată. Verifică starea actuală în admin; butonul poate fi expirat.');
    return send(cb.from.id, 'Prezența a fost înregistrată.');
  }
  if (action === 'reply' || action === 'sendanswer' || action === 'discardanswer') return organizerReplyCallback(db, cb.from.id, action, id);
  const p = await prospect(db, cb.from.id);
  if (!p || !p.dm_enabled) return send(cb.from.id, 'Scrie /start pentru a începe sau relua.');
  if (action === 'question') { await step(db, p, 'question'); return send(cb.from.id, trialCopy(c, 'question_prompt')); }
  if (action === 'dates') return showDates(db, p, c);
  if (action === 'date') {
    const dates = await eligibleTrialDates(db);
    const choice = dates.find(t => t.date === id);
    if (!choice) return showDates(db, p, c);
    // Persist exactly the conditions displayed, including date. An old accept button cannot accept new conditions silently.
    await step(db, p, JSON.stringify({ date: id, conditions: trialConditions(c) }));
    return send(cb.from.id, `${id}, ${choice.time} · ${choice.location}\n\n${conditionsText(trialConditions(c))}\n\nConfirmi participarea în aceste condiții?`, [[button('Accept și rezerv proba', `t:book:${id}`)], [button('Alege altă zi', 't:dates')]]);
  }
  if (action === 'book') {
    let accepted: { date?: string; conditions?: Record<string,string> } = {};
    try { accepted = JSON.parse(p.conversation_step); } catch { /* normal stage, not an acceptance */ }
    const existing = await currentBooking(db, p.id);
    if (existing) return showProgress(cb.from.id, existing, c);
    if (accepted.date !== id || !accepted.conditions) return send(cb.from.id, 'Alege din nou ziua și verifică condițiile.', mainKeyboard);
    const { error } = await db.rpc('trial_book', { p_telegram_id: cb.from.id, p_date: id, p_conditions: accepted.conditions });
    if (error) return send(cb.from.id, 'Nu am putut rezerva această probă. Programul sau înscrierea s-a schimbat. Alege din nou.', mainKeyboard);
    return send(cb.from.id, trialCopy(c, 'booking_received'));
  }
  if (action === 'cancel' || action === 'yes' || action === 'no') {
    const rpc = action === 'cancel' ? 'trial_cancel' : 'trial_continue';
    const { error } = await db.rpc(rpc, { p_telegram_id: cb.from.id, p_booking: id, p_version: Number(rawVersion), ...(action === 'cancel' ? {} : { p_continue: action === 'yes' }) });
    if (error) return send(cb.from.id, 'Acțiunea nu mai este disponibilă. Scrie /start pentru starea actuală.');
    return send(cb.from.id, action === 'cancel' ? 'Cererea de anulare este înregistrată. Confirmarea va sosi aici.' : action === 'yes' ? trialCopy(c, 'continuation_yes') : trialCopy(c, 'continuation_no'), action === 'cancel' ? mainKeyboard : undefined);
  }
  if (action === 'invite') {
    const b = await currentBooking(db, p.id);
    if (!b || b.id !== id || b.version !== Number(rawVersion) || !eligibleForInvite(b)) return send(cb.from.id, 'Invitația nu este disponibilă.');
    // Explicit request can renew a successfully delivered/expired invitation, never an ambiguous send automatically.
    const { error } = await db.rpc('trial_request_invite', { p_telegram_id: cb.from.id, p_booking: id });
    if (error) return send(cb.from.id, 'Invitația nu poate fi reemisă acum. Contactează organizatorul.');
    return send(cb.from.id, 'Cererea pentru invitație a fost înregistrată.');
  }
}
export function eligibleForInvite(b: Pick<Booking, 'status' | 'attendance_at' | 'continuation'>): boolean {
  return b.status === 'attended' && b.attendance_at !== null && b.continuation === 'yes';
}

async function organizerReplyCallback(db: TrialDb, actor: number, action: string, id: string) {
  if (!await organizer(db, actor)) return send(actor, 'Acțiune disponibilă numai organizatorilor.');
  if (action !== 'reply') {
    const { error } = await db.rpc('trial_confirm_reply', { p_actor: actor, p_draft: id, p_send: action === 'sendanswer' });
    if (error) return send(actor, 'Previzualizarea a expirat sau a fost înlocuită. Apasă din nou „Răspunde”.');
    return send(actor, action === 'sendanswer' ? 'Răspunsul este în coada de trimitere. Starea livrării apare în admin.' : 'Răspunsul a fost abandonat.');
  }
  const { data: q, error } = await db.from('trial_questions').select('*, trial_prospects(full_name,telegram_user_id)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!q || q.status !== 'open') return send(actor, 'Întrebarea a fost deja preluată sau nu mai există.');
  const { error: draftError } = await db.from('trial_reply_drafts').upsert({ telegram_user_id: actor, question_id: id, draft_id: randomUUID(), body: null, expires_at: new Date(Date.now() + 15 * 60_000).toISOString() });
  if (draftError) throw draftError;
  return send(actor, `Răspuns pentru ${q.trial_prospects?.full_name ?? 'persoană nouă'}\nÎntrebare: ${String(q.body).slice(0, 500)}\n\nScrie răspunsul. Îți voi cere confirmarea înainte de trimitere.`);
}
export async function trialOrganizerText(actor: number, text: string): Promise<boolean> {
  if (text.startsWith('/')) return false;
  const db = createAdminClient();
  const c = await trialConfig(db);
  if (!c?.enabled) return false;
  const { data: draft, error } = await db.from('trial_reply_drafts').select('*').eq('telegram_user_id', actor).maybeSingle();
  if (error) throw error;
  if (!draft || draft.body !== null || new Date(draft.expires_at).getTime() < Date.now() || !await organizer(db, actor)) return false;
  if (!text.trim() || text.length > 3500) { await send(actor, 'Răspunsul trebuie să aibă între 1 și 3500 de caractere.'); return true; }
  const { data: q, error: questionError } = await db.from('trial_questions').select('body,trial_prospects(full_name)').eq('id', draft.question_id).single();
  if (questionError) throw questionError;
  const { data: preview, error: writeError } = await db.from('trial_reply_drafts').update({ body: text }).eq('telegram_user_id', actor).eq('draft_id', draft.draft_id).is('body', null).select('draft_id').maybeSingle();
  if (writeError) throw writeError;
  if (!preview) { await send(actor, 'Contextul răspunsului s-a schimbat. Apasă din nou „Răspunde”.'); return true; }
  // Supabase infers relation arrays without generated DB types; normalize the response.
  const relation = q.trial_prospects as unknown as {full_name:string} | null;
  await send(actor, `Destinatar: ${relation?.full_name ?? 'persoană nouă'}\nÎntrebare: ${String(q.body).slice(0, 500)}\n\nRăspuns:\n${text}`, [[button('Confirmă trimiterea', `t:sendanswer:${preview.draft_id}`)], [button('Renunță', `t:discardanswer:${preview.draft_id}`)]]);
  return true;
}

export async function verifyTrialPermissions(db: TrialDb, c: TrialConfig): Promise<boolean> {
  const group = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!group || !c.bot_username || !c.organizer_telegram_id || !await organizer(db, c.organizer_telegram_id)) {
    const { error } = await db.from('trial_config').update({ permissions_verified_at: null }).eq('id', 1);
    if (error) throw error;
    return false;
  }
  const me = await getMe();
  if (!me.ok || !me.result || me.result.username?.toLowerCase() !== c.bot_username.toLowerCase()) {
    const { error } = await db.from('trial_config').update({ permissions_verified_at: null }).eq('id', 1);
    if (error) throw error;
    return false;
  }
  const permission = await getBotGroupPermissions(group, me.result.id);
  const valid = permission.ok && (permission.result?.status === 'creator' || (permission.result?.status === 'administrator' && permission.result.can_invite_users === true));
  const { error } = await db.from('trial_config').update({ permissions_verified_at: valid ? new Date().toISOString() : null }).eq('id', 1).eq('bot_username', c.bot_username).eq('organizer_telegram_id', c.organizer_telegram_id);
  if (error) throw error;
  return valid;
}
export async function trialJoinRequest(request: { chat: { id: number }; from: TrialUser; invite_link?: { invite_link: string } }): Promise<void> {
  const group = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (String(request.chat.id) !== group || !request.invite_link) return;
  const db = createAdminClient();
  const c = await trialConfig(db);
  if (!c) return;
  const { data: invitation, error } = await db.from('trial_invitations').select('*').eq('invite_link', request.invite_link.invite_link).maybeSingle();
  if (error) throw error;
  if (!invitation) return; // Other organizers' links remain theirs to moderate.
  const { data: booking, error: bookingError } = await db.from('trial_bookings').select('*').eq('id', invitation.booking_id).maybeSingle();
  if (bookingError) throw bookingError;
  const valid = c.enabled && Number(invitation.telegram_user_id) === request.from.id && !invitation.revoked_at && new Date(invitation.expires_at).getTime() > Date.now() && booking && invitation.booking_version === booking.version && eligibleForInvite(booking);
  if (!valid) { const r = await declineJoinRequest(group!, request.from.id); if (!r.ok) throw new Error(r.description); return; }
  const current = await getChatMember(group!, request.from.id);
  if (!current.ok || !current.result) throw new Error('Nu pot verifica apartenența înaintea aderării');
  // Never call unban: a prior exclusion is an explicit administrative decision.
  const { data: saved, error: savedError } = await db.from('telegram_group_memberships').select('state').eq('telegram_user_id', request.from.id).eq('chat_id', group).maybeSingle();
  if (savedError) throw savedError;
  if (current.result.status === 'kicked' || saved?.state === 'kicked') { await declineJoinRequest(group!, request.from.id); return; }
  const result = await approveJoinRequest(group!, request.from.id);
  if (!result.ok) throw new Error(result.description ?? 'Aprobarea aderării a eșuat');
  const observed = await getChatMember(group!, request.from.id);
  if (observed.ok && observed.result && membershipState(observed.result) === 'in_group') await recordMembership(group!, observed.result, new Date().toISOString());
}

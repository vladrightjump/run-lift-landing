import { trialCopy } from '../lib/trial-copy.js';
import { createAdminClient } from '../lib/supabase.js';
import { sendTrialText, createTrialInvite, getChatMember, revokeInvite, type InlineKeyboard } from '../lib/telegram.js';
import { bookingText, button, conditionsText, eligibleForInvite, mainKeyboard, trialConfig, verifyTrialPermissions,
  type TrialDb, type TrialConfig, type Booking, type Prospect } from '../lib/trial.js';

interface TrialMessage { id: string; prospect_id: string; booking_id: string | null; booking_version: number | null; kind: string; recipient_telegram_id: number; status: string; attempts: number; payload: Record<string, unknown> }
export function renderTrialMessage(m: Pick<TrialMessage, 'kind' | 'payload'>, p: Prospect, b: Booking | null, c: TrialConfig): {text:string; keyboard?:InlineKeyboard} {
  const name = p.full_name ?? 'Persoană nouă';
  const session = b ? bookingText(b) : '';
  const cancel = b ? [[button('Anulează / reprogramare', `t:cancel:${b.id}:${b.version}`)], [button('Am o întrebare', 't:question')]] : mainKeyboard;
  switch (m.kind) {
    case 'booking_confirmed': return { text: `${trialCopy(c, 'booking_confirmed')}\n${session}\n\n${conditionsText(b!.conditions_snapshot)}\n\nPoți opri mesajele cu /stop.`, keyboard: cancel };
    case 'session_changed': return { text: `${trialCopy(c, 'session_changed')}\n${session}\n\n${conditionsText(b!.conditions_snapshot)}`, keyboard: cancel };
    case 'organizer_booking': return { text: `${trialCopy(c, 'organizer_booking')}\n${name}\n${session}` };
    case 'reminder': return { text: `${trialCopy(c, 'reminder')}\n${session}\n\n${conditionsText(b!.conditions_snapshot)}`, keyboard: cancel };
    case 'attendance_request': return { text: `${trialCopy(c, 'attendance_request')}\n${name}\n${session}`, keyboard: [[button('A venit', `t:present:${b!.id}:${b!.version}`), button('Nu a venit', `t:absent:${b!.id}:${b!.version}`)]] };
    case 'cancelled': return { text: `${trialCopy(c, 'cancelled')}\n${session}`, keyboard: mainKeyboard };
    case 'organizer_cancelled': return { text: `${trialCopy(c, 'organizer_cancelled')}\n${name}\n${session}` };
    case 'continuation': return { text: `${trialCopy(c, 'continuation')}\n\n${c.continuation_conditions}`, keyboard: [[button('Da, vreau să continui', `t:yes:${b!.id}:${b!.version}`)], [button('Nu acum', `t:no:${b!.id}:${b!.version}`)]] };
    case 'rebook': return { text: trialCopy(c, 'rebook'), keyboard: mainKeyboard };
    case 'question': return { text: `${trialCopy(c, 'question')}\n${name}:\n${String(m.payload.body ?? '').slice(0, 3000)}`, keyboard: [[button('Răspunde', `t:reply:${m.payload.id}`)]] };
    case 'answer': return { text: `${trialCopy(c, 'answer')}\nÎntrebarea ta: ${String(m.payload.body ?? '').slice(0, 400)}\n\n${String(m.payload.response ?? '')}`, keyboard: mainKeyboard };
    default: throw new Error(`Tip de mesaj necunoscut: ${m.kind}`);
  }
}
export function messageStillRelevant(m: Pick<TrialMessage, 'booking_version' | 'kind'>, b: Booking | null, now = Date.now()): boolean {
  if (!b) return m.booking_version === null;
  if (m.booking_version !== b.version) return false;
  if (m.kind === 'invite') return eligibleForInvite(b);
  if (m.kind === 'continuation') return b.status === 'attended' && b.continuation === null;
  if (m.kind === 'rebook') return b.status === 'absent';
  if (m.kind === 'attendance_request') return ['scheduled', 'awaiting_attendance'].includes(b.status) && new Date(b.session_start).getTime() + b.duration_minutes * 60_000 <= now;
  if (['cancelled', 'organizer_cancelled'].includes(m.kind)) return b.status === 'cancelled';
  if (['booking_confirmed', 'reminder', 'session_changed'].includes(m.kind)) return b.status === 'scheduled' && new Date(b.session_start).getTime() > now;
  return true;
}
async function complete(db: TrialDb, m: TrialMessage, status: string, result: string) {
  const { error } = await db.rpc('trial_complete_message', { p_message: m.id, p_status: status, p_result: result.slice(0, 1000) });
  if (error) throw error;
}
async function invitation(db: TrialDb, p: Prospect, b: Booking): Promise<string> {
  const group = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!group || !eligibleForInvite(b)) throw new Error('Invitația nu este eligibilă');
  const current = await getChatMember(group, p.telegram_user_id);
  if (!current.ok || !current.result) throw new Error('Apartenența nu a putut fi verificată');
  const { data: saved, error: savedError } = await db.from('telegram_group_memberships').select('state').eq('telegram_user_id', p.telegram_user_id).eq('chat_id', group).maybeSingle();
  if (savedError) throw savedError;
  if (current.result.status === 'kicked' || saved?.state === 'kicked') throw new Error('Persoana este exclusă. Nu se deblochează automat.');
  const { data: old, error } = await db.from('trial_invitations').select('*').eq('booking_id', b.id).eq('booking_version', b.version).is('revoked_at', null).gt('expires_at', new Date(Date.now() + 60_000).toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (old) return old.invite_link;
  const expires = Math.floor(Date.now() / 1000) + 7 * 86400;
  const result = await createTrialInvite(group, expires);
  if (!result.ok || !result.result) throw new Error(result.description ?? 'Crearea invitației a eșuat');
  const link = result.result.invite_link;
  const { error: saveError } = await db.from('trial_invitations').insert({ prospect_id: p.id, booking_id: b.id, booking_version: b.version, telegram_user_id: p.telegram_user_id, invite_link: link, expires_at: new Date(expires * 1000).toISOString() });
  if (saveError) { await revokeInvite(group, link); throw saveError; }
  return link;
}
async function deliver(db: TrialDb, m: TrialMessage) {
  const { data: prospect, error } = await db.from('trial_prospects').select('*').eq('id', m.prospect_id).single();
  if (error) throw error;
  const p = prospect as Prospect;
  let b: Booking | null = null;
  if (m.booking_id) {
    const result = await db.from('trial_bookings').select('*').eq('id', m.booking_id).maybeSingle();
    if (result.error) throw result.error;
    b = result.data as Booking | null;
  }
  const participant = Number(m.recipient_telegram_id) === Number(p.telegram_user_id);
  // Re-read lease and feature switch immediately before any external write.
  const { data: lease, error: leaseError } = await db.from('trial_messages').select('status').eq('id', m.id).single();
  if (leaseError) throw leaseError;
  const freshConfig = await trialConfig(db);
  if (lease.status !== 'processing') return;
  if (!freshConfig?.enabled || (!p.dm_enabled && participant) || !messageStillRelevant(m, b)) return complete(db, m, 'cancelled', 'Stare schimbată înaintea trimiterii');
  let text: string;
  let keyboard: InlineKeyboard | undefined;
  if (m.kind === 'invite') text = `${trialCopy(freshConfig, 'invite')}\n${await invitation(db, p, b!)}`;
  else ({ text, keyboard } = renderTrialMessage(m, p, b, freshConfig));
  try {
    const result = await sendTrialText(m.recipient_telegram_id, text, keyboard);
    if (result.ok && result.result) return complete(db, m, 'sent', `Telegram message ${result.result.message_id}`);
    if (result.sentCount > 0) return complete(db, m, 'ambiguous', 'Mesaj livrat parțial. Verifică înainte de reîncercare.');
    if (result.error_code === 403 && participant) {
      const { error: disableError } = await db.from('trial_prospects').update({ dm_enabled: false }).eq('id', p.id);
      if (disableError) throw disableError;
    }
    // Explicit Telegram rejection is safe to retry, unlike network timeouts. Limit three attempts.
    if ((result.error_code === 429 || (result.error_code ?? 0) >= 500) && m.attempts < 3) {
      const { error: retryError } = await db.from('trial_messages').update({ status: 'pending', lease_until: null, due_at: new Date(Date.now() + m.attempts * 60_000).toISOString(), result: result.description ?? 'Telegram unavailable' }).eq('id', m.id).eq('status', 'processing');
      if (retryError) throw retryError;
      return;
    }
    return complete(db, m, 'failed', result.description ?? 'Telegram a refuzat mesajul');
  } catch {
    // sendMessage may have succeeded before the connection was lost. Keep visible for explicit review.
    return complete(db, m, 'ambiguous', 'Livrarea nu poate fi confirmată. Verifică înainte de reîncercare.');
  }
}
let running = false;
let lastPermissionCheck = 0;
let permissionValid = false;
let permissionIdentity = '';
export async function processTrialMessages(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const db = createAdminClient();
    const c = await trialConfig(db);
    if (!c) return;
    // Runs while disabled too, so the admin can activate only after a real permission check.
    const identity = `${c.bot_username}:${c.organizer_telegram_id}`;
    if (identity !== permissionIdentity || Date.now() - lastPermissionCheck > 5 * 60_000) {
      permissionValid = false;
      permissionValid = await verifyTrialPermissions(db, c);
      permissionIdentity = identity;
      lastPermissionCheck = Date.now();
    }
    if (!permissionValid || !c.enabled) return;
    const { data, error } = await db.rpc('trial_claim_messages', { p_limit: 10 });
    if (error) throw error;
    for (const m of (data ?? []) as TrialMessage[]) {
      try { await deliver(db, m); }
      catch (e) { await complete(db, m, 'failed', e instanceof Error ? e.message : 'Eroare la pregătirea mesajului'); }
    }
  } finally { running = false; }
}

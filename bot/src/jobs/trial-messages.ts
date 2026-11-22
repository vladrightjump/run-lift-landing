import { botFailure, observeOperation, observeTelegram, observeDatabase, unreportedFailure } from '../lib/log.js';
import { trialCopy } from '../lib/trial-copy.js';
import { createAdminClient } from '../lib/supabase.js';
import { sendTrialText, createTrialInvite, getChatMember, revokeInvite, type InlineKeyboard } from '../lib/telegram.js';
import { bookingText, button, conditionsText, eligibleForInvite, mainKeyboard, trialConfig, verifyTrialPermissions,
  type TrialDb, type TrialConfig, type Booking, type Prospect } from '../lib/trial.js';

interface TrialMessage { id: string; prospect_id: string; booking_id: string | null; booking_version: number | null; kind: string; recipient_telegram_id: number; status: string; lease_until: string; attempts: number; payload: Record<string, unknown> }
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
    case 'self_cancelled': return { text: `${trialCopy(c, 'self_cancelled')}\n${session}`, keyboard: mainKeyboard };
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
  if (['cancelled', 'self_cancelled', 'organizer_cancelled'].includes(m.kind)) return b.status === 'cancelled';
  if (['booking_confirmed', 'reminder', 'session_changed'].includes(m.kind)) return b.status === 'scheduled' && new Date(b.session_start).getTime() > now;
  return true;
}
async function complete(db: TrialDb, m: TrialMessage, status: string, result: string) {
  const outcome = status === 'sent' || status === 'ambiguous' ? 'unconfirmed' : 'failed';
  await observeDatabase('trial.complete_message', () =>
    db.rpc('trial_complete_message', { p_message: m.id, p_status: status, p_result: result.slice(0, 1000) }),
  outcome);
}

function requireTelegramResult<T>(
  operation: string,
  call: () => Promise<{ ok: boolean; result?: T }>,
  outcome: 'failed' | 'unconfirmed' = 'failed',
): Promise<T> {
  return observeOperation(operation, 'telegram', async () => {
    const reply = await call();
    if (!reply.ok || !reply.result) throw reply;
    return reply.result;
  }, outcome);
}
async function invitation(db: TrialDb, p: Prospect, b: Booking): Promise<string> {
  const group = process.env.TELEGRAM_GROUP_CHAT_ID;
  if (!group || !eligibleForInvite(b)) throw new Error('Invitația nu este eligibilă');
  const current = await requireTelegramResult('trial.get_invitee_membership', () => getChatMember(group, p.telegram_user_id));
  const saved = await observeDatabase('trial.read_invitee_membership', () => db.from('telegram_group_memberships')
    .select('state').eq('telegram_user_id', p.telegram_user_id).eq('chat_id', group).maybeSingle());
  if (current.status === 'kicked' || saved?.state === 'kicked') throw new Error('Persoana este exclusă. Nu se deblochează automat.');
  const old = await observeDatabase('trial.read_invitation', () => db.from('trial_invitations').select('*')
    .eq('booking_id', b.id).eq('booking_version', b.version).is('revoked_at', null)
    .gt('expires_at', new Date(Date.now() + 60_000).toISOString()).order('created_at', { ascending: false }).limit(1).maybeSingle());
  if (old) return old.invite_link;
  const expires = Math.floor(Date.now() / 1000) + 7 * 86400;
  const result = await requireTelegramResult('trial.create_invitation', () => createTrialInvite(group, expires), 'unconfirmed');
  const link = result.invite_link;
  try {
    await observeDatabase('trial.save_invitation', () => db.from('trial_invitations').insert({
      prospect_id: p.id, booking_id: b.id, booking_version: b.version,
      telegram_user_id: p.telegram_user_id, invite_link: link, expires_at: new Date(expires * 1000).toISOString(),
    }));
  } catch (error) {
    await observeTelegram('trial.revoke_invitation', () => revokeInvite(group, link)).catch(() => {});
    throw error;
  }
  return link;
}
async function prepareDelivery(db: TrialDb, m: TrialMessage) {
  const p = await observeDatabase('trial.read_prospect', () => db.from('trial_prospects').select('*').eq('id', m.prospect_id).single()) as Prospect;
  const b = m.booking_id ? await observeDatabase('trial.read_booking', () =>
    db.from('trial_bookings').select('*').eq('id', m.booking_id).maybeSingle(),
  ) as Booking | null : null;
  const participant = Number(m.recipient_telegram_id) === Number(p.telegram_user_id);
  // Re-read lease and feature switch immediately before any external write.
  const lease = await observeDatabase('trial.read_lease', () => db.from('trial_messages').select('status').eq('id', m.id).single());
  const freshConfig = await trialConfig(db);
  if (lease?.status !== 'processing') return 'skip';
  if (!freshConfig?.enabled) return 'paused';
  if ((!p.dm_enabled && participant) || !messageStillRelevant(m, b)) return 'cancelled';
  const message = m.kind === 'invite'
    ? { text: `${trialCopy(freshConfig, 'invite')}
${await invitation(db, p, b!)}`, keyboard: undefined }
    : renderTrialMessage(m, p, b, freshConfig);
  return { ...message, participant, prospectId: p.id };
}

function canRetryTelegram(errorCode: number | undefined, attempts: number): boolean {
  return (errorCode === 429 || (errorCode ?? 0) >= 500) && attempts < 3;
}

async function deliver(db: TrialDb, m: TrialMessage) {
  const started = performance.now();
  let prepared: Awaited<ReturnType<typeof prepareDelivery>>;
  try {
    prepared = await prepareDelivery(db, m);
  } catch (error) {
    unreportedFailure('trial.prepare_message', started, error);
    return complete(db, m, 'failed', error instanceof Error ? error.message : 'Eroare la pregătirea mesajului');
  }
  if (prepared === 'paused') return 'paused';
  if (prepared === 'skip') return;
  if (prepared === 'cancelled') return complete(db, m, 'cancelled', 'Stare schimbată înaintea trimiterii');

  const sendStarted = performance.now();
  let result: Awaited<ReturnType<typeof sendTrialText>>;
  try {
    result = await observeTelegram('trial.send_message',
      () => sendTrialText(m.recipient_telegram_id, prepared.text, prepared.keyboard),
      'unconfirmed',
      (r) => r.sentCount > 0 ? 'partial' : canRetryTelegram(r.error_code, m.attempts) ? 'retry' : 'failed',
    );
  } catch {
    return complete(db, m, 'ambiguous', 'Livrarea nu poate fi confirmată. Verifică înainte de reîncercare.');
  }
  // If the DB write after delivery fails, leave the lease to expire into
  // ambiguous. Recording "failed" could invite a resend of a delivered message.
  if (result.ok) {
    if (result.result) return complete(db, m, 'sent', `Telegram message ${result.result.message_id}`);
    botFailure('trial.send_message', 'telegram', sendStarted, new SyntaxError(), 'unconfirmed');
    return complete(db, m, 'ambiguous', 'Livrarea nu poate fi confirmată. Verifică înainte de reîncercare.');
  }
  if (result.sentCount > 0) return complete(db, m, 'ambiguous', 'Mesaj livrat parțial. Verifică înainte de reîncercare.');
  if (result.error_code === 403 && prepared.participant) {
    await observeDatabase('trial.disable_dm', () =>
      db.from('trial_prospects').update({ dm_enabled: false }).eq('id', prepared.prospectId));
  }
  if (canRetryTelegram(result.error_code, m.attempts)) {
    await observeDatabase('trial.requeue_message', () => db.from('trial_messages')
      .update({ status: 'pending', lease_until: null, due_at: new Date(Date.now() + m.attempts * 60_000).toISOString(), result: result.description ?? 'Telegram unavailable' })
      .eq('id', m.id).eq('status', 'processing'));
    return;
  }
  return complete(db, m, 'failed', result.description ?? 'Telegram a refuzat mesajul');
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
    const data = await observeDatabase('trial.claim_messages', () => db.rpc('trial_claim_messages', { p_limit: 10 }));
    const messages = (data ?? []) as TrialMessage[];
    for (const m of messages) {
      const started = performance.now();
      let delivery;
      try {
        delivery = await deliver(db, m);
      } catch (error) {
        unreportedFailure('trial.process_message', started, error);
        continue;
      }
      if (delivery === 'paused') {
        await observeDatabase('trial.release_messages', () => db.rpc('trial_release_messages', {
          p_claims: messages.map(row => ({ id: row.id, lease_until: row.lease_until })),
        }));
        break;
      }
    }
  } finally { running = false; }
}

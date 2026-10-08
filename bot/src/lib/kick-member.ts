import { createAdminClient } from './supabase.js';
import { banChatMember, getChatMember, unbanChatMember, type TelegramMember } from './telegram.js';
import { organizerIds } from './organizers.js';
import { membershipState, recordMembership } from './membership.js';

export interface KickCommand { member_id: string | null; telegram_user_id: number | null; payload: Record<string, unknown> | null }
export interface KickPorts {
  group: string; organizers: number[];
  member(id: string): Promise<{ telegram_user_id: number | null; is_admin: boolean } | null>;
  inspect(group: string, id: number): Promise<TelegramMember>;
  ban(group: string, id: number): Promise<void>;
  unban(group: string, id: number): Promise<void>;
  record(group: string, member: TelegramMember): Promise<void>;
}
export async function executeKick(cmd: KickCommand, ports: KickPorts): Promise<string> {
  const id = cmd.telegram_user_id;
  if (!id || !cmd.member_id) throw new Error('Lipsește identitatea membrului.');
  if (cmd.payload?.chat_id && cmd.payload.chat_id !== ports.group) throw new Error('Grupul s-a schimbat. Cere din nou scoaterea.');
  const current = await ports.member(cmd.member_id);
  if (!current || current.telegram_user_id !== id) throw new Error('Contul membrului s-a schimbat. Cere din nou scoaterea.');
  if (current.is_admin || ports.organizers.includes(id)) throw new Error('Organizatorii nu pot fi scoși.');
  const live = await ports.inspect(ports.group, id);
  if (live.status === 'administrator' || live.status === 'creator') throw new Error('Administratorii Telegram nu pot fi scoși.');
  if (membershipState(live) !== 'in_group') {
    await ports.record(ports.group, live);
    return 'Persoana nu mai este în grup.';
  }
  await ports.ban(ports.group, id);
  // A database outage after ban must not skip unban and turn a kick into a ban.
  try { await ports.unban(ports.group, id); }
  catch (error) {
    await ports.record(ports.group, { ...live, status: 'kicked' }).catch(() => {});
    throw error;
  }
  await ports.record(ports.group, { ...live, status: 'left' });
  return 'Scos din grup. Poate fi invitat din nou; istoricul rămâne.';
}
export const kickPorts = (group: string): KickPorts => ({
  group, organizers: organizerIds(),
  async member(id) {
    const { data, error } = await createAdminClient().from('members').select('telegram_user_id, is_admin').eq('id', id).maybeSingle();
    if (error) throw error;
    return data;
  },
  async inspect(chat, id) {
    const r = await getChatMember(chat, id);
    if (!r.ok || !r.result) throw new Error(r.description ?? 'Nu se poate verifica apartenența.');
    return r.result;
  },
  async ban(chat, id) { const r = await banChatMember(chat, id); if (!r.ok) throw new Error(r.description ?? 'Scoaterea a eșuat.'); },
  async unban(chat, id) { const r = await unbanChatMember(chat, id); if (!r.ok) throw new Error('Persoana a fost scoasă, dar deblocarea a eșuat. Deblocheaz-o din Telegram pentru a permite revenirea.'); },
  record(chat, member) { return recordMembership(chat, member, new Date().toISOString()); },
});

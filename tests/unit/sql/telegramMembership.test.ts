// @vitest-environment node
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest';
import { porneste, reseteaza, caRol, ADMIN_TOKEN, type BazaTest } from './db';
let db: BazaTest;
beforeAll(async () => { db = await porneste(); }, 60_000);
beforeEach(() => reseteaza(db));
afterAll(async () => { await db.close(); });
const observe = (state: string, at: string) => db.query(
  `select public.record_telegram_membership(1234, '-100', $1, $2::timestamptz, 'ana', 'Ana', 'Rusu')`, [state, at]);
const seed = async () => (await db.query<{ id: string }>(`insert into public.members(full_name, telegram_user_id) values ('Ana', 1234) returning id`)).rows[0].id;
it('new members start unknown; updates preserve training status and ignore stale deliveries', async () => {
  await seed();
  await db.query(`select * from public.telegram_membership_candidates('-100')`);
  expect((await db.query<{ state: string }>(`select state from public.telegram_group_memberships`)).rows[0].state).toBe('unknown');
  await observe('in_group', '2026-10-08T10:00:00Z');
  await observe('left', '2026-10-08T11:00:00Z');
  await observe('in_group', '2026-10-08T10:00:00Z');
  expect((await db.query<{ state: string }>(`select state from public.telegram_group_memberships`)).rows[0].state).toBe('left');
  expect((await db.query<{ status: string }>(`select status from public.members`)).rows[0].status).toBe('active');
  await observe('in_group', '2026-10-08T12:00:00Z');
  const result = await db.query<{ d: { membri: { telegram_membership: string }[] } }>(`select runlift.admin_sala_date($1) as d`, [ADMIN_TOKEN]);
  expect(result.rows[0].d.membri[0].telegram_membership).toBe('in_group');
});
it('unknown entrants are available to link, departed ones do not remain in the unmatched UI', async () => {
  await observe('in_group', '2026-10-08T10:00:00Z');
  expect((await db.query(`select * from public.telegram_unmatched`)).rows).toHaveLength(1);
  await observe('left', '2026-10-08T11:00:00Z');
  const result = await db.query<{ d: { necunoscuti: unknown[] } }>(`select runlift.admin_sala_date($1) as d`, [ADMIN_TOKEN]);
  expect(result.rows[0].d.necunoscuti).toHaveLength(0);
});
it('an API error preserves the verified state and schedules a later retry', async () => {
  await observe('in_group', '2026-10-08T10:00:00Z');
  await db.query(`select public.telegram_membership_retry(1234, '-100')`);
  expect((await db.query(`select state, check_failed from public.telegram_group_memberships`)).rows[0]).toEqual({ state: 'in_group', check_failed: true });
});
it('both entry points deduplicate pending kicks, keep the history and reject relinked IDs', async () => {
  const id = await seed();
  const a = await db.query<{ id: string }>(`select runlift.admin_sala_scoate_din_grup($1, $2) as id`, [ADMIN_TOKEN, id]);
  const b = await db.query<{ id: string }>(`select public.queue_telegram_kick($1, 1234, '-100', 42, 'Vlad') as id`, [id]);
  expect(a.rows[0].id).toBe(b.rows[0].id);
  expect((await db.query<{ status: string }>(`select status from public.members`)).rows[0].status).toBe('active');
  await expect(db.query(`select public.queue_telegram_kick($1, 9999, '-100', 42, 'Vlad')`, [id])).rejects.toThrow('telegram_changed');
});
it('anonymous callers cannot forge membership or invoke service-only removals', async () => {
  await expect(caRol(db, 'anon', () => observe('left', '2026-10-08T10:00:00Z'))).rejects.toThrow(/permission denied/);
  await expect(db.query(`select runlift.admin_sala_verifica_membri('00000000-0000-0000-0000-000000000000')`)).rejects.toThrow('invalid_token');
  await expect(caRol(db, 'anon', () => db.query(`select * from public.telegram_group_memberships`))).rejects.toThrow(/permission denied/);
});
it('departed users are excluded from reminders while historical attendance remains', async () => {
  await seed();
  await observe('in_group', '2026-10-08T10:00:00Z');
  expect((await db.query(`select * from public.telegram_training_members`)).rows).toHaveLength(1);
  await observe('left', '2026-10-08T11:00:00Z');
  expect((await db.query(`select * from public.telegram_training_members`)).rows).toHaveLength(0);
  expect((await db.query(`select * from public.member_attendance_stats`)).rows).toHaveLength(1);
});

it('acknowledgement requires admin auth, persists in the journal and preserves failed status and membership', async () => {
  const member = await seed();
  await observe('kicked', '2026-10-08T10:00:00Z');
  const { rows: [action] } = await db.query<{ id: string }>(`insert into public.bot_actions(action, member_id, telegram_user_id, status, result) values ('kick_member', $1, 1234, 'failed', 'Deblochează manual') returning id`, [member]);
  const mark = (token: string) => db.query(`select runlift.admin_sala_marcheaza_verificat($1, $2)`, [token, action.id]);
  await expect(mark('00000000-0000-0000-0000-000000000000')).rejects.toThrow('invalid_token');
  await caRol(db, 'anon', () => mark(ADMIN_TOKEN));
  const before = (await db.query(`select status, result, reviewed_at from public.bot_actions where id=$1`, [action.id])).rows;
  await mark(ADMIN_TOKEN);
  expect((await db.query(`select status, result, reviewed_at from public.bot_actions where id=$1`, [action.id])).rows).toEqual(before);
  expect(before[0]).toMatchObject({ status: 'failed', result: 'Deblochează manual', reviewed_at: expect.anything() });
  expect((await db.query(`select state from public.telegram_group_memberships`)).rows).toEqual([{ state: 'kicked' }]);
  expect((await db.query(`select id from public.bot_actions`)).rows).toHaveLength(1);
  const { rows: [r] } = await db.query<{ data: { comenzi: { reviewed_at: string }[], scoateri: { reviewed_at: string }[] } }>(`select runlift.admin_sala_date($1) as data`, [ADMIN_TOKEN]);
  expect(r.data.comenzi[0].reviewed_at).toBeTruthy();
  expect(r.data.scoateri[0].reviewed_at).toBe(r.data.comenzi[0].reviewed_at);
});
it('pending or completed commands cannot be dismissed', async () => {
  for (const status of ['pending', 'done']) {
    const { rows: [a] } = await db.query<{ id: string }>(`insert into public.bot_actions(action,status) values ('send_summary',$1) returning id`, [status]);
    await expect(db.query(`select runlift.admin_sala_marcheaza_verificat($1,$2)`, [ADMIN_TOKEN,a.id])).rejects.toThrow('comanda_neesuata');
  }
});

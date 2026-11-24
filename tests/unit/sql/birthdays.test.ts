import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ADMIN_TOKEN, porneste, reseteaza, type BazaTest } from './db';

const migration = readFileSync('supabase/sql/supabase-migration-sala-aniversari.sql', 'utf8');
const member = '11111111-2222-3333-4444-555555555555';
let db: BazaTest;
beforeAll(async () => { db = await porneste(); });
beforeEach(async () => {
  await reseteaza(db);
  await db.query('insert into public.members (id, full_name, telegram_user_id) values ($1, $2, 42)', [member, 'Ana']);
});
afterAll(async () => { await db?.close(); });

describe('Telegram birthday preferences and delivery', () => {
  it('preserves the old opt-in on migration replay and gives one persistent annual claim', async () => {
    await db.exec("select public.telegram_save_member_profile(42, 'Ana', 27, 11, true, 'Alergare')");
    await db.exec(migration);
    await db.exec(migration);
    const { rows } = await db.query("select * from public.telegram_birthday_candidates('2026-11-27')");
    expect(rows).toEqual([{ telegram_user_id: 42, source: 'legacy', display_name: 'Ana', revision: 0 }]);
    const claim = () => db.query("select public.telegram_claim_birthday(42, '2026-11-27', 0) as claimed");
    const claims = await Promise.all([claim(), claim()]);
    expect(claims.map(result => result.rows)).toEqual([[{ claimed: true }], [{ claimed: false }]]);
    await db.exec("select public.telegram_finish_birthday(42, '2026-11-27', 'uncertain')");
    expect((await claim()).rows).toEqual([{ claimed: false }]);
    expect((await db.query("select * from public.telegram_birthday_candidates('2027-11-27')")).rows).toHaveLength(1);
  });

  it('validates organizer edits and keeps permission independent of the date', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from public.telegram_birthday_preferences')).rejects.toThrow(/permission denied/);
      await expect(db.query("select * from public.telegram_birthday_candidates('2026-11-27')")).rejects.toThrow(/permission denied/);
      await expect(db.query('select runlift.admin_sala_read_birthday(null, $1)', [member]))
        .rejects.toThrow(/invalid_token/);
      await expect(db.query('select runlift.admin_sala_set_birthday($1, $2, 43, 27, 11)', [ADMIN_TOKEN, member]))
        .rejects.toThrow(/cont_telegram_schimbat/);
      await expect(db.query('select runlift.admin_sala_set_birthday($1, $2, 42, 30, 2)', [ADMIN_TOKEN, member]))
        .rejects.toThrow(/birthday_invalid/);
      await db.query('select runlift.admin_sala_set_birthday($1, $2, 42, 27, 11)', [ADMIN_TOKEN, member]);
      const result = await db.query('select runlift.admin_sala_read_birthday($1, $2) as prefs', [ADMIN_TOKEN, member]);
      expect(result.rows[0]).toMatchObject({ prefs: { day: 27, month: 11, source: 'manual', enabled: false } });
    } finally {
      await db.exec('reset role');
    }

    await db.exec("select public.telegram_change_birthday(42, 'enable', 26, 11, true, null)");
    expect((await db.query("select * from public.telegram_birthday_candidates('2026-11-26')")).rows).toEqual([]);
    const { rows } = await db.query("select * from public.telegram_birthday_candidates('2026-11-27')");
    expect(rows[0]).toMatchObject({ source: 'manual' });
    await db.exec("select public.telegram_change_birthday(42, 'disable', null, null, false, null)");
    const stale = await db.query('select public.telegram_claim_birthday(42, $1, $2) as claimed',
      ['2026-11-27', (rows[0] as { revision: number }).revision]);
    expect(stale.rows).toEqual([{ claimed: false }]);
  });

  it('removes a hidden Telegram birthday and honors a member clearing their date', async () => {
    await db.exec("select public.telegram_change_birthday(42, 'enable', 29, 2, true, null)");
    const { rows } = await db.query<{ revision: number }>("select * from public.telegram_birthday_candidates('2028-02-29')");
    expect(rows).toHaveLength(1);
    expect((await db.query("select * from public.telegram_birthday_candidates('2027-02-28')")).rows).toEqual([]);
    await db.query("select public.telegram_change_birthday(42, 'refresh', null, null, true, $1)", [rows[0].revision]);
    expect((await db.query("select * from public.telegram_birthday_candidates('2028-02-29')")).rows).toEqual([]);
    await db.exec("select public.telegram_change_birthday(42, 'clear', null, null, false, null)");
    const blocked = await db.query('select public.telegram_birthday_preference(42) as prefs');
    expect(blocked.rows[0]).toMatchObject({
      prefs: { day: null, month: null, enabled: false, source: null, import_blocked: true },
    });
  });
});

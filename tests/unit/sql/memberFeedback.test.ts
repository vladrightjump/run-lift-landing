import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { porneste, type BazaTest } from './db';

let db: BazaTest;
beforeAll(async () => {
  db = await porneste();
  await db.exec(readFileSync('supabase/sql/supabase-migration-sala-feedback.sql', 'utf8'));
});
afterAll(async () => { await db?.close(); });

describe('Telegram member forms', () => {
  it('stores feedback without a person reference and gives organizers exact counts', async () => {
    await db.exec(`
      set role service_role;
      insert into public.telegram_feedback (id, feeling, topics, comment)
      values ('11111111-1111-1111-1111-111111111111', 2, array['run','technique'], 'Mai devreme');
      reset role;
    `);
    await expect(db.query(`
      insert into public.telegram_feedback (id, feeling, topics)
      values ('22222222-2222-2222-2222-222222222222', 1, array['unknown'])
    `)).rejects.toThrow(/check constraint/);
    const { rows } = await db.query(`select public.telegram_feedback_report(1) as report`);
    expect(rows[0]).toEqual({ report: {
      total: 1,
      feelings: [0, 1, 0, 0],
      topics: [1, 0, 1, 0, 0, 0],
      comment_count: 1,
      comments: ['Mai devreme'],
    } });
    const columns = await db.query<{ column_name: string }>(`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'telegram_feedback'
      order by ordinal_position
    `);
    expect(columns.rows.map(row => row.column_name)).toEqual([
      'id', 'feeling', 'topics', 'comment', 'submitted_on',
    ]);
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query('select * from public.telegram_feedback')).rejects.toThrow(/permission denied/);
        await expect(db.query('select public.telegram_feedback_report(1)')).rejects.toThrow(/permission denied/);
        await expect(db.query('select * from public.telegram_member_profiles')).rejects.toThrow(/permission denied/);
        await expect(db.query('select public.telegram_profiles_report(1)')).rejects.toThrow(/permission denied/);
        await expect(db.query(`select public.telegram_save_member_profile(77123, 'Ana', 29, 2, false, null)`)).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec('reset role');
      }
    }
  });

  it('keeps unmatched submissions separate and resolves a subsequently linked account', async () => {
    await db.exec(`set role service_role`);
    try {
      await expect(db.query(`select public.telegram_save_member_profile(77123, 'Ana', 30, 2, true, '5 km')`))
        .rejects.toThrow(/check constraint/);
      await db.query(`select public.telegram_save_member_profile(77123, 'Ana', 29, 2, false, '5 km fără oprire')`);
      const pending = await db.query(`select public.telegram_profiles_report(1) as report`);
      expect(pending.rows[0]).toMatchObject({ report: { total: 1, profiles: [{ matched: false, display_name: 'Ana' }] } });
      expect((await db.query(`select first_name from public.telegram_unmatched where telegram_user_id = 77123`)).rows)
        .toEqual([{ first_name: null }]);
      expect((await db.query(`select id from public.members where telegram_user_id = 77123`)).rows).toEqual([]);
      await db.query(`insert into public.members (full_name, telegram_user_id) values ('Ana Popescu', 77123)`);
      await db.query(`select public.telegram_save_member_profile(77123, 'Ana', null, null, false, null)`);
      const matched = await db.query(`select public.telegram_profiles_report(1) as report`);
      expect(matched.rows[0]).toEqual({ report: { total: 1, profiles: [{
        telegram_user_id: 77123, matched: true, display_name: 'Ana', training_goal: null,
      }] } });
      expect((await db.query(`
        select birth_day, birth_month, birthday_greeting from public.telegram_member_profiles where telegram_user_id = 77123
      `)).rows).toEqual([{ birth_day: null, birth_month: null, birthday_greeting: false }]);
    } finally {
      await db.exec('reset role');
    }
  });
});

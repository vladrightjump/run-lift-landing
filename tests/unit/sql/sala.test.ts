// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { porneste, reseteaza, type BazaTest } from './db';

/**
 * Tabelele grupului de antrenament (fostul gym-app + botul de Telegram), în
 * baza de date.
 *
 * Repo-ul preia tabelele astea din `public` fără să le mute: botul le scrie în
 * continuare cu cheia de service, iar adminul le va citi prin funcții
 * `runlift.admin_sala_*`. Testele de aici încep cu caracterizarea a ce există
 * deja — funcția de unire și vederea cu statistici — ca o schimbare ulterioară
 * să nu le altereze pe tăcute.
 *
 * Rulează pe instantaneul din producție (`supabase/schema/sala.sql`, vezi `db.ts`).
 */

let db: BazaTest;

beforeAll(async () => {
  db = await porneste();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(() => reseteaza(db));

const membru = async (nume: string, tg: number | null = null): Promise<string> => {
  const r = await db.query<{ id: string }>(
    `insert into public.members (full_name, telegram_user_id) values ($1, $2) returning id`,
    [nume, tg]
  );
  return r.rows[0].id;
};

const antrenament = async (data: string): Promise<string> => {
  const r = await db.query<{ id: string }>(
    `insert into public.training_sessions (session_date) values ($1) returning id`,
    [data]
  );
  return r.rows[0].id;
};

const raspuns = async (sesiune: string, membruId: string, r: 'yes' | 'no'): Promise<void> => {
  await db.query(
    `insert into public.attendance (session_id, member_id, response) values ($1, $2, $3)`,
    [sesiune, membruId, r]
  );
};

describe('instantaneul grupului', () => {
  it('se încarcă lângă runlift și are cele opt tabele', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables
        where schemaname = 'public'
          and tablename in ('members', 'payments', 'training_sessions', 'attendance',
                            'attendance_log', 'bot_config', 'bot_actions', 'telegram_unmatched')`
    );
    expect(r.rows[0].n).toBe(8);
  });

  it('un antrenament nou primește ora și locul implicite', async () => {
    await antrenament('2026-10-06');
    const r = await db.query<{ starts_at: string; location: string; status: string }>(
      `select starts_at::text, location, status from public.training_sessions`
    );
    expect(r.rows[0]).toEqual({
      starts_at: '06:30:00',
      location: 'Parcul Dumitru Râșcanu',
      status: 'scheduled',
    });
  });
});

describe('merge_members (caracterizare)', () => {
  it('mută răspunsurile duplicatului pe membrul păstrat și șterge duplicatul', async () => {
    const pastrat = await membru('Ana Rusu');
    const duplicat = await membru('Ana R.', 555);
    const s1 = await antrenament('2026-09-29');
    const s2 = await antrenament('2026-10-01');
    await raspuns(s1, pastrat, 'yes');
    await raspuns(s1, duplicat, 'no');
    await raspuns(s2, duplicat, 'yes');

    await db.query(`select public.merge_members($1, $2)`, [pastrat, duplicat]);

    const ramasi = await db.query<{ id: string; telegram_user_id: string | null }>(
      `select id, telegram_user_id::text from public.members`
    );
    expect(ramasi.rows).toEqual([{ id: pastrat, telegram_user_id: '555' }]);

    // Pe s1 răspunsul păstratului câștigă; s2 vine de la duplicat.
    const raspunsuri = await db.query<{ session_id: string; response: string }>(
      `select session_id, response from public.attendance where member_id = $1 order by session_id = $2 desc`,
      [pastrat, s1]
    );
    expect(raspunsuri.rows).toEqual([
      { session_id: s1, response: 'yes' },
      { session_id: s2, response: 'yes' },
    ]);
  });

  it('refuză unirea unui membru cu el însuși', async () => {
    const m = await membru('Ion');
    await expect(db.query(`select public.merge_members($1, $1)`, [m])).rejects.toThrow(
      'Nu poți îmbina un membru cu el însuși'
    );
  });
});

describe('member_attendance_stats (caracterizare)', () => {
  it('numără „vin” și „nu vin” și ține ultima prezență', async () => {
    const m = await membru('Maria');
    const s1 = await antrenament('2026-09-29');
    const s2 = await antrenament('2026-10-01');
    const s3 = await antrenament('2026-10-06');
    await raspuns(s1, m, 'yes');
    await raspuns(s2, m, 'yes');
    await raspuns(s3, m, 'no');

    const r = await db.query<{ yes_count: number; no_count: number; last_attended: string }>(
      `select yes_count::int, no_count::int, last_attended::text
         from public.member_attendance_stats where id = $1`,
      [m]
    );
    expect(r.rows[0]).toEqual({ yes_count: 2, no_count: 1, last_attended: '2026-10-01' });
  });

  it('un membru fără răspunsuri apare cu zero și fără ultimă prezență', async () => {
    const m = await membru('Victor');
    const r = await db.query<{ yes_count: number; last_attended: string | null }>(
      `select yes_count::int, last_attended from public.member_attendance_stats where id = $1`,
      [m]
    );
    expect(r.rows[0]).toEqual({ yes_count: 0, last_attended: null });
  });
});

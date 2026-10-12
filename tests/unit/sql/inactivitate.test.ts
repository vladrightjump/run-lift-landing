// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { porneste, reseteaza, caRol, type BazaTest } from './db';

/**
 * Alerta de inactivitate (`supabase/sql/supabase-migration-sala-inactivitate.sql`).
 *
 * Calendarul e fix: „azi" e luni, 12 octombrie 2026. Săptămânile încep lunea,
 * iar antrenamentele de test cad miercurea.
 */

let db: BazaTest;
const AZI = '2026-10-12';
const GRUP = '-100';

beforeAll(async () => {
  db = await porneste();
}, 60_000);
afterAll(async () => {
  await db.close();
});
beforeEach(() => reseteaza(db));

/** Miercurea din săptămâna care începe la data dată (o luni). */
const MIERCURI: Record<string, string> = {
  '08-31': '2026-09-02', '09-07': '2026-09-09', '09-14': '2026-09-16', '09-21': '2026-09-23',
  '09-28': '2026-09-30', '10-05': '2026-10-07',
};

const membru = async (nume: string, tg: number, intrat = '2026-01-01', admin = false): Promise<string> =>
  (await db.query<{ id: string }>(
    `insert into public.members (full_name, telegram_user_id, join_date, is_admin) values ($1, $2, $3, $4) returning id`,
    [nume, tg, intrat, admin]
  )).rows[0].id;

const antrenament = async (data: string, status = 'scheduled'): Promise<string> =>
  (await db.query<{ id: string }>(
    `insert into public.training_sessions (session_date, status) values ($1, $2) returning id`,
    [data, status]
  )).rows[0].id;

const da = async (sesiune: string, m: string) =>
  db.query(`insert into public.attendance (session_id, member_id, response) values ($1, $2, 'yes')`, [sesiune, m]);

/** Câte un antrenament în fiecare săptămână dată (cheile din MIERCURI). */
const antrenamente = async (...saptamani: string[]) => {
  const ids: Record<string, string> = {};
  for (const s of saptamani) ids[s] = await antrenament(MIERCURI[s]);
  return ids;
};

type Candidat = { member_id: string; weeks_missed: number; anchor_date: string; last_yes: string | null };
const candidati = async (azi = AZI): Promise<Candidat[]> =>
  (await db.query<Candidat>(
    `select member_id, weeks_missed, anchor_date::text, last_yes::text from public.inactivity_candidates($1)`,
    [azi]
  )).rows;

const deschide = async (c: Candidat) =>
  (await db.query<{ id: string }>(`select public.inactivity_open($1, $2, $3) id`, [c.member_id, c.anchor_date, c.weeks_missed])).rows[0].id;

type Decizie = { outcome: string; review: { status: string; result: string | null; bot_action_id: string | null; decided_by_name: string | null } };
const decide = async (ciclu: string, actiune: string, cine = 'Vlad', id = 900): Promise<Decizie> =>
  (await db.query<{ r: Decizie }>(`select public.inactivity_decide($1, $2, $3, $4, $5) r`, [ciclu, actiune, id, cine, GRUP])).rows[0].r;

const intretinere = async (azi = AZI) =>
  (await db.query<{ r: { change: string; review: { id: string; weeks_missed: number } }[] }>(`select public.inactivity_maintain($1) r`, [azi])).rows[0].r;

describe('numărătoarea săptămânilor', () => {
  it('AE1: 5 săptămâni de la ultimul „Da", 2 de pauză → 3 lipsite, apare', async () => {
    const ion = await membru('Ion', 200);
    const s = await antrenamente('08-31', '09-07', '09-28', '10-05');
    await da(s['08-31'], ion);
    const [c] = await candidati();
    expect(c).toMatchObject({ member_id: ion, weeks_missed: 3, anchor_date: '2026-09-02', last_yes: '2026-09-02' });
  });

  it('AE2: 4 săptămâni de la ultimul „Da", 2 de pauză → nu apare', async () => {
    const ion = await membru('Ion', 200);
    const s = await antrenamente('09-07', '09-28', '10-05');
    await da(s['09-07'], ion);
    expect(await candidati()).toEqual([]);
  });

  it('o săptămână cu antrenamentul anulat nu se numără', async () => {
    const ion = await membru('Ion', 200);
    const s = await antrenamente('09-07', '09-14', '09-28');
    await antrenament(MIERCURI['10-05'], 'cancelled');
    await da(s['09-07'], ion);
    expect(await candidati()).toEqual([]);
  });

  it('antrenamentul de azi sau din viitor nu se numără', async () => {
    const ion = await membru('Ion', 200);
    const s = await antrenamente('09-07', '09-21', '09-28');
    await antrenament(AZI);
    await antrenament('2026-10-14');
    await da(s['09-07'], ion);
    expect(await candidati()).toEqual([]);
  });

  it('AE7: intrat de 2 săptămâni, fără „Da" → nu apare; organizatorul nu apare niciodată', async () => {
    await membru('Maria', 300, '2026-09-28');
    await membru('Roma', 900, '2026-01-01', true);
    await antrenamente('09-07', '09-14', '09-21', '09-28', '10-05');
    expect(await candidati()).toEqual([]);
  });

  it('fără „Da", socotit de la intrare: după 3 săptămâni cu antrenamente apare', async () => {
    const maria = await membru('Maria', 300, '2026-09-10');
    await antrenamente('09-14', '09-21', '09-28');
    const [c] = await candidati();
    expect(c).toMatchObject({ member_id: maria, weeks_missed: 3, last_yes: null, anchor_date: '2026-09-10' });
  });

  it('cine a ieșit sau a fost scos din grup nu apare', async () => {
    await membru('Ion', 200);
    await antrenamente('09-14', '09-21', '09-28');
    await db.query(`insert into public.telegram_group_memberships (telegram_user_id, chat_id, state) values (200, $1, 'left')`, [GRUP]);
    expect(await candidati()).toEqual([]);
  });
});

describe('ciclul de alertă', () => {
  const pregateste = async () => {
    const ion = await membru('Ion', 200);
    const s = await antrenamente('08-31', '09-07', '09-28', '10-05');
    await da(s['08-31'], ion);
    const [c] = await candidati();
    return { ion, s, ciclu: await deschide(c), c };
  };

  it('un membru cu ciclu activ nu reapare și nu primește al doilea ciclu', async () => {
    const { c } = await pregateste();
    expect(await candidati()).toEqual([]);
    expect(await deschide(c)).toBeNull();
    expect((await db.query(`select * from public.inactivity_reviews`)).rows).toHaveLength(1);
  });

  it('AE5: prima decizie câștigă, a doua întoarce decizia existentă', async () => {
    const { ciclu } = await pregateste();
    const prima = await decide(ciclu, 'kick', 'Vlad', 900);
    expect(prima.outcome).toBe('decided');
    expect(prima.review.status).toBe('kick_queued');
    const a_doua = await decide(ciclu, 'postpone', 'Roma', 901);
    expect(a_doua.outcome).toBe('already');
    expect(a_doua.review).toMatchObject({ status: 'kick_queued', decided_by_name: 'Vlad' });
    expect((await db.query(`select * from public.bot_actions where action = 'kick_member'`)).rows).toHaveLength(1);
  });

  it('Scoate valid pune exact o scoatere în coadă, legată de ciclu', async () => {
    const { ciclu, ion } = await pregateste();
    const d = await decide(ciclu, 'kick');
    const actiuni = (await db.query<{ id: string; member_id: string; payload: { chat_id: string } }>(
      `select id, member_id, payload from public.bot_actions`)).rows;
    expect(actiuni).toHaveLength(1);
    expect(actiuni[0]).toMatchObject({ id: d.review.bot_action_id, member_id: ion, payload: { chat_id: GRUP } });
  });

  it('AE6: Scoate după un „Da" nou → refuzat, fără scoatere în coadă', async () => {
    const { ciclu, ion, s } = await pregateste();
    await da(s['10-05'], ion);
    const d = await decide(ciclu, 'kick');
    expect(d).toMatchObject({ outcome: 'refused', review: { status: 'refused', result: 'returned' } });
    expect((await db.query(`select * from public.bot_actions`)).rows).toHaveLength(0);
  });

  it('Scoate pentru cine a ieșit între timp → refuzat', async () => {
    const { ciclu } = await pregateste();
    await db.query(`insert into public.telegram_group_memberships (telegram_user_id, chat_id, state) values (200, $1, 'left')`, [GRUP]);
    expect(await decide(ciclu, 'kick')).toMatchObject({ outcome: 'refused', review: { result: 'left' } });
  });

  it('o acțiune necunoscută e respinsă', async () => {
    const { ciclu } = await pregateste();
    await expect(decide(ciclu, 'ban')).rejects.toThrow('inactivity_bad_action');
  });

  it('AE3: amânarea expirată fără „Da" se redeschide; cu „Da" se închide ca revenit', async () => {
    const { ciclu, ion, s } = await pregateste();
    await decide(ciclu, 'postpone', 'Roma', 901);
    await db.query(`select public.inactivity_set_messages($1, '[{"chat_id":900,"message_id":5}]')`, [ciclu]);
    // Amânat luni la 18:00 (ora Chișinăului): revine în ziua termenului, la rularea de dimineață.
    await db.query(`update public.inactivity_reviews set snooze_until = '2026-10-19T15:00:00Z'`);
    expect(await intretinere('2026-10-18')).toEqual([]);

    const [redeschis] = await intretinere('2026-10-19');
    expect(redeschis.change).toBe('reopened');
    const rand = (await db.query<{ status: string; messages: unknown[] }>(`select status, messages from public.inactivity_reviews`)).rows[0];
    expect(rand).toEqual({ status: 'open', messages: [] });
    // Retrimiterea a eșuat: ciclul redeschis fără mesaje se poate renunța.
    await db.query(`select public.inactivity_discard($1)`, [ciclu]);
    expect((await db.query(`select * from public.inactivity_reviews`)).rows).toHaveLength(0);
    const [c] = await candidati();
    const ciclu2 = await deschide(c);

    await decide(ciclu2, 'postpone', 'Roma', 901);
    await da(s['10-05'], ion);
    const [revenit] = await intretinere();
    expect(revenit.change).toBe('returned');
  });

  it('cine a fost scos și reinvitat pornește de la zero, nu primește alertă a doua zi', async () => {
    const { ciclu } = await pregateste();
    const d = await decide(ciclu, 'kick');
    await db.query(`select public.inactivity_kick_result($1, true, 'Scos din grup.')`, [d.review.bot_action_id]);
    await db.query(`update public.inactivity_reviews set decided_at = '2026-10-12T08:00:00Z'`);
    // Reinvitat: din nou în grup, cu aceeași dată de intrare.
    expect(await candidati('2026-10-13')).toEqual([]);
    expect(await candidati('2026-10-26')).toEqual([]);
  });

  it('o scoatere încheiată în coadă fără raport se așază la întreținere', async () => {
    const { ciclu } = await pregateste();
    const d = await decide(ciclu, 'kick');
    await db.query(`update public.bot_actions set status = 'failed', result = 'Grupul s-a schimbat.' where id = $1`, [d.review.bot_action_id]);
    const [asezat] = await intretinere();
    expect(asezat.change).toBe('settled');
    const rand = (await db.query<{ status: string; result: string }>(`select status, result from public.inactivity_reviews`)).rows[0];
    expect(rand).toEqual({ status: 'kick_failed', result: 'Grupul s-a schimbat.' });
  });

  it('o scoatere pe care coada o refuză (membru devenit admin) e o decizie refuzată, nu o eroare', async () => {
    const { ciclu, ion } = await pregateste();
    await db.query(`update public.members set is_admin = true where id = $1`, [ion]);
    expect(await decide(ciclu, 'kick')).toMatchObject({ outcome: 'refused', review: { status: 'refused', result: 'membru_admin' } });
  });

  it('AE4: după Nu scoate, 2 săptămâni fără „Da" → nimic; a 3-a → alertă nouă', async () => {
    const { ciclu } = await pregateste();
    await decide(ciclu, 'keep');
    await db.query(`update public.inactivity_reviews set decided_at = '2026-10-12T08:00:00Z'`);
    // Săptămâna deciziei nu se numără; urmează două săptămâni cu antrenamente.
    await antrenament('2026-10-14');
    await antrenament('2026-10-21');
    await antrenament('2026-10-28');
    expect(await candidati('2026-11-02')).toEqual([]);
    await antrenament('2026-11-04');
    const [c] = await candidati('2026-11-09');
    expect(c).toMatchObject({ weeks_missed: 3, anchor_date: '2026-10-12' });
  });

  it('întreținerea închide ca „ieșit" cine nu mai e în grup și nu atinge scoaterile în coadă', async () => {
    const { ciclu } = await pregateste();
    await decide(ciclu, 'kick');
    await db.query(`insert into public.telegram_group_memberships (telegram_user_id, chat_id, state) values (200, $1, 'left')`, [GRUP]);
    expect(await intretinere()).toEqual([]);

    const maria = await membru('Maria', 300, '2026-09-01');
    const [c] = await candidati();
    expect(c.member_id).toBe(maria);
    await deschide(c);
    await db.query(`insert into public.telegram_group_memberships (telegram_user_id, chat_id, state) values (300, $1, 'kicked')`, [GRUP]);
    const [iesit] = await intretinere();
    expect(iesit.change).toBe('left');
  });

  it('rezultatul scoaterii ajunge pe ciclu; o scoatere fără ciclu întoarce null', async () => {
    const { ciclu } = await pregateste();
    const d = await decide(ciclu, 'kick');
    const r = (await db.query<{ r: { status: string; result: string; full_name: string } }>(
      `select public.inactivity_kick_result($1, true, 'Scos din grup.') r`, [d.review.bot_action_id])).rows[0].r;
    expect(r).toMatchObject({ status: 'kicked', result: 'Scos din grup.', full_name: 'Ion' });
    const fara = (await db.query<{ r: unknown }>(
      `select public.inactivity_kick_result(gen_random_uuid(), false, 'x') r`)).rows[0].r;
    expect(fara).toBeNull();
  });

  it('un ciclu fără niciun mesaj se poate renunța; unul cu mesaje rămâne', async () => {
    const { ciclu } = await pregateste();
    await db.query(`select public.inactivity_set_messages($1, '[{"chat_id":900,"message_id":5}]')`, [ciclu]);
    await db.query(`select public.inactivity_discard($1)`, [ciclu]);
    expect((await db.query(`select * from public.inactivity_reviews`)).rows).toHaveLength(1);
    await db.query(`select public.inactivity_set_messages($1, '[]')`, [ciclu]);
    await db.query(`select public.inactivity_discard($1)`, [ciclu]);
    expect((await db.query(`select * from public.inactivity_reviews`)).rows).toHaveLength(0);
  });
});

describe('drepturi', () => {
  it('anon și authenticated nu citesc ciclurile și nu cheamă funcțiile', async () => {
    for (const rol of ['anon', 'authenticated']) {
      await expect(caRol(db, rol, () => db.query(`select * from public.inactivity_reviews`))).rejects.toThrow(/permission denied/);
      await expect(caRol(db, rol, () => db.query(`select * from public.inactivity_candidates('2026-10-12')`))).rejects.toThrow(/permission denied/);
      await expect(caRol(db, rol, () => db.query(`select public.inactivity_decide(gen_random_uuid(), 'keep', 1, 'x', '-1')`))).rejects.toThrow(/permission denied/);
    }
  });
});

// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { porneste, reseteaza, caRol, ADMIN_TOKEN, type BazaTest } from './db';

/**
 * Antrenamentul săptămânii, în baza de date.
 *
 * Două reguli nu pot trăi în formular, pentru că formularul nu e singura cale
 * spre tabel:
 *
 *  • „pornit și gol" se refuză în RPC (KTD5). Altfel o scriere directă ar
 *    produce exact pagina publică goală pe care planul o interzice.
 *  • comutatorul peticește rândul publicat, iar doar editarea titlului sau a
 *    corpului scrie o versiune nouă (KTD9). Altfel o pornire-oprire dublă ar
 *    îngropa editarea reală sub patru rânduri identice, iar „Versiuni
 *    anterioare" ar deveni inutilizabil exact pentru ce există.
 *
 * Rulează pe instantaneul schemei din producție (vezi `db.ts`).
 */

let db: BazaTest;

beforeAll(async () => {
  db = await porneste();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(() => reseteaza(db));

const salveaza = async (titlu: string, corp: string, activ: boolean): Promise<string> => {
  const r = await db.query<{ admin_save_weekly_workout: string }>(
    `select runlift.admin_save_weekly_workout($1, $2, $3, $4)`,
    [ADMIN_TOKEN, titlu, corp, activ]
  );
  return r.rows[0].admin_save_weekly_workout;
};

type Versiune = { id: string; status: string; titlu: string; corp: string; activ: boolean };

const versiuni = async (): Promise<Versiune[]> =>
  (
    await db.query<Versiune>(`select * from runlift.admin_list_weekly_workout($1)`, [ADMIN_TOKEN])
  ).rows;

const vedePublicul = async (): Promise<{ titlu: string; corp: string } | null> =>
  (
    await db.query<{ public_weekly_workout: { titlu: string; corp: string } | null }>(
      `select runlift.public_weekly_workout()`
    )
  ).rows[0].public_weekly_workout;

describe('refuzul „pornit și gol"', () => {
  it('nu scrie nimic când comutatorul e pornit și corpul e gol', async () => {
    await expect(salveaza('Tempo', '', true)).rejects.toThrow(/workout_empty/);
    expect(await versiuni()).toHaveLength(0);
  });

  it('un corp din spații albe e tot gol', async () => {
    await expect(salveaza('Tempo', '   \n  ', true)).rejects.toThrow(/workout_empty/);
  });

  it('corp gol cu comutatorul oprit se acceptă — refuzul ține de comutator', async () => {
    await salveaza('Ciornă', '', false);
    expect(await versiuni()).toHaveLength(1);
  });
});

describe('versionarea', () => {
  it('a doua salvare cu corp schimbat împinge rândul precedent în „superseded"', async () => {
    await salveaza('Tempo', '5×1000m', true);
    await salveaza('Tempo', '6×1000m', true);

    const v = await versiuni();
    expect(v).toHaveLength(2);
    expect(v.filter((r) => r.status === 'published')).toHaveLength(1);
    expect(v.find((r) => r.status === 'published')!.corp).toBe('6×1000m');
  });

  it('o salvare care schimbă doar comutatorul peticește pe loc, fără versiune nouă', async () => {
    const id = await salveaza('Tempo', '5×1000m', true);
    const idDupa = await salveaza('Tempo', '5×1000m', false);

    expect(idDupa).toBe(id);
    expect(await versiuni()).toHaveLength(1);
  });

  it('pornirea și oprirea repetate nu cresc deloc lista de versiuni', async () => {
    await salveaza('Tempo', '5×1000m', true);
    await salveaza('Tempo', '5×1000m', false);
    await salveaza('Tempo', '5×1000m', true);
    await salveaza('Tempo', '5×1000m', false);

    expect(await versiuni()).toHaveLength(1);
  });

  it('revenirea la o versiune anterioară o republică și împinge curenta', async () => {
    const vechi = await salveaza('Tempo', '5×1000m', true);
    await salveaza('Fartlek', '8×400m', true);

    await db.query(`select runlift.admin_restore_weekly_workout($1, $2)`, [ADMIN_TOKEN, vechi]);

    const v = await versiuni();
    expect(v.filter((r) => r.status === 'published')).toHaveLength(1);
    expect(v.find((r) => r.status === 'published')!.id).toBe(vechi);
    expect((await vedePublicul())!.corp).toBe('5×1000m');
  });

  it('revenirea la un id inexistent e refuzată', async () => {
    await expect(
      db.query(`select runlift.admin_restore_weekly_workout($1, $2)`, [
        ADMIN_TOKEN,
        '99999999-9999-9999-9999-999999999999',
      ])
    ).rejects.toThrow(/not_found/);
  });
});

describe('ce vede publicul', () => {
  it('întoarce titlul și corpul rândului publicat și activ', async () => {
    await salveaza('Tempo', '5×1000m', true);
    expect(await vedePublicul()).toEqual({ titlu: 'Tempo', corp: '5×1000m' });
  });

  it('cu antrenamentul oprit nu scurge nici titlul, nici corpul', async () => {
    await salveaza('Tempo', '5×1000m', true);
    await salveaza('Tempo', '5×1000m', false);

    expect(await vedePublicul()).toBeNull();
  });

  it('fără niciun antrenament salvat întoarce nimic', async () => {
    expect(await vedePublicul()).toBeNull();
  });

  it('nu întoarce niciodată o versiune înlocuită', async () => {
    await salveaza('Tempo', '5×1000m', true);
    await salveaza('Fartlek', '8×400m', true);

    expect((await vedePublicul())!.titlu).toBe('Fartlek');
  });

  it('e apelabilă de rolul anon', async () => {
    await salveaza('Tempo', '5×1000m', true);
    const r = await caRol(db, 'anon', () =>
      db.query<{ public_weekly_workout: { titlu: string } | null }>(
        `select runlift.public_weekly_workout()`
      )
    );
    expect(r.rows[0].public_weekly_workout!.titlu).toBe('Tempo');
  });
});

describe('accesul direct la tabel', () => {
  it('`anon` nu poate citi rândurile, nici pe cel publicat', async () => {
    await salveaza('Tempo', '5×1000m', true);

    // Tabelul n-are `grant select` deloc, deci refuzul vine înaintea RLS-ului.
    // E cu un strat mai devreme decât la `event_config`, care dă lista goală —
    // ambele ascund rândurile, dar aici nici privilegiul nu există.
    await expect(
      caRol(db, 'anon', () => db.query(`select titlu, corp from runlift.weekly_workout`))
    ).rejects.toThrow(/permission denied/);
  });
});

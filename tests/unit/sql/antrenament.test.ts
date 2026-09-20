// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { porneste, reseteaza, caRol, ADMIN_TOKEN, type BazaTest } from './db';

/**
 * Programul antrenamentelor, în baza de date.
 *
 * Patru reguli nu pot trăi în formular, pentru că formularul nu e singura cale
 * spre tabel:
 *
 *  • „vizibil și gol" se refuză în RPC. Altfel o scriere directă ar produce o
 *    săptămână goală la un URL pe care organizatorul tocmai l-a trimis.
 *  • comutatorul de vizibilitate peticește rândul publicat, iar doar editarea
 *    titlului sau a corpului scrie o versiune nouă. Altfel o pornire-oprire
 *    dublă ar îngropa editarea reală sub patru rânduri identice.
 *  • numerele rămân 1…N fără goluri după orice mutare sau ștergere.
 *  • renumerotarea nu se poate ciocni de ea însăși. Indexul de unicitate e
 *    PARȚIAL, deci nu poate fi `deferrable`, iar verificarea se face rând cu
 *    rând. Măsurat pe instantaneu: schimbul dintr-un singur `update … case`
 *    pică cu „duplicate key", la fel orice `numar + 1` pe mai multe rânduri;
 *    `numar - 1` trece, dar doar fiindcă inserările lasă rândurile în ordine
 *    fizică crescătoare — o coincidență, nu o garanție. De asta ambele
 *    operații trec prin intervalul-tampon negativ.
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

/** Săptămână nouă: `p_id` null, numărul îl pune serverul. */
const adauga = async (titlu: string, corp: string, vizibil: boolean): Promise<string> => {
  const r = await db.query<{ admin_save_weekly_workout: string }>(
    `select runlift.admin_save_weekly_workout($1, null, $2, $3, $4)`,
    [ADMIN_TOKEN, titlu, corp, vizibil]
  );
  return r.rows[0].admin_save_weekly_workout;
};

/** Editarea unei săptămâni existente, prin id-ul rândului ei publicat. */
const editeaza = async (
  id: string,
  titlu: string,
  corp: string,
  vizibil: boolean
): Promise<string> => {
  const r = await db.query<{ admin_save_weekly_workout: string }>(
    `select runlift.admin_save_weekly_workout($1, $2, $3, $4, $5)`,
    [ADMIN_TOKEN, id, titlu, corp, vizibil]
  );
  return r.rows[0].admin_save_weekly_workout;
};

const muta = async (id: string, directie: -1 | 1): Promise<number> => {
  const r = await db.query<{ admin_move_weekly_workout: number }>(
    `select runlift.admin_move_weekly_workout($1, $2, $3)`,
    [ADMIN_TOKEN, id, directie]
  );
  return r.rows[0].admin_move_weekly_workout;
};

const sterge = async (id: string): Promise<number> => {
  const r = await db.query<{ admin_delete_weekly_workout: number }>(
    `select runlift.admin_delete_weekly_workout($1, $2)`,
    [ADMIN_TOKEN, id]
  );
  return r.rows[0].admin_delete_weekly_workout;
};

type Rand = {
  id: string;
  numar: number;
  status: string;
  titlu: string;
  corp: string;
  vizibil: boolean;
};

const randuri = async (): Promise<Rand[]> =>
  (await db.query<Rand>(`select * from runlift.admin_list_weekly_workout($1)`, [ADMIN_TOKEN])).rows;

/** Doar săptămânile, fără versiunile lor înlocuite. */
const program = async (): Promise<Rand[]> =>
  (await randuri()).filter((r) => r.status === 'published').sort((a, b) => a.numar - b.numar);

type SaptamanaPublica = { numar: number; titlu: string; corp: string };

const vedePublicul = async (): Promise<SaptamanaPublica[]> =>
  (
    await db.query<{ public_weekly_workouts: SaptamanaPublica[] }>(
      `select runlift.public_weekly_workouts()`
    )
  ).rows[0].public_weekly_workouts;

/** Programul, ca „1:Titlu, 2:Titlu" — citibil când o aserțiune cade. */
const schita = async (): Promise<string> =>
  (await program()).map((r) => `${r.numar}:${r.titlu}`).join(', ');

/** Un program de N săptămâni, toate vizibile, cu titluri S1…SN. */
const programDe = async (n: number): Promise<string[]> => {
  const ids: string[] = [];
  for (let i = 1; i <= n; i++) ids.push(await adauga(`S${i}`, `corp ${i}`, true));
  return ids;
};

describe('numerotarea automată', () => {
  it('fiecare săptămână nouă primește numărul următor', async () => {
    await programDe(3);
    expect(await schita()).toBe('1:S1, 2:S2, 3:S3');
  });

  it('prima săptămână dintr-un program gol e 1, nu 0', async () => {
    await adauga('S1', 'corp', true);
    expect((await program())[0].numar).toBe(1);
  });

  it('editarea unei săptămâni nu adaugă una nouă și nu-i schimbă numărul', async () => {
    const ids = await programDe(3);
    await editeaza(ids[1], 'S2 corectat', 'corp nou', true);

    expect(await schita()).toBe('1:S1, 2:S2 corectat, 3:S3');
  });

  it('editarea cere id-ul rândului PUBLICAT, nu al unei versiuni', async () => {
    const id = await adauga('S1', 'corp', true);
    await editeaza(id, 'S1', 'corp nou', true);

    // `id` e acum `superseded`: a doua editare pe el trebuie refuzată, ca un
    // ecran rămas în urmă să nu învie o versiune peste cea curentă.
    await expect(editeaza(id, 'S1', 'si mai nou', true)).rejects.toThrow(/not_found/);
  });
});

describe('refuzul „vizibil și gol"', () => {
  it('nu scrie nimic când săptămâna e vizibilă și corpul e gol', async () => {
    await expect(adauga('Tempo', '', true)).rejects.toThrow(/workout_empty/);
    expect(await randuri()).toHaveLength(0);
  });

  it('un corp din spații albe e tot gol', async () => {
    await expect(adauga('Tempo', '   \n  ', true)).rejects.toThrow(/workout_empty/);
  });

  it('corp gol cu săptămâna ascunsă se acceptă — refuzul ține de vizibilitate', async () => {
    await adauga('Ciornă', '', false);
    expect(await randuri()).toHaveLength(1);
  });
});

describe('versionarea, per săptămână', () => {
  it('editarea corpului împinge rândul precedent în „superseded", pe același număr', async () => {
    const id = await adauga('Tempo', '5×1000m', true);
    await editeaza(id, 'Tempo', '6×1000m', true);

    const toate = await randuri();
    expect(toate).toHaveLength(2);
    expect(toate.every((r) => r.numar === 1)).toBe(true);
    expect(toate.filter((r) => r.status === 'published')).toHaveLength(1);
    expect(toate.find((r) => r.status === 'published')!.corp).toBe('6×1000m');
  });

  it('o editare care schimbă doar vizibilitatea peticește pe loc, fără versiune nouă', async () => {
    const id = await adauga('Tempo', '5×1000m', true);
    const idDupa = await editeaza(id, 'Tempo', '5×1000m', false);

    expect(idDupa).toBe(id);
    expect(await randuri()).toHaveLength(1);
  });

  it('ascunderea și arătarea repetate nu cresc deloc lista de versiuni', async () => {
    const id = await adauga('Tempo', '5×1000m', true);
    await editeaza(id, 'Tempo', '5×1000m', false);
    await editeaza(id, 'Tempo', '5×1000m', true);
    await editeaza(id, 'Tempo', '5×1000m', false);

    expect(await randuri()).toHaveLength(1);
  });

  it('revenirea republică versiunea aleasă, fără să clintească restul programului', async () => {
    const ids = await programDe(3);
    const vechi = ids[1];
    await editeaza(vechi, 'S2', 'corp rescris', true);

    await db.query(`select runlift.admin_restore_weekly_workout($1, $2)`, [ADMIN_TOKEN, vechi]);

    expect(await schita()).toBe('1:S1, 2:S2, 3:S3');
    expect((await program())[1].id).toBe(vechi);
    expect((await program())[1].corp).toBe('corp 2');
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

describe('ordinea programului', () => {
  it('mutarea în sus schimbă săptămâna cu vecina de deasupra', async () => {
    const ids = await programDe(4);
    expect(await muta(ids[2], -1)).toBe(2);

    expect(await schita()).toBe('1:S1, 2:S3, 3:S2, 4:S4');
  });

  it('mutarea în jos schimbă săptămâna cu vecina de dedesubt', async () => {
    const ids = await programDe(4);
    expect(await muta(ids[0], 1)).toBe(2);

    expect(await schita()).toBe('1:S2, 2:S1, 3:S3, 4:S4');
  });

  it('mutarea versiunilor urmează săptămâna lor', async () => {
    const ids = await programDe(3);
    await editeaza(ids[2], 'S3', 'corp rescris', true);
    const publicat = (await program())[2];

    await muta(publicat.id, -1);

    // Ambele rânduri ale fostei săptămâni 3 poartă acum numărul 2.
    const aleEi = (await randuri()).filter((r) => r.titlu === 'S3');
    expect(aleEi).toHaveLength(2);
    expect(aleEi.every((r) => r.numar === 2)).toBe(true);
  });

  it('la capăt de program nu se întâmplă nimic, și nu e o eroare', async () => {
    const ids = await programDe(3);

    expect(await muta(ids[0], -1)).toBe(1);
    expect(await muta(ids[2], 1)).toBe(3);
    expect(await schita()).toBe('1:S1, 2:S2, 3:S3');
  });

  it('o direcție care nu e -1 sau 1 e refuzată', async () => {
    const ids = await programDe(2);
    await expect(
      db.query(`select runlift.admin_move_weekly_workout($1, $2, $3)`, [ADMIN_TOKEN, ids[0], 2])
    ).rejects.toThrow(/directie_invalida/);
  });

  it('mutarea unui id inexistent e refuzată', async () => {
    await expect(
      db.query(`select runlift.admin_move_weekly_workout($1, $2, $3)`, [
        ADMIN_TOKEN,
        '99999999-9999-9999-9999-999999999999',
        -1,
      ])
    ).rejects.toThrow(/not_found/);
  });
});

describe('ștergerea', () => {
  it('scoate săptămâna și compactează numerele de după', async () => {
    const ids = await programDe(4);
    expect(await sterge(ids[1])).toBe(2);

    expect(await schita()).toBe('1:S1, 2:S3, 3:S4');
  });

  it('duce cu ea și versiunile săptămânii', async () => {
    const ids = await programDe(3);
    await editeaza(ids[1], 'S2', 'corp rescris', true);
    const publicat = (await program())[1];

    await sterge(publicat.id);

    expect((await randuri()).filter((r) => r.titlu === 'S2')).toHaveLength(0);
  });

  it('ștergerea ultimei săptămâni nu lasă goluri', async () => {
    const ids = await programDe(3);
    await sterge(ids[2]);

    expect(await schita()).toBe('1:S1, 2:S2');
  });

  it('ștergerea singurei săptămâni golește programul', async () => {
    const ids = await programDe(1);
    await sterge(ids[0]);

    expect(await program()).toHaveLength(0);
  });

  it('ștergerea unui id inexistent e refuzată', async () => {
    await expect(
      db.query(`select runlift.admin_delete_weekly_workout($1, $2)`, [
        ADMIN_TOKEN,
        '99999999-9999-9999-9999-999999999999',
      ])
    ).rejects.toThrow(/not_found/);
  });
});

describe('renumerotarea nu se auto-lovește', () => {
  /**
   * Gărzile pentru capcana din KTD12. Indexul unic e PARȚIAL, deci Postgres nu
   * poate amâna verificarea: un `update` care mută mai multe numere deodată se
   * poate ciocni de el însuși, în funcție de ordinea fizică a rândurilor.
   *
   * De asta programele de aici sunt lungi și mutările multe — pe trei săptămâni,
   * și implementarea naivă trece.
   */

  it('mută fiecare săptămână în sus, de la capăt, pe un program de opt', async () => {
    await programDe(8);

    for (let poz = 8; poz >= 2; poz--) {
      const p = await program();
      await muta(p[poz - 1].id, -1);
    }

    // Ultima a urcat până în față; restul au coborât cu unu.
    expect(await schita()).toBe('1:S8, 2:S1, 3:S2, 4:S3, 5:S4, 6:S5, 7:S6, 8:S7');
  });

  it('șterge prima săptămână la rând, pe un program de opt', async () => {
    await programDe(8);

    for (let ramase = 8; ramase >= 1; ramase--) {
      const p = await program();
      expect(p.map((r) => r.numar)).toEqual(
        Array.from({ length: ramase }, (_, i) => i + 1)
      );
      await sterge(p[0].id);
    }

    expect(await program()).toHaveLength(0);
  });

  it('mutări și ștergeri amestecate lasă tot 1…N', async () => {
    await programDe(6);

    let p = await program();
    await muta(p[5].id, -1);
    p = await program();
    await sterge(p[0].id);
    p = await program();
    await muta(p[0].id, 1);
    p = await program();
    await sterge(p[4].id);

    const numere = (await program()).map((r) => r.numar);
    expect(numere).toEqual([1, 2, 3, 4]);
  });
});

describe('ce vede publicul', () => {
  it('întoarce programul vizibil, crescător, cu numere', async () => {
    await programDe(3);

    expect(await vedePublicul()).toEqual([
      { numar: 1, titlu: 'S1', corp: 'corp 1' },
      { numar: 2, titlu: 'S2', corp: 'corp 2' },
      { numar: 3, titlu: 'S3', corp: 'corp 3' },
    ]);
  });

  it('o săptămână ascunsă lipsește, iar numerele NU se recalculează', async () => {
    const ids = await programDe(4);
    await editeaza(ids[2], 'S3', 'corp 3', false);

    expect((await vedePublicul()).map((s) => s.numar)).toEqual([1, 2, 4]);
  });

  it('fără nicio săptămână vizibilă întoarce array gol, nu null', async () => {
    await adauga('Ciornă', 'corp', false);
    expect(await vedePublicul()).toEqual([]);
  });

  it('fără niciun antrenament salvat întoarce array gol, nu null', async () => {
    expect(await vedePublicul()).toEqual([]);
  });

  it('nu întoarce niciodată o versiune înlocuită', async () => {
    const id = await adauga('Tempo', '5×1000m', true);
    await editeaza(id, 'Fartlek', '8×400m', true);

    expect(await vedePublicul()).toEqual([{ numar: 1, titlu: 'Fartlek', corp: '8×400m' }]);
  });

  it('e apelabilă de rolul anon', async () => {
    await adauga('Tempo', '5×1000m', true);
    const r = await caRol(db, 'anon', () =>
      db.query<{ public_weekly_workouts: SaptamanaPublica[] }>(
        `select runlift.public_weekly_workouts()`
      )
    );
    expect(r.rows[0].public_weekly_workouts[0].titlu).toBe('Tempo');
  });
});

describe('accesul direct la tabel', () => {
  it('`anon` nu poate citi rândurile, nici pe cele publicate', async () => {
    await adauga('Tempo', '5×1000m', true);

    // Tabelul n-are `grant select` deloc, deci refuzul vine înaintea RLS-ului.
    await expect(
      caRol(db, 'anon', () => db.query(`select titlu, corp from runlift.weekly_workout`))
    ).rejects.toThrow(/permission denied/);
  });
});

describe('tokenul', () => {
  const FALS = '99999999-9999-9999-9999-999999999999';

  it('fiecare RPC de admin refuză un token inventat, fără să scrie nimic', async () => {
    const id = await adauga('Tempo', '5×1000m', true);

    const apeluri: [string, unknown[]][] = [
      ['runlift.admin_save_weekly_workout($1, null, $2, $3, $4)', [FALS, 'X', 'Y', true]],
      ['runlift.admin_list_weekly_workout($1)', [FALS]],
      ['runlift.admin_move_weekly_workout($1, $2, $3)', [FALS, id, -1]],
      ['runlift.admin_delete_weekly_workout($1, $2)', [FALS, id]],
      ['runlift.admin_restore_weekly_workout($1, $2)', [FALS, id]],
    ];

    for (const [apel, parametri] of apeluri) {
      await expect(db.query(`select ${apel}`, parametri)).rejects.toThrow(/invalid_token/);
    }

    expect(await randuri()).toHaveLength(1);
  });
});

describe('catalogul', () => {
  it('nu există două variante de `admin_save_weekly_workout`', async () => {
    // `create or replace` nu înlocuiește o funcție cu altă semnătură — o
    // suprasolicită. Cu două variante în catalog, PostgREST ar putea alege alta
    // decât cea vrută.
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'runlift' and p.proname = 'admin_save_weekly_workout'`
    );
    expect(r.rows[0].n).toBe(1);
  });

  it('funcția publică la singular nu mai există', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'runlift' and p.proname = 'public_weekly_workout'`
    );
    expect(r.rows[0].n).toBe(0);
  });
});

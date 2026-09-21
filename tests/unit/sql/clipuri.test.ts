// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { porneste, reseteaza, caRol, ADMIN_TOKEN, type BazaTest } from './db';

/**
 * Banda cu clipuri de antrenament, în baza de date.
 *
 * Trei reguli nu pot trăi în formular, pentru că formularul nu e singura cale
 * spre tabel:
 *
 *  • forma identificatorului YouTube se verifică în constrângere. Fără ea, o
 *    scriere directă ar putea pune un `src` arbitrar în pagina publică — exact
 *    genul de lucru pe care CSP-ul nu-l mai poate opri, fiindcă gazda video e
 *    acum permisă.
 *  • linkul de sub card rămâne Instagram, curat, fără coadă de parametri. Asta
 *    n-a fost atinsă de mutarea găzduirii și se păzește mai departe.
 *  • un clip o singură dată în bandă, iar numerele rămân 1…N fără goluri după
 *    orice mutare sau ștergere.
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

const URL_OK = 'https://www.instagram.com/reel/ABC12345/';

/** Clip nou: `p_id` null, numărul îl pune serverul. */
const adauga = async (
  youtube: string,
  caption = 'Marți în parc',
  url = URL_OK,
  vizibil = true
): Promise<string> => {
  const r = await db.query<{ admin_save_training_reel: string }>(
    `select runlift.admin_save_training_reel($1, null, $2, $3, $4, $5)`,
    [ADMIN_TOKEN, youtube, caption, url, vizibil]
  );
  return r.rows[0].admin_save_training_reel;
};

const muta = async (id: string, directie: -1 | 1): Promise<number> => {
  const r = await db.query<{ admin_move_training_reel: number }>(
    `select runlift.admin_move_training_reel($1, $2, $3)`,
    [ADMIN_TOKEN, id, directie]
  );
  return r.rows[0].admin_move_training_reel;
};

const sterge = async (id: string): Promise<number> => {
  const r = await db.query<{ admin_delete_training_reel: number }>(
    `select runlift.admin_delete_training_reel($1, $2)`,
    [ADMIN_TOKEN, id]
  );
  return r.rows[0].admin_delete_training_reel;
};

/** Banda publică, exact cum o primește pagina. */
type ClipPublic = { youtube: string; caption: string; url: string };
const banda = async (): Promise<ClipPublic[]> => {
  const r = await db.query<{ public_training_reels: ClipPublic[] }>(
    `select runlift.public_training_reels()`
  );
  return r.rows[0].public_training_reels;
};

const numere = async (): Promise<number[]> => {
  const r = await db.query<{ numar: number }>(
    `select numar from runlift.training_reels order by numar`
  );
  return r.rows.map((x) => x.numar);
};

describe('forma identificatorului', () => {
  it('unsprezece caractere din alfabetul YouTube intră', async () => {
    await expect(adauga('dQw4w9WgXcQ')).resolves.toEqual(expect.any(String));
    await expect(adauga('_-Ab0123456')).resolves.toEqual(expect.any(String));
  });

  it('o cale de fișier — forma veche — e respinsă', async () => {
    await expect(adauga('/reels/marti.mp4')).rejects.toThrow(/training_reels_youtube_ok/);
  });

  it('un link întreg e respins: în coloană stă identificatorul, nu adresa', async () => {
    await expect(adauga('https://youtu.be/dQw4w9WgXcQ')).rejects.toThrow(
      /training_reels_youtube_ok/
    );
  });

  it('lungimea greșită e respinsă în ambele direcții', async () => {
    await expect(adauga('dQw4w9WgXc')).rejects.toThrow(/training_reels_youtube_ok/);
    await expect(adauga('dQw4w9WgXcQQ')).rejects.toThrow(/training_reels_youtube_ok/);
  });

  it('același clip nu intră de două ori în bandă', async () => {
    await adauga('dQw4w9WgXcQ');
    await expect(adauga('dQw4w9WgXcQ')).rejects.toThrow(/training_reels_un_youtube/);
  });
});

describe('legenda și linkul', () => {
  it('legenda goală e respinsă — e tot ce primește un cititor de ecran', async () => {
    await expect(adauga('dQw4w9WgXcQ', '   ')).rejects.toThrow(/training_reels_caption_ok/);
  });

  it('linkul rămâne Instagram, chiar dacă găzduirea e YouTube', async () => {
    await expect(
      adauga('dQw4w9WgXcQ', 'Marți în parc', 'https://www.youtube.com/shorts/dQw4w9WgXcQ')
    ).rejects.toThrow(/training_reels_url_ok/);
  });

  it('un link Instagram cu coadă de parametri e respins', async () => {
    await expect(
      adauga('dQw4w9WgXcQ', 'Marți în parc', 'https://www.instagram.com/reel/ABC12345/?igsh=xyz')
    ).rejects.toThrow(/training_reels_url_ok/);
  });
});

describe('banda publică', () => {
  it('întoarce identificatorul, legenda și linkul — nimic altceva', async () => {
    await adauga('dQw4w9WgXcQ', 'Marți în parc');
    const lista = await banda();
    expect(lista).toHaveLength(1);
    expect(Object.keys(lista[0]).sort()).toEqual(['caption', 'url', 'youtube']);
    expect(lista[0].youtube).toBe('dQw4w9WgXcQ');
  });

  it('clipurile ascunse nu ies niciodată', async () => {
    await adauga('dQw4w9WgXcQ', 'Se vede');
    await adauga('_-Ab0123456', 'Ascuns', URL_OK, false);
    const lista = await banda();
    expect(lista.map((c) => c.caption)).toEqual(['Se vede']);
  });

  it('banda goală e o listă goală, nu null', async () => {
    expect(await banda()).toEqual([]);
  });

  it('ordinea din bandă e ordinea numerelor', async () => {
    const unu = await adauga('dQw4w9WgXcQ', 'Unu');
    await adauga('_-Ab0123456', 'Doi');
    await muta(unu, 1);
    expect((await banda()).map((c) => c.caption)).toEqual(['Doi', 'Unu']);
  });

  it('e citibilă cu cheia publicabilă, iar tabelul nu', async () => {
    await adauga('dQw4w9WgXcQ');
    await caRol(db, 'anon', async () => {
      const r = await db.query<{ public_training_reels: ClipPublic[] }>(
        `select runlift.public_training_reels()`
      );
      expect(r.rows[0].public_training_reels).toHaveLength(1);
      await expect(db.query(`select * from runlift.training_reels`)).rejects.toThrow();
    });
  });
});

describe('ordinea rămâne 1…N', () => {
  it('ștergerea din mijloc compactează numerele', async () => {
    await adauga('dQw4w9WgXcQ', 'Unu');
    const doi = await adauga('_-Ab0123456', 'Doi');
    await adauga('ZZZZ9999888', 'Trei');
    await sterge(doi);
    expect(await numere()).toEqual([1, 2]);
  });

  it('mutarea la capăt de bandă nu e o eroare', async () => {
    const unu = await adauga('dQw4w9WgXcQ', 'Unu');
    expect(await muta(unu, -1)).toBe(1);
    expect(await numere()).toEqual([1]);
  });
});

describe('tokenul', () => {
  it('fără token valid, nimic nu se salvează', async () => {
    await expect(
      db.query(
        `select runlift.admin_save_training_reel($1, null, $2, $3, $4, true)`,
        ['00000000-0000-0000-0000-000000000000', 'dQw4w9WgXcQ', 'Marți', URL_OK]
      )
    ).rejects.toThrow(/invalid_token/);
  });
});

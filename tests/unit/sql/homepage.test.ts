// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { porneste, reseteaza, caRol, ADMIN_TOKEN, type BazaTest } from './db';

/**
 * Ordinea de pe ecranul dintre ediții și locul antrenamentelor, în baza de date.
 *
 * `public_homepage()` e singura cale prin care site-ul le află, deci trebuie să
 * răspundă și fără rând de setări (implicitul: antrenamentul primul) și să ia
 * locul exact de unde îl ia botul, `public.bot_config`. Comutatorul e un gest al
 * operatorului: cere token și lasă urmă în `admin_events`.
 *
 * Rulează pe instantaneul schemei din producție (vezi `db.ts`).
 */

type Homepage = { trial_first: boolean; training_location: string | null };

let db: BazaTest;

beforeAll(async () => {
  db = await porneste();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(() => reseteaza(db));

const citeste = async (): Promise<Homepage> =>
  caRol(db, 'anon', async () => {
    const r = await db.query<{ public_homepage: Homepage }>('select runlift.public_homepage()');
    return r.rows[0].public_homepage;
  });

const comuta = (trialFirst: boolean, token = ADMIN_TOKEN) =>
  caRol(db, 'anon', () =>
    db.query('select runlift.admin_set_homepage_order($1, $2)', [token, trialFirst])
  );

describe('public_homepage', () => {
  it('fără setări și fără configul botului: antrenamentul primul, fără loc', async () => {
    expect(await citeste()).toEqual({ trial_first: false, training_location: null });
  });

  it('locul vine din configul botului, schimbat acolo se vede imediat', async () => {
    await db.exec(`insert into public.bot_config (id, location) values (1, 'Parcul Dumitru Râșcanu')`);
    expect((await citeste()).training_location).toBe('Parcul Dumitru Râșcanu');

    await db.exec(`update public.bot_config set location = 'Sala Ironworks, str. Ion Creangă' where id = 1`);
    expect((await citeste()).training_location).toBe('Sala Ironworks, str. Ion Creangă');
  });

  it('anon nu citește și nu scrie tabelul direct, doar prin funcție', async () => {
    await expect(
      caRol(db, 'anon', () => db.query('select * from runlift.homepage_settings'))
    ).rejects.toThrow();
    await expect(
      caRol(db, 'anon', () =>
        db.query('insert into runlift.homepage_settings (id, trial_first) values (1, true)')
      )
    ).rejects.toThrow();
  });
});

describe('admin_set_homepage_order', () => {
  it('cu token valid schimbă ordinea și lasă urmă în admin_events', async () => {
    await comuta(true);
    expect((await citeste()).trial_first).toBe(true);

    const ev = await db.query<{ detaliu: { trial_first: boolean } }>(
      `select detaliu from runlift.admin_events where tip = 'homepage_order_set'`
    );
    expect(ev.rows).toEqual([{ detaliu: { trial_first: true } }]);

    await comuta(false);
    expect((await citeste()).trial_first).toBe(false);
  });

  it('cu token invalid refuză și nu schimbă nimic', async () => {
    await expect(comuta(true, '22222222-2222-2222-2222-222222222222')).rejects.toThrow(
      /invalid_token/
    );
    expect((await citeste()).trial_first).toBe(false);
  });

  it('fără ordine (null) refuză și nu schimbă nimic', async () => {
    await expect(
      caRol(db, 'anon', () => db.query('select runlift.admin_set_homepage_order($1, null)', [ADMIN_TOKEN]))
    ).rejects.toThrow(/config_invalid/);
    expect((await citeste()).trial_first).toBe(false);
  });

  it('migrarea rulată din nou nu resetează ordinea aleasă', async () => {
    await comuta(true);
    const migrare = readFileSync(
      resolve(__dirname, '../../../supabase/sql/supabase-migration-homepage-ordine-locatie.sql'),
      'utf8'
    );
    await db.exec(migrare);
    expect((await citeste()).trial_first).toBe(true);
  });
});

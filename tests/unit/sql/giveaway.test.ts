// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { porneste, reseteaza, caRol, ADMIN_TOKEN, type BazaTest } from './db';

/**
 * Giveaway-ul, în baza de date.
 *
 * Aici stau regulile pe care nimeni nu le poate ocoli din browser: perioada,
 * o singură participare de persoană, extragerea și încheierea. Pagina publică
 * și funcția Edge doar le ascultă.
 *
 * Planul: docs/plans/2026-11-14-0736-feat-giveaway-instagram-plan.md (U1, U2).
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

type Perioada = 'programat' | 'deschis' | 'inchis';

const INTERVALE: Record<Perioada, [string, string]> = {
  programat: [`now() + interval '1 day'`, `now() + interval '2 days'`],
  deschis: [`now() - interval '1 day'`, `now() + interval '1 day'`],
  inchis: [`now() - interval '3 days'`, `now() - interval '2 days'`],
};

const giveaway = async (slug: string, perioada: Perioada): Promise<string> => {
  const [start, end] = INTERVALE[perioada];
  const r = await db.query<{ id: string }>(
    `insert into runlift.giveaways (slug, titlu, starts_at, ends_at)
     values ($1, $2, ${start}, ${end}) returning id`,
    [slug, `Giveaway ${slug}`]
  );
  return r.rows[0].id;
};

/** Mută sfârșitul în trecut: înscrierile s-au făcut cât era deschis. */
const inchide = (id: string) =>
  db.query(
    `update runlift.giveaways
        set starts_at = now() - interval '2 days', ends_at = now() - interval '1 minute'
      where id = $1`,
    [id]
  );

type Participare = {
  nume?: string;
  telefon?: string;
  email?: string;
  instagram?: string;
  acord_contact?: boolean;
  giveaway_id?: string;
};

let contor = 0;

/** Înscrie pe calea funcției Edge: rolul `service_role`, fără `returning`. */
const inscrie = async (p: Participare = {}): Promise<string> => {
  contor++;
  const email = p.email ?? `om${contor}@exemplu.ro`;
  const valori = [
    p.nume ?? `Participant ${contor}`,
    p.telefon ?? `0690000${String(contor).padStart(2, '0')}`,
    email,
    p.instagram ?? `cont.${contor}`,
    p.acord_contact ?? false,
  ];
  await caRol(db, 'service_role', () =>
    p.giveaway_id
      ? db.query(
          `insert into runlift.giveaway_entries
             (nume, telefon, email, instagram, acord_regulament, acord_contact, giveaway_id)
           values ($1, $2, $3, $4, true, $5, $6)`,
          [...valori, p.giveaway_id]
        )
      : db.query(
          `insert into runlift.giveaway_entries
             (nume, telefon, email, instagram, acord_regulament, acord_contact)
           values ($1, $2, $3, $4, true, $5)`,
          valori
        )
  );
  const r = await db.query<{ id: string }>(
    `select id from runlift.giveaway_entries where lower(email) = lower($1)
      order by created_at desc limit 1`,
    [email]
  );
  return r.rows[0].id;
};

type Public = { slug: string; starts_at: string; ends_at: string; stare: string } | null;

const citestePublic = async (): Promise<Public> =>
  caRol(db, 'anon', async () => {
    const r = await db.query<{ g: Public }>('select runlift.public_giveaway() g');
    return r.rows[0].g;
  });

type RandAdmin = {
  id: string;
  nume: string;
  telefon: string;
  email: string;
  instagram: string;
  acord_contact: boolean;
  created_at: string;
  extrasa_la: string | null;
  inlocuita_la: string | null;
};

type DateAdmin = {
  giveaways: { id: string; slug: string; titlu: string; stare: string }[];
  giveaway: {
    id: string;
    slug: string;
    stare: string;
    castigator: { nume: string; instagram: string; extras_la: string; confirmat_la: string } | null;
    incheiat_la: string | null;
    total_participari: number | null;
  } | null;
  participari: RandAdmin[];
};

const rpc = <T>(sql: string, params: unknown[]) => caRol(db, 'anon', () => db.query<T>(sql, params));

const date = async (id: string | null = null, token = ADMIN_TOKEN): Promise<DateAdmin> =>
  (await rpc<{ d: DateAdmin }>('select runlift.admin_giveaway_date($1, $2) d', [token, id])).rows[0].d;

const sterge = (id: string, token = ADMIN_TOKEN) =>
  rpc('select runlift.admin_giveaway_sterge($1, $2)', [token, id]);

const extrage = async (g: string, token = ADMIN_TOKEN): Promise<string> =>
  (await rpc<{ id: string }>('select runlift.admin_giveaway_extrage($1, $2) id', [token, g])).rows[0].id;

const confirma = (g: string, token = ADMIN_TOKEN) =>
  rpc('select runlift.admin_giveaway_confirma($1, $2)', [token, g]);

const incheie = async (g: string, token = ADMIN_TOKEN): Promise<number> =>
  (await rpc<{ n: number }>('select runlift.admin_giveaway_incheie($1, $2) n', [token, g])).rows[0].n;

const jurnal = async () =>
  (
    await db.query<{ tip: string; detaliu: Record<string, unknown> }>(
      `select tip, detaliu from runlift.admin_events where tip like 'giveaway\\_%' order by created_at`
    )
  ).rows;

const TOKEN_INVENTAT = '99999999-9999-9999-9999-999999999999';

describe('public_giveaway', () => {
  it('fără niciun giveaway întoarce null', async () => {
    expect(await citestePublic()).toBeNull();
  });

  it.each(['programat', 'deschis', 'inchis'] as const)('un giveaway %s apare cu starea lui', async (perioada) => {
    await giveaway('toamna', perioada);
    const g = await citestePublic();
    expect(g?.slug).toBe('toamna');
    expect(g?.stare).toBe(perioada);
    expect(new Date(g!.ends_at).getTime()).toBeGreaterThan(new Date(g!.starts_at).getTime());
  });

  it('curent e cel terminat până începe următorul, apoi cel nou', async () => {
    await giveaway('vechi', 'inchis');
    const nou = await giveaway('nou', 'programat');
    expect((await citestePublic())?.slug).toBe('vechi');

    await db.query(`update runlift.giveaways set starts_at = now() - interval '1 hour' where id = $1`, [nou]);
    expect(await citestePublic()).toMatchObject({ slug: 'nou', stare: 'deschis' });
  });

  it('nu spune câți s-au înscris și nu poartă date personale', async () => {
    await giveaway('toamna', 'deschis');
    await inscrie();
    expect(Object.keys((await citestePublic())!).sort()).toEqual(['ends_at', 'slug', 'stare', 'starts_at']);
  });
});

describe('înscrierea', () => {
  it('reușește cât e deschis și primește giveaway-ul curent, orice ar trimite clientul', async () => {
    const vechi = await giveaway('vechi', 'inchis');
    const curent = await giveaway('curent', 'deschis');
    const id = await inscrie({ giveaway_id: vechi });
    const r = await db.query<{ giveaway_id: string }>(
      'select giveaway_id from runlift.giveaway_entries where id = $1',
      [id]
    );
    expect(r.rows[0].giveaway_id).toBe(curent);
  });

  it('e refuzată înainte de început', async () => {
    await giveaway('toamna', 'programat');
    await expect(inscrie()).rejects.toThrow(/giveaway_neinceput/);
  });

  it('e refuzată după sfârșit', async () => {
    await giveaway('toamna', 'inchis');
    await expect(inscrie()).rejects.toThrow(/giveaway_inchis/);
  });

  it('e refuzată când nu există niciun giveaway', async () => {
    await expect(inscrie()).rejects.toThrow(/fara_giveaway/);
  });

  it('refuză un nume de cinci sute de caractere', async () => {
    await giveaway('toamna', 'deschis');
    await expect(inscrie({ nume: 'a'.repeat(500) })).rejects.toThrow(/violates check constraint/);
  });

  it('același cont de Instagram, scris altfel, e o dublură', async () => {
    await giveaway('toamna', 'deschis');
    await inscrie({ instagram: '@Ana.Run' });
    await expect(inscrie({ instagram: 'ana.run' })).rejects.toThrow(/duplicate key/);
  });

  it('același telefon, cu 0 sau cu +373, e o dublură', async () => {
    await giveaway('toamna', 'deschis');
    await inscrie({ telefon: '069123456' });
    await expect(inscrie({ telefon: '+37369123456' })).rejects.toThrow(/duplicate key/);
  });

  it('același email, cu alte majuscule, e o dublură', async () => {
    await giveaway('toamna', 'deschis');
    await inscrie({ email: 'Ana@Exemplu.ro' });
    await expect(inscrie({ email: 'ana@exemplu.ro' })).rejects.toThrow(/duplicate key/);
  });

  it('aceleași date sunt primite într-un giveaway nou, iar cel vechi rămâne neatins', async () => {
    const vechi = await giveaway('vechi', 'deschis');
    const ana = { telefon: '069123456', email: 'ana@exemplu.ro', instagram: 'ana.run' };
    await inscrie(ana);
    await inchide(vechi);
    const nou = await giveaway('nou', 'deschis');
    await inscrie(ana);

    const r = await db.query<{ giveaway_id: string }>(
      'select giveaway_id from runlift.giveaway_entries order by created_at'
    );
    expect(r.rows.map((x) => x.giveaway_id)).toEqual([vechi, nou]);
  });

  it('un giveaway care se termină înainte să înceapă e refuzat', async () => {
    await expect(
      db.query(
        `insert into runlift.giveaways (slug, titlu, starts_at, ends_at)
         values ('gresit', 'Greșit', now(), now() - interval '1 hour')`
      )
    ).rejects.toThrow(/violates check constraint/);
  });
});

describe('drepturile pe tabelele giveaway-ului', () => {
  beforeEach(async () => {
    await giveaway('toamna', 'deschis');
    await inscrie();
  });

  it.each([
    ['anon', 'giveaways'],
    ['anon', 'giveaway_entries'],
    ['authenticated', 'giveaways'],
    ['authenticated', 'giveaway_entries'],
  ])('%s nu poate citi %s', async (rol, tabel) => {
    await expect(caRol(db, rol, () => db.query(`select * from runlift.${tabel}`))).rejects.toThrow(
      /permission denied/
    );
  });

  it.each(['anon', 'authenticated'])('%s nu poate insera o participare', async (rol) => {
    await expect(
      caRol(db, rol, () =>
        db.query(
          `insert into runlift.giveaway_entries (nume, telefon, email, instagram, acord_regulament)
           values ('Bot Test', '069000000', 'bot@test.md', 'bot', true)`
        )
      )
    ).rejects.toThrow(/permission denied/);
  });

  it.each(['anon', 'authenticated'])('%s nu poate șterge participări', async (rol) => {
    await expect(caRol(db, rol, () => db.query('delete from runlift.giveaway_entries'))).rejects.toThrow(
      /permission denied/
    );
  });
});

describe('funcțiile adminului', () => {
  it('fiecare refuză un token inventat și nu schimbă nimic', async () => {
    const g = await giveaway('toamna', 'deschis');
    const id = await inscrie();
    await inchide(g);

    await expect(date(null, TOKEN_INVENTAT)).rejects.toThrow(/invalid_token/);
    await expect(sterge(id, TOKEN_INVENTAT)).rejects.toThrow(/invalid_token/);
    await expect(extrage(g, TOKEN_INVENTAT)).rejects.toThrow(/invalid_token/);
    await expect(confirma(g, TOKEN_INVENTAT)).rejects.toThrow(/invalid_token/);
    await expect(incheie(g, TOKEN_INVENTAT)).rejects.toThrow(/invalid_token/);

    const d = await date();
    expect(d.giveaway?.stare).toBe('inchis');
    expect(d.participari).toHaveLength(1);
    expect(await jurnal()).toEqual([]);
  });

  it('citirea întoarce starea și participările, cu acordul și momentul înscrierii', async () => {
    await giveaway('toamna', 'deschis');
    await inscrie({ nume: 'Ana Popescu', instagram: 'ana.run', acord_contact: true });
    await inscrie({ nume: 'Ion Rusu' });

    const d = await date();
    expect(d.giveaway).toMatchObject({ slug: 'toamna', stare: 'deschis', castigator: null });
    expect(d.participari).toHaveLength(2);
    expect(d.participari[0]).toMatchObject({ nume: 'Ana Popescu', instagram: 'ana.run', acord_contact: true });
    expect(d.participari[1].acord_contact).toBe(false);
    expect(Number.isNaN(Date.parse(d.participari[0].created_at))).toBe(false);
  });

  it('fără niciun giveaway întoarce giveaway null', async () => {
    const d = await date();
    expect(d.giveaway).toBeNull();
    expect(d.giveaways).toEqual([]);
    expect(d.participari).toEqual([]);
  });

  it('cu două giveaway-uri îl deschide pe cel curent și îl poate deschide pe celălalt', async () => {
    const vechi = await giveaway('vechi', 'deschis');
    await inscrie({ nume: 'Din Vechi' });
    await inchide(vechi);
    await giveaway('nou', 'deschis');
    await inscrie({ nume: 'Din Nou' });

    const curent = await date();
    expect(curent.giveaway?.slug).toBe('nou');
    expect(curent.giveaways.map((g) => g.slug).sort()).toEqual(['nou', 'vechi']);
    expect(curent.participari.map((p) => p.nume)).toEqual(['Din Nou']);

    const celalalt = await date(vechi);
    expect(celalalt.giveaway?.slug).toBe('vechi');
    expect(celalalt.participari.map((p) => p.nume)).toEqual(['Din Vechi']);
  });

  it('ștergerea scoate participarea și îi lasă persoanei drumul liber să se reînscrie', async () => {
    await giveaway('toamna', 'deschis');
    const ana = { telefon: '069123456', email: 'ana@exemplu.ro', instagram: 'ana.run' };
    const id = await inscrie(ana);
    await inscrie();

    await sterge(id);
    const d = await date();
    expect(d.participari).toHaveLength(1);
    expect(d.participari.some((p) => p.id === id)).toBe(false);

    await inscrie(ana);
    expect((await date()).participari).toHaveLength(2);
  });

  it('ștergerea unui id inexistent e refuzată și nu lasă urmă', async () => {
    await giveaway('toamna', 'deschis');
    await expect(sterge('00000000-0000-0000-0000-000000000000')).rejects.toThrow(/participare_inexistenta/);
    expect(await jurnal()).toEqual([]);
  });

  it('extragerea e refuzată cât giveaway-ul e deschis, dar lista se citește', async () => {
    const g = await giveaway('toamna', 'deschis');
    await inscrie();
    await expect(extrage(g)).rejects.toThrow(/giveaway_deschis/);
    expect((await date()).participari).toHaveLength(1);
  });

  it('după sfârșit, extragerea marchează exact o persoană și reține momentul', async () => {
    const g = await giveaway('toamna', 'deschis');
    await inscrie();
    await inscrie();
    await inscrie();
    await inchide(g);

    const ales = await extrage(g);
    const d = await date();
    expect(d.giveaway?.stare).toBe('extras');
    const extrasi = d.participari.filter((p) => p.extrasa_la !== null);
    expect(extrasi.map((p) => p.id)).toEqual([ales]);
    expect(extrasi[0].inlocuita_la).toBeNull();
  });

  it('la reextragere, cei dinainte rămân marcați și nu mai sunt aleși', async () => {
    const g = await giveaway('toamna', 'deschis');
    await inscrie();
    await inscrie();
    await inscrie();
    await inchide(g);

    const alesi = [await extrage(g), await extrage(g), await extrage(g)];
    expect(new Set(alesi).size).toBe(3);

    const d = await date();
    expect(d.participari.filter((p) => p.inlocuita_la !== null).map((p) => p.id).sort()).toEqual(
      alesi.slice(0, 2).sort()
    );

    await expect(extrage(g)).rejects.toThrow(/fara_participari/);
    // Refuzul nu-l înlocuiește pe ultimul extras.
    expect((await date()).participari.find((p) => p.id === alesi[2])?.inlocuita_la).toBeNull();
  });

  it('extragerea fără participări e refuzată', async () => {
    const g = await giveaway('toamna', 'inchis');
    await expect(extrage(g)).rejects.toThrow(/fara_participari/);
  });

  it('din două participări, fiecare ajunge să fie aleasă', async () => {
    const g = await giveaway('toamna', 'deschis');
    const a = await inscrie();
    const b = await inscrie();
    await inchide(g);

    const alese = new Set<string>();
    for (let i = 0; i < 200; i++) {
      alese.add(await extrage(g));
      await db.query('update runlift.giveaway_entries set extrasa_la = null, inlocuita_la = null');
    }
    expect([...alese].sort()).toEqual([a, b].sort());
  }, 30_000);

  it('confirmarea fără persoană extrasă e refuzată', async () => {
    const g = await giveaway('toamna', 'inchis');
    await expect(confirma(g)).rejects.toThrow(/fara_extras/);
  });

  it('confirmarea trece giveaway-ul pe confirmat și păstrează o copie a câștigătorului', async () => {
    const g = await giveaway('toamna', 'deschis');
    await inscrie({ nume: 'Maria Ceban', instagram: 'maria.c' });
    await inchide(g);
    await extrage(g);
    await confirma(g);

    const d = await date();
    expect(d.giveaway?.stare).toBe('confirmat');
    expect(d.giveaway?.castigator).toMatchObject({ nume: 'Maria Ceban', instagram: 'maria.c' });
    expect(d.giveaway?.castigator?.extras_la).toBeTruthy();
  });

  it('reextragerea după confirmare anulează confirmarea', async () => {
    const g = await giveaway('toamna', 'deschis');
    await inscrie();
    await inscrie();
    await inchide(g);
    const maria = await extrage(g);
    await confirma(g);

    const altul = await extrage(g);
    const d = await date();
    expect(altul).not.toBe(maria);
    expect(d.giveaway?.stare).toBe('extras');
    expect(d.giveaway?.castigator).toBeNull();
    expect(d.participari.find((p) => p.id === maria)?.inlocuita_la).not.toBeNull();
  });

  it('încheierea fără câștigător confirmat e refuzată', async () => {
    const g = await giveaway('toamna', 'deschis');
    await inscrie();
    await inchide(g);
    await extrage(g);
    await expect(incheie(g)).rejects.toThrow(/fara_castigator/);
  });

  it('încheierea șterge participările fără acord și păstrează totalul și câștigătorul', async () => {
    const g = await giveaway('toamna', 'deschis');
    const castigator = await inscrie({ nume: 'Ion Rusu', instagram: 'ion.r' });
    await inscrie({ acord_contact: true });
    await inscrie({ acord_contact: true });
    await inscrie();
    await inscrie();
    await inchide(g);
    // Extragerea e la întâmplare; testul are nevoie de un câștigător FĂRĂ acord.
    await db.query('update runlift.giveaway_entries set extrasa_la = now() where id = $1', [castigator]);
    await confirma(g);

    expect(await incheie(g)).toBe(3);
    const d = await date();
    expect(d.giveaway).toMatchObject({ stare: 'incheiat', total_participari: 5 });
    expect(d.giveaway?.castigator).toMatchObject({ nume: 'Ion Rusu', instagram: 'ion.r' });
    expect(d.participari).toHaveLength(2);
    expect(d.participari.every((p) => p.acord_contact)).toBe(true);
  });

  it('după încheiere nu se mai extrage, nu se mai confirmă și nu se mai încheie', async () => {
    const g = await giveaway('toamna', 'deschis');
    await inscrie({ acord_contact: true });
    await inscrie({ acord_contact: true });
    await inchide(g);
    await extrage(g);
    await confirma(g);
    await incheie(g);

    await expect(extrage(g)).rejects.toThrow(/giveaway_incheiat/);
    await expect(confirma(g)).rejects.toThrow(/giveaway_incheiat/);
    await expect(incheie(g)).rejects.toThrow(/giveaway_incheiat/);
  });

  it('după încheiere, o participare cu acord tot poate fi ștearsă', async () => {
    const g = await giveaway('toamna', 'deschis');
    const ramasa = await inscrie({ acord_contact: true });
    await inscrie({ acord_contact: true });
    await inchide(g);
    await db.query('update runlift.giveaway_entries set extrasa_la = now() where id <> $1', [ramasa]);
    await confirma(g);
    await incheie(g);

    await sterge(ramasa);
    expect((await date()).participari.some((p) => p.id === ramasa)).toBe(false);
  });

  it('ștergerea persoanei extrase și neconfirmate readuce starea la închis', async () => {
    const g = await giveaway('toamna', 'deschis');
    await inscrie();
    await inscrie();
    await inchide(g);
    const ales = await extrage(g);

    await sterge(ales);
    expect((await date()).giveaway?.stare).toBe('inchis');
    expect(await extrage(g)).not.toBe(ales);
  });

  it('încheierea unui giveaway vechi nu atinge participările celui nou', async () => {
    const vechi = await giveaway('vechi', 'deschis');
    await inscrie({ acord_contact: true });
    await inscrie();
    await inchide(vechi);
    await extrage(vechi);
    await confirma(vechi);
    await giveaway('nou', 'deschis');
    await inscrie();
    await inscrie();

    await incheie(vechi);
    expect((await date()).participari).toHaveLength(2);
    expect((await date(vechi)).participari.every((p) => p.acord_contact)).toBe(true);
  });

  it('fiecare scriere lasă urmă, fără nume și fără contacte', async () => {
    const g = await giveaway('toamna', 'deschis');
    const sters = await inscrie({ nume: 'Sters Acum', telefon: '069111222', email: 'sters@exemplu.ro', instagram: 'sters.acum' });
    await inscrie({ nume: 'Ana Popescu', telefon: '069333444', email: 'ana@exemplu.ro', instagram: 'ana.run' });
    await inchide(g);
    await sterge(sters);
    await extrage(g);
    await confirma(g);
    await incheie(g);

    const urme = await jurnal();
    expect(urme.map((u) => u.tip)).toEqual([
      'giveaway_stergere',
      'giveaway_extragere',
      'giveaway_confirmare',
      'giveaway_incheiere',
    ]);
    const text = JSON.stringify(urme);
    for (const secret of ['Sters Acum', '069111222', 'sters@exemplu.ro', 'sters.acum', 'Ana Popescu', '069333444', 'ana@exemplu.ro', 'ana.run']) {
      expect(text).not.toContain(secret);
    }
  });
});

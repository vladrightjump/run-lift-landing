// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { porneste, reseteaza, caRol, apeluriEdge, ADMIN_TOKEN, PAROLA_ADMIN, type BazaTest } from './db';

/**
 * Regulile de business care trăiesc în baza de date: plafonul de locuri,
 * deadline-ul, lista de așteptare cu promovarea automată, renunțarea la loc,
 * confirmarea adresei și ce vede publicul despre participanți.
 *
 * Toate sunt triggere și funcții `SECURITY DEFINER` — cod care rulează fără să
 * treacă prin browser, deci pe care nicio suită de până acum nu-l atingea.
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

const EDITIA = 7;

type Rand = { id: string; editie: number; token_renunt: string; token_unsub: string };

const inscrie = async (
  email: string,
  o: { nume?: string; editie?: number; creat?: string } = {}
): Promise<Rand> => {
  const r = await db.query<Rand>(
    `insert into runlift.registrations (nume, telefon, email, acord, editie, created_at)
     values ($1, '069000000', $2, true, $3, coalesce($4::timestamptz, now()))
     returning id, editie, token_renunt, token_unsub`,
    [o.nume ?? 'Ana Popescu', email, o.editie ?? EDITIA, o.creat ?? null]
  );
  return r.rows[0];
};

const peLista = async (email: string, o: { nume?: string; creat?: string } = {}) =>
  db.query(
    `insert into runlift.event_waitlist (nume, telefon, email, acord, editie, created_at)
     values ($1, '069000000', $2, true, $3, coalesce($4::timestamptz, now()))`,
    [o.nume ?? 'Ion Vasile', email, EDITIA, o.creat ?? null]
  );

/** Apelurile spre funcția Edge, doar cele de un anumit mod. */
const apeluriMod = async (mod: string) =>
  (await apeluriEdge(db)).filter((a) => (a.body as { mode?: string }).mode === mod);

const cati = async (editie = EDITIA): Promise<number> =>
  (
    await db.query<{ n: number }>(
      'select count(*)::int n from runlift.registrations where editie = $1 and deleted_at is null',
      [editie]
    )
  ).rows[0].n;

describe('plafonul de locuri și deadline-ul (registrations_guard)', () => {
  it('peste capacitate, înscrierea e respinsă cu `event_full`', async () => {
    await reseteaza(db, { locuri: 2 });
    await inscrie('unu@x.ro');
    await inscrie('doi@x.ro');
    await expect(inscrie('trei@x.ro')).rejects.toThrow(/event_full/);
    expect(await cati()).toBe(2);
  });

  it('un loc eliberat prin renunțare se poate reocupa', async () => {
    await reseteaza(db, { locuri: 1 });
    const a = await inscrie('unu@x.ro');
    await db.query('select runlift.decline_spot($1)', [a.token_renunt]);
    await expect(inscrie('doi@x.ro')).resolves.toBeTruthy();
  });

  it('după deadline nu se mai poate înscrie nimeni', async () => {
    await reseteaza(db, { deadline: '2020-01-01T06:00:00+03:00' });
    await expect(inscrie('ana@x.ro')).rejects.toThrow(/registration_closed/);
  });

  it('o ediție arhivată nu e păzită de plafon — adminul poate completa istoricul', async () => {
    await reseteaza(db, { locuri: 1 });
    await inscrie('unu@x.ro');
    await db.exec(`select set_config('runlift.guard_bypass', '1', false)`);
    await expect(inscrie('vechi@x.ro', { editie: 3 })).resolves.toBeTruthy();
    await db.exec(`select set_config('runlift.guard_bypass', '', false)`);
  });

  it('aceeași adresă nu se poate înscrie de două ori la aceeași ediție', async () => {
    await inscrie('ana@x.ro');
    await expect(inscrie('ANA@x.ro')).rejects.toThrow(/duplicate|unique/i);
  });

  it('după ce a renunțat, se poate reînscrie', async () => {
    const a = await inscrie('ana@x.ro');
    await db.query('select runlift.decline_spot($1)', [a.token_renunt]);
    await expect(inscrie('ana@x.ro')).resolves.toBeTruthy();
  });
});

describe('ediția o decide serverul (forteaza_editia_curenta)', () => {
  it('o ediție trimisă de client e suprascrisă cu cea curentă', async () => {
    const r = await inscrie('ana@x.ro', { editie: 99 });
    expect(r.editie).toBe(EDITIA);
  });

  it('și pe lista de așteptare', async () => {
    await db.query(
      `insert into runlift.event_waitlist (nume, telefon, email, acord, editie)
       values ('Ion', '069000000', 'ion@x.ro', true, 99)`
    );
    const r = await db.query<{ editie: number }>('select editie from runlift.event_waitlist');
    expect(r.rows[0].editie).toBe(EDITIA);
  });

  it('scrierile deliberate din admin își păstrează ediția', async () => {
    await db.exec(`select set_config('runlift.guard_bypass', '1', false)`);
    const r = await inscrie('vechi@x.ro', { editie: 4 });
    await db.exec(`select set_config('runlift.guard_bypass', '', false)`);
    expect(r.editie).toBe(4);
  });
});

describe('lista de așteptare și promovarea automată', () => {
  it('plafonul listei de așteptare vine din configul ediției', async () => {
    await db.query(`insert into runlift.app_config values ('waitlist_capacity', '2')
                    on conflict (key) do update set value = '2'`);
    await peLista('a@x.ro');
    await peLista('b@x.ro');
    await expect(peLista('c@x.ro')).rejects.toThrow(/waitlist_full/);
  });

  /**
   * Regresie: `waitlist_cap()` întorcea `10` scris în cod, iar publicarea nu
   * ducea niciodată `slots.waitlist` în `app_config` — câmpul din /admin era
   * decorativ, iar al unsprezecelea om primea `waitlist_full` oricum ar fi fost
   * configurat. Vezi `supabase/sql/supabase-migration-waitlist-cap-din-config.sql`.
   */
  it('publicarea duce plafonul listei în baza de date, ca pe cel al cursei', async () => {
    await db.query(`select runlift.scrie_scalarele_editiei($1::jsonb)`, [
      JSON.stringify({
        number: 8,
        launchNumber: 8,
        tz: '+03:00',
        start: '2026-10-03T07:00:00',
        registrationDeadline: '2026-10-03T06:00:00',
        slots: { total: 30, waitlist: 15 },
      }),
    ]);
    const r = await db.query<{ waitlist_cap: number }>('select runlift.waitlist_cap()');
    expect(r.rows[0].waitlist_cap).toBe(15);
  });

  it('fără cheia în config, plafonul rămâne cel dinainte', async () => {
    await db.query(`delete from runlift.app_config where key = 'waitlist_capacity'`);
    const r = await db.query<{ waitlist_cap: number }>('select runlift.waitlist_cap()');
    expect(r.rows[0].waitlist_cap).toBe(10);
  });

  it('un loc eliberat urcă PRIMUL om de pe listă, în ordinea sosirii', async () => {
    await reseteaza(db, { locuri: 1 });
    const a = await inscrie('titular@x.ro');
    await peLista('al-doilea@x.ro', { creat: '2026-09-10T10:00:00Z' });
    await peLista('primul@x.ro', { creat: '2026-09-09T10:00:00Z' });

    await db.query('select runlift.decline_spot($1)', [a.token_renunt]);

    const inscrisi = await db.query<{ email: string }>(
      'select email from runlift.registrations where deleted_at is null'
    );
    expect(inscrisi.rows.map((r) => r.email)).toEqual(['primul@x.ro']);
    const lista = await db.query<{ email: string }>('select email from runlift.event_waitlist');
    expect(lista.rows.map((r) => r.email)).toEqual(['al-doilea@x.ro']);
  });

  it('promovarea cere emailul care o anunță', async () => {
    await reseteaza(db, { locuri: 1 });
    const a = await inscrie('titular@x.ro');
    await peLista('urmatorul@x.ro');
    await db.query('select runlift.decline_spot($1)', [a.token_renunt]);

    const apeluri = await apeluriMod('promoted');
    expect(apeluri).toHaveLength(1);
    expect(apeluri[0].url).toContain('/functions/v1/send-email');
  });

  it('promovarea lasă urmă în jurnalul de evenimente al adminului', async () => {
    await reseteaza(db, { locuri: 1 });
    const a = await inscrie('titular@x.ro');
    await peLista('urmatorul@x.ro');
    await db.query('select runlift.decline_spot($1)', [a.token_renunt]);
    const ev = await db.query<{ tip: string }>(
      `select tip from runlift.admin_events where tip = 'auto_promote'`
    );
    expect(ev.rows).toHaveLength(1);
  });

  it('nu promovează peste capacitate', async () => {
    await reseteaza(db, { locuri: 2 });
    const a = await inscrie('unu@x.ro');
    await inscrie('doi@x.ro');
    await peLista('trei@x.ro');
    await peLista('patru@x.ro');
    await db.query('select runlift.decline_spot($1)', [a.token_renunt]);
    expect(await cati()).toBe(2);
    const lista = await db.query('select 1 from runlift.event_waitlist');
    expect(lista.rows).toHaveLength(1);
  });

  it('fără nimeni pe listă, locul rămâne liber, fără email', async () => {
    await reseteaza(db, { locuri: 1 });
    const a = await inscrie('unu@x.ro');
    await db.query('select runlift.decline_spot($1)', [a.token_renunt]);
    expect(await cati()).toBe(0);
    expect(await apeluriMod('promoted')).toHaveLength(0);
  });

  it('un loc eliberat la o ediție veche nu mișcă lista ediției curente', async () => {
    await db.exec(`select set_config('runlift.guard_bypass', '1', false)`);
    const vechi = await inscrie('vechi@x.ro', { editie: 4 });
    await db.exec(`select set_config('runlift.guard_bypass', '', false)`);
    await peLista('asteapta@x.ro');
    await db.query('update runlift.registrations set deleted_at = now() where id = $1', [vechi.id]);
    expect(await cati()).toBe(0);
    expect(await apeluriMod('promoted')).toHaveLength(0);
  });
});

describe('renunțarea la loc (decline_spot)', () => {
  it('eliberează locul și lasă urmă', async () => {
    const a = await inscrie('ana@x.ro');
    const r = await db.query<{ decline_spot: string }>('select runlift.decline_spot($1)', [
      a.token_renunt,
    ]);
    expect(r.rows[0].decline_spot).toBe('renuntat');
    expect(await cati()).toBe(0);
    const ev = await db.query(`select 1 from runlift.admin_events where tip = 'renuntare'`);
    expect(ev.rows).toHaveLength(1);
  });

  it('un token necunoscut nu spune nimic despre nimeni', async () => {
    const r = await db.query<{ decline_spot: string }>('select runlift.decline_spot($1)', [
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect(r.rows[0].decline_spot).toBe('invalid');
  });

  it('a doua oară → deja_renuntat', async () => {
    const a = await inscrie('ana@x.ro');
    await db.query('select runlift.decline_spot($1)', [a.token_renunt]);
    const r = await db.query<{ decline_spot: string }>('select runlift.decline_spot($1)', [
      a.token_renunt,
    ]);
    expect(r.rows[0].decline_spot).toBe('deja_renuntat');
  });

  /** După start, un loc eliberat n-ar mai apuca să fie luat de nimeni. */
  it('după startul cursei → prea_tarziu, locul rămâne ocupat', async () => {
    await reseteaza(db, { start: '2020-01-01T07:00:00+03:00' });
    const a = await inscrie('ana@x.ro');
    const r = await db.query<{ decline_spot: string }>('select runlift.decline_spot($1)', [
      a.token_renunt,
    ]);
    expect(r.rows[0].decline_spot).toBe('prea_tarziu');
    expect(await cati()).toBe(1);
  });

  it('linkul unei ediții trecute nu mai eliberează nimic', async () => {
    await db.exec(`select set_config('runlift.guard_bypass', '1', false)`);
    const vechi = await inscrie('vechi@x.ro', { editie: 4 });
    await db.exec(`select set_config('runlift.guard_bypass', '', false)`);
    const r = await db.query<{ decline_spot: string }>('select runlift.decline_spot($1)', [
      vechi.token_renunt,
    ]);
    expect(r.rows[0].decline_spot).toBe('prea_tarziu');
  });
});

describe('ce vede publicul (public_stats)', () => {
  const stats = async () =>
    (
      await db.query<{
        public_stats: { count: number; participants: { nume: string }[]; waitlist: number };
      }>('select runlift.public_stats()')
    ).rows[0].public_stats;

  /** Lista de pe site e publică: numele de familie nu are ce căuta întreg. */
  it('arată prenumele și inițiala, niciodată numele întreg', async () => {
    await inscrie('ana@x.ro', { nume: 'Ana Popescu' });
    const s = await stats();
    expect(s.participants[0].nume).toBe('Ana P.');
    expect(JSON.stringify(s)).not.toContain('Popescu');
  });

  it('un nume dintr-un singur cuvânt rămâne cum e', async () => {
    await inscrie('ana@x.ro', { nume: 'Ana' });
    expect((await stats()).participants[0].nume).toBe('Ana');
  });

  it('nu scapă adrese, telefoane sau date de naștere', async () => {
    await inscrie('ana@x.ro');
    const brut = JSON.stringify(await stats());
    expect(brut).not.toContain('ana@x.ro');
    expect(brut).not.toContain('069000000');
  });

  it('numără doar ediția curentă și doar locurile ocupate', async () => {
    await inscrie('ana@x.ro');
    const b = await inscrie('ion@x.ro');
    await db.query('select runlift.decline_spot($1)', [b.token_renunt]);
    await db.exec(`select set_config('runlift.guard_bypass', '1', false)`);
    await inscrie('vechi@x.ro', { editie: 4 });
    await db.exec(`select set_config('runlift.guard_bypass', '', false)`);
    const s = await stats();
    expect(s.count).toBe(1);
  });

  it('include numărul celor de pe lista de așteptare', async () => {
    await peLista('a@x.ro');
    await peLista('b@x.ro');
    expect((await stats()).waitlist).toBe(2);
  });

  it('e citibilă cu cheia publică — de acolo o cere site-ul', async () => {
    await inscrie('ana@x.ro');
    const s = await caRol(db, 'anon', () => db.query('select runlift.public_stats()'));
    expect(s.rows).toHaveLength(1);
  });
});

describe('confirmarea adresei (confirm_signup)', () => {
  const inscrieLaLansare = async (email: string) =>
    (
      await db.query<{ token_confirmare: string }>(
        `insert into runlift.launch_notifications (nume, prenume, email, telefon)
         values ('Popescu', 'Ana', $1, '069000000') returning token_confirmare`,
        [email]
      )
    ).rows[0].token_confirmare;

  it('confirmă o singură dată', async () => {
    const t = await inscrieLaLansare('ana@x.ro');
    const unu = await db.query<{ confirm_signup: string }>('select runlift.confirm_signup($1)', [t]);
    expect(unu.rows[0].confirm_signup).toBe('confirmat');
    const doi = await db.query<{ confirm_signup: string }>('select runlift.confirm_signup($1)', [t]);
    expect(doi.rows[0].confirm_signup).toBe('deja_confirmat');
  });

  it('un token inventat nu confirmă pe nimeni', async () => {
    await inscrieLaLansare('ana@x.ro');
    const r = await db.query<{ confirm_signup: string }>('select runlift.confirm_signup($1)', [
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect(r.rows[0].confirm_signup).toBe('invalid');
    const c = await db.query('select 1 from runlift.launch_notifications where confirmat_la is not null');
    expect(c.rows).toHaveLength(0);
  });

  it('doar cei confirmați și nedezabonați primesc difuzări', async () => {
    const t1 = await inscrieLaLansare('confirmat@x.ro');
    await inscrieLaLansare('neconfirmat@x.ro');
    const t3 = await inscrieLaLansare('dezabonat@x.ro');
    await db.query('select runlift.confirm_signup($1)', [t1]);
    await db.query('select runlift.confirm_signup($1)', [t3]);
    await db.query(
      `update runlift.launch_notifications set dezabonat_la = now() where email = 'dezabonat@x.ro'`
    );
    const r = await db.query<{ email: string }>('select email from runlift.waitlist_recipients()');
    expect(r.rows.map((x) => x.email)).toEqual(['confirmat@x.ro']);
  });
});

describe('semnalul „locurile s-au epuizat"', () => {
  it('se declanșează exact când se ocupă ultimul loc', async () => {
    await reseteaza(db, { locuri: 2 });
    await inscrie('unu@x.ro');
    expect(await apeluriMod('alert')).toHaveLength(0);
    await inscrie('doi@x.ro');
    expect(await apeluriMod('alert')).toHaveLength(1);
  });
});

describe('autentificarea în backoffice', () => {
  const login = async (user: string, parola: string) =>
    (
      await db.query<{ admin_login: string | null }>('select runlift.admin_login($1, $2)', [
        user,
        parola,
      ])
    ).rows[0].admin_login;

  it('parola corectă întoarce un token de sesiune valid', async () => {
    const token = await login('operator', PAROLA_ADMIN);
    expect(token).toBeTruthy();
    const ok = await db.query<{ admin_check_token: boolean }>(
      'select runlift.admin_check_token($1)',
      [token]
    );
    expect(ok.rows[0].admin_check_token).toBe(true);
  });

  it.each([
    ['parolă greșită', 'operator', 'altceva'],
    ['utilizator inexistent', 'nimeni', PAROLA_ADMIN],
  ])('%s nu primește token', async (_, user, parola) => {
    expect(await login(user, parola)).toBeNull();
  });

  /** Fără plafon, tokenul de admin ar fi la distanță de un atac prin forță brută. */
  it('după cinci încercări greșite, contul se blochează 15 minute', async () => {
    for (let i = 0; i < 5; i++) await login('operator', 'gresit');
    expect(await login('operator', PAROLA_ADMIN)).toBeNull();
    const blocat = await db.query<{ locked_until: string | null }>(
      'select locked_until from runlift.admin_login_attempts'
    );
    expect(blocat.rows[0].locked_until).toBeTruthy();
    // Fiecare încercare greșită doarme o secundă, deliberat.
  }, 30_000);

  it('o sesiune expirată nu mai e validă', async () => {
    await db.query(
      `update runlift.admin_sessions set expires_at = now() - interval '1 minute' where token = $1`,
      [ADMIN_TOKEN]
    );
    const r = await db.query<{ admin_check_token: boolean }>(
      'select runlift.admin_check_token($1)',
      [ADMIN_TOKEN]
    );
    expect(r.rows[0].admin_check_token).toBe(false);
  });
});

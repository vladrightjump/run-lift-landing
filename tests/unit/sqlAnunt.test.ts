// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/**
 * Funcțiile SQL ale anunțului, rulate pe un Postgres real (PGlite, în proces).
 *
 * Migrațiile se încarcă din FIȘIERELE care se aplică în producție, nu dintr-o
 * copie: testul pică dacă cineva schimbă regula acolo. Înainte, singura
 * verificare era un bloc de interogări comentate în capul migrației, rulat de
 * mână o dată.
 *
 * Tabelele de mai jos sunt coloanele din producție (`information_schema`, 17
 * septembrie 2026), fără triggerele și constrângerile care nu țin de anunț.
 * Dacă adaugi o coloană pe care o citesc funcțiile, adaug-o și aici.
 */

const SCHEMA = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema runlift;
  grant usage on schema runlift to anon, authenticated, service_role;

  create table runlift.app_config (key text primary key, value text not null);
  create function runlift.current_event_edition() returns smallint
    language sql stable security definer as $$
      select coalesce((select value::smallint from runlift.app_config where key='current_event_edition'), 2);
    $$;

  create table runlift.admin_sessions (token uuid primary key, expires_at timestamptz not null);
  create function runlift.admin_check_token(p_token uuid) returns boolean
    language sql stable security definer set search_path to 'runlift' as $$
      select exists (select 1 from admin_sessions where token = p_token and expires_at > now());
    $$;

  create table runlift.registrations (
    id uuid not null default gen_random_uuid() primary key,
    created_at timestamptz not null default now(),
    nume text not null, telefon text not null, email text not null,
    echipa text not null default '', acord boolean not null,
    editie smallint not null default runlift.current_event_edition(),
    data_nasterii date, dezabonat_la timestamptz,
    token_unsub uuid not null default gen_random_uuid(),
    deleted_at timestamptz,
    token_renunt uuid not null default gen_random_uuid(),
    renuntat_la timestamptz
  );

  create table runlift.launch_notifications (
    id uuid not null default gen_random_uuid() primary key,
    created_at timestamptz not null default now(),
    nume text not null, prenume text not null, email text not null, telefon text not null,
    editie smallint not null default 1, sursa text not null default 'lansare',
    token_confirmare uuid not null default gen_random_uuid(),
    confirmat_la timestamptz, email_trimis_la timestamptz, dezabonat_la timestamptz,
    token_unsub uuid not null default gen_random_uuid()
  );

  create table runlift.email_log (
    id uuid not null default gen_random_uuid() primary key,
    created_at timestamptz not null default now(),
    email text not null, nume text not null default '', subiect text not null default '',
    text_email text not null default '', mod text not null, audienta text not null default '',
    status text not null, provider_status integer, eroare text,
    editie smallint not null default runlift.current_event_edition(), sablon text
  );

  create table runlift.email_templates (
    cheie text primary key, subiect text not null, text_email text not null
  );
`;

const migratie = (fisier: string) => readFileSync(resolve(__dirname, '../..', fisier), 'utf8');
const ISTORIC = migratie('supabase-migration-anunt-istoric.sql');
const REJUCARE = migratie('supabase-migration-anunt-rejucare.sql');

const EDITIA_CURENTA = 7;
const ADMIN = '11111111-1111-1111-1111-111111111111';

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(ISTORIC);
  await db.exec(REJUCARE);
}, 30_000);

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    reset role;
    truncate runlift.registrations, runlift.launch_notifications, runlift.email_log,
             runlift.app_config, runlift.admin_sessions;
    insert into runlift.app_config values ('current_event_edition', '${EDITIA_CURENTA}');
    insert into runlift.admin_sessions values ('${ADMIN}', now() + interval '1 hour');
  `);
});

type Inscriere = {
  email: string;
  nume?: string;
  editie?: number;
  creat?: string;
  sters?: boolean;
  renuntat?: boolean;
  dezabonat?: boolean;
};

/** O înscriere; întoarce tokenul de dezabonare al rândului. */
const inscrie = async (r: Inscriere): Promise<string> => {
  const res = await db.query<{ token_unsub: string }>(
    `insert into runlift.registrations
       (nume, telefon, email, acord, editie, created_at, deleted_at, renuntat_la, dezabonat_la)
     values ($1, '069000000', $2, true, $3, $4, $5, $6, $7)
     returning token_unsub`,
    [
      r.nume ?? 'Ana Popescu',
      r.email,
      r.editie ?? 5,
      r.creat ?? '2026-06-01T10:00:00Z',
      r.sters || r.renuntat ? '2026-06-02T10:00:00Z' : null,
      r.renuntat ? '2026-06-02T10:00:00Z' : null,
      r.dezabonat ? '2026-06-03T10:00:00Z' : null,
    ]
  );
  return res.rows[0].token_unsub;
};

const laLansare = async (email: string, dezabonat = false): Promise<string> => {
  const res = await db.query<{ token_unsub: string }>(
    `insert into runlift.launch_notifications (nume, prenume, email, telefon, dezabonat_la)
     values ('Popescu', 'Ana', $1, '069000000', $2) returning token_unsub`,
    [email, dezabonat ? now() : null]
  );
  return res.rows[0].token_unsub;
};

const now = () => new Date().toISOString();

type Destinatar = { email: string; nume: string; token_unsub: string; ultima_editie: number };

const audienta = async (exclude: (string | null)[] = []): Promise<Destinatar[]> =>
  (await db.query<Destinatar>('select * from runlift.anunt_recipients($1)', [exclude])).rows;

const adrese = async (exclude: (string | null)[] = []) =>
  (await audienta(exclude)).map((d) => d.email.trim().toLowerCase()).sort();

describe('anunt_recipients — cine primește anunțul', () => {
  it('un om cu mai multe înscrieri apare o singură dată, cu ultima lui ediție', async () => {
    await inscrie({ email: 'ana@x.ro', editie: 2 });
    await inscrie({ email: 'ana@x.ro', editie: 5 });
    await inscrie({ email: 'ana@x.ro', editie: 3 });
    const lista = await audienta();
    expect(lista).toHaveLength(1);
    expect(lista[0].ultima_editie).toBe(5);
  });

  it('majusculele și spațiile din adresă nu fac din el doi oameni', async () => {
    await inscrie({ email: 'Ana@X.ro', editie: 2 });
    await inscrie({ email: ' ana@x.ro ', editie: 4 });
    expect(await audienta()).toHaveLength(1);
  });

  it('numele și tokenul vin de pe înscrierea CEA MAI RECENTĂ', async () => {
    await inscrie({ email: 'ana@x.ro', nume: 'Ana Vechi', editie: 2, creat: '2026-01-01T00:00:00Z' });
    const nou = await inscrie({
      email: 'ana@x.ro',
      nume: 'Ana Nou',
      editie: 4,
      creat: '2026-05-01T00:00:00Z',
    });
    const [d] = await audienta();
    expect(d.nume).toBe('Ana Nou');
    expect(d.token_unsub).toBe(nou);
  });

  it('cine e deja înscris la ediția curentă nu primește „s-au deschis înscrierile"', async () => {
    await inscrie({ email: 'ana@x.ro', editie: 5 });
    await inscrie({ email: 'ana@x.ro', editie: EDITIA_CURENTA });
    await inscrie({ email: 'ion@x.ro', editie: 5 });
    expect(await adrese()).toEqual(['ion@x.ro']);
  });

  it('o înscriere la ediția curentă ȘTEARSĂ de admin nu-l scoate din audiență', async () => {
    await inscrie({ email: 'ana@x.ro', editie: 5 });
    await inscrie({ email: 'ana@x.ro', editie: EDITIA_CURENTA, sters: true });
    expect(await adrese()).toEqual(['ana@x.ro']);
  });

  it('un singur rând dezabonat din mai multe scoate persoana', async () => {
    await inscrie({ email: 'ana@x.ro', editie: 2 });
    await inscrie({ email: 'ana@x.ro', editie: 3, dezabonat: true });
    await inscrie({ email: 'ana@x.ro', editie: 5 });
    expect(await audienta()).toHaveLength(0);
  });

  it('dezabonat doar din lista de lansare → scos și de aici', async () => {
    await inscrie({ email: 'ana@x.ro' });
    await laLansare('ANA@x.ro', true);
    expect(await audienta()).toHaveLength(0);
  });

  it('cineva doar pe lista de lansare, neînscris vreodată, NU e în audiență', async () => {
    await laLansare('ana@x.ro');
    expect(await audienta()).toHaveLength(0);
  });

  it('rândul șters de admin nu aduce persoana; cel eliberat de participant o aduce', async () => {
    await inscrie({ email: 'sters@x.ro', sters: true });
    await inscrie({ email: 'renuntat@x.ro', renuntat: true });
    expect(await adrese()).toEqual(['renuntat@x.ro']);
  });

  it('ultima ediție ignoră rândurile șterse de admin', async () => {
    await inscrie({ email: 'ana@x.ro', editie: 3 });
    await inscrie({ email: 'ana@x.ro', editie: 6, sters: true });
    expect((await audienta())[0].ultima_editie).toBe(3);
  });

  it('adresele goale nu devin destinatari', async () => {
    await inscrie({ email: '   ' });
    await inscrie({ email: '' });
    expect(await audienta()).toHaveLength(0);
  });

  it('excluderile scot oameni, indiferent de majuscule și spații', async () => {
    await inscrie({ email: 'ana@x.ro' });
    await inscrie({ email: 'ion@x.ro' });
    expect(await adrese([' ANA@X.RO '])).toEqual(['ion@x.ro']);
  });

  it('excluderile nu pot ADĂUGA pe nimeni', async () => {
    await inscrie({ email: 'ana@x.ro' });
    expect(await adrese(['intrus@x.ro'])).toEqual(['ana@x.ro']);
  });

  /** `not in` cu un NULL în listă ar fi întors zero rânduri, tăcut. */
  it('un NULL printre excluderi nu golește lista', async () => {
    await inscrie({ email: 'ana@x.ro' });
    await inscrie({ email: 'ion@x.ro' });
    expect(await adrese([null, 'ion@x.ro'])).toEqual(['ana@x.ro']);
  });

  it('fără argument se comportă ca fără excluderi', async () => {
    await inscrie({ email: 'ana@x.ro' });
    const r = await db.query('select * from runlift.anunt_recipients()');
    expect(r.rows).toHaveLength(1);
  });

  it('ediția curentă e citită la fiecare apel, nu înghețată', async () => {
    await inscrie({ email: 'ana@x.ro', editie: 8 });
    expect(await audienta()).toHaveLength(1);
    await db.exec(`update runlift.app_config set value = '8' where key = 'current_event_edition'`);
    expect(await audienta()).toHaveLength(0);
  });
});

describe('unsubscribe — dezabonarea se aplică persoanei', () => {
  const stareDezabonare = async (email: string) =>
    (
      await db.query<{ tabel: string; dezabonat: boolean }>(
        `select 'reg' tabel, dezabonat_la is not null dezabonat from runlift.registrations
          where lower(btrim(email)) = $1
         union all
         select 'lans', dezabonat_la is not null from runlift.launch_notifications
          where lower(btrim(email)) = $1`,
        [email]
      )
    ).rows;

  const dezaboneaza = async (token: string) =>
    (await db.query<{ r: string }>('select runlift.unsubscribe($1) r', [token])).rows[0].r;

  it('un token de pe un rând marchează TOATE rândurile adresei, în ambele tabele', async () => {
    const tok = await inscrie({ email: 'ana@x.ro', editie: 2 });
    await inscrie({ email: 'ANA@x.ro ', editie: 4 });
    await laLansare(' ana@X.ro');
    expect(await dezaboneaza(tok)).toBe('dezabonat');
    const stare = await stareDezabonare('ana@x.ro');
    expect(stare).toHaveLength(3);
    expect(stare.every((s) => s.dezabonat)).toBe(true);
  });

  it('și tokenul din lista de lansare dezabonează înscrierile', async () => {
    await inscrie({ email: 'ana@x.ro' });
    const tok = await laLansare('ana@x.ro');
    expect(await dezaboneaza(tok)).toBe('dezabonat');
    expect((await stareDezabonare('ana@x.ro')).every((s) => s.dezabonat)).toBe(true);
  });

  it('nu atinge pe altcineva', async () => {
    const tok = await inscrie({ email: 'ana@x.ro' });
    await inscrie({ email: 'ion@x.ro' });
    await dezaboneaza(tok);
    expect((await stareDezabonare('ion@x.ro')).some((s) => s.dezabonat)).toBe(false);
  });

  it('a doua oară → deja_dezabonat', async () => {
    const tok = await inscrie({ email: 'ana@x.ro' });
    await dezaboneaza(tok);
    expect(await dezaboneaza(tok)).toBe('deja_dezabonat');
  });

  it('un token necunoscut → invalid, fără scrieri', async () => {
    await inscrie({ email: 'ana@x.ro' });
    expect(await dezaboneaza('00000000-0000-0000-0000-000000000000')).toBe('invalid');
    expect((await stareDezabonare('ana@x.ro')).some((s) => s.dezabonat)).toBe(false);
  });

  it('nu rescrie data unei dezabonări mai vechi', async () => {
    const tok = await inscrie({ email: 'ana@x.ro', editie: 2, dezabonat: true });
    await inscrie({ email: 'ana@x.ro', editie: 4 });
    await dezaboneaza(tok);
    const r = await db.query<{ d: string }>(
      `select dezabonat_la::text d from runlift.registrations where editie = 2`
    );
    expect(r.rows[0].d).toContain('2026-06-03');
  });

  it('cap-coadă: după dezabonare, persoana dispare din următorul anunț', async () => {
    const tok = await inscrie({ email: 'ana@x.ro', editie: 2 });
    await inscrie({ email: 'ana@x.ro', editie: 5 });
    expect(await audienta()).toHaveLength(1);
    await dezaboneaza(tok);
    expect(await audienta()).toHaveLength(0);
  });
});

describe('admin_replay_anunt_lookup — rejucarea unui anunț eșuat', () => {
  const jurnalizeaza = async (email: string, mod = 'anunt'): Promise<string> =>
    (
      await db.query<{ id: string }>(
        `insert into runlift.email_log (email, nume, subiect, text_email, mod, audienta, status, editie)
         values ($1, 'Ana Popescu', 'Subiectul trimis', 'Textul trimis', $2, 'istoric', 'esuat', $3)
         returning id`,
        [email, mod, EDITIA_CURENTA]
      )
    ).rows[0].id;

  type Plan = { ok: boolean; motiv: string | null; email: string; subiect: string | null; text_email: string | null; token_unsub: string | null };

  const cauta = async (logId: string, token = ADMIN): Promise<Plan> =>
    (await db.query<Plan>('select * from runlift.admin_replay_anunt_lookup($1, $2)', [token, logId]))
      .rows[0];

  it('refuză un token de admin invalid', async () => {
    const id = await jurnalizeaza('ana@x.ro');
    await expect(cauta(id, '22222222-2222-2222-2222-222222222222')).rejects.toThrow('invalid_token');
  });

  it('un rând de jurnal inexistent → jurnal_lipsa', async () => {
    const p = await cauta('33333333-3333-3333-3333-333333333333');
    expect(p).toMatchObject({ ok: false, motiv: 'jurnal_lipsa' });
  });

  it.each(['anunt_test', 'confirm', 'admin'])('modul `%s` nu trece pe aici → mod_exclus', async (mod) => {
    await inscrie({ email: 'ana@x.ro' });
    const p = await cauta(await jurnalizeaza('ana@x.ro', mod));
    expect(p).toMatchObject({ ok: false, motiv: 'mod_exclus' });
  });

  it('întoarce subiectul și textul DIN JURNAL, cu tokenul de dezabonare de acum', async () => {
    await inscrie({ email: 'ana@x.ro', editie: 2, creat: '2026-01-01T00:00:00Z' });
    const recent = await inscrie({ email: 'ana@x.ro', editie: 5, creat: '2026-05-01T00:00:00Z' });
    const p = await cauta(await jurnalizeaza('ANA@x.ro'));
    expect(p).toMatchObject({
      ok: true,
      subiect: 'Subiectul trimis',
      text_email: 'Textul trimis',
      token_unsub: recent,
    });
  });

  it('dezabonat între timp → refuz cu motivul `dezabonat`', async () => {
    const tok = await inscrie({ email: 'ana@x.ro' });
    const id = await jurnalizeaza('ana@x.ro');
    await db.query('select runlift.unsubscribe($1)', [tok]);
    expect(await cauta(id)).toMatchObject({ ok: false, motiv: 'dezabonat', token_unsub: null });
  });

  it('înscris între timp la ediția curentă → nu_mai_e_in_audienta', async () => {
    await inscrie({ email: 'ana@x.ro', editie: 5 });
    const id = await jurnalizeaza('ana@x.ro');
    await inscrie({ email: 'ana@x.ro', editie: EDITIA_CURENTA });
    expect(await cauta(id)).toMatchObject({ ok: false, motiv: 'nu_mai_e_in_audienta' });
  });
});

describe('drepturi — tokenurile de dezabonare nu ies prin cheia publică', () => {
  const caRol = async (rol: string, sql: string) => {
    await db.exec(`set role ${rol}`);
    try {
      return await db.query(sql);
    } finally {
      await db.exec('reset role');
    }
  };

  it.each(['anon', 'authenticated'])('`%s` nu poate chema anunt_recipients', async (rol) => {
    await expect(caRol(rol, 'select * from runlift.anunt_recipients()')).rejects.toThrow(
      /permission denied/
    );
  });

  it.each(['anon', 'authenticated'])('`%s` nu poate chema admin_replay_anunt_lookup', async (rol) => {
    await expect(
      caRol(
        rol,
        `select * from runlift.admin_replay_anunt_lookup('${ADMIN}', gen_random_uuid())`
      )
    ).rejects.toThrow(/permission denied/);
  });

  it('service_role (funcția Edge) le poate chema', async () => {
    await inscrie({ email: 'ana@x.ro' });
    const r = await caRol('service_role', 'select * from runlift.anunt_recipients()');
    expect(r.rows).toHaveLength(1);
  });
});

describe('migrația — sigur de reaplicat', () => {
  it('creează șablonul implicit, cu variabilele pe care le completează serverul', async () => {
    const r = await db.query<{ subiect: string; text_email: string }>(
      `select subiect, text_email from runlift.email_templates where cheie = 'bulk_participant_anunt'`
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].text_email).toContain('https://parktraining.fit/inscriere');
    expect(r.rows[0].text_email).not.toContain('{link_renunt}');
    expect(r.rows[0].text_email).not.toContain('{data_inscrierii}');
  });

  it('a doua aplicare nu strică și nu suprascrie un șablon editat din admin', async () => {
    await db.exec(
      `update runlift.email_templates set subiect = 'Editat' where cheie = 'bulk_participant_anunt'`
    );
    await db.exec(ISTORIC);
    await db.exec(REJUCARE);
    const r = await db.query<{ subiect: string }>(
      `select subiect from runlift.email_templates where cheie = 'bulk_participant_anunt'`
    );
    expect(r.rows[0].subiect).toBe('Editat');
  });
});

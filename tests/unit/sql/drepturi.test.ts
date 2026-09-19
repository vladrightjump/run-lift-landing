// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { porneste, reseteaza, caRol, type BazaTest } from './db';

/**
 * Cine are voie ce, în baza de date.
 *
 * Cheia publishable e vizibilă în bundle-ul JS, deci „rolul `anon`" înseamnă
 * „oricine de pe internet". Un `grant` uitat la o funcție nouă nu se vede în
 * niciun ecran și nu strică nimic vizibil — până când cineva citește tokenurile
 * de dezabonare sau lista de adrese.
 *
 * Testele merg pe INVENTARUL funcțiilor din instantaneu, nu pe o listă scrisă de
 * mână: o funcție nouă intră automat în verificare și trebuie trecută explicit
 * într-una din liste.
 */

let db: BazaTest;

beforeAll(async () => {
  db = await porneste();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(() => reseteaza(db));

const TOKEN_INVENTAT = '99999999-9999-9999-9999-999999999999';

type Functie = { nume: string; argumente: string };

const functii = async (like: string): Promise<Functie[]> =>
  (
    await db.query<Functie>(
      `select p.proname nume, pg_get_function_identity_arguments(p.oid) argumente
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'runlift' and p.proname like $1
        order by p.proname`,
      [like]
    )
  ).rows;

/** Apel cu tokenul dat pe primul argument `uuid`, restul `null` pe tipul lor. */
const apel = (f: Functie, token: string): string => {
  const argumente = f.argumente
    .split(', ')
    .filter(Boolean)
    .map((a, i) => {
      const tip = a.slice(a.indexOf(' ') + 1);
      return i === 0 && tip === 'uuid' ? `'${token}'::uuid` : `null::${tip}`;
    });
  return `select * from runlift.${f.nume}(${argumente.join(', ')})`;
};

describe('funcțiile de admin cer un token de sesiune', () => {
  it('sunt douăzeci și ceva, și toate trec prin verificare', async () => {
    const toate = await functii('admin\\_%');
    // `admin_login` primește user+parolă, nu token; `admin_check_token` ESTE
    // verificarea. Restul trebuie să refuze un token inventat.
    const cuToken = toate.filter((f) => !['admin_login', 'admin_check_token'].includes(f.nume));
    expect(cuToken.length).toBeGreaterThan(20);

    const refuzuri: string[] = [];
    for (const f of cuToken) {
      try {
        const r = await db.query(apel(f, TOKEN_INVENTAT));
        // Fără excepție, singurul răspuns acceptabil e „nimic": nici rânduri,
        // nici `true`.
        const valori = r.rows.flatMap((rand) => Object.values(rand as Record<string, unknown>));
        if (valori.some((v) => v !== null && v !== false)) refuzuri.push(f.nume);
      } catch {
        /* excepția e refuzul așteptat */
      }
    }
    expect(refuzuri).toEqual([]);
  }, 30_000);

  it('un token expirat e la fel de bun ca unul inventat', async () => {
    const r = await db.query<{ admin_check_token: boolean }>(
      `select runlift.admin_check_token($1)`,
      [TOKEN_INVENTAT]
    );
    expect(r.rows[0].admin_check_token).toBe(false);
  });

  it('nicio funcție de admin chemată cu token inventat nu scrie nimic', async () => {
    await db.query(
      `insert into runlift.registrations (nume, telefon, email, acord, editie)
       values ('Ana Popescu', '069000000', 'ana@x.ro', true, 7)`
    );
    const numara = async () =>
      (
        await db.query<{ n: number }>(
          `select (select count(*) from runlift.registrations where deleted_at is null)
                + (select count(*) from runlift.event_waitlist)
                + (select count(*) from runlift.email_templates)
                + (select count(*) from runlift.event_config)
                + (select count(*) from runlift.weekly_workout) as n`
        )
      ).rows[0].n;

    const inainte = await numara();
    for (const f of await functii('admin\\_%')) {
      if (f.nume === 'admin_login') continue;
      await db.query(apel(f, TOKEN_INVENTAT)).catch(() => undefined);
    }
    expect(await numara()).toBe(inainte);
  }, 30_000);
});

describe('ce poate chema cheia publică (rolul anon)', () => {
  /**
   * Funcțiile pe care site-ul public chiar le cheamă, plus cele lăsate
   * deliberat deschise. Orice funcție nouă apare în testul de mai jos și
   * trebuie trecută AICI, conștient, sau revocată.
   */
  const PERMISE_PUBLIC = [
    'public_stats',
    'public_config',
    // Întoarce doar rândul publicat ȘI activ, deci exact ce arată pagina.
    'public_weekly_workout',
    'confirm_signup',
    'decline_spot',
    'unsubscribe',
    'current_event_edition',
    'current_launch_edition',
    'event_config_validate',
    'info_template',
    'template_lookup',
    'confirm_lookup',
    'info_lookup',
    'mark_confirmation_sent',
    'edition2_recipients',
    'waitlist_recipients',
    'broadcast_secret',
    'waitlist_cap',
    'event_waitlist_cap',
    'registrations_guard',
    'registrations_backup_sync',
    'auto_promote_from_waitlist',
    'semnaleaza_locuri_epuizate',
    // RPC-urile de backoffice: deschise rolului anon fiindcă /admin se
    // autentifică prin `p_token`, nu prin sesiune Postgres. Testul de mai sus
    // păzește faptul că fiecare își verifică tokenul.
    ...[
      'admin_add_registration', 'admin_check_token', 'admin_create_edition',
      'admin_delete_registration', 'admin_delete_waitlist', 'admin_get_event_config',
      'admin_list_editions', 'admin_list_email_log', 'admin_list_email_templates',
      'admin_list_events', 'admin_list_launch_notifications', 'admin_list_registrations',
      'admin_list_waitlist', 'admin_login', 'admin_logout', 'admin_promote_waitlist',
      'admin_publish_event_config', 'admin_replay_lookup', 'admin_restore_event_config',
      'admin_save_email_template', 'admin_save_event_config_draft', 'admin_set_coming_soon',
      'admin_undelete_registration', 'admin_undelete_waitlist', 'admin_update_registration',
      'admin_save_weekly_workout', 'admin_list_weekly_workout', 'admin_restore_weekly_workout',
    ],
  ];

  /** Funcțiile care poartă date pe care clientul nu trebuie să le vadă. */
  const DOAR_SERVER = [
    'anunt_recipients',
    'admin_replay_anunt_lookup',
    'log_emails',
    'operator_email',
    'escaladeaza',
    'broadcast_once',
    'maybe_send_reminder',
    'scrie_scalarele_editiei',
    'forteaza_editia_curenta',
  ];

  it('inventarul e complet — o funcție nouă nu poate trece neobservată', async () => {
    const toate = (await functii('%')).map((f) => f.nume);
    const neclasificate = toate.filter(
      (n) => !PERMISE_PUBLIC.includes(n) && !DOAR_SERVER.includes(n)
    );
    expect(neclasificate).toEqual([]);
  });

  it.each(['anunt_recipients', 'admin_replay_anunt_lookup', 'log_emails', 'operator_email'])(
    '`anon` NU poate chema %s',
    async (nume) => {
      const f = (await functii(nume)).find((x) => x.nume === nume)!;
      await expect(
        caRol(db, 'anon', () => db.query(apel(f, TOKEN_INVENTAT)))
      ).rejects.toThrow(/permission denied/);
    }
  );

  it('niciuna dintre funcțiile „doar server" nu e apelabilă de anon sau authenticated', async () => {
    const scapari: string[] = [];
    for (const nume of DOAR_SERVER) {
      for (const rol of ['anon', 'authenticated']) {
        const are = await db.query<{ p: boolean }>(
          `select has_function_privilege($1, p.oid, 'execute') p
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'runlift' and p.proname = $2`,
          [rol, nume]
        );
        if (are.rows.some((r) => r.p)) scapari.push(`${nume}/${rol}`);
      }
    }
    expect(scapari).toEqual([]);
  });

  it('site-ul public își poate citi datele de care are nevoie', async () => {
    await caRol(db, 'anon', async () => {
      await db.query('select runlift.public_stats()');
      await db.query('select runlift.public_config()');
    });
  });
});

describe('citirea directă a tabelelor', () => {
  beforeEach(async () => {
    await db.query(
      `insert into runlift.registrations (nume, telefon, email, acord, editie)
       values ('Ana Popescu', '069509949', 'ana@x.ro', true, 7)`
    );
  });

  /** RLS e singurul lucru dintre cheia publică și lista de adrese. */
  it.each(['registrations', 'event_waitlist', 'launch_notifications', 'email_log', 'admin_users'])(
    '`anon` nu poate citi %s',
    async (tabel) => {
      const r = await caRol(db, 'anon', () => db.query(`select * from runlift.${tabel}`));
      expect(r.rows).toEqual([]);
    }
  );

  it('`anon` nu poate șterge înscrieri', async () => {
    await caRol(db, 'anon', () => db.query('delete from runlift.registrations'));
    const r = await db.query('select 1 from runlift.registrations where deleted_at is null');
    expect(r.rows).toHaveLength(1);
  });

  /**
   * Lockdown-ul anti-bot (`supabase/sql/supabase-migration-turnstile-lockdown.sql`, aplicată
   * pe 17 septembrie 2026). Cheia publishable e în bundle, deci dacă `anon` ar
   * putea insera, un bot ar ocoli Turnstile cu un `curl` — captcha ar fi decor.
   * Singura cale de scriere publică e funcția Edge `submit-form`.
   */
  it.each(['registrations', 'event_waitlist', 'launch_notifications'])(
    '`anon` NU poate insera în %s — ar ocoli captcha',
    async (tabel) => {
      const coloane =
        tabel === 'launch_notifications'
          ? `(nume, prenume, email, telefon) values ('Bot', 'Test', 'bot@test.md', '069000000')`
          : `(nume, telefon, email, acord) values ('Bot Test', '069000000', 'bot@test.md', true)`;
      await expect(
        caRol(db, 'anon', () => db.query(`insert into runlift.${tabel} ${coloane}`))
      ).rejects.toThrow(/permission denied/);
    }
  );

  it('nicio politică nu mai lasă `anon` să scrie, în niciun tabel', async () => {
    const r = await db.query<{ relname: string }>(
      `select c.relname
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'runlift' and c.relkind = 'r'
          and has_table_privilege('anon', c.oid, 'insert')
          and (not c.relrowsecurity
               or exists (select 1 from pg_policies p
                           where p.schemaname = 'runlift' and p.tablename = c.relname
                             and p.cmd = 'INSERT' and p.roles::text like '%anon%'))`
    );
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });

  it('funcția Edge, cu cheia de service, scrie în continuare', async () => {
    await caRol(db, 'service_role', () =>
      db.query(
        `insert into runlift.registrations (nume, telefon, email, acord, editie)
         values ('Ana Popescu', '069000000', 'prin-functie@x.ro', true, 7)`
      )
    );
    const r = await db.query('select 1 from runlift.registrations where email = $1', [
      'prin-functie@x.ro',
    ]);
    expect(r.rows).toHaveLength(1);
  });

  it('RLS e pornit pe toate tabelele', async () => {
    const r = await db.query<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'runlift' and c.relkind = 'r' and not c.relrowsecurity`
    );
    expect(r.rows.map((x) => x.relname)).toEqual([]);
  });
});

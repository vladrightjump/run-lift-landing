import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

/**
 * Schema `runlift` din producție, încărcată într-un Postgres care rulează în
 * proces (PGlite). Fixture-ul e `supabase/schema/runlift.sql` — un instantaneu
 * GENERAT din baza reală, nu o rescriere: funcțiile, triggerele, drepturile și
 * politicile testate aici sunt exact cele care rulează live.
 *
 * Ce nu poate veni din instantaneu, fiindcă ține de infrastructura Supabase:
 *  • rolurile `anon` / `authenticated` / `service_role` (ultimul cu `bypassrls`);
 *  • `pgcrypto` în schema `extensions` (`admin_login` cheamă `crypt`);
 *  • `net.http_post` (pg_net), prin care triggerele cheamă funcțiile Edge. Aici
 *    e un dublu care ÎNREGISTREAZĂ apelurile, deci testele pot verifica faptul
 *    că s-a cerut un email — fără să trimită vreunul.
 */

const SCHEMA_SQL = readFileSync(
  resolve(__dirname, '../../../supabase/schema/runlift.sql'),
  'utf8'
);

const INFRASTRUCTURA = `
  create role anon nologin;
  create role authenticated nologin;
  -- bypassrls, ca in Supabase: cheia de service ocoleste RLS, iar functiile
  -- Edge se bazeaza pe asta ca sa scrie dupa lockdown-ul anti-bot.
  create role service_role nologin bypassrls;
  create schema extensions;
  create extension pgcrypto schema extensions;
  create schema runlift;
  grant usage on schema runlift to anon, authenticated, service_role;

  create schema net;
  create table net._apeluri (id bigserial primary key, url text, body jsonb, headers jsonb, creat timestamptz default now());
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                                headers jsonb default '{}', timeout_milliseconds integer default 5000)
    returns bigint language sql as $$
      insert into net._apeluri (url, body, headers) values (url, body, headers) returning id;
    $$;
`;

/** Tabelele golite între teste. Cele de backup se golesc odată cu sursele. */
const TABELE = [
  'registrations',
  'registrations_backup',
  'event_waitlist',
  'launch_notifications',
  'email_log',
  'email_templates',
  'admin_sessions',
  'admin_users',
  'admin_login_attempts',
  'admin_events',
  'app_config',
  'event_config',
  'weekly_workout',
];

export const ADMIN_TOKEN = '11111111-1111-1111-1111-111111111111';

/** Parola operatorului creat de `reseteaza`. */
export const PAROLA_ADMIN = 'parola-de-test';

export type BazaTest = PGlite;

export const porneste = async (): Promise<BazaTest> => {
  const db = new PGlite({ extensions: { pgcrypto } });
  // Corpurile funcțiilor SQL se validează la creare, iar instantaneul le
  // încarcă înaintea tabelelor pe care le citesc.
  await db.exec('set check_function_bodies = off;');
  await db.exec(INFRASTRUCTURA);
  await db.exec(SCHEMA_SQL);
  return db;
};

export type Reper = {
  /** Ediția curentă (`current_event_edition`). */
  editie?: number;
  /** Numărul de locuri (`event_capacity`). */
  locuri?: number;
  /** Momentul până la care se poate înscrie cineva. */
  deadline?: string;
  /** Startul cursei. */
  start?: string;
};

/** Golește datele și repune reperele ediției. Se cheamă în `beforeEach`. */
export const reseteaza = async (db: BazaTest, r: Reper = {}): Promise<void> => {
  await db.exec('reset role');
  await db.exec(`truncate ${TABELE.map((t) => `runlift.${t}`).join(', ')} cascade; truncate net._apeluri;`);
  const editie = r.editie ?? 7;
  /**
   * Reperele implicite se măsoară față de ACUM, nu scrise ca dată.
   *
   * Erau `2026-09-19T07:00:00+03:00` și deadline-ul cu o oră înainte — chiar
   * momentele ediției 7. Au ținut exact până în dimineața cursei: pe 19
   * septembrie, la 06:00, deadline-ul a trecut, `runlift.register()` a început
   * să răspundă `registration_closed`, iar seed-ul a picat în TOATE testele din
   * `business` și `drepturi` — inclusiv în cele despre RLS, care au nevoie doar
   * de un rând existent. Treizeci și trei de teste roșii fără ca vreo regulă să
   * se fi schimbat, și o dată pe zi de atunci înainte.
   *
   * Testele care au nevoie de o fereastră ÎNCHISĂ o cer explicit (`deadline` sau
   * `start` în 2020), deci relativul nu le atinge.
   */
  const start = r.start ?? new Date(Date.now() + 3_600_000).toISOString();
  const deadline = r.deadline ?? new Date(Date.now() + 1_800_000).toISOString();
  await db.query(
    `insert into runlift.app_config (key, value) values
       ('current_event_edition', $1), ('current_launch_edition', $1),
       ('event_capacity', $2), ('event_start', $3), ('registration_deadline', $4),
       -- Fara ele, escaladeaza() iese tacut pe prima ramura si niciun semnal
       -- catre operator nu pleaca, inclusiv in teste.
       ('operator_email', 'operator@exemplu.ro'), ('broadcast_secret', 'secret-test')
     on conflict (key) do update set value = excluded.value`,
    [String(editie), String(r.locuri ?? 30), start, deadline]
  );
  // Un operator autentificat: RPC-urile de admin cer un token de sesiune viu.
  const user = await db.query<{ id: number }>(
    `insert into runlift.admin_users (username, password_hash)
     values ('operator', extensions.crypt($1, extensions.gen_salt('bf'))) returning id`,
    [PAROLA_ADMIN]
  );
  await db.query(
    `insert into runlift.admin_sessions (token, user_id, expires_at) values ($1, $2, now() + interval '1 hour')`,
    [ADMIN_TOKEN, user.rows[0].id]
  );
};

/** Rulează ceva sub un alt rol (anon/authenticated/service_role). */
export const caRol = async <T>(db: BazaTest, rol: string, f: () => Promise<T>): Promise<T> => {
  await db.exec(`set role ${rol}`);
  try {
    return await f();
  } finally {
    await db.exec('reset role');
  }
};

/** Apelurile pe care triggerele le-au făcut spre funcțiile Edge, prin pg_net. */
export const apeluriEdge = async (db: BazaTest): Promise<{ url: string; body: unknown }[]> =>
  (await db.query<{ url: string; body: unknown }>('select url, body from net._apeluri order by id')).rows;

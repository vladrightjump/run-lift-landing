// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { porneste, reseteaza, caRol, ADMIN_TOKEN, type BazaTest } from './db';

/**
 * Tabelele grupului de antrenament (fostul gym-app + botul de Telegram), în
 * baza de date.
 *
 * Repo-ul preia tabelele astea din `public` fără să le mute: botul le scrie în
 * continuare cu cheia de service, iar adminul le va citi prin funcții
 * `runlift.admin_sala_*`. Testele de aici încep cu caracterizarea a ce există
 * deja — funcția de unire și vederea cu statistici — ca o schimbare ulterioară
 * să nu le altereze pe tăcute.
 *
 * Rulează pe instantaneul din producție (`supabase/schema/sala.sql`, vezi `db.ts`).
 */

let db: BazaTest;

beforeAll(async () => {
  db = await porneste();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(() => reseteaza(db));

const membru = async (nume: string, tg: number | null = null): Promise<string> => {
  const r = await db.query<{ id: string }>(
    `insert into public.members (full_name, telegram_user_id) values ($1, $2) returning id`,
    [nume, tg]
  );
  return r.rows[0].id;
};

const antrenament = async (data: string): Promise<string> => {
  const r = await db.query<{ id: string }>(
    `insert into public.training_sessions (session_date) values ($1) returning id`,
    [data]
  );
  return r.rows[0].id;
};

const raspuns = async (sesiune: string, membruId: string, r: 'yes' | 'no'): Promise<void> => {
  await db.query(
    `insert into public.attendance (session_id, member_id, response) values ($1, $2, $3)`,
    [sesiune, membruId, r]
  );
};

describe('instantaneul grupului', () => {
  it('se încarcă lângă runlift și are cele opt tabele', async () => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_tables
        where schemaname = 'public'
          and tablename in ('members', 'payments', 'training_sessions', 'attendance',
                            'attendance_log', 'bot_config', 'bot_actions', 'telegram_unmatched')`
    );
    expect(r.rows[0].n).toBe(8);
  });

  it('un antrenament nou primește ora și locul implicite', async () => {
    await antrenament('2026-10-06');
    const r = await db.query<{ starts_at: string; location: string; status: string }>(
      `select starts_at::text, location, status from public.training_sessions`
    );
    expect(r.rows[0]).toEqual({
      starts_at: '06:30:00',
      location: 'Parcul Dumitru Râșcanu',
      status: 'scheduled',
    });
  });
});

describe('merge_members (caracterizare)', () => {
  it('mută răspunsurile duplicatului pe membrul păstrat și șterge duplicatul', async () => {
    const pastrat = await membru('Ana Rusu');
    const duplicat = await membru('Ana R.', 555);
    const s1 = await antrenament('2026-09-29');
    const s2 = await antrenament('2026-10-01');
    await raspuns(s1, pastrat, 'yes');
    await raspuns(s1, duplicat, 'no');
    await raspuns(s2, duplicat, 'yes');

    await db.query(`select public.merge_members($1, $2)`, [pastrat, duplicat]);

    const ramasi = await db.query<{ id: string; telegram_user_id: string | null }>(
      `select id, telegram_user_id::text from public.members`
    );
    expect(ramasi.rows).toEqual([{ id: pastrat, telegram_user_id: '555' }]);

    // Pe s1 răspunsul păstratului câștigă; s2 vine de la duplicat.
    const raspunsuri = await db.query<{ session_id: string; response: string }>(
      `select session_id, response from public.attendance where member_id = $1 order by session_id = $2 desc`,
      [pastrat, s1]
    );
    expect(raspunsuri.rows).toEqual([
      { session_id: s1, response: 'yes' },
      { session_id: s2, response: 'yes' },
    ]);
  });

  it('refuză unirea unui membru cu el însuși', async () => {
    const m = await membru('Ion');
    await expect(db.query(`select public.merge_members($1, $1)`, [m])).rejects.toThrow(
      'Nu poți îmbina un membru cu el însuși'
    );
  });
});

describe('member_attendance_stats (caracterizare)', () => {
  it('numără „vin” și „nu vin” și ține ultima prezență', async () => {
    const m = await membru('Maria');
    const s1 = await antrenament('2026-09-29');
    const s2 = await antrenament('2026-10-01');
    const s3 = await antrenament('2026-10-06');
    await raspuns(s1, m, 'yes');
    await raspuns(s2, m, 'yes');
    await raspuns(s3, m, 'no');

    const r = await db.query<{ yes_count: number; no_count: number; last_attended: string }>(
      `select yes_count::int, no_count::int, last_attended::text
         from public.member_attendance_stats where id = $1`,
      [m]
    );
    expect(r.rows[0]).toEqual({ yes_count: 2, no_count: 1, last_attended: '2026-10-01' });
  });

  it('un membru fără răspunsuri apare cu zero și fără ultimă prezență', async () => {
    const m = await membru('Victor');
    const r = await db.query<{ yes_count: number; last_attended: string | null }>(
      `select yes_count::int, last_attended from public.member_attendance_stats where id = $1`,
      [m]
    );
    expect(r.rows[0]).toEqual({ yes_count: 0, last_attended: null });
  });
});

// ---------------------------------------------------------------------------
// Funcțiile adminului (U2)
// ---------------------------------------------------------------------------

const TOKEN_GRESIT = '22222222-2222-2222-2222-222222222222';

const cheama = async <T = unknown>(fn: string, ...args: unknown[]): Promise<T> => {
  const semne = args.map((_, i) => `$${i + 1}`).join(', ');
  const r = await db.query<Record<string, T>>(`select runlift.${fn}(${semne}) as r`, args);
  return r.rows[0].r;
};

/** Același apel, dar ca `anon` — rolul cu care cheamă browserul (cheia publică). */
const cheamaAnon = <T = unknown>(fn: string, ...args: unknown[]): Promise<T> =>
  caRol(db, 'anon', () => cheama<T>(fn, ...args));

/** Ziua de azi după baza de date (la Chișinău), plus `n` zile. */
const ziua = async (n = 0): Promise<string> =>
  (await db.query<{ d: string }>(`select (runlift.sala_azi() + $1::int)::text as d`, [n])).rows[0].d;

const configValid = (peste: Record<string, unknown> = {}) => ({
  enabled: true,
  poll_days: [1, 3],
  poll_time: '12:00',
  summary_days: [2, 4],
  summary_time: '06:00',
  training_time: '06:30',
  location: 'Parcul Dumitru Râșcanu',
  auto_reminder_enabled: true,
  reminder_threshold: 6,
  poll_title: '',
  poll_yes_label: '',
  poll_no_label: '',
  ...peste,
});

const randBotConfig = async () =>
  (await db.query<Record<string, unknown>>(`select * from public.bot_config where id = 1`)).rows[0];

const comenzi = async () =>
  (
    await db.query<{ action: string; status: string; member_id: string | null }>(
      `select action, status, member_id from public.bot_actions order by created_at`
    )
  ).rows;

const evenimente = async () =>
  (
    await db.query<{ tip: string; detaliu: Record<string, unknown> }>(
      `select tip, detaliu from runlift.admin_events order by created_at`
    )
  ).rows;

describe('tokenul', () => {
  const apeluri: [string, unknown[]][] = [
    ['admin_sala_date', []],
    ['admin_sala_rezumat', []],
    ['admin_sala_set_prezenta', [null, null, 'yes']],
    ['admin_sala_seteaza_antrenament', ['2026-10-06', true]],
    ['admin_sala_salveaza_config', [JSON.stringify({})]],
    ['admin_sala_porneste_bot', [true]],
    ['admin_sala_comanda', ['send_poll', null]],
    ['admin_sala_scoate_din_grup', [null]],
    ['admin_sala_salveaza_membru', [null, 'Ana', null, null, 'active', false]],
    ['admin_sala_leaga_cont', [1, null]],
    ['admin_sala_membru_din_cont', [1, 'Ana']],
    ['admin_sala_uneste', [null, null]],
  ];

  it.each(apeluri)('%s refuză un token invalid', async (fn, rest) => {
    await expect(cheama(fn, TOKEN_GRESIT, ...rest)).rejects.toThrow('invalid_token');
  });

  it('anon le poate chema, dar doar cu token valid', async () => {
    await expect(
      caRol(db, 'anon', () => db.query(`select runlift.admin_sala_date($1)`, [TOKEN_GRESIT]))
    ).rejects.toThrow('invalid_token');
    const r = await caRol(db, 'anon', () =>
      db.query<{ r: { membri: unknown[] } }>(`select runlift.admin_sala_date($1) as r`, [ADMIN_TOKEN])
    );
    expect(r.rows[0].r.membri).toEqual([]);
  });

  it('ajutoarele interne nu se pot chema din afară', async () => {
    await expect(caRol(db, 'anon', () => db.query(`select runlift.sala_azi()`))).rejects.toThrow(
      /permission denied/
    );
    await expect(
      caRol(db, 'anon', () => db.query(`select runlift.sala_jurnal($1, 'x', '{}')`, [ADMIN_TOKEN]))
    ).rejects.toThrow(/permission denied/);
  });

  it('anon nu mai poate chema merge_members direct', async () => {
    const a = await membru('Ana');
    const b = await membru('Ana R.');
    await expect(
      caRol(db, 'anon', () => db.query(`select public.merge_members($1, $2)`, [a, b]))
    ).rejects.toThrow(/permission denied/);
  });
});

describe('admin_sala_date', () => {
  it('întoarce membrii, antrenamentele, răspunsurile, conturile necunoscute, setările și comenzile', async () => {
    const m = await membru('Maria', 101);
    const ieri = await ziua(-1);
    const s = await antrenament(ieri);
    await raspuns(s, m, 'yes');
    await db.query(`insert into public.telegram_unmatched (telegram_user_id, first_name) values (909, 'Străin')`);
    await db.query(`insert into public.bot_config (id) values (1)`);
    await db.query(`insert into public.bot_actions (action) values ('send_poll')`);

    const d = await cheama<Record<string, unknown[] & Record<string, unknown>>>('admin_sala_date', ADMIN_TOKEN);
    expect(d.membri).toHaveLength(1);
    expect(d.antrenamente).toEqual([
      expect.objectContaining({ id: s, session_date: ieri, starts_at: '06:30', poll_sent: false }),
    ]);
    expect(d.raspunsuri).toEqual([expect.objectContaining({ session_id: s, member_id: m, response: 'yes' })]);
    expect(d.necunoscuti).toEqual([expect.objectContaining({ telegram_user_id: 909 })]);
    expect(d.config).toEqual(expect.objectContaining({ id: 1, poll_title: null }));
    expect(d.comenzi).toEqual([expect.objectContaining({ action: 'send_poll', status: 'pending' })]);
  });

  it('membrii vin fără telefon și email: niciun ecran nu le folosește', async () => {
    await db.query(
      `insert into public.members (full_name, phone, email) values ('Maria', '069123456', 'maria@x.ro')`
    );
    const d = await cheama<{ membri: Record<string, unknown>[] }>('admin_sala_date', ADMIN_TOKEN);
    expect(Object.keys(d.membri[0]).sort()).toEqual([
      'bot_dm_enabled',
      'full_name',
      'id',
      'is_admin',
      'join_date',
      'status',
      'telegram_user_id',
      'telegram_username',
    ]);
  });

  it('fereastra de 800 de zile și ultimele 30 de comenzi, cea mai nouă prima', async () => {
    const m = await membru('Ana');
    const vechi = await antrenament(await ziua(-801));
    const inFereastra = await antrenament(await ziua(-799));
    await raspuns(vechi, m, 'yes');
    await raspuns(inFereastra, m, 'yes');
    await db.query(
      `insert into public.bot_actions (action, created_at)
       select 'send_summary', now() - make_interval(mins => g) from generate_series(1, 31) g`
    );
    const d = await cheama<{
      antrenamente: { id: string }[];
      raspunsuri: { session_id: string }[];
      comenzi: { created_at: string }[];
    }>('admin_sala_date', ADMIN_TOKEN);
    expect(d.antrenamente.map((a) => a.id)).toEqual([inFereastra]);
    expect(d.raspunsuri.map((r) => r.session_id)).toEqual([inFereastra]);
    expect(d.comenzi).toHaveLength(30);
    const ore = d.comenzi.map((c) => c.created_at);
    expect([...ore].sort().reverse()).toEqual(ore);
  });

  it('scoateri: ultima scoatere a fiecărui membru, oricât de veche, chiar dincolo de ultimele 30 de comenzi', async () => {
    const ana = await membru('Ana', 555);
    const ion = await membru('Ion', 556);
    await db.query(
      `insert into public.bot_actions (action, member_id, telegram_user_id, status, result, created_at) values
         ('kick_member', $1, 555, 'failed', 'Bad Request: not enough rights', now() - interval '2 days'),
         ('kick_member', $1, 555, 'done', 'kicked', now() - interval '1 day'),
         ('kick_member', $2, 556, 'failed', 'Bad Request: not enough rights', now() - interval '3 days'),
         ('kick_member', null, null, 'failed', 'fără membru', now() - interval '4 days')`,
      [ana, ion]
    );
    // 31 de comenzi mai noi împing toate scoaterile afară din `comenzi`.
    await db.query(
      `insert into public.bot_actions (action, created_at)
       select 'send_summary', now() - make_interval(mins => g) from generate_series(1, 31) g`
    );
    const d = await cheama<{
      comenzi: { action: string }[];
      scoateri: { member_id: string; action: string; status: string; result: string; created_at: string }[];
    }>('admin_sala_date', ADMIN_TOKEN);
    expect(d.comenzi.some((c) => c.action === 'kick_member')).toBe(false);
    expect(d.scoateri.map((k) => [k.member_id, k.status])).toEqual([
      [ana, 'done'],
      [ion, 'failed'],
    ]);
    expect(Object.keys(d.scoateri[1]).sort()).toEqual(
      ['action', 'created_at', 'id', 'member_id', 'processed_at', 'result', 'status'].sort()
    );
    expect(d.scoateri[1].result).toBe('Bad Request: not enough rights');
  });

  it('scoateri e o listă goală când nimeni n-a fost scos', async () => {
    const d = await cheama<{ scoateri: unknown[] }>('admin_sala_date', ADMIN_TOKEN);
    expect(d.scoateri).toEqual([]);
  });

  it('nu întoarce nicio plată', async () => {
    const m = await membru('Maria');
    // O sumă pe care n-o poate conține întâmplător un uuid sau o dată.
    await db.query(`insert into public.payments (member_id, amount) values ($1, 7777.77)`, [m]);
    const d = await cheama<Record<string, unknown>>('admin_sala_date', ADMIN_TOKEN);
    expect(JSON.stringify(d)).not.toMatch(/payment|amount|7777\.77/);
  });
});

describe('admin_sala_rezumat', () => {
  it('fără antrenament viitor întoarce orarul, ca să se poată spune când pleacă sondajul', async () => {
    await db.query(`insert into public.bot_config (id, poll_time) values (1, '12:00')`);
    const r = await cheama<Record<string, unknown>>('admin_sala_rezumat', ADMIN_TOKEN);
    expect(r).toEqual(
      expect.objectContaining({ pornit: true, poll_days: [1, 3], poll_time: '12:00', urmatorul: null })
    );
  });

  it('cu antrenament viitor numără cine vine și cine nu', async () => {
    const azi = (await db.query<{ d: string }>(`select runlift.sala_azi()::text as d`)).rows[0].d;
    const s = await antrenament(azi);
    await raspuns(s, await membru('A'), 'yes');
    await raspuns(s, await membru('B'), 'yes');
    await raspuns(s, await membru('C'), 'no');
    const r = await cheama<{ urmatorul: Record<string, unknown> }>('admin_sala_rezumat', ADMIN_TOKEN);
    expect(r.urmatorul).toEqual(
      expect.objectContaining({ session_date: azi, status: 'scheduled', vin: 2, nu_vin: 1 })
    );
  });

  it('spune dacă sondajul antrenamentului următor a plecat (AE4)', async () => {
    const maine = await ziua(1);
    await antrenament(maine);
    let r = await cheama<{ urmatorul: Record<string, unknown> }>('admin_sala_rezumat', ADMIN_TOKEN);
    expect(r.urmatorul).toEqual(expect.objectContaining({ session_date: maine, poll_sent: false }));
    await db.query(`update public.training_sessions set poll_message_id = 42`);
    r = await cheama<{ urmatorul: Record<string, unknown> }>('admin_sala_rezumat', ADMIN_TOKEN);
    expect(r.urmatorul).toEqual(expect.objectContaining({ poll_sent: true }));
  });

  it('un antrenament trecut nu mai e „următorul”', async () => {
    await antrenament('2020-01-01');
    const r = await cheama<{ urmatorul: unknown }>('admin_sala_rezumat', ADMIN_TOKEN);
    expect(r.urmatorul).toBeNull();
  });
});

describe('admin_sala_set_prezenta', () => {
  it('„yes” scrie prezența, o marchează prim antrenament și lasă urmă în jurnal', async () => {
    const m = await membru('Ion');
    const s = await antrenament('2026-10-06');
    await cheama('admin_sala_set_prezenta', ADMIN_TOKEN, s, m, 'yes');

    const a = await db.query(`select response, is_first_training from public.attendance`);
    expect(a.rows).toEqual([{ response: 'yes', is_first_training: true }]);
    const j = await db.query(`select response, source from public.attendance_log`);
    expect(j.rows).toEqual([{ response: 'yes', source: 'manual' }]);
  });

  it('Covers R6. se poate marca de mână și un membru fără Telegram sau în pauză', async () => {
    const faraCont = await membru('Fără cont');
    const pauza = await membru('În pauză', 777);
    await db.query(`update public.members set status = 'paused' where id = $1`, [pauza]);
    const s = await antrenament('2026-10-06');
    await cheama('admin_sala_set_prezenta', ADMIN_TOKEN, s, faraCont, 'yes');
    await cheama('admin_sala_set_prezenta', ADMIN_TOKEN, s, pauza, 'yes');
    const a = await db.query(`select member_id, response from public.attendance order by member_id`);
    expect(a.rows).toEqual(
      [
        { member_id: faraCont, response: 'yes' },
        { member_id: pauza, response: 'yes' },
      ].sort((x, y) => x.member_id.localeCompare(y.member_id))
    );
  });

  it('nu e prim antrenament dacă a mai venit înainte', async () => {
    const m = await membru('Ion');
    await raspuns(await antrenament('2026-09-29'), m, 'yes');
    const s = await antrenament('2026-10-06');
    await cheama('admin_sala_set_prezenta', ADMIN_TOKEN, s, m, 'yes');
    const a = await db.query(`select is_first_training from public.attendance where session_id = $1`, [s]);
    expect(a.rows).toEqual([{ is_first_training: false }]);
  });

  it('„clear” șterge răspunsul, iar jurnalul ține ștergerea', async () => {
    const m = await membru('Ion');
    const s = await antrenament('2026-10-06');
    await raspuns(s, m, 'no');
    await cheama('admin_sala_set_prezenta', ADMIN_TOKEN, s, m, 'clear');
    expect((await db.query(`select 1 from public.attendance`)).rows).toHaveLength(0);
    const j = await db.query(`select response, source from public.attendance_log`);
    expect(j.rows).toEqual([{ response: 'clear', source: 'manual' }]);
  });

  it('refuză un membru inexistent', async () => {
    const s = await antrenament('2026-10-06');
    await expect(
      cheama('admin_sala_set_prezenta', ADMIN_TOKEN, s, '33333333-3333-3333-3333-333333333333', 'yes')
    ).rejects.toThrow('membru_inexistent');
  });

  it('un „yes” repetat pe același antrenament nu dublează rândul și rămâne prim antrenament', async () => {
    const m = await membru('Ion');
    const s = await antrenament('2026-10-06');
    await cheama('admin_sala_set_prezenta', ADMIN_TOKEN, s, m, 'yes');
    await cheama('admin_sala_set_prezenta', ADMIN_TOKEN, s, m, 'yes');
    const a = await db.query(`select response, is_first_training from public.attendance`);
    expect(a.rows).toEqual([{ response: 'yes', is_first_training: true }]);
    expect((await db.query(`select 1 from public.attendance_log`)).rows).toHaveLength(2);
  });

  it('refuză un răspuns necunoscut și un antrenament inexistent', async () => {
    const m = await membru('Ion');
    const s = await antrenament('2026-10-06');
    await expect(cheama('admin_sala_set_prezenta', ADMIN_TOKEN, s, m, 'poate')).rejects.toThrow('raspuns_invalid');
    await expect(
      cheama('admin_sala_set_prezenta', ADMIN_TOKEN, '33333333-3333-3333-3333-333333333333', m, 'yes')
    ).rejects.toThrow('antrenament_inexistent');
  });
});

describe('admin_sala_seteaza_antrenament', () => {
  it('anularea unei zile fără antrenament creează rândul anulat', async () => {
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true);
    const r = await db.query(`select session_date::text, status from public.training_sessions`);
    expect(r.rows).toEqual([{ session_date: '2026-10-08', status: 'cancelled' }]);
  });

  it('rândul creat de anulare ia ora și locul din setările botului', async () => {
    await db.query(
      `insert into public.bot_config (id, training_time, location) values (1, '07:15', 'Parcul Valea Morilor')`
    );
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true);
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', false);
    const r = await db.query(`select starts_at::text, location, status from public.training_sessions`);
    expect(r.rows).toEqual([{ starts_at: '07:15:00', location: 'Parcul Valea Morilor', status: 'scheduled' }]);
  });

  it('anularea unei zile care are deja antrenament nu-i schimbă ora', async () => {
    await db.query(`insert into public.bot_config (id, training_time) values (1, '07:15')`);
    await antrenament('2026-10-08');
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true);
    const r = await db.query(`select starts_at::text, status from public.training_sessions`);
    expect(r.rows).toEqual([{ starts_at: '06:30:00', status: 'cancelled' }]);
  });

  it('refuză o zi lipsă', async () => {
    await expect(cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, null, true)).rejects.toThrow('data_invalida');
  });

  it('reactivarea nu atinge un antrenament ținut deja', async () => {
    await db.query(`insert into public.training_sessions (session_date, status) values ('2026-10-01', 'done')`);
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-01', false);
    const r = await db.query(`select status from public.training_sessions`);
    expect(r.rows).toEqual([{ status: 'done' }]);
  });

  it('reactivarea pune ziua înapoi pe scheduled', async () => {
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true);
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', false);
    const r = await db.query(`select status from public.training_sessions`);
    expect(r.rows).toEqual([{ status: 'scheduled' }]);
  });
});

describe('anunțul anulării din admin (sala_06, R13)', () => {
  const coada = async () =>
    (
      await db.query<{ action: string; status: string; payload: Record<string, unknown> | null }>(
        `select action, status, payload from public.bot_actions order by created_at`
      )
    ).rows;

  /** Un antrenament al cărui sondaj e deja în grup. */
  const cuSondaj = async (data: string, status = 'scheduled') => {
    await db.query(
      `insert into public.training_sessions (session_date, status, poll_message_id) values ($1, $2, 4242)`,
      [data, status]
    );
  };

  it('anularea unui antrenament cu sondaj în grup pune anunțul în coadă, cu data, motivul și adminul', async () => {
    await cuSondaj('2026-10-08');
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true, '  ploaie  ');
    expect(await coada()).toEqual([
      {
        action: 'cancel_session',
        status: 'pending',
        payload: { data: '2026-10-08', motiv: 'ploaie', sursa: 'admin', organizator: 'operator' },
      },
    ]);
  });

  it('reactivarea unui antrenament anulat cu sondaj în grup pune anunțul de reactivare', async () => {
    await cuSondaj('2026-10-08', 'cancelled');
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', false);
    expect((await coada()).map((c) => [c.action, c.payload?.data])).toEqual([['reactivate_session', '2026-10-08']]);
  });

  it('fără sondaj în grup nu pune nimic în coadă (R11)', async () => {
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true);
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', false);
    expect(await coada()).toEqual([]);
  });

  it('o anulare sau reactivare care nu schimbă starea nu mai anunță o dată', async () => {
    await cuSondaj('2026-10-08', 'cancelled');
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true);
    await cuSondaj('2026-10-09');
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-09', false);
    expect(await coada()).toEqual([]);
  });

  it('un motiv gol sau doar spații nu intră în payload', async () => {
    await cuSondaj('2026-10-08');
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true, ' \t ');
    expect((await coada())[0].payload).toEqual({ data: '2026-10-08', sursa: 'admin', organizator: 'operator' });
  });

  it('un motiv peste 200 de caractere e refuzat, fără nicio scriere', async () => {
    await cuSondaj('2026-10-08');
    await expect(
      cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true, 'x'.repeat(201))
    ).rejects.toThrow('motiv_prea_lung');
    expect(await coada()).toEqual([]);
    const r = await db.query(`select status from public.training_sessions`);
    expect(r.rows).toEqual([{ status: 'scheduled' }]);
  });

  it('cu un token greșit nu scrie nimic', async () => {
    await cuSondaj('2026-10-08');
    await expect(cheama('admin_sala_seteaza_antrenament', TOKEN_GRESIT, '2026-10-08', true)).rejects.toThrow(
      'invalid_token'
    );
    expect(await coada()).toEqual([]);
  });

  it('motivul ajunge și în urma adminului', async () => {
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true, 'ploaie');
    expect((await evenimente())[0].detaliu).toEqual(
      expect.objectContaining({ data: '2026-10-08', motiv: 'ploaie', admin: 'operator' })
    );
  });

  it('apelul pe nume cu cei trei parametri vechi încă merge (adminul deployat)', async () => {
    await caRol(db, 'anon', () =>
      db.query(`select runlift.admin_sala_seteaza_antrenament(p_token => $1, p_data => $2, p_anulat => true)`, [
        ADMIN_TOKEN,
        '2026-10-08',
      ])
    );
    const r = await db.query(`select status from public.training_sessions`);
    expect(r.rows).toEqual([{ status: 'cancelled' }]);
  });

  it('coada acceptă acțiunile noi și refuză una necunoscută', async () => {
    for (const a of ['cancel_session', 'reactivate_session', 'move_session', 'add_session']) {
      await db.query(`insert into public.bot_actions (action, status) values ($1, 'done')`, [a]);
    }
    await expect(
      db.query(`insert into public.bot_actions (action, status) values ('altceva', 'done')`)
    ).rejects.toThrow(/bot_actions_action_check/);
  });

  it('„Ultimele comenzi" spun sursa, organizatorul și data; rândurile vechi le au nule', async () => {
    await db.query(
      `insert into public.bot_actions (action, status, payload, created_at) values
         ('move_session', 'done', '{"sursa":"telegram","organizator":"Vlad","data":"2026-10-08"}', now()),
         ('send_poll', 'done', null, now() - interval '1 minute')`
    );
    const d = await cheama<{ comenzi: Record<string, unknown>[] }>('admin_sala_date', ADMIN_TOKEN);
    expect(d.comenzi.map((c) => [c.action, c.sursa, c.organizator, c.data])).toEqual([
      ['move_session', 'telegram', 'Vlad', '2026-10-08'],
      ['send_poll', null, null, null],
    ]);
  });
});

describe('admin_sala_salveaza_config', () => {
  it('scrie setările valide și ține textul gol ca null', async () => {
    await cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid()));
    expect(await randBotConfig()).toEqual(
      expect.objectContaining({
        enabled: true,
        poll_days: [1, 3],
        poll_time: '12:00',
        summary_days: [2, 4],
        reminder_threshold: 6,
        poll_title: null,
        poll_yes_label: null,
        poll_no_label: null,
      })
    );
  });

  it('păstrează textul sondajului când e completat', async () => {
    await cheama(
      'admin_sala_salveaza_config',
      ADMIN_TOKEN,
      JSON.stringify(configValid({ poll_title: '  Alergăm mâine  ', poll_yes_label: 'Da!', poll_no_label: 'Nu' }))
    );
    expect(await randBotConfig()).toEqual(
      expect.objectContaining({ poll_title: 'Alergăm mâine', poll_yes_label: 'Da!', poll_no_label: 'Nu' })
    );
  });

  it.each([
    ['ora 25:00', { poll_time: '25:00' }, 'ora_invalida'],
    ['ora fără zero', { summary_time: '6:00' }, 'ora_invalida'],
    ['ziua 7', { poll_days: [1, 7] }, 'zi_invalida'],
    ['zile dublate', { poll_days: [1, 1] }, 'zi_invalida'],
    ['pragul negativ', { reminder_threshold: -1 }, 'prag_invalid'],
    ['locul gol', { location: '   ' }, 'loc_invalid'],
    ['titlul prea lung', { poll_title: 'x'.repeat(81) }, 'text_prea_lung'],
    ['eticheta prea lungă', { poll_yes_label: 'x'.repeat(33) }, 'text_prea_lung'],
    ['eticheta „nu" prea lungă', { poll_no_label: 'x'.repeat(33) }, 'text_prea_lung'],
    ['zilele care nu-s listă', { poll_days: 3 }, 'zi_invalida'],
    ['zilele lipsă', { summary_days: null }, 'zi_invalida'],
    ['o zi scrisă ca text', { poll_days: ['1'] }, 'zi_invalida'],
    ['ora lipsă', { training_time: null }, 'ora_invalida'],
    ['locul prea lung', { location: 'x'.repeat(121) }, 'loc_invalid'],
    ['pornit scris ca text', { enabled: 'da' }, 'config_invalid'],
    ['pragul cu virgulă', { reminder_threshold: 1.5 }, 'prag_invalid'],
    ['pragul peste 999', { reminder_threshold: 1000 }, 'prag_invalid'],
  ])('refuză %s și lasă rândul neschimbat', async (_, peste, eroare) => {
    await cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid()));
    const inainte = await randBotConfig();
    await expect(
      cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid(peste)))
    ).rejects.toThrow(eroare);
    expect(await randBotConfig()).toEqual(inainte);
  });

  it('nu repornește un bot oprit între timp: `enabled` îl schimbă doar comutatorul', async () => {
    await cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid()));
    await cheama('admin_sala_porneste_bot', ADMIN_TOKEN, false);
    // O ciornă citită înainte de oprire poartă încă `enabled: true`.
    await cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid({ location: 'Alt parc' })));
    expect(await randBotConfig()).toEqual(expect.objectContaining({ enabled: false, location: 'Alt parc' }));
  });

  it('prima salvare, fără rând, scrie și `enabled`', async () => {
    await cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid({ enabled: false })));
    expect(await randBotConfig()).toEqual(expect.objectContaining({ enabled: false }));
  });

  it('un text doar din spații albe (și tab-uri) înseamnă textul de azi', async () => {
    await cheama(
      'admin_sala_salveaza_config',
      ADMIN_TOKEN,
      JSON.stringify(configValid({ poll_title: ' \t ', location: '\tParcul Valea Morilor\t' }))
    );
    expect(await randBotConfig()).toEqual(
      expect.objectContaining({ poll_title: null, location: 'Parcul Valea Morilor' })
    );
  });

  it('refuză un corp care nu e obiect', async () => {
    await expect(cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify([1]))).rejects.toThrow(
      'config_invalid'
    );
  });

  it('comutatorul fără rând de setări îl creează, ca să nu mintă că a oprit botul', async () => {
    await cheama('admin_sala_porneste_bot', ADMIN_TOKEN, false);
    expect(await randBotConfig()).toEqual(expect.objectContaining({ enabled: false }));
  });

  it('comutatorul pornit/oprit nu atinge orarul', async () => {
    await cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid()));
    await cheama('admin_sala_porneste_bot', ADMIN_TOKEN, false);
    expect(await randBotConfig()).toEqual(expect.objectContaining({ enabled: false, poll_time: '12:00' }));
  });
});

describe('admin_sala_comanda', () => {
  it('adaugă comanda în coadă, în așteptare', async () => {
    await cheama('admin_sala_comanda', ADMIN_TOKEN, 'send_poll', null);
    await cheama('admin_sala_comanda', ADMIN_TOKEN, 'send_reminder', null);
    expect(await comenzi()).toEqual([
      { action: 'send_poll', status: 'pending', member_id: null },
      { action: 'send_reminder', status: 'pending', member_id: null },
    ]);
  });

  it('mesajul liber poartă HTML-ul în payload', async () => {
    await cheama('admin_sala_comanda', ADMIN_TOKEN, 'send_message', '<b>Mâine</b> alergăm');
    const r = await db.query(`select payload from public.bot_actions`);
    expect(r.rows).toEqual([{ payload: { html: '<b>Mâine</b> alergăm' } }]);
  });

  it('a doua apăsare cât prima așteaptă nu mai pune nimic în coadă', async () => {
    const a = await cheama<string>('admin_sala_comanda', ADMIN_TOKEN, 'send_poll', null);
    const b = await cheama<string>('admin_sala_comanda', ADMIN_TOKEN, 'send_poll', null);
    expect(b).toBe(a);
    expect(await comenzi()).toEqual([{ action: 'send_poll', status: 'pending', member_id: null }]);
    // După ce botul a executat-o, o apăsare nouă e o comandă nouă.
    await db.query(`update public.bot_actions set status = 'done'`);
    const c = await cheama<string>('admin_sala_comanda', ADMIN_TOKEN, 'send_poll', null);
    expect(c).not.toBe(a);
  });

  it('mesajele libere nu se unesc: fiecare e alt text', async () => {
    await cheama('admin_sala_comanda', ADMIN_TOKEN, 'send_message', 'Unu');
    await cheama('admin_sala_comanda', ADMIN_TOKEN, 'send_message', 'Doi');
    expect(await comenzi()).toHaveLength(2);
  });

  it.each(['send_poll', 'send_reminder'])(
    'refuză %s când antrenamentul de mâine e anulat, fără rând în coadă',
    async (actiune) => {
      await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, await ziua(1), true);
      await expect(cheama('admin_sala_comanda', ADMIN_TOKEN, actiune, null)).rejects.toThrow('antrenament_anulat');
      expect(await comenzi()).toEqual([]);
    }
  );

  it('rezumatul pleacă și când mâine e anulat (e pentru admini, nu pentru grup)', async () => {
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, await ziua(1), true);
    await cheama('admin_sala_comanda', ADMIN_TOKEN, 'send_summary', null);
    expect(await comenzi()).toEqual([{ action: 'send_summary', status: 'pending', member_id: null }]);
  });

  it('refuză o comandă din afara listei, fără rând în coadă', async () => {
    await expect(cheama('admin_sala_comanda', ADMIN_TOKEN, 'kick_member', null)).rejects.toThrow(
      'comanda_necunoscuta'
    );
    expect(await comenzi()).toEqual([]);
  });

  it('refuză un mesaj gol sau peste limita Telegram', async () => {
    await expect(cheama('admin_sala_comanda', ADMIN_TOKEN, 'send_message', '   ')).rejects.toThrow('mesaj_gol');
    await expect(cheama('admin_sala_comanda', ADMIN_TOKEN, 'send_message', 'x'.repeat(4097))).rejects.toThrow(
      'mesaj_prea_lung'
    );
  });
});

describe('admin_sala_scoate_din_grup', () => {
  it('Covers AE2. refuză un admin și nu-i schimbă starea', async () => {
    const m = await membru('Roma', 777);
    await db.query(`update public.members set is_admin = true where id = $1`, [m]);
    await expect(cheama('admin_sala_scoate_din_grup', ADMIN_TOKEN, m)).rejects.toThrow('membru_admin');
    expect(await comenzi()).toEqual([]);
    const r = await db.query(`select status from public.members`);
    expect(r.rows).toEqual([{ status: 'active' }]);
  });

  it('refuză un membru fără cont de Telegram', async () => {
    const m = await membru('Fără cont');
    await expect(cheama('admin_sala_scoate_din_grup', ADMIN_TOKEN, m)).rejects.toThrow('fara_telegram');
  });

  it('un membru obișnuit trece pe cancelled și primește o comandă kick_member', async () => {
    const m = await membru('Ana', 555);
    await cheama('admin_sala_scoate_din_grup', ADMIN_TOKEN, m);
    expect(await comenzi()).toEqual([{ action: 'kick_member', status: 'pending', member_id: m }]);
    const r = await db.query(`select status from public.members`);
    expect(r.rows).toEqual([{ status: 'cancelled' }]);
  });
});

describe('membrii', () => {
  it('salvează numele, contul, starea și adminul', async () => {
    const m = await membru('ana');
    await cheama('admin_sala_salveaza_membru', ADMIN_TOKEN, m, '  Ana   Rusu ', 12345, '@ana_r', 'paused', true);
    const r = await db.query(
      `select full_name, telegram_user_id::text as tg, telegram_username, status, is_admin from public.members`
    );
    expect(r.rows).toEqual([
      { full_name: 'Ana Rusu', tg: '12345', telegram_username: 'ana_r', status: 'paused', is_admin: true },
    ]);
  });

  it.each([
    ['numele prea scurt', ['A', null, null, 'active', false], 'nume_invalid'],
    ['un utilizator cu caractere HTML', ['Ana', null, '<b>', 'active', false], 'utilizator_invalid'],
    ['o stare necunoscută', ['Ana', null, null, 'sters', false], 'status_invalid'],
  ])('refuză %s', async (_, rest, eroare) => {
    const m = await membru('Ana');
    await expect(cheama('admin_sala_salveaza_membru', ADMIN_TOKEN, m, ...rest)).rejects.toThrow(eroare);
  });

  it.each([
    ['un membru inexistent', 'membru_inexistent', true],
    ['un id de Telegram sub 100', 'telegram_invalid', false],
    ['un nume peste 80 de caractere', 'nume_invalid', false],
  ])('refuză %s', async (_, eroare, inexistent) => {
    const m = inexistent ? '33333333-3333-3333-3333-333333333333' : await membru('Ana');
    const nume = eroare === 'nume_invalid' ? 'x'.repeat(81) : 'Ana';
    const tg = eroare === 'telegram_invalid' ? 99 : null;
    await expect(cheama('admin_sala_salveaza_membru', ADMIN_TOKEN, m, nume, tg, null, 'active', false)).rejects.toThrow(
      eroare
    );
  });

  it('legarea sau crearea dintr-un cont care nu (mai) e în listă e refuzată cu nume', async () => {
    const m = await membru('Ana');
    await expect(cheama('admin_sala_leaga_cont', ADMIN_TOKEN, 909, m)).rejects.toThrow('cont_inexistent');
    await expect(cheama('admin_sala_membru_din_cont', ADMIN_TOKEN, 909, 'Dan')).rejects.toThrow('cont_inexistent');
  });

  it('unirea cu un membru inexistent e refuzată', async () => {
    const a = await membru('Ana');
    await expect(
      cheama('admin_sala_uneste', ADMIN_TOKEN, a, '33333333-3333-3333-3333-333333333333')
    ).rejects.toThrow('membru_inexistent');
  });

  it('refuză un cont de Telegram legat deja de alt membru', async () => {
    await membru('Primul', 555);
    const al2lea = await membru('Al doilea');
    await expect(
      cheama('admin_sala_salveaza_membru', ADMIN_TOKEN, al2lea, 'Al doilea', 555, null, 'active', false)
    ).rejects.toThrow('telegram_deja_legat');
  });

  it('leagă un cont necunoscut de un membru și îl scoate din listă', async () => {
    const m = await membru('Ana');
    await db.query(`insert into public.telegram_unmatched (telegram_user_id, username) values (909, 'ana_tg')`);
    await cheama('admin_sala_leaga_cont', ADMIN_TOKEN, 909, m);
    const r = await db.query(`select telegram_user_id::text as tg, telegram_username from public.members`);
    expect(r.rows).toEqual([{ tg: '909', telegram_username: 'ana_tg' }]);
    expect((await db.query(`select 1 from public.telegram_unmatched`)).rows).toHaveLength(0);
  });

  it('un cont necunoscut legat deja de alt membru e refuzat cu nume', async () => {
    await membru('Primul', 909);
    const al2lea = await membru('Al doilea');
    await db.query(`insert into public.telegram_unmatched (telegram_user_id) values (909)`);
    await expect(cheama('admin_sala_leaga_cont', ADMIN_TOKEN, 909, al2lea)).rejects.toThrow('telegram_deja_legat');
  });

  it('creează un membru nou dintr-un cont necunoscut', async () => {
    await db.query(`insert into public.telegram_unmatched (telegram_user_id, username) values (909, 'nou')`);
    await cheama('admin_sala_membru_din_cont', ADMIN_TOKEN, 909, '');
    const r = await db.query(`select full_name, status, telegram_user_id::text as tg from public.members`);
    expect(r.rows).toEqual([{ full_name: '@nou', status: 'active', tg: '909' }]);
  });

  it('unește doi membri și refuză unirea cu sine', async () => {
    const a = await membru('Ana');
    const b = await membru('Ana R.', 555);
    await raspuns(await antrenament('2026-10-01'), b, 'yes');
    await expect(cheama('admin_sala_uneste', ADMIN_TOKEN, a, a)).rejects.toThrow('acelasi_membru');
    await cheama('admin_sala_uneste', ADMIN_TOKEN, a, b);
    const r = await db.query(`select id from public.members`);
    expect(r.rows).toEqual([{ id: a }]);
    const p = await db.query(`select member_id from public.attendance`);
    expect(p.rows).toEqual([{ member_id: a }]);
  });
});

describe('urma scrierilor', () => {
  it('fiecare scriere reușită lasă un rând sala_* cu numele adminului', async () => {
    const m = await membru('Ana', 555);
    const s = await antrenament('2026-10-06');
    await cheama('admin_sala_set_prezenta', ADMIN_TOKEN, s, m, 'yes');
    // Nu mâine: sondajul „acum" de mai jos e refuzat pentru un mâine anulat. Cu
    // o dată fixă, testul pica exact în ziua dinaintea ei (7 octombrie 2026).
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, await ziua(5), true);
    await cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid()));
    await cheama('admin_sala_porneste_bot', ADMIN_TOKEN, true);
    await cheama('admin_sala_comanda', ADMIN_TOKEN, 'send_poll', null);
    await cheama('admin_sala_scoate_din_grup', ADMIN_TOKEN, m);

    const ev = await evenimente();
    expect(ev.map((e) => e.tip)).toEqual([
      'sala_prezenta',
      'sala_anulare',
      'sala_config',
      'sala_pornire',
      'sala_comanda',
      'sala_scoatere',
    ]);
    expect(ev.every((e) => e.detaliu.admin === 'operator')).toBe(true);
  });

  it('și scrierile membrilor lasă urmă, cu numele adminului', async () => {
    const a = await membru('Ana', 555);
    const b = await membru('Ana R.');
    await db.query(`insert into public.telegram_unmatched (telegram_user_id) values (909), (910)`);
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true);
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', false);
    await cheama('admin_sala_salveaza_membru', ADMIN_TOKEN, a, 'Ana Rusu', 555, null, 'active', false);
    await cheama('admin_sala_leaga_cont', ADMIN_TOKEN, 909, b);
    await cheama('admin_sala_membru_din_cont', ADMIN_TOKEN, 910, 'Dan');
    await cheama('admin_sala_uneste', ADMIN_TOKEN, a, b);
    const ev = await evenimente();
    expect(ev.map((e) => e.tip)).toEqual([
      'sala_anulare',
      'sala_reactivare',
      'sala_membru',
      'sala_legare',
      'sala_membru_nou',
      'sala_unire',
    ]);
    expect(ev.every((e) => e.detaliu.admin === 'operator')).toBe(true);
  });

  it('urma rămâne în tabel, dar nu ocupă fluxul de activitate al edițiilor', async () => {
    await db.query(`insert into runlift.admin_events (tip, detaliu) values ('renuntare', '{}')`);
    for (let i = 0; i < 5; i += 1) await cheama('admin_sala_porneste_bot', ADMIN_TOKEN, i % 2 === 0);
    const r = await db.query<{ tip: string }>(`select tip from runlift.admin_list_events($1, 1)`, [ADMIN_TOKEN]);
    expect(r.rows).toEqual([{ tip: 'renuntare' }]);
    expect((await evenimente()).filter((e) => e.tip.startsWith('sala_'))).toHaveLength(5);
  });

  it('o scriere refuzată nu lasă urmă', async () => {
    await expect(cheama('admin_sala_comanda', ADMIN_TOKEN, 'nimic', null)).rejects.toThrow();
    expect(await evenimente()).toEqual([]);
  });
});

describe('ca anon, rolul browserului', () => {
  // Restul fișierului cheamă funcțiile ca superuser (PGlite), deci un drept
  // lipsă sau o funcție internă închisă prea tare n-ar pica nimic. Aici, câte o
  // scriere din fiecare familie trece pe drumul adevărat: cheia publică + token.
  it('prezența, anularea, setările, comutatorul și comanda merg cu token valid', async () => {
    const m = await membru('Ion', 555);
    const s = await antrenament(await ziua(2));
    await cheamaAnon('admin_sala_set_prezenta', ADMIN_TOKEN, s, m, 'yes');
    await cheamaAnon('admin_sala_seteaza_antrenament', ADMIN_TOKEN, await ziua(3), true);
    await cheamaAnon('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid()));
    await cheamaAnon('admin_sala_porneste_bot', ADMIN_TOKEN, false);
    await cheamaAnon('admin_sala_comanda', ADMIN_TOKEN, 'send_summary', null);
    expect((await evenimente()).map((e) => e.tip)).toEqual([
      'sala_prezenta',
      'sala_anulare',
      'sala_config',
      'sala_pornire',
      'sala_comanda',
    ]);
  });

  it('membrii: editarea, legarea, membrul nou, scoaterea și unirea merg cu token valid', async () => {
    const a = await membru('Ana', 555);
    const b = await membru('Ana R.');
    await db.query(`insert into public.telegram_unmatched (telegram_user_id, username) values (909, 'x'), (910, 'y')`);
    await cheamaAnon('admin_sala_salveaza_membru', ADMIN_TOKEN, a, 'Ana Rusu', 555, null, 'active', false);
    await cheamaAnon('admin_sala_leaga_cont', ADMIN_TOKEN, 909, b);
    await cheamaAnon('admin_sala_membru_din_cont', ADMIN_TOKEN, 910, 'Dan');
    await cheamaAnon('admin_sala_scoate_din_grup', ADMIN_TOKEN, a);
    // `uneste` deleagă la `public.merge_members`, închisă pentru anon: merge doar
    // prin proprietarul funcției adminului.
    await cheamaAnon('admin_sala_uneste', ADMIN_TOKEN, a, b);
    const r = await db.query<{ full_name: string }>(`select full_name from public.members order by full_name`);
    expect(r.rows.map((x) => x.full_name)).toEqual(['Ana Rusu', 'Dan']);
  });
});

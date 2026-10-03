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
    const s = await antrenament('2026-10-01');
    await raspuns(s, m, 'yes');
    await db.query(`insert into public.telegram_unmatched (telegram_user_id, first_name) values (909, 'Străin')`);
    await db.query(`insert into public.bot_config (id) values (1)`);
    await db.query(`insert into public.bot_actions (action) values ('send_poll')`);

    const d = await cheama<Record<string, unknown[] & Record<string, unknown>>>('admin_sala_date', ADMIN_TOKEN);
    expect(d.membri).toHaveLength(1);
    expect(d.antrenamente).toEqual([
      expect.objectContaining({ id: s, session_date: '2026-10-01', starts_at: '06:30', poll_sent: false }),
    ]);
    expect(d.raspunsuri).toEqual([expect.objectContaining({ session_id: s, member_id: m, response: 'yes' })]);
    expect(d.necunoscuti).toEqual([expect.objectContaining({ telegram_user_id: 909 })]);
    expect(d.config).toEqual(expect.objectContaining({ id: 1, poll_title: null }));
    expect(d.comenzi).toEqual([expect.objectContaining({ action: 'send_poll', status: 'pending' })]);
  });

  it('nu întoarce nicio plată', async () => {
    const m = await membru('Maria');
    await db.query(`insert into public.payments (member_id, amount) values ($1, 300)`, [m]);
    const d = await cheama<Record<string, unknown>>('admin_sala_date', ADMIN_TOKEN);
    expect(JSON.stringify(d)).not.toMatch(/payment|amount|300/);
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

  it('reactivarea pune ziua înapoi pe scheduled', async () => {
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true);
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', false);
    const r = await db.query(`select status from public.training_sessions`);
    expect(r.rows).toEqual([{ status: 'scheduled' }]);
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
  ])('refuză %s și lasă rândul neschimbat', async (_, peste, eroare) => {
    await cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid()));
    const inainte = await randBotConfig();
    await expect(
      cheama('admin_sala_salveaza_config', ADMIN_TOKEN, JSON.stringify(configValid(peste)))
    ).rejects.toThrow(eroare);
    expect(await randBotConfig()).toEqual(inainte);
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
    await cheama('admin_sala_seteaza_antrenament', ADMIN_TOKEN, '2026-10-08', true);
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

  it('o scriere refuzată nu lasă urmă', async () => {
    await expect(cheama('admin_sala_comanda', ADMIN_TOKEN, 'nimic', null)).rejects.toThrow();
    expect(await evenimente()).toEqual([]);
  });
});

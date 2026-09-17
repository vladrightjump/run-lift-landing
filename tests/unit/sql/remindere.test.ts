// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { porneste, reseteaza, apeluriEdge, type BazaTest } from './db';

/**
 * `maybe_send_reminder()` — singura bucată de cod care pleacă SINGURĂ, fără ca
 * cineva să apese ceva: `pg_cron` o cheamă din 15 în 15 minute.
 *
 * Două feluri de greșeli, ambele scumpe: să nu plece reminderul (oameni care
 * uită de cursă) sau să plece de mai multe ori (același email, din sfert în
 * sfert de oră, până la start). Nimic din ecrane nu le-ar arăta la timp.
 */

let db: BazaTest;

beforeAll(async () => {
  db = await porneste();
}, 60_000);

afterAll(async () => {
  await db.close();
});

beforeEach(() => reseteaza(db));

/** Mută startul cursei față de acum și scrie orarul de remindere. */
const pregateste = async (oreLaStart: number, orar: unknown) => {
  await db.query(
    `insert into runlift.app_config (key, value) values ('event_start', (now() + make_interval(mins => $1))::text)
     on conflict (key) do update set value = excluded.value`,
    [Math.round(oreLaStart * 60)]
  );
  await db.query(
    `insert into runlift.app_config (key, value) values ('reminder_schedule', $1)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(orar)]
  );
};

const ruleazaCron = () => db.query('select runlift.maybe_send_reminder()');

const difuzari = async () =>
  (await apeluriEdge(db)).filter((a) => (a.body as { mode?: string }).mode === 'broadcast');

const ORAR_24H = [{ offsetHours: 24, enabled: true, template: 'bulk_participant_reminder' }];

describe('fereastra de trimitere', () => {
  it('cu 23 de ore înainte de start, reminderul de 24h pleacă', async () => {
    await pregateste(23, ORAR_24H);
    await ruleazaCron();
    const trimise = await difuzari();
    expect(trimise).toHaveLength(1);
    expect(trimise[0].body).toMatchObject({
      mode: 'broadcast',
      audience: 'participanti',
      template: 'bulk_participant_reminder',
      secret: 'secret-test',
    });
  });

  it('cu 30 de ore înainte, încă nu e momentul', async () => {
    await pregateste(30, ORAR_24H);
    await ruleazaCron();
    expect(await difuzari()).toHaveLength(0);
  });

  /** Fereastra e de două ore: un cron oprit o zi nu trimite un reminder expirat. */
  it('dacă momentul a trecut cu mai mult de două ore, nu se mai trimite', async () => {
    await pregateste(21.5, ORAR_24H);
    await ruleazaCron();
    expect(await difuzari()).toHaveLength(0);
  });

  it('după startul cursei nu mai pleacă nimic', async () => {
    await pregateste(-1, ORAR_24H);
    await ruleazaCron();
    expect(await difuzari()).toHaveLength(0);
  });

  it('fără oră de start nu se presupune nimic', async () => {
    await db.query(`delete from runlift.app_config where key = 'event_start'`);
    await db.query(
      `insert into runlift.app_config (key, value) values ('reminder_schedule', $1)
       on conflict (key) do update set value = excluded.value`,
      [JSON.stringify(ORAR_24H)]
    );
    await ruleazaCron();
    expect(await difuzari()).toHaveLength(0);
  });
});

describe('o singură dată, oricâte sferturi de oră', () => {
  it('cronul rulat de patru ori în fereastră trimite un singur reminder', async () => {
    await pregateste(23, ORAR_24H);
    await ruleazaCron();
    await ruleazaCron();
    await ruleazaCron();
    await ruleazaCron();
    expect(await difuzari()).toHaveLength(1);
  });

  it('ediția următoare primește totuși reminderul ei', async () => {
    await pregateste(23, ORAR_24H);
    await ruleazaCron();
    await db.query(`update runlift.app_config set value = '8' where key = 'current_event_edition'`);
    await ruleazaCron();
    expect(await difuzari()).toHaveLength(2);
  });

  it('două repere din orar au zăvoare separate', async () => {
    await pregateste(2.5, [
      { offsetHours: 24, enabled: true, template: 'bulk_participant_reminder' },
      { offsetHours: 3, enabled: true, template: 'bulk_participant_reminder_final' },
    ]);
    await ruleazaCron();
    const trimise = await difuzari();
    expect(trimise).toHaveLength(1);
    expect(trimise[0].body).toMatchObject({ template: 'bulk_participant_reminder_final' });
  });
});

describe('orarul citit din configul ediției', () => {
  it('un reper oprit nu trimite', async () => {
    await pregateste(23, [{ offsetHours: 24, enabled: false, template: 'bulk_participant_reminder' }]);
    await ruleazaCron();
    expect(await difuzari()).toHaveLength(0);
  });

  it.each([
    ['offset zero', [{ offsetHours: 0, enabled: true }]],
    ['offset negativ', [{ offsetHours: -5, enabled: true }]],
    ['offset care nu e număr', [{ offsetHours: 'douăzeci', enabled: true }]],
  ])('%s e ignorat, nu produce o trimitere la o oră inventată', async (_, orar) => {
    await pregateste(23, orar);
    await ruleazaCron();
    expect(await difuzari()).toHaveLength(0);
  });

  it('fără șablon, reminderul cade pe cel implicit', async () => {
    await pregateste(23, [{ offsetHours: 24, enabled: true }]);
    await ruleazaCron();
    expect((await difuzari())[0].body).toMatchObject({ template: 'bulk_participant_reminder' });
  });

  it('un orar stricat nu oprește reminderul de bază', async () => {
    await db.query(
      `insert into runlift.app_config (key, value) values ('reminder_schedule', 'nu-i json')
       on conflict (key) do update set value = excluded.value`
    );
    await db.query(
      `insert into runlift.app_config (key, value) values ('event_start', (now() + interval '23 hours')::text)
       on conflict (key) do update set value = excluded.value`
    );
    await ruleazaCron();
    expect(await difuzari()).toHaveLength(1);
  });
});

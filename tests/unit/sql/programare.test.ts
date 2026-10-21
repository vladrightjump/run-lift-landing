// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ADMIN_TOKEN, caRol, porneste, reseteaza, type BazaTest } from './db';

let db: BazaTest;
const migrare = readFileSync(resolve(__dirname, '../../../supabase/sql/supabase-migration-programare.sql'), 'utf8');
let functiiInitiale: { semnatura: string; corp: string }[];
const functii = () => db.query<{ semnatura: string; corp: string }>(
  `select p.oid::regprocedure::text as semnatura, p.prosrc as corp
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'runlift' order by p.oid::regprocedure::text`,
);
beforeAll(async () => {
  db = await porneste(false);
  functiiInitiale = (await functii()).rows;
  await db.exec(migrare);
}, 60_000);
afterAll(async () => { await db.close(); });
beforeEach(() => reseteaza(db));

// Fixture inventat integral: niciun text sau identificator dintr-un program extern.
const tipuri = ['strength', 'cardio', 'cardio_intervals', 'emom', 'for_time', 'amrap', 'generic', 'warm_up'];
const documentSintetic = () => ({
  versiune: 1,
  program: { id_extern: 'program-sintetic', nume: 'Program sintetic', descriere: 'Exemplu inventat',
    saptamani: 12, zile_pe_saptamana: 5, sursa: 'Sursă sintetică' },
  miscari: [
    { id_extern: 'miscare-sintetica-1', nume: 'Mișcare sintetică 1', categorie: 'forță',
      masuratori: ['repetari', 'incarcare'], youtube_id: 'abcdefghijk', sursa: 'Sursă sintetică' },
    { id_extern: 'miscare-sintetica-2', nume: 'Mișcare sintetică 2', categorie: 'cardio',
      masuratori: ['calorii', 'durata_sec'], youtube_id: null, sursa: 'Sursă sintetică' },
  ],
  zile: [[1, 1], [2, 2], [7, 3], [12, 5]].map(([saptamana, zi]) => ({
    id_extern: `zi-${saptamana}-${zi}`, saptamana, zi, titlu: `Zi sintetică ${saptamana}.${zi}`,
    blocuri: tipuri.map((tip, index) => ({
      id_extern: `bloc-${index}`, ordine: index + 1, tip, nume: `Bloc sintetic ${index + 1}`,
      instructiuni_inainte: 'Înainte sintetic', instructiuni_dupa: 'După sintetic',
      note_sportiv: 'Notă sintetică pentru sportiv', note_antrenor: 'Notă sintetică pentru antrenor',
      text: tip === 'generic' || tip === 'warm_up' ? 'Text sintetic' : null,
      ascuns: index === 7,
      parametri: { prefix: String.fromCharCode(65 + index), interval_sec: 60, durata_sec: 300,
        runde: 3, criteriu_scor: 'durata', pauza_raport: 1.5 },
      seturi: [
        { id_extern: 'set-3', exercitiu: 2, ordine: 1, miscare_id_extern: 'miscare-sintetica-2',
          repetari: 'X', calorii: 18, tinte_feminine: { calorii: 14 },
          pauza_tip: 'dupa_timp', pauza_sec: 30, note: 'Exercițiu secundar',
          provenienta: { valoare: 'X', unitate: 'lb' }, tinte_text: { incarcare: 'X' } },
        { id_extern: 'set-2', exercitiu: 1, ordine: 2, miscare_id_extern: 'miscare-sintetica-1',
          repetari: '1.1.1', incarcare: 55.5, unitate_incarcare: '%1rm', distanta_m: 100,
          durata_sec: 45, calorii: 12, inaltime_cm: 30.48, putere_w: 210, tempo: '3010',
          tinte_feminine: { incarcare: 40, distanta_m: 80, repetari: '15-20' },
          pauza_tip: ['fara', 'dupa_nevoie', 'fixa', 'interval', 'dupa_timp'][index % 5],
          pauza_sec: 90, note: 'Notă sintetică de exercițiu', provenienta: {}, tinte_text: {} },
        { id_extern: 'set-1', exercitiu: 1, ordine: 1, miscare_id_extern: 'miscare-sintetica-1',
          repetari: 'max', incarcare: 20, unitate_incarcare: 'kg', tinte_feminine: { incarcare: 15 },
          pauza_tip: 'fixa', pauza_sec: 30, note: 'Primul set', provenienta: {}, tinte_text: {} },
      ],
    })).reverse(),
  })).reverse(),
});

type SetCitit = {
  id: string; id_extern: string; exercitiu: number; ordine: number;
  miscare: { id: string; nume: string; youtube_id: string | null };
  repetari: string; incarcare: number; tinte_feminine: Record<string, unknown>;
  provenienta: Record<string, unknown>; tinte_text: Record<string, unknown>;
};
type BlocCitit = { id: string; id_extern: string; ordine: number; tip: string;
  ascuns: boolean; note_antrenor: string; parametri: Record<string, unknown>; seturi: SetCitit[] };
type ZiCitita = { id: string; saptamana: number; zi: number; blocuri: BlocCitit[] };
type Atribuire = { id: string; sportiv_id: number; data_start: string; data_sfarsit: string };
type Program = { id: string; nume: string; sursa: string; zile: ZiCitita[]; atribuiri: Atribuire[] };
type Azi = { profil: { id: number } | null; antrenamente: { atribuire: Atribuire; zi: ZiCitita }[] };

const rpc = async <T>(apel: string, parametri: unknown[] = []): Promise<T> => (
  await db.query<{ rezultat: T }>(`select runlift.${apel} as rezultat`, parametri)
).rows[0].rezultat;
const importa = (document = documentSintetic()) => rpc<Program>('admin_prog_importa($1, $2)', [ADMIN_TOKEN, document]);
const profil = (token = ADMIN_TOKEN, nume = 'Sportiv sintetic') =>
  rpc<{ id: number; nume: string }>('admin_prog_profil_salveaza($1, $2, $3)', [token, nume, 'masculin']);
const atribuie = (programId: string, dataStart = '2026-09-07', token = ADMIN_TOKEN) =>
  rpc<Atribuire>('admin_prog_atribuie($1, $2, $3)', [token, programId, dataStart]);
const azi = (data: string, token = ADMIN_TOKEN) => rpc<Azi>('admin_prog_azi($1, $2)', [token, data]);
const tokenB = '22222222-2222-2222-2222-222222222222';
const adaugaAlDoileaAdmin = async () => {
  const r = await db.query<{ id: number }>(
    `insert into runlift.admin_users(username, password_hash) values ('admin-sintetic-2', 'hash-sintetic') returning id`,
  );
  await db.query(`insert into runlift.admin_sessions(token, user_id, expires_at) values ($1,$2,now()+interval '1 hour')`,
    [tokenB, r.rows[0].id]);
  return r.rows[0].id;
};

describe('profilul sportivului', () => {
  it('salvează identitatea sportivului din sesiunea existentă', async () => {
    const r = await db.query<{ profil: { id: number; nume: string; gen: string } }>(
      `select runlift.admin_prog_profil_salveaza($1, 'Sportiv sintetic', 'masculin') as profil`,
      [ADMIN_TOKEN],
    );
    const user = await db.query<{ user_id: number }>(
      'select user_id from runlift.admin_sessions where token = $1', [ADMIN_TOKEN],
    );
    expect(r.rows[0].profil).toMatchObject({
      id: user.rows[0].user_id, nume: 'Sportiv sintetic', gen: 'masculin',
    });
  });

  it('un al doilea token poate salva numai profilul propriului admin', async () => {
    const a = await profil();
    const idB = await adaugaAlDoileaAdmin();
    const b = await profil(tokenB, 'Al doilea sportiv sintetic');
    expect(b.id).toBe(idB);
    expect(b.id).not.toBe(a.id);
    expect(await rpc('admin_prog_profil($1)', [ADMIN_TOKEN])).toMatchObject(a);
  });

  it('profilul păstrează unitățile și id-ul Telegram, iar lipsa profilului e explicită', async () => {
    expect(await rpc('admin_prog_profil($1)', [ADMIN_TOKEN])).toBeNull();
    expect(await rpc('admin_prog_profil_salveaza($1,$2,$3,$4,$5,$6)',
      [ADMIN_TOKEN, 'Sportivă sintetică', 'feminin', 'lbs', 'ft', '123456']))
      .toMatchObject({ gen: 'feminin', unitate_greutate: 'lbs', unitate_distanta: 'ft', telegram_id: '123456' });
  });
});

describe('importul structurat și citirea', () => {
  it('păstrează cele opt tipuri, ordinea, superseturile, țintele și proveniența', async () => {
    const p = await importa();
    expect(p.sursa).toBe('Sursă sintetică');
    expect(p.zile.map((z) => [z.saptamana, z.zi])).toEqual([[1, 1], [2, 2], [7, 3], [12, 5]]);
    expect(p.zile[0].blocuri.map((b) => b.tip)).toEqual(tipuri);
    const b = p.zile[0].blocuri[0];
    expect(b).toMatchObject({ instructiuni_inainte: 'Înainte sintetic', instructiuni_dupa: 'După sintetic',
      note_sportiv: 'Notă sintetică pentru sportiv', note_antrenor: 'Notă sintetică pentru antrenor',
      parametri: { prefix: 'A', interval_sec: 60, durata_sec: 300, runde: 3, pauza_raport: 1.5 } });
    expect(b.seturi.map((s) => [s.exercitiu, s.ordine])).toEqual([[1, 1], [1, 2], [2, 1]]);
    expect(b.seturi[1]).toMatchObject({ repetari: '1.1.1', incarcare: 55.5, unitate_incarcare: '%1rm',
      distanta_m: 100, durata_sec: 45, calorii: 12, inaltime_cm: 30.48, putere_w: 210, tempo: '3010',
      tinte_feminine: { incarcare: 40, distanta_m: 80, repetari: '15-20' } });
    expect(b.seturi[2]).toMatchObject({ provenienta: { valoare: 'X', unitate: 'lb' },
      tinte_text: { incarcare: 'X' }, pauza_tip: 'dupa_timp', pauza_sec: 30 });
    expect(b.seturi[0].miscare).toMatchObject({ nume: 'Mișcare sintetică 1', youtube_id: 'abcdefghijk' });
    expect(p.zile[0].blocuri[7].ascuns).toBe(true);
  });

  it('reimportă în aceleași rânduri, actualizând conținutul fără duplicate', async () => {
    const initial = await importa();
    const document = documentSintetic();
    document.program.nume = 'Program sintetic actualizat';
    document.miscari[0].nume = 'Mișcare sintetică actualizată';
    document.zile[3].blocuri[7].seturi[2].repetari = '15-20';
    const actualizat = await importa(document);
    expect(actualizat.id).toBe(initial.id);
    expect(actualizat.zile.map((z) => z.id)).toEqual(initial.zile.map((z) => z.id));
    expect(actualizat.zile[0].blocuri[0].id).toBe(initial.zile[0].blocuri[0].id);
    expect(actualizat.zile[0].blocuri[0].seturi[0].id).toBe(initial.zile[0].blocuri[0].seturi[0].id);
    expect(actualizat.zile[0].blocuri[0].seturi[0].repetari).toBe('15-20');
    expect(actualizat.zile[0].blocuri[0].seturi[0].miscare.nume).toBe('Mișcare sintetică actualizată');
    for (const [tabel, n] of [['prog_program', 1], ['prog_miscare', 2], ['prog_zi', 4], ['prog_bloc', 32], ['prog_set', 96]]) {
      expect((await db.query<{ n: number }>(`select count(*)::int n from runlift.${tabel}`)).rows[0].n).toBe(n);
    }
  });

  it('ascunde rândurile scoase la reimport și le readuce cu aceleași id-uri', async () => {
    const initial = await importa();
    const document = documentSintetic();
    document.zile = document.zile.filter((z) => z.saptamana !== 7);
    document.zile[2].blocuri.pop();
    document.zile[2].blocuri[0].seturi.pop();
    const redus = await importa(document);
    expect(redus.zile).toHaveLength(3);
    expect(redus.zile[0].blocuri).toHaveLength(7);
    expect(redus.zile[0].blocuri[6].seturi).toHaveLength(2);
    const revenit = await importa();
    expect(revenit.zile.map((z) => z.id)).toEqual(initial.zile.map((z) => z.id));
  });

  it('constrângerea refuză un YouTube id de 10 caractere și importul rămâne atomic', async () => {
    const document = documentSintetic();
    document.miscari[0].youtube_id = 'abcdefghij';
    await expect(importa(document)).rejects.toThrow(/check constraint/);
    expect(await rpc('admin_prog_programe($1)', [ADMIN_TOKEN])).toEqual([]);
  });

  it('baza refuză un tip de bloc necunoscut și poziții duplicate de zi', async () => {
    const document = documentSintetic();
    document.zile[0].blocuri[0].tip = 'necunoscut';
    await expect(importa(document)).rejects.toThrow(/check constraint/);
    const duplicat = documentSintetic();
    duplicat.zile.push({ ...duplicat.zile[0], id_extern: 'alta-zi-sintetica' });
    await expect(importa(duplicat)).rejects.toThrow(/unique constraint/);
  });
});

describe('atribuirea, Azi și calendarul', () => {
  beforeEach(() => profil());

  it('mapează exact zilele relative din AE5, inclusiv vizita în trecut', async () => {
    const p = await importa();
    const a = await atribuie(p.id);
    expect((await azi('2026-10-21')).antrenamente[0]).toMatchObject({ atribuire: { id: a.id }, zi: { saptamana: 7, zi: 3 } });
    expect((await azi('2026-09-15')).antrenamente[0].zi).toMatchObject({ saptamana: 2, zi: 2 });
  });

  it('mapează și date relative la ziua rulării, fără dependență de ora locală', async () => {
    const p = await importa();
    const r = await db.query<{ start: string; tinta: string }>(
      `select (current_date - 44)::text as start, current_date::text as tinta`,
    );
    await atribuie(p.id, r.rows[0].start);
    expect((await azi(r.rows[0].tinta)).antrenamente[0].zi).toMatchObject({ saptamana: 7, zi: 3 });
  });

  it('nu are antrenament înainte de start, după final sau într-o zi fără prescripție', async () => {
    const p = await importa();
    await atribuie(p.id);
    for (const data of ['2026-09-06', '2026-11-28', '2026-09-08']) {
      expect((await azi(data)).antrenamente).toEqual([]);
    }
  });

  it('Începe din nou păstrează prima atribuire și istoricul văzut de orice admin', async () => {
    const p = await importa();
    const prima = await atribuie(p.id);
    const doua = await atribuie(p.id, '2026-12-07');
    expect(doua.id).not.toBe(prima.id);
    await adaugaAlDoileaAdmin();
    const vazut = await rpc<Program>('admin_prog_program($1,$2)', [tokenB, p.id]);
    expect(vazut.atribuiri.map((a) => a.id)).toEqual([prima.id, doua.id]);
    expect((await azi('2026-09-07', tokenB)).antrenamente).toEqual([]);
    const programe = await rpc<Program[]>('admin_prog_programe($1)', [tokenB]);
    expect(programe[0].atribuiri).toHaveLength(2);
  });

  it('atribuirea unui al doilea admin îi aparține exclusiv sesiunii lui', async () => {
    const p = await importa();
    const a = await atribuie(p.id);
    const idB = await adaugaAlDoileaAdmin();
    await profil(tokenB);
    const b = await atribuie(p.id, '2026-09-07', tokenB);
    expect(b.sportiv_id).toBe(idB);
    expect(b.sportiv_id).not.toBe(a.sportiv_id);
    expect((await azi('2026-09-07', tokenB)).antrenamente.map((x) => x.atribuire.id)).toEqual([b.id]);
  });

  it('calendarul oricărui admin arată date reale, stări și totaluri fără rezultate', async () => {
    const p = await importa();
    const a = await atribuie(p.id);
    await adaugaAlDoileaAdmin();
    const calendar = await rpc<{ zile: { data: string; stare: string }[]; totaluri: unknown }>(
      'admin_prog_calendar($1,$2,$3)', [tokenB, a.id, '2026-10-21'],
    );
    expect(calendar.zile.map(({ data, stare }) => [data, stare])).toEqual([
      ['2026-09-07', 'nefăcut'], ['2026-09-15', 'nefăcut'], ['2026-10-21', 'nefăcut'], ['2026-11-27', 'viitor'],
    ]);
    expect(calendar.totaluri).toEqual({ zile_antrenament: 4, rezultate: 0, pr: 0 });
    expect(a.data_sfarsit).toBe('2026-11-27');
  });

  it('numai un program publicat poate fi atribuit', async () => {
    const p = await importa();
    await db.query('update runlift.prog_program set publicat = false where id = $1', [p.id]);
    await expect(atribuie(p.id)).rejects.toThrow(/program_nepublicat/);
  });
});

describe('drepturi și migrare', () => {
  it('anon nu poate citi direct niciun tabel prog_* și nici helper-ele', async () => {
    await importa();
    for (const tabel of ['prog_sportiv', 'prog_program', 'prog_miscare', 'prog_zi', 'prog_bloc', 'prog_set', 'prog_atribuire']) {
      await expect(caRol(db, 'anon', () => db.query(`select * from runlift.${tabel}`))).rejects.toThrow(/permission denied/);
    }
    await expect(caRol(db, 'anon', () => db.query(`select runlift._prog_program_json(null)`))).rejects.toThrow(/permission denied/);
    expect(await caRol(db, 'anon', () => rpc('admin_prog_programe($1)', [ADMIN_TOKEN]))).toHaveLength(1);
  });

  it.each(['inventat', 'expirat', 'null'])('fiecare RPC respinge tokenul %s înainte de orice citire/scriere', async (tip) => {
    const token = tip === 'null' ? null : '99999999-9999-9999-9999-999999999999';
    if (tip === 'expirat') {
      await db.query(`insert into runlift.admin_sessions(token,user_id,expires_at)
        select $1,user_id,now()-interval '1 second' from runlift.admin_sessions where token=$2`, [token, ADMIN_TOKEN]);
    }
    const apeluri: [string, unknown[]][] = [
      ['admin_prog_profil($1)', [token]],
      ['admin_prog_profil_salveaza($1,$2,$3)', [token, 'Nume sintetic', 'masculin']],
      ['admin_prog_importa($1,$2)', [token, documentSintetic()]],
      ['admin_prog_programe($1)', [token]],
      ['admin_prog_program($1,$2)', [token, null]],
      ['admin_prog_atribuie($1,$2,$3)', [token, null, '2026-09-07']],
      ['admin_prog_azi($1,$2)', [token, '2026-10-21']],
      ['admin_prog_calendar($1,$2,$3)', [token, null, '2026-10-21']],
    ];
    for (const [apel, parametri] of apeluri) await expect(caRol(db, 'anon', () => rpc(apel, parametri))).rejects.toThrow(/invalid_token/);
    expect(await rpc('admin_prog_programe($1)', [ADMIN_TOKEN])).toEqual([]);
    expect(await rpc('admin_prog_profil($1)', [ADMIN_TOKEN])).toBeNull();
  });

  it('corpurile tuturor funcțiilor existente rămân identice', async () => {
    const actuale = (await functii()).rows;
    for (const initiala of functiiInitiale) expect(actuale.find((f) => f.semnatura === initiala.semnatura)).toEqual(initiala);
  });

  it('reaplicarea migrării păstrează rândurile și aceleași corpuri de funcții', async () => {
    const initial = await importa();
    const inainte = (await functii()).rows;
    await db.exec(migrare);
    expect((await functii()).rows).toEqual(inainte);
    expect(await rpc('admin_prog_program($1,$2)', [ADMIN_TOKEN, initial.id])).toEqual(initial);
  });
});

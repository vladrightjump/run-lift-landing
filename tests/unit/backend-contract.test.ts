import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitRegistration,
  submitWaitlist,
  submitLaunchNotification,
  fetchStats,
  confirmSignup,
  fetchWeeklyWorkouts,
} from '../../src/lib/supabase';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { listWeeklyWorkout, mesajRefuzAntrenament, InvalidTokenError } from '../../src/lib/adminApi';
import * as sala from '../../src/lib/salaApi';
import { SUPABASE } from '../../src/lib/config';

/**
 * Contractul cererilor către Supabase — păzește exact regresiile care au picat
 * producția pe 4 august 2026:
 *  1. rutarea spre schema `runlift` (headerele Accept-Profile / Content-Profile).
 *     Fără ele, PostgREST caută în `public` și toate cererile pică.
 *  2. cererile merg spre URL-ul proiectului configurat (nu spre cel vechi).
 *
 * Toate testele mock-uiesc `fetch` — nu se atinge niciun backend real.
 */

const regData = {
  nume: 'Filip',
  prenume: 'Vladislav',
  telefon: '069509949',
  email: 'vlad@example.com',
  dataNasterii: '1994-10-18',
  acord: true,
};

const launchData = { nume: 'Popescu', prenume: 'Andrei', email: 'a@b.ro', telefon: '069123456' };

/** Dovezile anti-bot pe care le colectează hook-urile înainte de submit. */
const proofs = { token: 'tok-turnstile', hp: '', elapsed: 9000 };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response('', { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const headersOf = (callIndex = 0): Record<string, string> =>
  fetchMock.mock.calls[callIndex][1].headers as Record<string, string>;
const urlOf = (callIndex = 0): string => String(fetchMock.mock.calls[callIndex][0]);

describe('rutarea spre schema runlift', () => {
  it('schema din config e „runlift"', () => {
    expect(SUPABASE.schema).toBe('runlift');
  });

  it('apelurile RPC directe trimit Content-Profile = schema (runlift)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify('invalid'), { status: 200 }));
    await confirmSignup('tok-123').catch(() => {});
    expect(headersOf()['Content-Profile']).toBe(SUPABASE.schema);
  });

  it('formularele NU mai trimit Content-Profile — rutarea o face funcția Edge', async () => {
    // De când scrierile trec prin `submit-form`, schema o pune funcția Edge
    // (`DB_SCHEMA`), nu clientul. Un `Content-Profile` trimis de aici ar fi
    // ignorat și ar sugera fals că browserul mai vorbește direct cu PostgREST.
    for (const call of [
      () => submitRegistration(regData, proofs),
      () => submitWaitlist(regData, proofs),
      () => submitLaunchNotification(launchData, proofs),
    ]) {
      fetchMock.mockClear();
      await call();
      expect(headersOf()['Content-Profile']).toBeUndefined();
      expect(urlOf()).toMatch(/\/functions\/v1\/submit-form$/);
    }
  });

  it('citirea statisticilor trimite Accept-Profile = schema (runlift)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0, participants: [], waitlist: 0 }), { status: 200 })
    );
    await fetchStats();
    expect(headersOf()['Accept-Profile']).toBe(SUPABASE.schema);
  });

  it('citirea programului trimite Content-Profile = schema și merge spre proiectul corect', async () => {
    fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    await fetchWeeklyWorkouts();
    expect(headersOf()['Content-Profile']).toBe(SUPABASE.schema);
    expect(urlOf()).toBe(`${SUPABASE.url}/rest/v1/rpc/public_weekly_workouts`);
  });
});

describe('programul antrenamentelor — ce ajunge la pagină', () => {
  const saptamana = (numar: number) => ({ numar, titlu: `S${numar}`, corp: `corp ${numar}` });

  it('întoarce programul când serverul îl dă', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([saptamana(1), saptamana(2)]), { status: 200 })
    );
    expect(await fetchWeeklyWorkouts()).toEqual([saptamana(1), saptamana(2)]);
  });

  it('array gol (nimic vizibil, nimic scris, doar versiuni vechi) rămâne gol', async () => {
    fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    expect(await fetchWeeklyWorkouts()).toEqual([]);
  });

  it('o săptămână stricată se sare, fără să le ascundă pe celelalte', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([saptamana(1), { numar: 2, titlu: 'S2' }, saptamana(3)]),
        { status: 200 }
      )
    );
    expect(await fetchWeeklyWorkouts()).toEqual([saptamana(1), saptamana(3)]);
  });

  it('un număr care nu e număr descalifică doar săptămâna lui', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ numar: 'unu', titlu: 'S1', corp: 'x' }, saptamana(2)]), {
        status: 200,
      })
    );
    expect(await fetchWeeklyWorkouts()).toEqual([saptamana(2)]);
  });

  it('un răspuns care nu e array devine listă goală, nu excepție', async () => {
    fetchMock.mockResolvedValueOnce(new Response('null', { status: 200 }));
    expect(await fetchWeeklyWorkouts()).toEqual([]);
  });

  it('numerele sosite în dezordine ies crescător — ordinea E programul', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([saptamana(3), saptamana(1), saptamana(2)]), { status: 200 })
    );
    expect((await fetchWeeklyWorkouts()).map((s) => s.numar)).toEqual([1, 2, 3]);
  });

  it('o eroare HTTP se propagă — pagina arată starea de eroare, nu „nimic publicat"', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(fetchWeeklyWorkouts()).rejects.toThrow();
  });
});

describe('programul din admin — apărarea de o bază nemigrată', () => {
  /**
   * `admin_list_weekly_workout(uuid)` e singurul RPC din migrarea programului
   * care și-a păstrat SEMNĂTURA schimbându-și forma răspunsului. Toate celelalte
   * s-au redenumit sau au primit un parametru, deci o bază nemigrată le respinge
   * din PostgREST. Ăsta ar rezolva liniștit împotriva funcției vechi, iar ecranul
   * ar randa un program greșit în loc să se oprească.
   */
  const randNou = { id: 'r1', numar: 1, status: 'published', titlu: 'T', corp: 'C', vizibil: true, creat_la: 'x' };
  const randVechi = { id: 'r1', status: 'published', titlu: 'T', corp: 'C', activ: true, creat_la: 'x' };

  it('rândurile în forma nouă trec', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([randNou]), { status: 200 }));
    expect(await listWeeklyWorkout('t')).toHaveLength(1);
  });

  it('rândurile în forma VECHE sunt respinse, nu interpretate greșit', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify([randVechi]), { status: 200 }));
    await expect(listWeeklyWorkout('t')).rejects.toThrow(/weekly_workout_forma_veche/);
  });

  it('un singur rând vechi între altele bune descalifică tot răspunsul', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([randNou, randVechi]), { status: 200 })
    );
    await expect(listWeeklyWorkout('t')).rejects.toThrow(/weekly_workout_forma_veche/);
  });

  it('un program gol e valid, nu o formă veche', async () => {
    fetchMock.mockResolvedValueOnce(new Response('[]', { status: 200 }));
    expect(await listWeeklyWorkout('t')).toEqual([]);
  });

  it('refuzul ajunge la operator ca instrucțiune, nu ca text brut', () => {
    const msg = mesajRefuzAntrenament(new Error('weekly_workout_forma_veche'));
    expect(msg).toMatch(/migrarea/i);
    expect(msg).not.toMatch(/weekly_workout_forma_veche/);
  });
});

describe('țintirea proiectului corect', () => {
  it('toate cererile pleacă spre SUPABASE.url', async () => {
    const calls: Array<() => Promise<unknown>> = [
      () => submitRegistration(regData, proofs),
      () => submitWaitlist(regData, proofs),
      () => submitLaunchNotification(launchData, proofs),
    ];
    for (const call of calls) {
      fetchMock.mockClear();
      await call();
      expect(urlOf().startsWith(SUPABASE.url)).toBe(true);
    }
  });

  it('statisticile lovesc RPC-ul public_stats de pe proiectul configurat', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0, participants: [], waitlist: 0 }), { status: 200 })
    );
    await fetchStats();
    expect(urlOf()).toBe(`${SUPABASE.url}/rest/v1/rpc/public_stats`);
  });

  it('nu se scurge niciun URL de proiect vechi (hardcodat) în cereri', async () => {
    await submitRegistration(regData, proofs);
    // Orice host Supabase din cerere trebuie să fie exact cel din config.
    const host = new URL(urlOf()).host;
    expect(host).toBe(new URL(SUPABASE.url).host);
  });
});

describe('grupul de antrenament (salaApi)', () => {
  /** Fiecare funcție a clientului, cu RPC-ul pe care TREBUIE să-l cheme. */
  const apeluri: [string, () => Promise<unknown>][] = [
    ['admin_sala_date', () => sala.incarcaSala('tok')],
    ['admin_sala_rezumat', () => sala.incarcaRezumatSala('tok')],
    ['admin_sala_set_prezenta', () => sala.seteazaPrezenta('tok', 's', 'm', 'yes')],
    ['admin_sala_seteaza_antrenament', () => sala.seteazaAntrenament('tok', '2026-10-08', true)],
    [
      'admin_sala_salveaza_config',
      () =>
        sala.salveazaConfigBot('tok', {
          enabled: true, poll_days: [1, 3], poll_time: '12:00', summary_days: [2, 4], summary_time: '06:00',
          training_time: '06:30', location: 'Parc', auto_reminder_enabled: true, reminder_threshold: 6,
          poll_title: null, poll_yes_label: null, poll_no_label: null,
        }),
    ],
    ['admin_sala_porneste_bot', () => sala.pornesteBot('tok', false)],
    ['admin_sala_comanda', () => sala.trimiteComanda('tok', 'send_poll')],
    ['admin_sala_scoate_din_grup', () => sala.scoateDinGrup('tok', 'm')],
    [
      'admin_sala_salveaza_membru',
      () => sala.salveazaMembru('tok', 'm', { nume: 'Ana', telegramId: null, telegramUser: null, status: 'active', admin: false }),
    ],
    ['admin_sala_leaga_cont', () => sala.leagaCont('tok', 909, 'm')],
    ['admin_sala_membru_din_cont', () => sala.membruDinCont('tok', 909, 'Ana')],
    ['admin_sala_uneste', () => sala.unesteMembri('tok', 'a', 'b')],
  ];

  it.each(apeluri)('%s: POST pe RPC, cu Content-Profile runlift și tokenul în corp', async (rpc, cheama) => {
    fetchMock.mockResolvedValueOnce(new Response('null', { status: 200 }));
    await cheama();
    expect(urlOf()).toBe(`${SUPABASE.url}/rest/v1/rpc/${rpc}`);
    expect(headersOf()['Content-Profile']).toBe(SUPABASE.schema);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body)).p_token).toBe('tok');
  });

  it('fiecare RPC chemat de client există în instantaneul schemei din producție', () => {
    const schema = readFileSync(resolve(__dirname, '../../supabase/schema/runlift.sql'), 'utf8');
    const lipsa = apeluri.map(([rpc]) => rpc).filter((rpc) => !schema.includes(`FUNCTION runlift.${rpc}(`));
    expect(lipsa).toEqual([]);
  });

  /**
   * Parametrii fiecărei funcții, din instantaneul producției. Componentele și
   * e2e-ul mochează stratul RPC, deci un `p_*` scris greșit în client ar trece
   * prin toate testele și ar pica abia live, cu un 404 de la PostgREST.
   */
  const parametri = (schema: string, rpc: string): { toti: string[]; obligatorii: string[] } => {
    const m = new RegExp(`FUNCTION runlift\\.${rpc}\\(([^)]*)\\)`).exec(schema);
    if (!m) throw new Error(`${rpc} lipsește din instantaneu`);
    const parti = m[1].split(/,\s*(?=p_)/).map((p) => p.trim()).filter(Boolean);
    return {
      toti: parti.map((p) => p.split(' ')[0]),
      obligatorii: parti.filter((p) => !/\bDEFAULT\b/i.test(p)).map((p) => p.split(' ')[0]),
    };
  };

  it.each(apeluri)('%s: corpul are exact parametrii funcției din producție', async (rpc, cheama) => {
    const schema = readFileSync(resolve(__dirname, '../../supabase/schema/runlift.sql'), 'utf8');
    fetchMock.mockResolvedValueOnce(new Response('null', { status: 200 }));
    await cheama();
    const chei = Object.keys(JSON.parse(String(fetchMock.mock.calls[0][1].body))).sort();
    const { toti, obligatorii } = parametri(schema, rpc);
    expect(chei.filter((k) => !toti.includes(k))).toEqual([]);
    expect(obligatorii.filter((k) => !chei.includes(k))).toEqual([]);
  });

  it('fiecare refuz numit de server are un mesaj în client', () => {
    const coduri = new Set<string>();
    for (const f of ['supabase-migration-sala-functii-admin.sql', 'supabase-migration-sala-corecturi.sql']) {
      const sql = readFileSync(resolve(__dirname, '../../supabase/sql', f), 'utf8');
      for (const m of sql.matchAll(/raise exception '(\w+)'/g)) coduri.add(m[1]);
    }
    coduri.delete('invalid_token');
    const necunoscute = [...coduri].filter((c) => !(sala.REFUZURI_SALA as readonly string[]).includes(c));
    expect(necunoscute).toEqual([]);
  });

  it('mesajul liber poartă HTML-ul, iar celelalte comenzi trimit null', async () => {
    fetchMock.mockResolvedValue(new Response('"id"', { status: 200 }));
    await sala.trimiteComanda('tok', 'send_message', '<b>Mâine</b>');
    await sala.trimiteComanda('tok', 'send_summary');
    const corp = (i: number) => JSON.parse(String(fetchMock.mock.calls[i][1].body));
    expect(corp(0)).toEqual({ p_token: 'tok', p_actiune: 'send_message', p_html: '<b>Mâine</b>' });
    expect(corp(1).p_html).toBeNull();
  });

  it('refuzSala recunoaște motivul serverului și are un mesaj pentru fiecare', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'P0001', message: 'membru_admin' }), { status: 400 })
    );
    const err = await sala.scoateDinGrup('tok', 'm').catch((e: unknown) => e);
    expect(sala.refuzSala(err)).toBe('membru_admin');
    expect(sala.refuzSala(new Error('altceva'))).toBeNull();
    for (const motiv of sala.REFUZURI_SALA) expect(sala.MESAJE_REFUZ[motiv]).toBeTruthy();
  });

  it('o sesiune expirată devine InvalidTokenError', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'P0001', message: 'invalid_token' }), { status: 400 })
    );
    await expect(sala.incarcaSala('tok')).rejects.toBeInstanceOf(InvalidTokenError);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitRegistration,
  submitWaitlist,
  submitLaunchNotification,
  fetchStats,
  confirmSignup,
  fetchWeeklyWorkouts,
} from '../../src/lib/supabase';
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

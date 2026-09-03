import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  submitRegistration,
  submitWaitlist,
  submitLaunchNotification,
  fetchStats,
  confirmSignup,
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

  it('scrierile trimit Content-Profile = schema (runlift)', async () => {
    const writes: Array<() => Promise<unknown>> = [
      () => submitRegistration(regData),
      () => submitWaitlist(regData),
      () => submitLaunchNotification(launchData),
      () => confirmSignup('tok-123'),
    ];
    for (const call of writes) {
      fetchMock.mockClear();
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify('invalid'), { status: 200 }));
      await call().catch(() => {});
      expect(headersOf()['Content-Profile']).toBe(SUPABASE.schema);
    }
  });

  it('citirea statisticilor trimite Accept-Profile = schema (runlift)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ count: 0, participants: [], waitlist: 0 }), { status: 200 })
    );
    await fetchStats();
    expect(headersOf()['Accept-Profile']).toBe(SUPABASE.schema);
  });
});

describe('țintirea proiectului corect', () => {
  it('toate cererile pleacă spre SUPABASE.url', async () => {
    const calls: Array<() => Promise<unknown>> = [
      () => submitRegistration(regData),
      () => submitWaitlist(regData),
      () => submitLaunchNotification(launchData),
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
    await submitRegistration(regData);
    // Orice host Supabase din cerere trebuie să fie exact cel din config.
    const host = new URL(urlOf()).host;
    expect(host).toBe(new URL(SUPABASE.url).host);
  });
});

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePagePhase } from '../../src/hooks/usePagePhase';
import { LEADERBOARD_DATE, EVENT_END_DATE } from '../../src/lib/config';

/**
 * Cele trei faze ale zilei de eveniment. Ceasul e mockuit prin `Date.now`
 * (singurul pe care-l citește `useCountdown`), iar momentele se derivă din
 * config — testul nu are date scrise de mână, deci supraviețuiește ediției
 * următoare.
 */

const laMomentul = (t: number) => vi.spyOn(Date, 'now').mockReturnValue(t);

const cuPreview = (valoare: string | null) => {
  const url = valoare ? `/?preview=${valoare}` : '/';
  window.history.replaceState({}, '', url);
};

afterEach(() => {
  vi.restoreAllMocks();
  cuPreview(null);
});

describe('usePagePhase — după ceas', () => {
  it('înainte de fereastra listei: „pre"', () => {
    laMomentul(LEADERBOARD_DATE.getTime() - 60_000);
    expect(renderHook(() => usePagePhase()).result.current).toBe('pre');
  });

  it('între cele două granițe: „leaderboard"', () => {
    laMomentul(LEADERBOARD_DATE.getTime() + 60_000);
    expect(renderHook(() => usePagePhase()).result.current).toBe('leaderboard');
  });

  it('după finalul cursei: „next"', () => {
    laMomentul(EVENT_END_DATE.getTime() + 60_000);
    expect(renderHook(() => usePagePhase()).result.current).toBe('next');
  });

  // Exact pe graniță câștigă faza următoare — altfel ar exista o secundă în
  // care pagina nu e nici într-o fază, nici în cealaltă.
  it('exact pe prima graniță e deja „leaderboard"', () => {
    laMomentul(LEADERBOARD_DATE.getTime());
    expect(renderHook(() => usePagePhase()).result.current).toBe('leaderboard');
  });

  it('exact pe a doua graniță e deja „next"', () => {
    laMomentul(EVENT_END_DATE.getTime());
    expect(renderHook(() => usePagePhase()).result.current).toBe('next');
  });
});

describe('usePagePhase — ?preview bate ceasul', () => {
  it('„next" se poate vedea cu o zi înainte', () => {
    laMomentul(LEADERBOARD_DATE.getTime() - 86_400_000);
    cuPreview('next');
    expect(renderHook(() => usePagePhase()).result.current).toBe('next');
  });

  it('„leaderboard" se poate vedea cu o zi înainte', () => {
    laMomentul(LEADERBOARD_DATE.getTime() - 86_400_000);
    cuPreview('leaderboard');
    expect(renderHook(() => usePagePhase()).result.current).toBe('leaderboard');
  });

  it('„landing" readuce landing-ul complet peste o fază târzie', () => {
    laMomentul(EVENT_END_DATE.getTime() + 86_400_000);
    cuPreview('landing');
    expect(renderHook(() => usePagePhase()).result.current).toBe('pre');
  });

  it('un preview necunoscut nu schimbă faza dată de ceas', () => {
    laMomentul(EVENT_END_DATE.getTime() + 60_000);
    cuPreview('altceva');
    expect(renderHook(() => usePagePhase()).result.current).toBe('next');
  });
});

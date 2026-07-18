import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdown } from '../../src/hooks/useCountdown';

const inViitor = (ms: number) => new Date(Date.now() + ms);

afterEach(() => {
  vi.useRealTimers();
});

describe('useCountdown', () => {
  it('calculează corect zile, ore, minute, secunde', () => {
    const tinta = inViitor(
      4 * 86_400_000 + 7 * 3_600_000 + 42 * 60_000 + 38_000 + 500
    );
    const { result } = renderHook(() => useCountdown(tinta));
    expect(result.current).toMatchObject({
      zile: '04',
      ore: '07',
      minute: '42',
      secunde: '38',
      done: false,
    });
  });

  it('adaugă zero în față la valori sub 10', () => {
    const { result } = renderHook(() => useCountdown(inViitor(5_000 + 500)));
    expect(result.current.secunde).toBe('05');
    expect(result.current.zile).toBe('00');
  });

  it('marchează done și pune totul pe zero când ținta a trecut', () => {
    const { result } = renderHook(() => useCountdown(new Date(Date.now() - 1000)));
    expect(result.current).toMatchObject({
      zile: '00',
      ore: '00',
      minute: '00',
      secunde: '00',
      done: true,
    });
  });

  it('tratează exact momentul zero ca done', () => {
    const acum = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(acum);
    const { result } = renderHook(() => useCountdown(new Date(acum)));
    expect(result.current.done).toBe(true);
    vi.mocked(Date.now).mockRestore();
  });

  it('avansează în timp real, o dată pe secundă', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdown(inViitor(10_000)));
    const initial = result.current.secunde;
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.secunde).not.toBe(initial);
  });

  it('nu mai numără după ce a ajuns la zero', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdown(new Date(Date.now() - 1000)));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.done).toBe(true);
    expect(result.current.secunde).toBe('00');
  });
});

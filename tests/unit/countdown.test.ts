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
    // Ținta se calculează O DATĂ, în afara funcției de randare. `inViitor` în
    // interior ar produce un reper nou la fiecare re-randare — o țintă care
    // fuge înainte cu exact cât a trecut ceasul, deci un countdown care nu
    // scade niciodată. `useEditionDates()` întoarce repere fixe.
    const tinta = inViitor(10_000);
    const { result } = renderHook(() => useCountdown(tinta));
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

/**
 * Ținta se schimbă după primul cadru — cazul real, nu unul teoretic: pagina
 * pornește pe instantaneul de build (ediția încheiată) și primește reperele
 * ediției publicate când răspunde `public_config()`.
 */
describe('useCountdown — ținta se schimbă din mers', () => {
  it('o țintă trecută înlocuită cu una viitoare nu rămâne „done"', () => {
    const { result, rerender } = renderHook(({ tinta }) => useCountdown(tinta), {
      initialProps: { tinta: new Date(Date.now() - 1000) },
    });
    expect(result.current.done).toBe(true);

    rerender({ tinta: inViitor(3 * 3_600_000 + 500) });

    expect(result.current.done).toBe(false);
    expect(result.current.ore).toBe('03');
  });

  it('după schimbare numără mai departe, o dată pe secundă', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ tinta }) => useCountdown(tinta), {
      initialProps: { tinta: new Date(Date.now() - 1000) },
    });

    rerender({ tinta: inViitor(10_000) });
    const initial = result.current.secunde;
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.secunde).not.toBe(initial);
  });

  // Reciproca: o ediție care se încheie cât tabul e deschis trebuie să treacă
  // pe „done", nu doar să înghețe pe ultima valoare afișată.
  it('o țintă viitoare înlocuită cu una trecută devine „done"', () => {
    const { result, rerender } = renderHook(({ tinta }) => useCountdown(tinta), {
      initialProps: { tinta: inViitor(3 * 3_600_000) },
    });
    expect(result.current.done).toBe(false);

    rerender({ tinta: new Date(Date.now() - 1000) });

    expect(result.current.done).toBe(true);
    expect(result.current.secunde).toBe('00');
  });

  // Aceeași milisecundă venită ca obiect `Date` nou (fiecare refresh de config
  // întoarce repere noi) nu e o schimbare de țintă.
  it('o țintă identică re-creată nu resetează numărătoarea', () => {
    vi.useFakeTimers();
    const ms = Date.now() + 10_000;
    const { result, rerender } = renderHook(({ tinta }) => useCountdown(tinta), {
      initialProps: { tinta: new Date(ms) },
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const dupaTreiSecunde = result.current.secunde;

    rerender({ tinta: new Date(ms) });

    expect(result.current.secunde).toBe(dupaTreiSecunde);
  });
});

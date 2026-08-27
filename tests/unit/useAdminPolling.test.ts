// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminPolling, ADMIN_REFRESH_MS } from '../../src/admin/useAdminPolling';

/**
 * Hook-ul de poll din backoffice — extras din blocul duplicat aproape identic
 * între `AdminDashboard` și `AdminLaunchTab`. Testele fixează exact contractul
 * pe care îl aveau amândouă înainte de extragere: un fetch la montare, unul la
 * fiecare interval, unul la revenirea în tab, și abort la orice suprapunere.
 */

const setVisibility = (state: 'visible' | 'hidden') => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  setVisibility('visible');
});

describe('useAdminPolling', () => {
  it('cere datele o dată la montare', () => {
    const fetch = vi.fn();
    renderHook(() => useAdminPolling(fetch));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('mai cere o dată după ce trece intervalul', () => {
    const fetch = vi.fn();
    renderHook(() => useAdminPolling(fetch));
    act(() => {
      vi.advanceTimersByTime(ADMIN_REFRESH_MS);
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('revenirea în tab declanșează un refresh; părăsirea lui, nu', () => {
    const fetch = vi.fn();
    renderHook(() => useAdminPolling(fetch));
    fetch.mockClear();

    act(() => setVisibility('hidden'));
    expect(fetch).not.toHaveBeenCalled();

    act(() => setVisibility('visible'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('un refresh nou anulează cererea aflată în zbor', () => {
    const semnale: AbortSignal[] = [];
    const fetch = vi.fn((signal: AbortSignal) => {
      semnale.push(signal);
    });
    const { result } = renderHook(() => useAdminPolling(fetch));

    act(() => {
      result.current();
    });

    expect(semnale).toHaveLength(2);
    expect(semnale[0].aborted).toBe(true);
    expect(semnale[1].aborted).toBe(false);
  });

  it('la demontare anulează cererea în zbor și oprește intervalul', () => {
    const semnale: AbortSignal[] = [];
    const fetch = vi.fn((signal: AbortSignal) => {
      semnale.push(signal);
    });
    const { unmount } = renderHook(() => useAdminPolling(fetch));

    unmount();

    expect(semnale[0].aborted).toBe(true);
    act(() => {
      vi.advanceTimersByTime(ADMIN_REFRESH_MS * 3);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('după demontare nu mai reacționează la visibilitychange', () => {
    const fetch = vi.fn();
    const { unmount } = renderHook(() => useAdminPolling(fetch));
    unmount();
    fetch.mockClear();

    act(() => setVisibility('visible'));

    expect(fetch).not.toHaveBeenCalled();
  });
});

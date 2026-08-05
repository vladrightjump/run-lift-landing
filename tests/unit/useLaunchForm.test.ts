// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLaunchForm } from '../../src/hooks/useLaunchForm';
import type { LaunchOutcome } from '../../src/hooks/useLaunchForm';

const VALID = { nume: 'Popescu', prenume: 'Andrei', email: 'a@b.ro', telefon: '069123456' } as const;

type Hook = { current: ReturnType<typeof useLaunchForm> };

const fillValid = (r: Hook) => {
  act(() => {
    (Object.keys(VALID) as Array<keyof typeof VALID>).forEach((k) => r.current.setField(k, VALID[k]));
  });
};

/** Înlocuiește `fetch` global cu un mock (auto-restaurat de unstubAllGlobals). */
const stubFetch = (response: unknown) => {
  const fn = vi.fn(async () => response);
  vi.stubGlobal('fetch', fn);
  return fn;
};

const submitOnce = async (r: Hook): Promise<LaunchOutcome> => {
  let outcome: LaunchOutcome | undefined;
  await act(async () => {
    outcome = await r.current.submit();
  });
  return outcome as LaunchOutcome;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useLaunchForm', () => {
  it('draft invalid → outcome „invalid", fără fetch', async () => {
    const fetchMock = stubFetch({ ok: true });
    const { result } = renderHook(() => useLaunchForm());
    const outcome = await submitOnce(result);
    expect(outcome.kind).toBe('invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('draft valid → outcome „success" și state „success"', async () => {
    stubFetch({ ok: true, status: 201 });
    const { result } = renderHook(() => useLaunchForm());
    fillValid(result);
    const outcome = await submitOnce(result);
    expect(outcome).toMatchObject({ kind: 'success', duplicate: false, email: VALID.email });
    expect(result.current.state).toBe('success');
  });

  it('HTTP 409 (email deja înscris) → success cu duplicate=true', async () => {
    stubFetch({ ok: false, status: 409, text: async () => 'duplicate' });
    const { result } = renderHook(() => useLaunchForm('despre-noi'));
    fillValid(result);
    const outcome = await submitOnce(result);
    expect(outcome).toMatchObject({ kind: 'success', duplicate: true });
  });

  it('fără conexiune → outcome „offline", fără fetch', async () => {
    const fetchMock = stubFetch({ ok: true });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    try {
      const { result } = renderHook(() => useLaunchForm());
      fillValid(result);
      const outcome = await submitOnce(result);
      expect(outcome.kind).toBe('offline');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      // Șterge getter-ul propriu → revine la cel din prototip (onLine === true).
      delete (navigator as { onLine?: boolean }).onLine;
    }
  });
});

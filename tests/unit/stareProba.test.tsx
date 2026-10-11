import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';

const load = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/trialPublic', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/trialPublic')>()),
  loadPublicTrial: load,
}));

import { LIMITA_INCARCARE_PROBA_MS, usePublicTrial, useStareProba } from '../../src/hooks/usePublicTrial';

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  load.mockReset();
});

describe('starea probei publice', () => {
  it('pornește în „se încarcă" și trece în pornit cu configul', async () => {
    const config = { enabled: true, bot_username: 'ParkTrialBot', contact_text: '' };
    load.mockResolvedValue(config);
    const { result } = renderHook(() => useStareProba());
    expect(result.current).toEqual({ fel: 'incarca' });
    await waitFor(() => expect(result.current).toEqual({ fel: 'pornit', config }));
  });

  it('configul dezactivat sau invalid înseamnă oprit', async () => {
    load.mockResolvedValue(null);
    const { result } = renderHook(() => useStareProba());
    await waitFor(() => expect(result.current).toEqual({ fel: 'oprit' }));
  });

  it('o cerere picată ajunge în oprit, nu rămâne în încărcare', async () => {
    load.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useStareProba());
    await waitFor(() => expect(result.current).toEqual({ fel: 'oprit' }));
  });

  it('sub StrictMode, cererea anulată de primul efect nu trece starea în oprit', async () => {
    // Prima cerere e anulată de curățarea dublă din dev; a doua rămâne în aer.
    load.mockImplementation(
      (signal?: AbortSignal) =>
        new Promise((_, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        })
    );
    const { result } = renderHook(() => useStareProba(), { wrapper: StrictMode });
    await new Promise((r) => setTimeout(r, 0));
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current).toEqual({ fel: 'incarca' });
  });
});

describe('starea probei — cererea blocată', () => {
  it('după limita de așteptare trece în oprit și anulează cererea', async () => {
    vi.useFakeTimers();
    let semnal: AbortSignal | undefined;
    load.mockImplementation((signal?: AbortSignal) => {
      semnal = signal;
      return new Promise(() => {});
    });
    const { result } = renderHook(() => useStareProba({ cuLimita: true }));
    expect(result.current).toEqual({ fel: 'incarca' });
    await act(async () => {
      vi.advanceTimersByTime(LIMITA_INCARCARE_PROBA_MS);
    });
    expect(result.current).toEqual({ fel: 'oprit' });
    expect(semnal?.aborted).toBe(true);
  });

  it('fără limită (landing, teaser) așteaptă oricât, ca înainte', async () => {
    vi.useFakeTimers();
    load.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useStareProba());
    await act(async () => {
      vi.advanceTimersByTime(LIMITA_INCARCARE_PROBA_MS * 3);
    });
    expect(result.current).toEqual({ fel: 'incarca' });
  });
});

describe('usePublicTrial — ce văd landing-ul și teaser-ul', () => {
  it('dă configul doar când proba e pornită', async () => {
    const config = { enabled: true, bot_username: 'ParkTrialBot', contact_text: '' };
    load.mockResolvedValue(config);
    const { result } = renderHook(() => usePublicTrial());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(config));
  });

  it('dă null când proba e oprită', async () => {
    load.mockResolvedValue(null);
    const { result } = renderHook(() => usePublicTrial());
    await waitFor(() => expect(load).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});

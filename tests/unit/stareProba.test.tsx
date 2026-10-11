import { afterEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';

const load = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/trialPublic', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/trialPublic')>()),
  loadPublicTrial: load,
}));

import { useStareProba } from '../../src/hooks/usePublicTrial';

afterEach(() => {
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

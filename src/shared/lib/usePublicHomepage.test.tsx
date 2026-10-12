import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { usePublicHomepage } from './usePublicHomepage';
import { raspunde } from '../../../tests/support/linkEmail';

afterEach(cleanup);

describe('ordinea homepage-ului se așază înaintea locului întârziat', () => {
  it('după două secunde păstrează ordinea implicită, dar primește locul', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const requests = raspunde('public_homepage', { body: { trial_first: true, training_location: 'Sala nouă' }, asteapta: pending });
    const view = renderHook(() => usePublicHomepage());
    try {
      expect(view.result.current).toEqual({ trialFirst: false, trainingLocation: null, gata: false });
      await waitFor(() => expect(requests.numar).toBe(1));
      await waitFor(() => expect(view.result.current.gata).toBe(true), { timeout: 3000 });
      release();
      await waitFor(() => expect(view.result.current.trainingLocation).toBe('Sala nouă'));
      expect(view.result.current.trialFirst).toBe(false);
    } finally { release(); view.unmount(); }
  });

  it('o sursă dezactivată nu cere setări; demontarea anulează cererea activată', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const requests = raspunde('public_homepage', { asteapta: pending });
    const view = renderHook(({ enabled }) => usePublicHomepage(enabled), { initialProps: { enabled: false } });
    try {
      expect(requests.numar).toBe(0);
      view.rerender({ enabled: true });
      await waitFor(() => expect(requests.numar).toBe(1));
      expect(requests.semnale[0].aborted).toBe(false);
      view.unmount();
      await waitFor(() => expect(requests.semnale[0].aborted).toBe(true));
    } finally { release(); view.unmount(); }
  });
});

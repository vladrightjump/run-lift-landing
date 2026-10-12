import { afterEach, expect, it } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { usePublicTrialStare } from './usePublicTrial';
import { raspunde } from '../../../../tests/support/linkEmail';

afterEach(cleanup);

it('proba lentă eliberează pagina după două secunde și poate sosi ulterior', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const config = { enabled: true, bot_username: 'runlift_bot', contact_text: 'Scrie-ne' };
  const requests = raspunde('public_trial_config', { body: config, asteapta: pending });
  const view = renderHook(() => usePublicTrialStare());
  try {
    expect(view.result.current).toEqual({ config: null, gata: false });
    await waitFor(() => expect(requests.numar).toBe(1));
    await waitFor(() => expect(view.result.current.gata).toBe(true), { timeout: 3000 });
    expect(view.result.current.config).toBeNull();
    release();
    await waitFor(() => expect(view.result.current.config).toEqual(config));
  } finally { release(); view.unmount(); }
});

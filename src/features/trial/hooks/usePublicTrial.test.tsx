import { afterEach, expect, it } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
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
    expect(view.result.current).toEqual({ config: null, gata: false, status: 'pending' });
    await waitFor(() => expect(requests.numar).toBe(1));
    await waitFor(() => expect(view.result.current.gata).toBe(true), { timeout: 3000 });
    expect(view.result.current.status).toBe('pending');
    release();
    await waitFor(() => expect(view.result.current).toEqual({ config, gata: true, status: 'success' }));
  } finally { release(); view.unmount(); }
});

it.each([
  { brut: '<html>Indisponibil</html>' },
  { body: { enabled: true, bot_username: '?' } },
  { body: { enabled: true, bot_username: 'runlift_bot', next_session: { starts_at: 'invalid' } } },
])('tratează un răspuns invalid ca eroare de încărcare', async (response) => {
  raspunde('public_trial_config', response);
  const view = renderHook(() => usePublicTrialStare());
  await waitFor(() => expect(view.result.current).toEqual({ config: null, gata: true, status: 'error' }));
});

it('retrage programul vechi dacă actualizarea eșuează și îl afișează din nou după reconectare', async () => {
  const config = { enabled: true, bot_username: 'runlift_bot', contact_text: '' };
  raspunde('public_trial_config', { body: config });
  const view = renderHook(() => usePublicTrialStare());
  await waitFor(() => expect(view.result.current.config).toEqual(config));

  raspunde('public_trial_config', { status: 503 });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitFor(() => expect(view.result.current).toEqual({ config: null, gata: true, status: 'error' }));

  raspunde('public_trial_config', { body: config });
  act(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitFor(() => expect(view.result.current.config).toEqual(config));
});

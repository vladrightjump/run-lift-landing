import { it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { useCallback } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { HttpResponse } from 'msw';
import { createAppQueryClient } from '../../../../app/providers';
import { FurnizorSesiuneAdmin } from '../../data/adminSession';
import { useAdminResource } from '../../data/useAdminResource';
import { useSala } from './useSala';
import { useTrials } from './useTrials';
import { listEditions, listEventConfig } from '../evenimente/api';
import { EcranPrezente } from './EcranPrezente';
import { dateSala } from '../../../../../tests/support/builders/sala';
import { trialData } from '../../../../../tests/support/builders/trial';
import { server } from '../../../../../tests/support/vitest.setup';
import { rpcHandler } from '../../../../../tests/support/handlers';

it('marcarea prezenței reîmprospătează numai citirile grupului, fără probe, ediții sau config', async () => {
  let date = dateSala();
  const citesteSala = vi.fn(() => HttpResponse.json(date));
  const citesteProbe = vi.fn(() => HttpResponse.json(trialData()));
  const citesteEditii = vi.fn(() => HttpResponse.json([]));
  const citesteConfig = vi.fn(() => HttpResponse.json([]));
  const scrie = vi.fn(async ({ request }: { request: Request }) => {
    expect(await request.json()).toEqual({ p_token: 'tok', p_sesiune: 's2', p_membru: 'maria', p_raspuns: 'yes' });
    date = { ...date, raspunsuri: [...date.raspunsuri, { session_id: 's2', member_id: 'maria', response: 'yes', is_first_training: false, responded_at: '2026-10-07T09:10:00Z' }] };
    return HttpResponse.json(null);
  });
  server.use(
    rpcHandler('admin_sala_date', citesteSala),
    rpcHandler('admin_trial_data', citesteProbe),
    rpcHandler('admin_list_editions', citesteEditii),
    rpcHandler('admin_get_event_config', citesteConfig),
    rpcHandler('admin_sala_set_prezenta', scrie),
  );
  const CititorGrup = () => {
    const { date: dateCitite } = useSala();
    useTrials();
    useAdminResource(listEditions, null, { queryKey: ['evenimente', 'editions'] });
    useAdminResource(useCallback((token: string, signal: AbortSignal) => listEventConfig(token, undefined, signal), []), null, { queryKey: ['evenimente', 'config'] });
    return <output aria-label="Răspunsul Mariei">{dateCitite?.raspunsuri.find(r => r.session_id === 's2' && r.member_id === 'maria')?.response ?? 'fără răspuns'}</output>;
  };
  const client = createAppQueryClient();
  const showToast = vi.fn();
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <FurnizorSesiuneAdmin token="tok" onAuthError={() => false} showToast={showToast}>
        <EcranPrezente />
        <CititorGrup />
      </FurnizorSesiuneAdmin>
    </QueryClientProvider>
  );
  await screen.findByRole('heading', { name: 'Joi, 8 oct' });
  await waitFor(() => expect(citesteSala).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(citesteProbe).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(citesteEditii).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(citesteConfig).toHaveBeenCalledTimes(1));
  fireEvent.click(within(screen.getByRole('group', { name: 'Prezența lui Maria, Joi, 8 oct' })).getByRole('button', { name: 'Vine' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith({ kind: 'success', msg: 'Maria: vine.' }));
  await waitFor(() => expect(screen.getByLabelText('Răspunsul Mariei').textContent).toBe('yes'));
  expect(scrie).toHaveBeenCalledTimes(1);
  expect(citesteSala).toHaveBeenCalledTimes(4);
  expect(citesteProbe).toHaveBeenCalledTimes(1);
  expect(citesteEditii).toHaveBeenCalledTimes(1);
  expect(citesteConfig).toHaveBeenCalledTimes(1);
  unmount();
  client.clear();
});

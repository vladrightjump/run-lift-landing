import { it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { AdminEventTab } from './AdminEventTab';
import { FurnizorSesiuneAdmin } from '../../data/adminSession';
import { EventConfigProvider, useEventConfig } from '../../../../shared/lib/useEventConfig';
import { SNAPSHOT_CONFIG } from '../../../../shared/content/eventConfig';
import { configRow } from '../../../../../tests/support/builders/config';
import { server } from '../../../../../tests/support/vitest.setup';
import { rpcHandler } from '../../../../../tests/support/handlers';

it('publicarea reîmprospătează configul public o dată și configul editorului o dată', async () => {
  let publicat = SNAPSHOT_CONFIG;
  let ciorna: typeof SNAPSHOT_CONFIG | null = null;
  const citestePublic = vi.fn(() => HttpResponse.json(publicat));
  const citesteEditor = vi.fn(() => HttpResponse.json([
    ...(ciorna ? [configRow({ id: 'draft-id', editie: ciorna.number, status: 'draft', config: ciorna, published_at: null })] : []),
    configRow({ editie: publicat.number, config: publicat }),
  ]));
  server.use(
    rpcHandler('public_config', citestePublic),
    rpcHandler('admin_get_event_config', citesteEditor),
    rpcHandler('admin_save_event_config_draft', async ({ request }) => {
      const corp = await request.json() as { p_config: typeof SNAPSHOT_CONFIG };
      ciorna = corp.p_config;
      return HttpResponse.json('draft-id');
    }),
    rpcHandler('admin_publish_event_config', () => {
      if (!ciorna) throw new Error('Publicare fără ciornă');
      publicat = ciorna;
      ciorna = null;
      return HttpResponse.json('pub-id');
    }),
  );
  const ConfigVizibil = () => <output>{useEventConfig().eventName}</output>;
  render(
    <EventConfigProvider>
      <FurnizorSesiuneAdmin token="t" onAuthError={() => false} showToast={() => {}}>
        <ConfigVizibil />
        <AdminEventTab inregistreazaGardaIesire={() => {}} />
      </FurnizorSesiuneAdmin>
    </EventConfigProvider>
  );
  fireEvent.click(await screen.findByRole('button', { name: `Editează ediția ${SNAPSHOT_CONFIG.number}` }));
  fireEvent.change(screen.getByLabelText('Numele evenimentului'), { target: { value: 'Ediția publicată acum' } });
  await waitFor(() => expect(citestePublic).toHaveBeenCalledTimes(1));
  expect(citesteEditor).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Publică' }));
  fireEvent.click(screen.getByRole('button', { name: 'Da, publică' }));
  await waitFor(() => expect(citestePublic).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(citesteEditor).toHaveBeenCalledTimes(2));
  // „O dată" înseamnă și că nu mai vine o a treia citire după ce s-au așezat.
  await act(() => new Promise((gata) => setTimeout(gata, 100)));
  expect(citestePublic).toHaveBeenCalledTimes(2);
  expect(citesteEditor).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Ediția publicată acum', { selector: 'output' })).toBeDefined();
});

import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HttpResponse } from 'msw';
import { server } from '../../../../../tests/support/vitest.setup';
import { rpcHandler } from '../../../../../tests/support/handlers';
import { FurnizorSesiuneAdmin } from '../../data/adminSession';
import { AdminOrdineHomepage } from './AdminOrdineHomepage';

/**
 * Ordinea salvată e cea citită la următoarea deschidere. Serverul fals ține
 * valoarea între scriere (`admin_set_homepage_order`) și citire
 * (`public_homepage`), deci testul trece prin aceleași cereri ca ecranul real.
 * Stările în care serverul refuză sau atârnă sunt în `AdminComingSoonTab.test.tsx`.
 */

afterEach(cleanup);

const json = (corp: unknown) =>
  new HttpResponse(JSON.stringify(corp), { headers: { 'Content-Type': 'application/json' } });

const randeaza = () =>
  render(
    <FurnizorSesiuneAdmin token="tok" onAuthError={() => false} showToast={vi.fn()}>
      <AdminOrdineHomepage />
    </FurnizorSesiuneAdmin>
  );

const optiune = (nume: RegExp) => screen.getByRole('radio', { name: nume }) as HTMLInputElement;

it('ordinea aleasă se salvează și se citește la următoarea deschidere', async () => {
  let trialFirst = false;
  const scrieri: unknown[] = [];
  server.use(
    rpcHandler('public_homepage', () => json({ trial_first: trialFirst, training_location: null })),
    rpcHandler('admin_set_homepage_order', async ({ request }) => {
      const corp = (await request.json()) as { p_token: string; p_trial_first: boolean };
      scrieri.push(corp);
      trialFirst = corp.p_trial_first;
      return json(null);
    })
  );

  const { unmount } = randeaza();
  await waitFor(() => expect(optiune(/Antrenamentul săptămânii primul/).checked).toBe(true));
  fireEvent.click(optiune(/Proba primul/));
  await waitFor(() => expect(scrieri).toEqual([{ p_token: 'tok', p_trial_first: true }]));
  await waitFor(() => expect(optiune(/Proba primul/).disabled).toBe(false));
  unmount();

  randeaza();
  await waitFor(() => expect(optiune(/Proba primul/).checked).toBe(true));
});

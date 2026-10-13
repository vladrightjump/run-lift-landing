import { describe, it, expect } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';

import { rand, randeaza, listEventConfig, restoreEventConfig } from './test-support';

describe('versiuni anterioare', () => {
  it('o versiune înlocuită poate fi readusă', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'veche', status: 'superseded', published_at: '2026-07-01T09:00:00Z' }),
    ]);
    randeaza();
    fireEvent.click(await screen.findByRole('button', { name: 'Revino la asta' }));
    await waitFor(() => expect(restoreEventConfig).toHaveBeenCalledWith('t', 'veche'));
  });

  it('fără versiuni înlocuite, secțiunea nu apare', async () => {
    randeaza();
    await screen.findByText(/Nicio ciornă deschisă/);
    expect(screen.queryByText('Versiuni anterioare')).toBeNull();
  });
});

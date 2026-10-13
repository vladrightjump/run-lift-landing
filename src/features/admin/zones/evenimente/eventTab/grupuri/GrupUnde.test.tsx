import { describe, it, expect } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../../shared/content/eventConfig';

import { rand, randeaza, deschideCiorna, deschideGrupurile, eroareaCampului, listEventConfig, saveEventConfigDraft } from '../test-support';

describe('câmpurile lipsă din formular', () => {
  it('zoom-ul hărții se poate alege, și ajunge în documentul salvat', async () => {
    await deschideCiorna();
    fireEvent.change(screen.getByLabelText('Zoom-ul hărții'), { target: { value: '18' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalled());
    expect(saveEventConfigDraft.mock.calls[0][2].venue.zoom).toBe(18);
  });

  it('un document cu zoom zero e reparabil din formular, nu blocat pe veci', async () => {
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna',
        status: 'draft',
        published_at: null,
        config: { ...SNAPSHOT_CONFIG, venue: { ...SNAPSHOT_CONFIG.venue, zoom: 0 } },
      }),
      rand(),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });

    // Grupul „Unde" e deschis de la sine, cu eroarea PE câmp.
    expect(eroareaCampului('Zoom-ul hărții')).toContain('Zoom');
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(
      true
    );

    fireEvent.change(screen.getByLabelText('Zoom-ul hărții'), { target: { value: '16' } });
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });

  it('un zoom din afara treptelor rămâne vizibil, nu se pierde', async () => {
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna',
        status: 'draft',
        published_at: null,
        config: { ...SNAPSHOT_CONFIG, venue: { ...SNAPSHOT_CONFIG.venue, zoom: 11 } },
      }),
      rand(),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    expect((screen.getByLabelText('Zoom-ul hărții') as HTMLSelectElement).value).toBe('11');
  });

  it('valoarea de rezervă a ocupării se poate corecta din formular', async () => {
    await deschideCiorna();
    fireEvent.change(screen.getByLabelText(/Ocupate \(valoare de rezervă\)/), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvează' }));

    await waitFor(() => expect(saveEventConfigDraft).toHaveBeenCalled());
    expect(saveEventConfigDraft.mock.calls[0][2].slots.occupiedFallback).toBe(0);
  });

  it('o valoare de rezervă peste capacitate e semnalată, dar nu blochează', async () => {
    await deschideCiorna();
    fireEvent.change(screen.getByLabelText(/Ocupate \(valoare de rezervă\)/), {
      target: { value: '999' },
    });
    expect(eroareaCampului(/Ocupate \(valoare de rezervă\)/)).toContain('capacitatea');
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });
});

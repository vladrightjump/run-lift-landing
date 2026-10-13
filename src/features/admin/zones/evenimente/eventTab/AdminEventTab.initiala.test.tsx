import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../shared/content/eventConfig';

import { rand, randeaza, creeazaPrinDialog, deschideGrupurile, camp, listEventConfig, saveEventConfigDraft, publishEventConfig } from './test-support';

describe('starea inițială', () => {
  it('arată ediția publicată fără să deschidă o ciornă', async () => {
    randeaza();
    expect(await screen.findByText(`Ediția ${SNAPSHOT_CONFIG.number}`)).toBeTruthy();
    expect(screen.getByText(/Nicio ciornă deschisă/)).toBeTruthy();
  });

  it('spune ce vede vizitatorul acum', async () => {
    randeaza();
    expect(await screen.findByText('Landing')).toBeTruthy();
  });

  it('nu salvează și nu publică nimic doar prin deschiderea tabului', async () => {
    randeaza();
    await screen.findByText(/Nicio ciornă deschisă/);
    expect(saveEventConfigDraft).not.toHaveBeenCalled();
    expect(publishEventConfig).not.toHaveBeenCalled();
  });
});

describe('ciorna pentru ediția următoare', () => {
  it('o ciornă cu ALT număr decât ediția publicată e găsită și încărcată', async () => {
    // Regresie: `admin_get_event_config` filtra pe ediția curentă, deci ciorna
    // ediției următoare — care are prin construcție alt număr — era invizibilă.
    // Ciorna salvată „dispărea" la reîncărcare și preview-ul cădea pe publicat.
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna-6',
        editie: SNAPSHOT_CONFIG.number + 1,
        status: 'draft',
        published_at: null,
        config: { ...SNAPSHOT_CONFIG, number: SNAPSHOT_CONFIG.number + 1 },
      }),
      rand(),
    ]);
    randeaza();
    // Formularul se deschide singur pe ciorna existentă, fără să apeși nimic.
    await waitFor(() =>
      expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number + 1))
    );
  });

  it('pornește de la cea publicată, cu ediția incrementată', async () => {
    await creeazaPrinDialog();
    deschideGrupurile();
    expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number + 1));
    // Locul se păstrează ca punct de plecare, nu se golește.
    expect(camp('Numele locului').value).toBe(SNAPSHOT_CONFIG.venue.name);
  });
});

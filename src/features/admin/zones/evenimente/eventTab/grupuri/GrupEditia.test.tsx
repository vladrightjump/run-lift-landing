import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../../shared/content/eventConfig';

import { rand, randeaza, deschideGrupurile, camp, eroareaCampului, listEventConfig } from '../test-support';

describe('ciorna bifurcată devine vizibilă', () => {
  const douaCiorne = () => {
    listEventConfig.mockResolvedValue([
      rand({
        id: 'ciorna-noua',
        editie: SNAPSHOT_CONFIG.number + 1,
        config: { ...SNAPSHOT_CONFIG, number: SNAPSHOT_CONFIG.number + 1 },
        status: 'draft',
        published_at: null,
        created_at: '2026-08-10T10:00:00Z',
      }),
      rand({
        id: 'ciorna-veche',
        editie: SNAPSHOT_CONFIG.number,
        config: SNAPSHOT_CONFIG,
        status: 'draft',
        published_at: null,
        created_at: '2026-08-02T10:00:00Z',
      }),
      rand(),
    ]);
  };

  const banner = (): string =>
    [...document.querySelectorAll('[data-css~="admin-banner"]')]
      .map((b) => b.textContent ?? '')
      .find((t) => t.includes('ciorne deschise')) ?? '';

  it('două ciorne pe server produc un banner care le numește', async () => {
    douaCiorne();
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });

    expect(banner()).toContain('2 ciorne deschise');
    expect(banner()).toContain(String(SNAPSHOT_CONFIG.number));
    expect(banner()).toContain(String(SNAPSHOT_CONFIG.number + 1));
  });

  it('o singură ciornă nu produce niciun banner', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    expect(banner()).toBe('');
  });

  it('cealaltă ciornă se poate deschide dintr-un click', async () => {
    douaCiorne();
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();
    // Se încarcă cea mai nouă: ediția N+1.
    expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number + 1));

    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`Deschide ciorna ediției ${SNAPSHOT_CONFIG.number}$`),
      })
    );
    deschideGrupurile();
    expect(camp('Numărul ediției').value).toBe(String(SNAPSHOT_CONFIG.number));
  });

  it('schimbarea numărului ediției spune că salvarea va crea o ciornă separată', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    const numar = camp('Numărul ediției');
    fireEvent.change(numar, { target: { value: String(SNAPSHOT_CONFIG.number + 1) } });
    expect(eroareaCampului('Numărul ediției')).toContain('ciornă separată');

    // Înapoi la numărul încărcat: atenționarea dispare.
    fireEvent.change(numar, { target: { value: String(SNAPSHOT_CONFIG.number) } });
    expect(eroareaCampului('Numărul ediției')).not.toContain('ciornă separată');
  });

  it('atenționarea nu blochează publicarea — nu e o eroare', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    fireEvent.change(camp('Numărul ediției'), {
      target: { value: String(SNAPSHOT_CONFIG.number + 1) },
    });
    expect((screen.getByRole('button', { name: 'Publică' }) as HTMLButtonElement).disabled).toBe(
      false
    );
  });
});

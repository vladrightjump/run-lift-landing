import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../shared/content/eventConfig';

import { rand, fataDeStart, randeaza, deschideCiorna, creeazaPrinDialog, deschideGrupurile, camp, listEventConfig } from './test-support';

describe('confirmarea publicării arată diferențele', () => {
  const deschideConfirmarea = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Publică' }));

  const diferente = (): string[] =>
    [...document.querySelectorAll('[data-css~="admin-diferente"] > div')].map(
      (d) => d.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    );

  it('enumeră doar câmpurile schimbate, cu valoarea veche și cea nouă', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    fireEvent.change(camp('Locuri disponibile'), { target: { value: '42' } });
    deschideConfirmarea();

    const lista = diferente();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toContain('Locuri disponibile');
    expect(lista[0]).toContain(String(SNAPSHOT_CONFIG.slots.total));
    expect(lista[0]).toContain('42');
  });

  it('un document neschimbat o spune, în loc să arate o listă goală', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });

    deschideConfirmarea();
    expect(screen.getByText(/Nimic nu se schimbă/)).toBeDefined();
    expect(diferente()).toHaveLength(0);
  });

  it('o ciornă a altei ediții e prima publicare, nu un document „tot schimbat"', async () => {
    await creeazaPrinDialog();
    deschideConfirmarea();

    expect(screen.getByText(/Prima publicare a ediției/)).toBeDefined();
    expect(diferente()).toHaveLength(0);
  });

  it('confirmarea păstrează ce vede vizitatorul și nota despre share preview', async () => {
    await deschideCiorna();
    deschideConfirmarea();

    expect(screen.getByText(/landing-ul cu înscrieri/)).toBeDefined();
    expect(screen.getByText(/Share preview-ul/)).toBeDefined();
  });

  it('momentele din listă se citesc, nu se descifrează', async () => {
    listEventConfig.mockResolvedValue([
      rand(),
      rand({ id: 'ciorna', status: 'draft', published_at: null }),
    ]);
    randeaza();
    await screen.findByRole('button', { name: 'Renunță' });
    deschideGrupurile();

    // Două ore mai târziu, nu o altă lună: restul reperelor ale instantaneului
    // rămân valide, deci „Publică" nu e blocat de validare și dialogul se
    // deschide — testul e despre FORMA valorii, nu despre validare.
    const nou = fataDeStart(2);
    fireEvent.change(camp('Startul cursei'), { target: { value: nou } });
    deschideConfirmarea();

    const rand0 = diferente().find((d) => d.includes('Startul cursei')) ?? '';
    expect(rand0).toContain(nou.slice(11, 16));
    expect(rand0).not.toContain(`${nou}:00`);
  });
});

import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../../shared/content/eventConfig';

import { rand, deschideCiorna, listEventConfig } from '../test-support';

describe('câmpurile predispuse la greșeli sînt liste, nu text liber', () => {
  const control = (eticheta: string) => screen.getByLabelText(eticheta) as HTMLSelectElement;

  it('durata, ora de check-in și fusul sînt `select`', async () => {
    await deschideCiorna();
    for (const eticheta of ['Durata', 'Check-in de la', 'Fusul orar']) {
      expect(control(eticheta).tagName).toBe('SELECT');
    }
  });

  it('fusul oferă doar valorile Moldovei, în forma pe care o cere serverul', async () => {
    await deschideCiorna();
    // „+3:00” în loc de „+03:00” trecea de input și cădea abia la „Publică”.
    const valori = [...control('Fusul orar').options].map((o) => o.value);
    expect(valori).toContain('+03:00');
    expect(valori).toContain('+02:00');
    expect(valori.every((v) => /^[+-]\d{2}:\d{2}$/.test(v))).toBe(true);
  });

  it('o valoare din afara listei nu se pierde', async () => {
    // Un document scris manual în DB nu trebuie să pară că are altă valoare.
    listEventConfig.mockResolvedValue([
      rand({ config: { ...SNAPSHOT_CONFIG, checkinFrom: '04:07' } }),
    ]);
    await deschideCiorna();
    expect(control('Check-in de la').value).toBe('04:07');
  });
});

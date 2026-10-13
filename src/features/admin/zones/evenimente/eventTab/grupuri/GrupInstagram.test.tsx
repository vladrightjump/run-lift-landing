import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../../shared/content/eventConfig';

import { randeaza } from '../test-support';

describe('textele și secțiunile stau în grupurile lor', () => {
  /** Grupul cu titlul dat, ca element — ca să putem căuta ÎN el. */
  const grupul = (titlu: string): HTMLElement => {
    const cap = [...document.querySelectorAll('[data-css~="admin-config-grup-cap"]')].find((c) =>
      c.textContent?.includes(titlu)
    );
    return cap?.closest('[data-css~="admin-config-grup"]') as HTMLElement;
  };

  const deschide = (titlu: string) => {
    const cap = grupul(titlu).querySelector('[data-css~="admin-config-grup-cap"]') as HTMLElement;
    if (cap.getAttribute('aria-expanded') === 'false') fireEvent.click(cap);
  };

  it('textele secțiunii se editează din grupul „Instagram"', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    deschide('Instagram');

    const grup = grupul('Instagram');
    expect(within(grup).getByLabelText('Titlul secțiunii')).toBeDefined();
    // Clipurile nu se mai editează de aici: sunt fișiere proprii, în cod.
    expect(within(grup).queryByRole('button', { name: '+ Adaugă clip' })).toBeNull();
  });

  it('secțiunile se aranjează din grupul „Ce arată pagina"', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    deschide('Ce arată pagina');

    const grup = grupul('Ce arată pagina');
    expect(within(grup).getByText('Formatul')).toBeDefined();
    expect(within(grup).getByRole('button', { name: /Mută „Locația” mai sus/ })).toBeDefined();
  });

  it('cu grupurile pliate, niciuna dintre cele două liste nu mai stă pe ecran', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    // Nimic nu s-a deschis: doar „Ediția" e deschis implicit.
    expect(screen.queryByLabelText('Titlul secțiunii')).toBeNull();
    expect(screen.queryByRole('button', { name: /Mută „Locația” mai sus/ })).toBeNull();
  });
});

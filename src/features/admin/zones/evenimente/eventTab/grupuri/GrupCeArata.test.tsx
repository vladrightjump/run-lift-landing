import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';

import { deschideCiorna } from '../test-support';

describe('aranjarea secțiunilor', () => {
  /**
   * Rândurile listei de SECȚIUNI, nu toate elementele de listă din tab.
   *
   * `getAllByRole('listitem')` prindea și clipurile, și cronologia „Când" —
   * adică ordinea secțiunilor se verifica pe primul `<li>" randat oriunde în
   * formular. Trecea din coincidență, până când altceva a fost randat mai sus.
   */
  const randuriSectiuni = (): HTMLElement[] => [
    ...document.querySelectorAll<HTMLElement>('[data-css~="admin-layout-list"] li'),
  ];

  it('mută o secțiune și renumerotează', async () => {
    await deschideCiorna();
    expect(randuriSectiuni()[0].textContent).toContain('Formatul');

    fireEvent.click(screen.getByRole('button', { name: /Mută „Locația” mai sus/ }));
    expect(randuriSectiuni()[0].textContent).toContain('Locația');
  });

  it('ascunderea scoate numărul și marchează rândul', async () => {
    await deschideCiorna();
    const randVenue = randuriSectiuni().find((li) => li.textContent?.includes('Locația'))!;
    fireEvent.click(within(randVenue).getByRole('button', { name: 'Ascunde' }));

    const dupa = randuriSectiuni().find((li) => li.textContent?.includes('Locația'))!;
    expect(dupa.className).toContain('ascunsa');
    expect(within(dupa).getByRole('button', { name: 'Arată' })).toBeTruthy();
  });
});

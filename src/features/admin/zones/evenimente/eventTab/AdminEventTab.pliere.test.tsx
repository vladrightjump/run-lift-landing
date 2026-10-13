import { describe, it, expect } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../shared/content/eventConfig';
import { formatRoDate } from '../../../../../shared/content/format';
import { randeaza, deschideCiorna, camp } from './test-support';

describe('grupurile pliate comprimă documentul, nu îl ascund', () => {
  /** Capacele grupurilor, cu textul lor (titlu + rezumat când e pliat). */
  const capace = (): string[] =>
    [...document.querySelectorAll('[data-css~="admin-config-grup-cap"]')].map((c) => c.textContent ?? '');

  const deschis = (titlu: string): boolean =>
    [...document.querySelectorAll('[data-css~="admin-config-grup-cap"]')]
      .find((c) => c.textContent?.includes(titlu))
      ?.getAttribute('aria-expanded') === 'true';

  it('la deschiderea ciornei, câmpurile nu sînt toate pe ecran', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    // Douăzeci de câmpuri deschise simultan erau două ecrane și jumătate.
    expect(screen.queryByLabelText('Numele locului')).toBeNull();
    expect(deschis('Unde')).toBe(false);
  });

  it('rezumatul ține locul câmpurilor — plierea comprimă, nu ascunde', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    const text = capace().join(' | ');
    // Locul, capacitatea și data se citesc fără să deschizi nimic.
    expect(text).toContain(SNAPSHOT_CONFIG.venue.name);
    expect(text).toContain(String(SNAPSHOT_CONFIG.slots.total));
    // Data startului, scrisă în română — derivată din instantaneu, ca luna să
    // nu fie o constantă care expiră la ediția următoare.
    expect(text).toContain(formatRoDate(SNAPSHOT_CONFIG.start));
  });

  it('un grup se deschide la click și se închide la al doilea', async () => {
    randeaza();
    fireEvent.click(
      await screen.findByRole('button', {
        name: new RegExp(`Editează ediția ${SNAPSHOT_CONFIG.number}`),
      })
    );
    const cap = [...document.querySelectorAll('[data-css~="admin-config-grup-cap"]')].find((c) =>
      c.textContent?.includes('Unde')
    )!;
    fireEvent.click(cap);
    expect(camp('Numele locului')).toBeTruthy();
    fireEvent.click(cap);
    expect(screen.queryByLabelText('Numele locului')).toBeNull();
  });

  it('un grup cu eroare se deschide singur și NU se mai poate închide', async () => {
    // Altfel „Publică" ar rămâne blocat de o eroare ascunsă sub un capac, iar
    // bannerul de sus ar spune CE e greșit fără să arate UNDE.
    await deschideCiorna();
    fireEvent.change(camp('Coordonatele'), { target: { value: 'Valea Morilor' } });

    const cap = [...document.querySelectorAll('[data-css~="admin-config-grup-cap"]')].find((c) =>
      c.textContent?.includes('Unde')
    )!;
    fireEvent.click(cap); // încercăm să-l închidem
    expect(deschis('Unde')).toBe(true);
    expect(camp('Coordonatele')).toBeTruthy();
  });
});

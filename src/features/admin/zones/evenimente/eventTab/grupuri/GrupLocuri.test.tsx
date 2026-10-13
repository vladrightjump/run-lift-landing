import { describe, it, expect } from 'vitest';
import { screen, fireEvent, within } from '@testing-library/react';
import { SNAPSHOT_CONFIG } from '../../../../../../shared/content/eventConfig';

import { deschideCiorna, camp } from '../test-support';

describe('avertismentele nu blochează', () => {
  it('ediția de lansare înaintea celei a evenimentului avertizează, dar lasă publicarea', async () => {
    await deschideCiorna();
    fireEvent.change(camp('Ediția de lansare'), {
      target: { value: String(SNAPSHOT_CONFIG.number + 1) },
    });
    // Doar în bannerul de avertisment: „/confirmare" apare și în explicația de
    // sub câmp, care e text permanent, nu reacție la ce tocmai s-a tastat.
    const banner = document.querySelector('[data-css~="admin-banner"]:not(.warn)') as HTMLElement;
    expect(within(banner).getByText(/confirmare/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Publică' }).hasAttribute('disabled')).toBe(false);
  });
});

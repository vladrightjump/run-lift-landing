import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ziProgram } from '../../../../tests/support/builders/programare';
import { HartaAn } from './HartaAn';

afterEach(cleanup);

describe('Harta anului', () => {
  it('desenează fiecare zi a anului bisect o singură dată și descrie zilele fără antrenament', () => {
    render(<HartaAn an={2024} zile={[]} />);
    const harta = screen.getByRole('img', { name: 'Harta antrenamentelor în 2024' });
    const date = [...harta.querySelectorAll('rect title')].map(t => t.textContent);
    expect(date).toHaveLength(366);
    expect(new Set(date).size).toBe(366);
    expect(date[0]).toBe('luni, 1 ianuarie 2024, fără antrenament');
    expect(date).toContain('joi, 29 februarie 2024, fără antrenament');
    expect(date.at(-1)).toBe('marți, 31 decembrie 2024, fără antrenament');
    expect(harta.getAttribute('viewBox')).toBeTruthy();
  });

  it('marchează stările primite și nu amestecă zilele din alt an', () => {
    render(<HartaAn an={2026} zile={[
      { ...ziProgram(), data: '2026-10-21', stare: 'nefăcut' },
      { ...ziProgram({ id: 'zi-2' }), data: '2026-10-22', stare: 'viitor' },
      { ...ziProgram({ id: 'zi-3' }), data: '2027-01-01', stare: 'viitor' },
    ]} />);
    const harta = screen.getByRole('img', { name: 'Harta antrenamentelor în 2026' });
    const titluri = [...harta.querySelectorAll('rect title')];
    expect(titluri).toHaveLength(365);
    const trecut = titluri.find(t => t.textContent === 'miercuri, 21 octombrie 2026, nefăcut')!;
    const viitor = titluri.find(t => t.textContent === 'joi, 22 octombrie 2026, viitor')!;
    expect(trecut).toBeDefined();
    expect(viitor).toBeDefined();
    expect(trecut.parentElement?.getAttribute('class')).not.toBe(viitor.parentElement?.getAttribute('class'));
    expect(titluri.some(t => t.textContent?.includes('2027'))).toBe(false);
  });
});

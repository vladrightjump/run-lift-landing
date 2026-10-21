import { describe, expect, it } from 'vitest';
import { stareZi } from './stareZi';

describe('starea unei zile din calendar', () => {
  const blocuri = [
    { tip: 'warm_up', are_rezultat: false },
    { tip: 'strength', are_rezultat: true },
    { tip: 'cardio', are_rezultat: false },
  ];

  it('arată viitor înainte de a evalua rezultatele', () => {
    expect(stareZi('2026-10-22', '2026-10-21', blocuri)).toBe('viitor');
  });

  it('arată parțial când cel puțin un bloc dintre cele urmărite are rezultat', () => {
    expect(stareZi('2026-10-20', '2026-10-21', blocuri)).toBe('partial');
  });

  it('arată făcut când toate blocurile vizibile au rezultat, exceptând încălzirea', () => {
    expect(stareZi('2026-10-21', '2026-10-21', [
      { tip: 'warm_up', are_rezultat: false },
      { tip: 'strength', are_rezultat: true },
      { tip: 'cardio', are_rezultat: false, ascuns: true },
    ])).toBe('facut');
  });

  it('arată nefăcut când niciun bloc urmărit nu are rezultat', () => {
    expect(stareZi('2026-10-20', '2026-10-21', [{ tip: 'cardio', are_rezultat: false }])).toBe('nefacut');
    expect(stareZi('2026-10-20', '2026-10-21', [{ tip: 'warm_up', are_rezultat: true }])).toBe('nefacut');
    expect(stareZi('2026-10-20', '2026-10-21', [])).toBe('nefacut');
  });
});

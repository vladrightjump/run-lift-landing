import { describe, expect, it } from 'vitest';
import { estimeazaUnuRm, celMaiMareUnuRm, kgSugerate } from './unuRm';

describe('1RM estimat și încărcarea sugerată', () => {
  it('aplică Epley: 3 repetări cu 93 kg estimează 102,3 kg', () => {
    expect(estimeazaUnuRm(93, 3)).toBeCloseTo(102.3);
  });

  it('folosește numai repetări întregi între 1 și 10, cu greutate pozitivă', () => {
    expect(estimeazaUnuRm(80, 10)).toBeCloseTo(106.666666);
    for (const repetari of [0, 12, 2.5, 'max', '15-20', 'X']) {
      expect(estimeazaUnuRm(93, repetari)).toBeNull();
    }
    expect(estimeazaUnuRm(0, 3)).toBeNull();
  });

  it('alege cel mai mare estimat valid din rezultatele mișcării', () => {
    expect(celMaiMareUnuRm([
      { incarcare: 93, repetari: '3' },
      { incarcare: 80, repetari: '5' },
      { incarcare: 100, repetari: '12' },
      { incarcare: null, repetari: '3' },
    ])).toBeCloseTo(102.3);
    expect(celMaiMareUnuRm([])).toBeNull();
  });

  it('rotunjește procentul din 1RM la cel mai apropiat 0,5 kg', () => {
    expect(kgSugerate(70, 100)).toBe(70);
    expect(kgSugerate(75, 102.3)).toBe(76.5);
    expect(kgSugerate(70, null)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { numar, durata, distanta, livreInKg, feetInMetri, inchInCm } from './unitati';

describe('unități metrice și text românesc', () => {
  it('scrie zecimalele cu virgulă, fără zerouri inutile', () => {
    expect(numar(102.3)).toBe('102,3');
    expect(numar(70)).toBe('70');
  });

  it('exprimă duratele, inclusiv minutele și secundele rămase', () => {
    expect(durata(30)).toBe('30 de secunde');
    expect(durata(60)).toBe('1 minut');
    expect(durata(1200)).toBe('20 de minute');
    expect(durata(90)).toBe('1 minut și 30 de secunde');
    expect(durata(3600)).toBe('1 oră');
    expect(durata(0)).toBe('0 secunde');
  });

  it('păstrează distanțele metrice și convertește doar afișarea kilometrilor', () => {
    expect(distanta(400)).toBe('400 m');
    expect(distanta(1500)).toBe('1,5 km');
    expect(distanta(1001)).toBe('1,001 km');
  });

  it('convertește unitățile importate fără să rotunjească datele stocate', () => {
    expect(livreInKg(100)).toBeCloseTo(45.359237);
    expect(feetInMetri(10)).toBeCloseTo(3.048);
    expect(inchInCm(24)).toBeCloseTo(60.96);
  });
});

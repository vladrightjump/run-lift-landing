import { describe, expect, it } from 'vitest';
import { aziProgramare, dataAtribuire, decaleazaData, diferentaZile, dataCompleta } from './date';

describe('datele fixe ale programului', () => {
  it('calculează data din săptămâna și ziua relative', () => {
    expect(dataAtribuire('2026-10-21', 1, 1)).toBe('2026-10-21');
    expect(dataAtribuire('2026-10-21', 2, 3)).toBe('2026-10-30');
    expect(dataAtribuire('2026-12-28', 2, 1)).toBe('2027-01-04');
  });

  it('adună zile calendaristice peste ambele schimbări de oră, fără alunecare', () => {
    expect(decaleazaData('2026-03-28', 2)).toBe('2026-03-30');
    expect(decaleazaData('2026-10-24', 2)).toBe('2026-10-26');
    expect(decaleazaData('2028-02-28', 1)).toBe('2028-02-29');
    expect(diferentaZile('2026-10-24', '2026-10-26')).toBe(2);
    expect(diferentaZile('2026-03-30', '2026-03-28')).toBe(-2);
  });

  it('alege azi în Europe/Chisinau, inclusiv lângă miezul nopții', () => {
    expect(aziProgramare(new Date('2026-10-20T21:30:00Z'))).toBe('2026-10-21');
    expect(aziProgramare(new Date('2026-01-09T22:05:00Z'))).toBe('2026-01-10');
  });

  it('scrie data completă în română fără o conversie de fus', () => {
    expect(dataCompleta('2026-10-21')).toBe('miercuri, 21 octombrie 2026');
  });
});

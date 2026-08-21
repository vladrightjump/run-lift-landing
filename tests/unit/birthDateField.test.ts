import { describe, it, expect } from 'vitest';
import { formatMask, toISO, fromISO } from '../../src/components/landing/BirthDateField';
import { dataNasteriiError } from '../../src/lib/validation';

/**
 * Câmpul unic de dată (`zz.ll.aaaa`) înlocuiește cele 3 select-uri. Contractul cu
 * restul aplicației e ISO `yyyy-mm-dd` într-un input ascuns — deci `validate()` și
 * `dataNasteriiError()` rămân neatinse. Testele de aici păzesc exact conversia
 * asta: dacă masca sau ISO-ul se strică, înscrierile ajung cu date greșite în DB.
 */

describe('formatMask — punctele apar în timp ce scrii', () => {
  it('pune punctele singur, pe măsură ce se tastează', () => {
    expect(formatMask('1')).toBe('1');
    expect(formatMask('12')).toBe('12');
    expect(formatMask('120')).toBe('12.0');
    expect(formatMask('1208')).toBe('12.08');
    expect(formatMask('12081990')).toBe('12.08.1990');
  });

  it('ignoră separatorii pe care îi tastează omul', () => {
    expect(formatMask('12/08/1990')).toBe('12.08.1990');
    expect(formatMask('12-08-1990')).toBe('12.08.1990');
    expect(formatMask('12 08 1990')).toBe('12.08.1990');
  });

  it('taie peste 8 cifre, deci nu se poate scrie la nesfârșit', () => {
    expect(formatMask('120819901234')).toBe('12.08.1990');
  });

  it('șirul gol rămâne gol', () => {
    expect(formatMask('')).toBe('');
  });
});

describe('toISO — ce ajunge efectiv în formular', () => {
  it('o dată completă devine ISO', () => {
    expect(toISO('12.08.1990')).toBe('1990-08-12');
  });

  // Cel mai important caz: o dată pe jumătate scrisă NU trebuie să treacă drept
  // validă. Dacă ar întoarce ceva ne-gol, `validate()` ar accepta o dată ruptă.
  it('o dată incompletă întoarce gol, deci validarea o respinge', () => {
    for (const partial of ['', '1', '12', '12.0', '12.08', '12.08.19']) {
      expect(toISO(partial)).toBe('');
    }
    expect(dataNasteriiError(toISO('12.08'))).toBe('Introdu data nașterii.');
  });

  it('completează cu zero zilele și lunile de o cifră', () => {
    expect(toISO('1.2.1990')).toBe('');
    expect(toISO('01.02.1990')).toBe('1990-02-01');
  });

  // Garda de calendar stă în `ageAtEvent` — câmpul nu trebuie să o ocolească.
  it('o dată imposibilă produce ISO pe care validarea îl respinge', () => {
    expect(toISO('30.02.2000')).toBe('2000-02-30');
    expect(dataNasteriiError('2000-02-30')).toBe('Data nașterii nu e validă.');
  });
});

describe('fromISO — valoarea venită din afară', () => {
  it('ISO devine text afișabil', () => {
    expect(fromISO('1990-08-12')).toBe('12.08.1990');
  });

  // `resetForm` golește valoarea din părinte; câmpul trebuie să urmeze.
  it('gol sau malformat întoarce gol', () => {
    expect(fromISO('')).toBe('');
    expect(fromISO('1990-8-12')).toBe('');
    expect(fromISO('nu-e-o-data')).toBe('');
  });

  it('dus-întors păstrează data', () => {
    expect(toISO(fromISO('1994-05-15'))).toBe('1994-05-15');
  });
});

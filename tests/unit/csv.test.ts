import { describe, it, expect } from 'vitest';
import { toCsv, durataCsv } from '../../src/lib/csv';

describe('toCsv', () => {
  it('încadrează în ghilimele și dublează ghilimelele interne', () => {
    expect(toCsv([['a', 'b,c', 'd"e']])).toBe('"a","b,c","d""e"');
  });

  it('neutralizează injecția de formule (= + - @) cu un apostrof', () => {
    expect(toCsv([['=SUM(A1)', '+1', '-2', '@x', 'safe']])).toBe(
      `"'=SUM(A1)","'+1","'-2","'@x","safe"`
    );
  });

  it('nu atinge textul normal, chiar dacă are un simbol la mijloc', () => {
    expect(toCsv([['Ana=Maria', 'a+b']])).toBe('"Ana=Maria","a+b"');
  });

  it('pune rândurile pe linii separate', () => {
    expect(toCsv([['a'], ['b']])).toBe('"a"\n"b"');
  });
});

/**
 * Timpul final, scris ca să NU fie reinterpretat de spreadsheet.
 *
 * Serverul întoarce `HH:MM:SS`. Pus așa într-o celulă, Excel și Sheets îl
 * citesc ca ORĂ DIN ZI — 32 de minute de alergare devin 00:32, adică miezul
 * nopții. Celula poartă deci unități.
 */
describe('durataCsv', () => {
  it('sub o oră: minute și secunde, fără ora zero', () => {
    expect(durataCsv('00:32:15')).toBe('32m 15s');
  });

  it('peste o oră: ore, minute, secunde', () => {
    expect(durataCsv('01:02:15')).toBe('1h 02m 15s');
  });

  it('nu produce nimic care să arate a oră din zi', () => {
    expect(durataCsv('00:32:15')).not.toContain(':');
    expect(durataCsv('01:02:15')).not.toContain(':');
  });

  it('minutele își pierd zeroul din față, secundele nu', () => {
    // „5m 04s": 4 secunde nu e 40.
    expect(durataCsv('00:05:04')).toBe('5m 04s');
  });

  it('peste 24 de ore rămâne o durată, nu trece într-o zi următoare', () => {
    expect(durataCsv('26:00:00')).toBe('26h 00m 00s');
  });

  it('acceptă fracțiunile de secundă întoarse de Postgres', () => {
    expect(durataCsv('00:32:15.482')).toBe('32m 15s');
  });

  it('lipsa e celulă goală, nu „null" și nu zero', () => {
    expect(durataCsv(null)).toBe('');
    expect(durataCsv(undefined)).toBe('');
    expect(durataCsv('')).toBe('');
  });

  /**
   * O formă ciudată e mai bună decât o celulă goală: goală arată ca „n-a
   * terminat", ceea ce ar fi o afirmație despre cursă.
   */
  it('ce nu recunoaștem pleacă neatins', () => {
    expect(durataCsv('cam o jumătate de oră')).toBe('cam o jumătate de oră');
  });

  it('trece prin escaping ca orice altă celulă', () => {
    expect(toCsv([[durataCsv('00:32:15')]])).toBe('"32m 15s"');
  });
});

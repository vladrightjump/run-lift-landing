import { describe, it, expect } from 'vitest';
import { toCsv } from '../../src/lib/csv';

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

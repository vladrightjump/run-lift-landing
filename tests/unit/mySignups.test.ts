import { describe, it, expect, beforeEach } from 'vitest';
import { maskName, getMySignups, rememberMySignup } from '../../src/lib/mySignups';

/**
 * `mySignups` reține local înscrierile de pe acest dispozitiv, doar pentru
 * badge-ul „Nou" din lista de participanți. `maskName` trebuie să oglindească
 * mascarea din RPC-ul `public_stats` — altfel badge-ul nu s-ar potrivi.
 */

beforeEach(() => {
  localStorage.clear();
});

describe('maskName (oglinda mascării din public_stats)', () => {
  it('„Prenume Nume" → „Prenume N."', () => {
    expect(maskName('Vlad Filip')).toBe('Vlad F.');
    expect(maskName('Ana Maria Popescu')).toBe('Ana P.');
  });

  it('un singur cuvânt rămâne neschimbat', () => {
    expect(maskName('Vlad')).toBe('Vlad');
  });

  it('curăță spațiile în plus', () => {
    expect(maskName('  Vlad   Filip  ')).toBe('Vlad F.');
  });

  it('inițiala numelui e majusculă', () => {
    expect(maskName('vlad filip')).toBe('vlad F.');
  });

  it('string gol → gol', () => {
    expect(maskName('   ')).toBe('');
  });
});

describe('getMySignups / rememberMySignup', () => {
  it('pornește gol', () => {
    expect(getMySignups()).toEqual([]);
  });

  it('reține numele mascat, nu pe cel complet', () => {
    rememberMySignup('Vlad Filip');
    expect(getMySignups()).toEqual(['Vlad F.']);
  });

  it('adaugă în ordine, păstrând intrările anterioare', () => {
    rememberMySignup('Vlad Filip');
    rememberMySignup('Ana Popescu');
    expect(getMySignups()).toEqual(['Vlad F.', 'Ana P.']);
  });

  it('ignoră un localStorage corupt fără să arunce', () => {
    localStorage.setItem('runlift_registrari', 'not-json');
    expect(getMySignups()).toEqual([]);
  });

  it('păstrează doar string-uri dintr-un array mixt', () => {
    localStorage.setItem('runlift_registrari', JSON.stringify(['Vlad F.', 42, null, 'Ana P.']));
    expect(getMySignups()).toEqual(['Vlad F.', 'Ana P.']);
  });
});

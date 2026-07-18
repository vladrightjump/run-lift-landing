import { describe, it, expect } from 'vitest';
import {
  EMAIL_RE,
  PHONE_RE,
  normalizePhone,
  MIN_AGE,
  ageAtEvent,
  dataNasteriiError,
} from '../../src/lib/validation';

describe('normalizePhone', () => {
  it('scoate spații, paranteze, puncte și liniuțe', () => {
    expect(normalizePhone('069 123 456')).toBe('069123456');
    expect(normalizePhone('(069) 123-456')).toBe('069123456');
    expect(normalizePhone('069.123.456')).toBe('069123456');
  });

  it('păstrează prefixul internațional', () => {
    // Intenționat: acceptăm și participanți din afara Moldovei.
    expect(normalizePhone('+373 69 123 456')).toBe('+37369123456');
  });

  it('lasă neatins un număr deja curat', () => {
    expect(normalizePhone('069123456')).toBe('069123456');
  });

  it('nu modifică cifrele', () => {
    expect(normalizePhone('0 6 9 1 2 3 4 5 6')).toBe('069123456');
  });
});

describe('PHONE_RE', () => {
  it('acceptă numere moldovenești', () => {
    for (const t of ['069123456', '060875770', '079000111']) {
      expect(PHONE_RE.test(normalizePhone(t))).toBe(true);
    }
  });

  it('acceptă formatul internațional', () => {
    for (const t of ['+373 69 123 456', '+40 721 234 567', '+1 555 010 9999']) {
      expect(PHONE_RE.test(normalizePhone(t))).toBe(true);
    }
  });

  it('respinge ce nu e număr', () => {
    for (const t of ['abcdefghi', '', '   ', '069-abc-456']) {
      expect(PHONE_RE.test(normalizePhone(t))).toBe(false);
    }
  });

  it('respinge numere prea scurte sau prea lungi', () => {
    expect(PHONE_RE.test(normalizePhone('1234567'))).toBe(false); // 7 cifre
    expect(PHONE_RE.test(normalizePhone('1234567890123456'))).toBe(false); // 16 cifre
  });

  it('acceptă 8–15 cifre — prag deliberat larg pentru numere internaționale', () => {
    // Documentează o alegere de design: NU validăm structura numerelor
    // moldovenești strict, ca să nu blocăm participanți din alte țări.
    // Efect secundar acceptat: „06912345" (8 cifre) trece.
    expect(PHONE_RE.test('12345678')).toBe(true);
    expect(PHONE_RE.test('123456789012345')).toBe(true);
  });

  it('acceptă un singur plus, doar la început', () => {
    expect(PHONE_RE.test('+37369123456')).toBe(true);
    expect(PHONE_RE.test('373+69123456')).toBe(false);
    expect(PHONE_RE.test('++37369123456')).toBe(false);
  });
});

describe('EMAIL_RE', () => {
  it('acceptă adrese valide', () => {
    const valide = [
      'andrei@email.ro',
      'dumitru@barbaros.md',
      'nume.prenume+tag@sub.domeniu.com',
      'a@b.co',
    ];
    for (const t of valide) expect(EMAIL_RE.test(t)).toBe(true);
  });

  it('respinge adrese invalide', () => {
    const invalide = [
      'nu-e-email',
      '@fara-parte-locala.com',
      'fara-domeniu@',
      'fara@tld',
      'spatiu in@email.com',
      'doua@@arobase.com',
      '',
    ];
    for (const t of invalide) expect(EMAIL_RE.test(t)).toBe(false);
  });

  it('cere cel puțin două caractere după ultimul punct', () => {
    expect(EMAIL_RE.test('a@b.c')).toBe(false);
    expect(EMAIL_RE.test('a@b.co')).toBe(true);
  });
});

describe('vârsta la data evenimentului', () => {
  it('calculează ani întregi', () => {
    expect(ageAtEvent('2000-01-01')).toBeGreaterThan(20);
  });

  it('returnează null pentru date invalide', () => {
    expect(ageAtEvent('')).toBeNull();
    expect(ageAtEvent('nu-e-data')).toBeNull();
  });

  it('respinge participanții sub vârsta minimă', () => {
    const anulCurent = new Date().getFullYear();
    const preTanar = `${anulCurent - (MIN_AGE - 2)}-01-01`;
    expect(dataNasteriiError(preTanar)).not.toBeNull();
  });

  it('acceptă o dată de naștere validă', () => {
    expect(dataNasteriiError('1994-05-20')).toBeNull();
  });
});

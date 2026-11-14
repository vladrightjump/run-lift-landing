import { describe, expect, it } from 'vitest';
import { EMPTY_GIVEAWAY_DRAFT, normalizeInstagram, validateGiveawayDraft } from './giveawayForm';

const VALID = {
  ...EMPTY_GIVEAWAY_DRAFT,
  nume: 'Ana Popescu',
  telefon: '069 123 456',
  email: 'ana@exemplu.ro',
  instagram: '@ana.run',
  acordRegulament: true,
};

describe('contul de Instagram', () => {
  it.each([
    ['@Ana.Run', 'ana.run'],
    ['  ana.run  ', 'ana.run'],
    ['https://www.instagram.com/ana.run/', 'ana.run'],
    ['instagram.com/Ana.Run?igsh=abc123', 'ana.run'],
  ])('`%s` devine `%s`', (scris, asteptat) => {
    expect(normalizeInstagram(scris)).toBe(asteptat);
  });
});

describe('validarea formularului de giveaway', () => {
  it('un draft complet nu are nicio eroare, cu sau fără acordul de contact', () => {
    expect(validateGiveawayDraft(VALID)).toEqual({});
    expect(validateGiveawayDraft({ ...VALID, acordContact: true })).toEqual({});
  });

  it('un link de profil lipit în câmpul de Instagram e acceptat', () => {
    expect(validateGiveawayDraft({ ...VALID, instagram: 'https://www.instagram.com/ana.run/' })).toEqual({});
  });

  it.each([
    ['nume de două litere', { nume: 'Al' }, 'nume'],
    ['telefon de cinci cifre', { telefon: '06950' }, 'telefon'],
    ['email fără domeniu', { email: 'ana@exemplu' }, 'email'],
    ['cont de Instagram cu spații', { instagram: 'ana run' }, 'instagram'],
    ['cont de Instagram de 31 de caractere', { instagram: 'a'.repeat(31) }, 'instagram'],
    ['cont de Instagram gol', { instagram: '' }, 'instagram'],
    ['regulament nebifat', { acordRegulament: false }, 'acordRegulament'],
  ] as const)('%s marchează doar câmpul lui', (_, over, camp) => {
    expect(validateGiveawayDraft({ ...VALID, ...over })).toEqual({ [camp]: true });
  });
});

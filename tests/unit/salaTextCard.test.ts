import { describe, it, expect } from 'vitest';
import { textCard } from '../../src/admin/sala/textCard';
import type { SalaRezumat } from '../../src/lib/salaApi';

/**
 * Cardul grupului de pe ecranul de pornire (R4, AE4): o propoziție adevărată
 * despre antrenamentul următor, în fiecare dintre stări.
 */

// Miercuri 7 octombrie, 10:00 la Chișinău.
const ACUM = new Date('2026-10-07T10:00:00+03:00');

const rezumat = (peste: Partial<SalaRezumat> = {}): SalaRezumat => ({
  azi: '2026-10-07',
  pornit: true,
  poll_days: [1, 3],
  poll_time: '12:00',
  urmatorul: null,
  ...peste,
});

const urmator = (peste: Partial<NonNullable<SalaRezumat['urmatorul']>> = {}) => ({
  session_date: '2026-10-08',
  starts_at: '06:30',
  location: 'Parc',
  status: 'scheduled' as const,
  vin: 12,
  nu_vin: 3,
  ...peste,
});

describe('textCard', () => {
  it('cu antrenament și răspunsuri: data și câți vin', () => {
    expect(textCard(rezumat({ urmatorul: urmator() }), ACUM)).toEqual({
      stare: 'cu-raspunsuri',
      titlu: 'Joi, 8 oct, 06:30',
      detaliu: '12 vin · 3 nu',
    });
  });

  it('un singur „vine" la singular', () => {
    expect(textCard(rezumat({ urmatorul: urmator({ vin: 1, nu_vin: 0 }) }), ACUM).detaliu).toBe('1 vine · 0 nu');
  });

  it('Covers AE4. sondajul încă n-a plecat: spune când pleacă, nu „0 vin"', () => {
    const t = textCard(rezumat(), ACUM);
    expect(t.stare).toBe('asteapta-sondajul');
    expect(t.titlu).toBe('Următorul: Joi, 8 oct');
    expect(t.detaliu).toBe('Sondajul pleacă miercuri la 12:00.');
    expect(`${t.titlu} ${t.detaliu}`).not.toMatch(/0 vin/);
  });

  it('Covers AE4. botul oprit: spune că e oprit', () => {
    const t = textCard(rezumat({ pornit: false }), ACUM);
    expect(t.stare).toBe('oprit');
    expect(t.titlu).toBe('Botul e oprit');
  });

  it('antrenamentul următor anulat: spune că e anulat, chiar cu botul oprit', () => {
    const t = textCard(rezumat({ pornit: false, urmatorul: urmator({ status: 'cancelled' }) }), ACUM);
    expect(t.stare).toBe('anulat');
    expect(t.titlu).toBe('Joi, 8 oct — anulat');
  });

  it('fără zile de sondaj: spune unde se aleg', () => {
    expect(textCard(rezumat({ poll_days: [] }), ACUM).stare).toBe('fara-orar');
  });
});

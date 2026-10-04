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
  poll_sent: true,
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

  it('Covers AE4. rând programat, dar sondajul n-a plecat (reactivat): nu „0 vin", ci când pleacă', () => {
    const t = textCard(rezumat({ urmatorul: urmator({ poll_sent: false, vin: 0, nu_vin: 0 }) }), ACUM);
    expect(t.stare).toBe('asteapta-sondajul');
    expect(t.titlu).toBe('Următorul: Joi, 8 oct, 06:30');
    expect(t.detaliu).toBe('Sondajul pleacă miercuri la 12:00.');
  });

  it('rând programat fără sondaj, pentru o zi pe care orarul n-o acoperă: spune doar că n-a plecat', () => {
    // Sondajul de vineri e pentru sâmbătă, deci joi rămâne următorul, fără sondaj.
    const t = textCard(
      rezumat({ poll_days: [5], urmatorul: urmator({ poll_sent: false, vin: 0, nu_vin: 0 }) }),
      ACUM
    );
    expect(t.stare).toBe('asteapta-sondajul');
    expect(t.titlu).toBe('Următorul: Joi, 8 oct, 06:30');
    expect(t.detaliu).toBe('Sondajul n-a plecat încă.');
  });

  it('o zi anulată peste două săptămâni nu ascunde antrenamentul de joi', () => {
    // Singurul rând de azi încolo e ziua anulată; joi n-are încă rând, dar
    // sondajul pentru el pleacă azi la 12:00.
    const t = textCard(rezumat({ urmatorul: urmator({ session_date: '2026-10-22', status: 'cancelled' }) }), ACUM);
    expect(t).toEqual({
      stare: 'asteapta-sondajul',
      titlu: 'Următorul: Joi, 8 oct',
      detaliu: 'Sondajul pleacă miercuri la 12:00.',
    });
  });

  it('o zi reactivată departe, fără sondaj, nu ascunde antrenamentul de joi', () => {
    const t = textCard(
      rezumat({ urmatorul: urmator({ session_date: '2026-10-20', poll_sent: false, vin: 0, nu_vin: 0 }) }),
      ACUM
    );
    expect(t.titlu).toBe('Următorul: Joi, 8 oct');
    expect(t.detaliu).toBe('Sondajul pleacă miercuri la 12:00.');
  });

  it('o zi anulată departe, cu botul oprit: spune că botul e oprit', () => {
    const t = textCard(
      rezumat({ pornit: false, urmatorul: urmator({ session_date: '2026-10-22', status: 'cancelled' }) }),
      ACUM
    );
    expect(t.stare).toBe('oprit');
  });

  it('ziua anulată e chiar următoarea din orar: rămâne „anulat"', () => {
    // Fără joi, orarul (luni, miercuri) duce la marți 13; ziua anulată de joi e mai aproape.
    const t = textCard(rezumat({ urmatorul: urmator({ status: 'cancelled', poll_sent: false, vin: 0, nu_vin: 0 }) }), ACUM);
    expect(t.stare).toBe('anulat');
    expect(t.titlu).toBe('Joi, 8 oct — anulat');
  });

  it('voturi marcate de mână înainte de sondaj se numără', () => {
    const t = textCard(rezumat({ urmatorul: urmator({ poll_sent: false, vin: 2, nu_vin: 0 }) }), ACUM);
    expect(t.stare).toBe('cu-raspunsuri');
    expect(t.detaliu).toBe('2 vin · 0 nu');
  });

  it('fără zile de sondaj: spune unde se aleg', () => {
    expect(textCard(rezumat({ poll_days: [] }), ACUM).stare).toBe('fara-orar');
  });
});

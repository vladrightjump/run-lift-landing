import { describe, it, expect } from 'vitest';
import {
  istoricMembru,
  peZileleSaptamanii,
  prezentePeMembru,
  randuriFrecventa,
  stareFrecventa,
} from '../../src/admin/sala/analiza';
import { sessionBreakdown } from '../../src/admin/sala/statistici';
import { sesiuniPentruStatistici } from '../../src/admin/sala/model';
import { dateSala, membruSala } from './helpers/salaFixtures';
import type { SalaDate } from '../../src/lib/salaApi';

describe('stareFrecventa (pragurile din gym-app)', () => {
  it('fără nicio prezență → n-a venit', () => {
    expect(stareFrecventa(0, null, '2026-10-07')).toBe('niciodata');
  });
  it('ultima prezență acum 14 zile → încă activ', () => {
    expect(stareFrecventa(3, '2026-09-23', '2026-10-07')).toBe('activ');
  });
  it('acum 15 zile → inactiv', () => {
    expect(stareFrecventa(3, '2026-09-22', '2026-10-07')).toBe('inactiv');
  });
});

describe('prezentePeMembru', () => {
  it('un „vin" pentru mâine nu e o prezență', () => {
    const { ultima, sesiuni } = prezentePeMembru(dateSala());
    expect(ultima.get('ana')).toBeUndefined();
    expect(sesiuni.get('ana')).toBeUndefined();
    expect(ultima.get('maria')).toBe('2026-10-06');
  });

  it('un antrenament anulat nu se socotește', () => {
    const d = dateSala();
    d.antrenamente[1] = { ...d.antrenamente[1], status: 'cancelled' };
    expect(prezentePeMembru(d).ultima.get('maria')).toBeUndefined();
  });
});

describe('randuriFrecventa', () => {
  it('numără prezențele pe antrenamentele trecute și lasă afară membrii ieșiți', () => {
    const d = dateSala();
    d.membri.push(membruSala('plecat', { status: 'cancelled' }));
    const r = randuriFrecventa(d);
    expect(r.map((x) => x.membru.id)).not.toContain('plecat');
    expect(r.find((x) => x.membru.id === 'maria')).toEqual(
      expect.objectContaining({ prezente: 1, total: 1, ultima: '2026-10-06', stare: 'activ' })
    );
    expect(r.find((x) => x.membru.id === 'ion')).toEqual(
      expect.objectContaining({ prezente: 0, stare: 'niciodata' })
    );
  });
});

describe('istoricMembru', () => {
  const cuSesiuni = (raspunsuri: ('yes' | 'no' | null)[]): SalaDate => {
    // raspunsuri[0] = cel mai nou antrenament
    const antrenamente = raspunsuri.map((_, i) => ({
      id: `t${i}`,
      session_date: new Date(Date.UTC(2026, 9, 6 - i * 3)).toISOString().slice(0, 10),
      starts_at: '06:30',
      location: 'Parc',
      status: 'done' as const,
      poll_sent: true,
    }));
    return dateSala({
      antrenamente,
      raspunsuri: raspunsuri.flatMap((r, i) =>
        r ? [{ session_id: `t${i}`, member_id: 'ana', response: r, is_first_training: false, responded_at: '2026-10-01T00:00:00Z' }] : []
      ),
    });
  };

  it('procentul și ordinea, cel mai nou primul', () => {
    const ist = istoricMembru(cuSesiuni(['yes', 'no', null, 'yes']), 'ana');
    expect(ist.istoric.map((h) => h.raspuns)).toEqual(['yes', 'no', null, 'yes']);
    expect(ist).toEqual(expect.objectContaining({ prezente: 2, total: 4, procent: 50 }));
  });

  it('tendința: ultimele 4 față de cele 4 dinainte, prag 12 puncte', () => {
    expect(istoricMembru(cuSesiuni(['yes', 'yes', 'yes', 'yes', 'no', 'no', 'no', 'no']), 'ana').tendinta).toBe('sus');
    expect(istoricMembru(cuSesiuni(['no', 'no', 'no', 'no', 'yes', 'yes', 'yes', 'yes']), 'ana').tendinta).toBe('jos');
    expect(istoricMembru(cuSesiuni(['yes', 'no', 'yes', 'no', 'yes', 'no', 'yes', 'no']), 'ana').tendinta).toBe('egal');
  });

  it('cel mult 20 de antrenamente, fără cele viitoare', () => {
    const ist = istoricMembru(cuSesiuni(Array(25).fill('yes')), 'ana');
    expect(ist.total).toBe(20);
  });
});

describe('peZileleSaptamanii', () => {
  it('media procentului „vin" pe zi, de luni încolo', () => {
    const d = dateSala({
      antrenamente: [
        { id: 'a', session_date: '2026-10-06', starts_at: '06:30', location: 'P', status: 'done', poll_sent: true }, // marți
        { id: 'b', session_date: '2026-10-05', starts_at: '06:30', location: 'P', status: 'done', poll_sent: true }, // luni
      ],
      raspunsuri: [{ session_id: 'b', member_id: 'ana', response: 'yes', is_first_training: false, responded_at: 'x' }],
    });
    const sesiuni = sesiuniPentruStatistici(d);
    const def = sesiuni.map((s) => sessionBreakdown(s, 4));
    expect(peZileleSaptamanii(sesiuni, def)).toEqual([
      { zi: 'Luni', procent: 25 },
      { zi: 'Marți', procent: 0 },
    ]);
  });
});

import { describe, it, expect } from 'vitest';
import {
  oreCheckin,
  caIsoLocal,
  sambeteleUrmatoare,
  refuzCuPas,
  DURATE,
  AVANSURI_CHECKIN,
  AVANSURI_LEADERBOARD,
} from '../../src/admin/eventTab/ajutoare';
import { SubmitHttpError } from '../../src/lib/supabase';

/**
 * Derivările de timp din tabul „Eveniment".
 *
 * Erau prinse în capul unui fișier de 1841 de linii, deci ca să verifici ce ore
 * de check-in propune formularul trebuia montat tot backoffice-ul. Sunt funcții
 * pure; acum se cheamă direct.
 */

describe('oreCheckin — orele propuse pentru check-in', () => {
  it('propune câte o oră pentru fiecare avans configurat', () => {
    expect(oreCheckin('2026-09-05T07:00:00')).toHaveLength(AVANSURI_CHECKIN.length);
  });

  it('prima propunere e chiar ora startului (avans zero)', () => {
    const [prima] = oreCheckin('2026-09-05T07:00:00');
    expect(prima.valoare).toBe('07:00');
  });

  it('scade avansul din startul cursei', () => {
    const ore = oreCheckin('2026-09-05T07:00:00');
    const valori = ore.map((o) => o.valoare);
    expect(valori).toContain('06:45'); // 15 minute înainte
    expect(valori).toContain('06:00'); // o oră înainte
  });

  it('trece corect peste miezul nopții, fără să dea o oră negativă', () => {
    const ore = oreCheckin('2026-09-05T00:15:00');
    for (const o of ore) {
      expect(o.valoare).toMatch(/^\d{2}:\d{2}$/);
      const [h, m] = o.valoare.split(':').map(Number);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(23);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(59);
    }
  });

  it('eticheta spune cu cât înainte de start e ora', () => {
    const ore = oreCheckin('2026-09-05T07:00:00');
    expect(ore.some((o) => o.eticheta.length > 0)).toBe(true);
  });
});

describe('caIsoLocal — momentul local, fără fus', () => {
  it('scrie forma pe care o cere documentul de config', () => {
    const d = new Date(2026, 8, 5, 7, 0, 0); // 5 septembrie 2026, 07:00 local
    expect(caIsoLocal(d)).toBe('2026-09-05T07:00:00');
  });

  it('completează cu zero luna, ziua și ora', () => {
    const d = new Date(2026, 0, 9, 6, 5);
    expect(caIsoLocal(d)).toBe('2026-01-09T06:05:00');
  });

  it('taie secundele la zero — configul ediției se scrie la minut', () => {
    // Nu e o scăpare: câmpurile formularului sunt `datetime-local` la minut, iar
    // o secundă rămasă din `new Date()` ar fi făcut două documente identice să
    // difere pe hârtie.
    const d = new Date(2026, 0, 9, 6, 5, 47);
    expect(caIsoLocal(d)).toBe('2026-01-09T06:05:00');
  });

  it('nu poartă niciun sufix de fus — asta e tot rostul funcției', () => {
    const d = new Date(2026, 8, 5, 7, 0, 0);
    expect(caIsoLocal(d)).not.toMatch(/[Z+]/);
  });
});

describe('sambeteleUrmatoare — propunerile de dată', () => {
  const ACUM = new Date('2026-09-05T07:00:00Z').getTime();

  it('propune numai sâmbete', () => {
    for (const s of sambeteleUrmatoare(ACUM, '2026-09-05T07:00:00')) {
      const zi = new Date(`${s.moment}Z`).getUTCDay();
      expect(zi).toBe(6);
    }
  });

  it('propunerile sunt în viitor față de momentul dat', () => {
    for (const s of sambeteleUrmatoare(ACUM, '2026-09-05T07:00:00')) {
      expect(new Date(`${s.moment}Z`).getTime()).toBeGreaterThan(ACUM);
    }
  });

  it('păstrează ora din startul curent, schimbă doar ziua', () => {
    for (const s of sambeteleUrmatoare(ACUM, '2026-09-05T07:00:00')) {
      expect(s.moment).toContain('T07:00');
    }
  });

  it('fiecare propunere are o etichetă de citit', () => {
    for (const s of sambeteleUrmatoare(ACUM, '2026-09-05T07:00:00')) {
      expect(s.eticheta.length).toBeGreaterThan(0);
    }
  });
});

describe('refuzCuPas — care scriere a picat', () => {
  it.each([
    ['salvare' as const],
    ['publicare' as const],
    ['revenire' as const],
  ])('numește pasul „%s" în mesaj', (pas) => {
    const msg = refuzCuPas(pas, new Error('ceva'));
    expect(msg.length).toBeGreaterThan(0);
  });

  it('cele trei pasuri dau trei mesaje diferite pentru aceeași eroare', () => {
    const err = new Error('ceva');
    const mesaje = new Set([
      refuzCuPas('salvare', err),
      refuzCuPas('publicare', err),
      refuzCuPas('revenire', err),
    ]);
    expect(mesaje.size).toBe(3);
  });

  it('păstrează motivul recunoscut al serverului, nu-l înlocuiește', () => {
    const msg = refuzCuPas('publicare', new SubmitHttpError(400, '{"message":"no_draft"}'));
    expect(msg.length).toBeGreaterThan(0);
  });
});

describe('listele de opțiuni ale formularului', () => {
  it('duratele sunt crescătoare, ca să nu sară ochiul prin listă', () => {
    expect([...DURATE]).toEqual([...DURATE].sort((a, b) => a - b));
  });

  it('avansul de check-in începe de la zero', () => {
    expect(AVANSURI_CHECKIN[0]).toBe(0);
  });

  it('avansul pentru „cine vine" începe de la zero', () => {
    expect(AVANSURI_LEADERBOARD[0]).toBe(0);
  });
});

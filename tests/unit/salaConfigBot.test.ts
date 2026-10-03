import { describe, it, expect } from 'vitest';
import { CONFIG_IMPLICIT, configEgal, dinServer, problemeConfig } from '../../src/admin/sala/configBot';

describe('dinServer', () => {
  it('fără rând de setări → valorile implicite ale botului', () => {
    expect(dinServer(null)).toEqual(CONFIG_IMPLICIT);
  });
  it('ia ce vine de la server și sortează zilele', () => {
    const c = dinServer({ ...CONFIG_IMPLICIT, poll_days: [3, 1], poll_time: '12:00' });
    expect(c.poll_days).toEqual([1, 3]);
    expect(c.poll_time).toBe('12:00');
  });
});

describe('problemeConfig (oglinda validării din server)', () => {
  it('setările implicite trec', () => {
    expect(problemeConfig(CONFIG_IMPLICIT)).toEqual([]);
  });
  it.each([
    [{ poll_time: '25:00' }, /sondajului/],
    [{ summary_time: '6:00' }, /rezumatului/],
    [{ training_time: '' }, /antrenamentului/],
    [{ location: '   ' }, /Locul/],
    [{ reminder_threshold: -1 }, /Pragul/],
    [{ reminder_threshold: Number.NaN }, /Pragul/],
    [{ poll_title: 'x'.repeat(81) }, /80/],
    [{ poll_yes_label: 'x'.repeat(33) }, /32/],
  ])('refuză %o', (peste, mesaj) => {
    const p = problemeConfig({ ...CONFIG_IMPLICIT, ...peste });
    expect(p.some((x) => mesaj.test(x))).toBe(true);
  });
});

describe('configEgal', () => {
  it('ordinea zilelor și spațiile din texte nu sunt modificări', () => {
    expect(
      configEgal(
        { ...CONFIG_IMPLICIT, poll_days: [3, 1], poll_title: '  ' },
        { ...CONFIG_IMPLICIT, poll_days: [1, 3], poll_title: null }
      )
    ).toBe(true);
  });
  it('o oră schimbată e o modificare', () => {
    expect(configEgal({ ...CONFIG_IMPLICIT, poll_time: '12:00' }, CONFIG_IMPLICIT)).toBe(false);
  });
});

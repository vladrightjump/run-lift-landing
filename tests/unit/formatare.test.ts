import { describe, it, expect } from 'vitest';
import { ziLunaOra, ziSiLuna, momentComplet, ziLunaLunga } from '../../src/lib/formatare';

/**
 * Formatarea trebuie să scoată EXACT ce scoteau cele șase definiții risipite
 * dinainte — altfel „refactor fără schimbare de comportament" e o vorbă goală.
 *
 * De asta testul fixează string-uri literale, nu recompune un `Intl` cu
 * aceleași opțiuni: a doua formă ar trece și dacă ambele părți s-ar strica la
 * fel. Valorile de mai jos sunt culese din codul de dinainte de mutare.
 */

/** Ora cursei, 07:00 UTC = 10:00 la Chișinău (EEST, vara). */
const DIMINEATA_CURSEI = new Date('2026-09-05T07:00:00Z');
/** Iarna (EET) și peste miezul nopții — prinde și fusul, și `2-digit`. */
const NOAPTEA_DE_IARNA = new Date('2026-01-09T22:05:00Z');

describe('formatare — ziua, luna și ora', () => {
  it('scrie momentul unei difuzări ca „5 sept., 10:00"', () => {
    expect(ziLunaOra(DIMINEATA_CURSEI)).toBe('5 sept., 10:00');
  });

  it('trece corect peste miezul nopții, pe fusul de iarnă', () => {
    expect(ziLunaOra(NOAPTEA_DE_IARNA)).toBe('10 ian., 00:05');
  });

  it('acceptă și un ISO, nu doar un Date', () => {
    expect(ziLunaOra('2026-09-05T07:00:00Z')).toBe('5 sept., 10:00');
  });
});

describe('formatare — data scurtă din liste', () => {
  /**
   * `ziSiLuna` e SINGURA fără fus impus — e o dată de calendar dintr-o listă de
   * înscrieri, nu un moment — deci se citește în fusul celui care se uită.
   *
   * Testele ei trebuie construite tot în ora locală. Prima versiune folosea un
   * moment UTC („2026-01-09T22:05:00Z") și aștepta „10 ian": trecea pe un ceas
   * la UTC+3 și pica în CI, care rulează pe UTC. Testul era greșit, nu funcția —
   * dar exact aici se vede de ce merită ca fusul să fie explicit.
   */
  const NOUA_IANUARIE = new Date(2026, 0, 9, 22, 5);
  const CINCI_SEPTEMBRIE = new Date(2026, 8, 5, 10, 0);

  it('scoate punctul de după luna prescurtată', () => {
    expect(ziSiLuna(CINCI_SEPTEMBRIE)).toBe('5 sept');
    expect(ziSiLuna(NOUA_IANUARIE)).toBe('9 ian');
  });

  it('dă aceeași zi de calendar în care a fost construită, oriunde ar rula', () => {
    // Fără fus impus, ziua afișată e ziua locală a datei — nu se mută peste
    // miezul nopții pentru cine citește din alt fus decât cel al serverului.
    const d = new Date(2026, 0, 9, 23, 59);
    expect(ziSiLuna(d)).toBe('9 ian');
  });

  it('nu conține niciun punct', () => {
    expect(ziSiLuna(CINCI_SEPTEMBRIE)).not.toContain('.');
  });
});

describe('formatare — momentul scris în clar', () => {
  it('scrie ținta numărătorii ca „5 septembrie 2026 la 10:00"', () => {
    expect(momentComplet(DIMINEATA_CURSEI)).toBe('5 septembrie 2026 la 10:00');
  });

  it('păstrează fusul evenimentului și iarna', () => {
    expect(momentComplet(NOAPTEA_DE_IARNA)).toBe('10 ianuarie 2026 la 00:05');
  });
});

describe('formatare — ziua pentru badge', () => {
  it('scrie doar ziua și luna, fără an și fără oră', () => {
    expect(ziLunaLunga(DIMINEATA_CURSEI)).toBe('5 septembrie');
    expect(ziLunaLunga(NOAPTEA_DE_IARNA)).toBe('10 ianuarie');
  });
});

describe('formatare — fusul e al evenimentului, nu al cititorului', () => {
  it('un moment de la 23:30 UTC apare deja în ziua următoare, ca la Chișinău', () => {
    // 23:30 UTC pe 4 septembrie = 02:30 pe 5 septembrie la Chișinău.
    const inainteDeMiezulNoptii = new Date('2026-09-04T23:30:00Z');
    expect(ziLunaOra(inainteDeMiezulNoptii)).toBe('5 sept., 02:30');
    expect(ziLunaLunga(inainteDeMiezulNoptii)).toBe('5 septembrie');
  });
});

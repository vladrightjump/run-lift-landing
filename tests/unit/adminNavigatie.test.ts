import { describe, it, expect } from 'vitest';
import {
  GRUPURI,
  TOATE_TABURILE,
  grupulTabului,
  etichetaTabului,
  contorGrup,
} from '../../src/admin/adminNavigatie';
import type { TabAdmin } from '../../src/admin/stareCurenta';

/**
 * Gruparea taburilor.
 *
 * Ce se păzește aici: gruparea a pus un acoperiș peste taburi, nu a mutat
 * conținut. Dacă o frunză dispare din grupuri, tabul devine inaccesibil — ecran
 * mort, fără niciun mesaj.
 */

const TOATE_CHEILE: TabAdmin[] = [
  'participanti',
  'email',
  'livrare',
  'lansare',
  'sabloane',
  'eveniment',
  'coming-soon',
];

describe('nicio secțiune nu rămâne fără acoperiș', () => {
  it('fiecare tab existent stă într-un grup', () => {
    const inGrupuri = TOATE_TABURILE.map((t) => t.cheie).sort();
    expect(inGrupuri).toEqual([...TOATE_CHEILE].sort());
  });

  it('niciun tab nu apare în două grupuri', () => {
    const chei = TOATE_TABURILE.map((t) => t.cheie);
    expect(new Set(chei).size).toBe(chei.length);
  });

  it('fiecare grup are cel puțin o frunză', () => {
    // Un grup gol ar fi un buton care duce la nimic: `onTab(g.taburi[0])` ar
    // arunca, iar navigația ar cădea la primul click.
    for (const g of GRUPURI) expect(g.taburi.length).toBeGreaterThan(0);
  });

  it('fiecare tab își găsește grupul', () => {
    for (const cheie of TOATE_CHEILE) {
      const grup = grupulTabului(cheie);
      expect(GRUPURI.some((g) => g.cheie === grup)).toBe(true);
    }
  });

  it('fiecare tab are etichetă', () => {
    for (const cheie of TOATE_CHEILE) expect(etichetaTabului(cheie).length).toBeGreaterThan(0);
  });
});

describe('contorul grupului spune ce e înăuntru', () => {
  const contoare = (over: Partial<Record<TabAdmin, number | null>>) =>
    ({
      participanti: null,
      email: null,
      livrare: null,
      lansare: null,
      sabloane: null,
      eveniment: null,
      'coming-soon': null,
      ...over,
    }) as Record<TabAdmin, number | null>;

  const oameni = GRUPURI.find((g) => g.cheie === 'oameni')!;

  it('însumează frunzele — cu grupul închis, numărul trebuie să spună tot', () => {
    expect(contorGrup(oameni, contoare({ participanti: 20, lansare: 41 }))).toBe(61);
  });

  it('date nesosite (null) nu contează ca zero', () => {
    // Un „0" afișat în timpul încărcării e o minciună scurtă, dar tocmai pe aia
    // o citește organizatorul când intră.
    expect(contorGrup(oameni, contoare({}))).toBeNull();
    expect(contorGrup(oameni, contoare({ participanti: 20 }))).toBe(20);
  });
});

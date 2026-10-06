import { describe, it, expect } from 'vitest';
import {
  ZONE,
  TOATE_ECRANELE,
  zonaEcranului,
  filaEcranului,
  etichetaEcranului,
  esteEcran,
  estePeEditie,
  contorZona,
  ECRAN_IMPLICIT,
} from '../../src/admin/adminNavigatie';
import type { EcranAdmin } from '../../src/admin/stareCurenta';

/**
 * Registrul de zone și file (U6, KTD3 din planul redesignului adminului).
 *
 * Ce se păzește: registrul e singura listă de ecrane. Un ecran care dispare
 * din zone devine inaccesibil — ecran mort, fără niciun mesaj. Și: adresele
 * vechi (`#livrare`, `#grup-bot`) rămân valabile, fiindcă sunt cheile filelor.
 */

/** Cele 14 ecrane de dinainte de redesign. Toate trebuie să aibă un loc (R1). */
const CHEI_VECHI: EcranAdmin[] = [
  'desfasurare',
  'participanti',
  'lansare',
  'email',
  'livrare',
  'sabloane',
  'eveniment',
  'clipuri',
  'antrenament',
  'coming-soon',
  'grup-prezente',
  'grup-membri',
  'grup-analiza',
  'grup-bot',
];

describe('zonele', () => {
  it('sunt patru, în ordinea Acum · Antrenamente · Evenimente · Site', () => {
    expect(ZONE.map((z) => z.cheie)).toEqual(['acum', 'antrenamente', 'evenimente', 'site']);
  });

  it('fiecare dintre cele 14 ecrane vechi e o filă validă (R1)', () => {
    for (const cheie of CHEI_VECHI) expect(esteEcran(cheie)).toBe(true);
  });

  it('niciun ecran nu apare de două ori', () => {
    const chei = TOATE_ECRANELE.map((e) => e.cheie);
    expect(new Set(chei).size).toBe(chei.length);
  });

  it('fiecare zonă are cel puțin o filă, iar fiecare filă cel puțin un ecran', () => {
    for (const z of ZONE) {
      expect(z.file.length).toBeGreaterThan(0);
      for (const f of z.file) expect(f.ecrane.length).toBeGreaterThan(0);
    }
  });

  it('fiecare ecran are etichetă și descriere vizibilă', () => {
    for (const e of TOATE_ECRANELE) {
      expect(etichetaEcranului(e.cheie).length).toBeGreaterThan(0);
      expect(e.descriere.length).toBeGreaterThan(0);
    }
  });
});

describe('adresele (R5, KTD3)', () => {
  it('Covers AE5: `livrare` duce în Evenimente → Mesaje → Livrare', () => {
    expect(zonaEcranului('livrare')).toBe('evenimente');
    const fila = filaEcranului('livrare');
    expect(fila.eticheta).toBe('Mesaje');
    expect(fila.ecrane.find((e) => e.cheie === 'livrare')?.eticheta).toBe('Livrare');
  });

  it('cheile vechi își găsesc zona din harta ecranelor', () => {
    expect(zonaEcranului('grup-bot')).toBe('antrenamente');
    expect(zonaEcranului('grup-prezente')).toBe('antrenamente');
    expect(zonaEcranului('desfasurare')).toBe('evenimente');
    expect(zonaEcranului('participanti')).toBe('evenimente');
    expect(zonaEcranului('antrenament')).toBe('site');
    expect(zonaEcranului('coming-soon')).toBe('site');
  });

  it('aterizarea implicită e Acum', () => {
    expect(ECRAN_IMPLICIT).toBe('acum');
    expect(zonaEcranului('acum')).toBe('acum');
  });

  it('o cheie necunoscută nu e ecran și cade pe Acum', () => {
    expect(esteEcran('nu-exista')).toBe(false);
    expect(zonaEcranului('nu-exista' as EcranAdmin)).toBe('acum');
  });
});

describe('ediția aleasă (R4)', () => {
  it('contează doar pe filele din Evenimente, nu și pe șabloanele comune', () => {
    const peEditie = TOATE_ECRANELE.filter((e) => estePeEditie(e.cheie)).map((e) => e.cheie).sort();
    expect(peEditie).toEqual(['email', 'eveniment', 'lansare', 'livrare', 'participanti'].sort());
    for (const cheie of peEditie) expect(zonaEcranului(cheie)).toBe('evenimente');
    expect(estePeEditie('sabloane')).toBe(false);
  });
});

describe('contorul unei zone', () => {
  const contor = (valori: Partial<Record<EcranAdmin, number | null>>) =>
    Object.fromEntries(TOATE_ECRANELE.map((e) => [e.cheie, valori[e.cheie] ?? null])) as Record<
      EcranAdmin,
      number | null
    >;
  const evenimente = ZONE.find((z) => z.cheie === 'evenimente')!;

  it('e suma filelor', () => {
    expect(contorZona(evenimente, contor({ participanti: 22, livrare: 1 }))).toBe(23);
  });

  it('o filă încă neîncărcată (null) nu se numără ca zero', () => {
    expect(contorZona(evenimente, contor({ participanti: 22 }))).toBe(22);
  });

  it('dacă nicio filă nu are încă un număr, contorul e null', () => {
    expect(contorZona(evenimente, contor({}))).toBeNull();
  });
});

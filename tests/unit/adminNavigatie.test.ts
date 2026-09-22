import { describe, it, expect } from 'vitest';
import {
  GRUPURI,
  TOATE_ECRANELE,
  grupulEcranului,
  etichetaEcranului,
  contorGrup,
} from '../../src/admin/adminNavigatie';
import type { EcranAdmin } from '../../src/admin/stareCurenta';

/**
 * Registrul de ecrane.
 *
 * Ce se păzește aici: registrul e singura listă de ecrane. Dacă un ecran
 * dispare din grupuri, devine inaccesibil — ecran mort, fără niciun mesaj.
 * Antrenamentele au fost exact asta până acum: ajungeai la ele dintr-o manetă
 * a cromului, nu din registru.
 */

const TOATE_CHEILE: EcranAdmin[] = [
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
];

describe('niciun ecran nu rămâne în afara registrului', () => {
  it('fiecare ecran existent stă într-un grup', () => {
    const inGrupuri = TOATE_ECRANELE.map((e) => e.cheie).sort();
    expect(inGrupuri).toEqual([...TOATE_CHEILE].sort());
  });

  it('niciun ecran nu apare în două grupuri', () => {
    const chei = TOATE_ECRANELE.map((e) => e.cheie);
    expect(new Set(chei).size).toBe(chei.length);
  });

  it('fiecare grup are cel puțin o frunză', () => {
    // Un grup gol ar fi un buton care duce la nimic: `onEcran(g.ecrane[0])` ar
    // arunca, iar navigația ar cădea la primul click.
    for (const g of GRUPURI) expect(g.ecrane.length).toBeGreaterThan(0);
  });

  it('fiecare ecran își găsește grupul', () => {
    for (const cheie of TOATE_CHEILE) {
      const grup = grupulEcranului(cheie);
      expect(GRUPURI.some((g) => g.cheie === grup)).toBe(true);
    }
  });

  it('un ecran necunoscut cade pe primul grup, nu pe nimic', () => {
    // Configurare greșită, nu stare de rulare: ecranul nu trebuie să rămână gol.
    expect(grupulEcranului('nu-exista' as EcranAdmin)).toBe(GRUPURI[0].cheie);
  });

  it('fiecare ecran are etichetă', () => {
    for (const cheie of TOATE_CHEILE) expect(etichetaEcranului(cheie).length).toBeGreaterThan(0);
  });

  it('fiecare ecran are o descriere vizibilă, nu doar un nume', () => {
    // Descrierile existau și înainte, dar ajungeau doar în `title`. Ecranul
    // care le arată are nevoie ca fiecare să fie scrisă.
    for (const e of TOATE_ECRANELE) expect(e.descriere.length).toBeGreaterThan(0);
  });

  it('antrenamentele sînt un ecran ca oricare altul', () => {
    // R5: până acum se ajungea la ele dintr-o manetă a cromului paginii.
    expect(TOATE_ECRANELE.some((e) => e.cheie === 'antrenament')).toBe(true);
  });
});

describe('contorul grupului spune ce e înăuntru', () => {
  const contoare = (over: Partial<Record<EcranAdmin, number | null>>) =>
    ({
      desfasurare: null,
      participanti: null,
      lansare: null,
      email: null,
      livrare: null,
      sabloane: null,
      eveniment: null,
      clipuri: null,
      antrenament: null,
      'coming-soon': null,
      ...over,
    }) as Record<EcranAdmin, number | null>;

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

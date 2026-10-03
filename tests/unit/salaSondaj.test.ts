import { describe, it, expect } from 'vitest';
import {
  TEXT_IMPLICIT,
  antetSondaj,
  corpSondaj,
  dataScurta,
  frazaSondaj,
  numeZi,
  textEfectiv,
  urmatorulSondaj,
  ziSiData,
} from '../../src/admin/sala/sondaj';

/**
 * Previzualizarea sondajului și momentul următorului.
 *
 * Așteptările de text sunt cele din testele botului (`bot/test/poll-text.test.ts`,
 * pentru `bot/src/lib/poll-text.ts`): fără text salvat, previzualizarea trebuie
 * să iasă caracter cu caracter ce scrie botul azi.
 */

describe('textul de azi, ca în bot', () => {
  it('antetul: titlu îngroșat cu ziua și data în română, ora și locul', () => {
    expect(antetSondaj('2026-07-22', '06:30', 'Parcul Dumitru Râșcanu')).toBe(
      '🏃 <b>Antrenament mâine — Miercuri, 22 iul</b>\n🕕 06:30 · 📍 Parcul Dumitru Râșcanu'
    );
  });

  it('antetul fără dată și fără loc', () => {
    expect(antetSondaj('', '08:00', '')).toBe('🏃 <b>Antrenament mâine</b>\n🕕 08:00');
    expect(antetSondaj('', '06:30:00', 'Parc')).toBe('🏃 <b>Antrenament mâine</b>\n🕕 06:30 · 📍 Parc');
  });

  it('fără voturi: îndemnul de vot', () => {
    expect(corpSondaj('H', [], [])).toBe('H\n\nCine vine? Apasă mai jos 👇');
  });

  it('cu voturi: liste cu puncte, doar secțiunile nevide, escapate', () => {
    const out = corpSondaj('H', ['Ana', 'V<lad'], []);
    expect(out).toBe('H\n\n✅ <b>Vin (2)</b>\n• Ana\n• V&lt;lad');
    expect(out).not.toContain('Nu pot');
  });

  it('ambele secțiuni, despărțite de un rând gol', () => {
    expect(corpSondaj('H', ['Ana'], ['Ion'])).toBe('H\n\n✅ <b>Vin (1)</b>\n• Ana\n\n❌ <b>Nu pot (1)</b>\n• Ion');
  });

  it('butoanele de azi', () => {
    expect([TEXT_IMPLICIT.da, TEXT_IMPLICIT.nu]).toEqual(['✅ Vin!', '❌ Nu pot']);
  });
});

describe('textul editat', () => {
  it('fraza de titlu proprie înlocuiește doar fraza; ziua, ora și locul rămân', () => {
    expect(antetSondaj('2026-10-07', '06:30', 'Parc', 'Alergăm!')).toBe(
      '🏃 <b>Alergăm! — Miercuri, 7 oct</b>\n🕕 06:30 · 📍 Parc'
    );
  });

  it('un titlu cu HTML apare escapat', () => {
    expect(antetSondaj('', '06:30', '', '<b>Mâine</b> & poimâine')).toBe(
      '🏃 <b>&lt;b&gt;Mâine&lt;/b&gt; &amp; poimâine</b>\n🕕 06:30'
    );
  });

  it('câmpurile goale sau doar cu spații înseamnă textul de azi', () => {
    expect(textEfectiv({ titlu: null, da: '  ', nu: '' })).toEqual({
      titlu: 'Antrenament mâine',
      da: '✅ Vin!',
      nu: '❌ Nu pot',
    });
    expect(textEfectiv({ titlu: ' Alergăm ', da: 'Da', nu: 'Nu' })).toEqual({
      titlu: 'Alergăm',
      da: 'Da',
      nu: 'Nu',
    });
  });
});

describe('ziSiData', () => {
  it('scrie ziua săptămânii și luna scurtă', () => {
    expect(ziSiData('2026-10-06')).toBe('Marți, 6 oct');
  });
  it('o dată care nu se citește dă null', () => {
    expect(ziSiData('mâine')).toBeNull();
  });
});

describe('urmatorulSondaj (luni și miercuri la 12:00, ora Chișinăului)', () => {
  const zile = [1, 3];
  // Chișinău e UTC+3 vara; 2026-10-07 e miercuri.
  const la = (isoChisinau: string) => new Date(`${isoChisinau}+03:00`);

  it('miercuri la 11:59 → miercuri 12:00, pentru antrenamentul de joi', () => {
    expect(urmatorulSondaj(zile, '12:00', la('2026-10-07T11:59:00'))).toEqual({
      data: '2026-10-07',
      ora: '12:00',
      antrenament: '2026-10-08',
    });
  });

  it('miercuri la 12:01 → lunea următoare la 12:00', () => {
    expect(urmatorulSondaj(zile, '12:00', la('2026-10-07T12:01:00'))).toEqual({
      data: '2026-10-12',
      ora: '12:00',
      antrenament: '2026-10-13',
    });
  });

  it('în minutul orei, sondajul încă se socotește următor', () => {
    expect(urmatorulSondaj(zile, '12:00', la('2026-10-07T12:00:30'))?.data).toBe('2026-10-07');
  });

  it('o singură zi, trecută azi → aceeași zi săptămâna viitoare', () => {
    expect(urmatorulSondaj([3], '12:00', la('2026-10-07T13:00:00'))?.data).toBe('2026-10-14');
  });

  it('ziua de la Chișinău, nu din UTC: 01:30 la Chișinău e încă ziua precedentă în UTC', () => {
    // Joi 01:30 la Chișinău = miercuri 22:30 UTC. Următorul sondaj e luni, nu „miercuri 12:00 trecut".
    expect(urmatorulSondaj(zile, '12:00', la('2026-10-08T01:30:00'))?.data).toBe('2026-10-12');
  });

  it('sare peste ziua de sondaj al cărei antrenament e anulat (botul nu trimite)', () => {
    // Miercuri 11:59; joi e anulat → sondajul de miercuri nu pleacă, următorul e luni.
    expect(urmatorulSondaj(zile, '12:00', la('2026-10-07T11:59:00'), new Set(['2026-10-08']))).toEqual({
      data: '2026-10-12',
      ora: '12:00',
      antrenament: '2026-10-13',
    });
  });

  it('cu toate antrenamentele unei săptămâni anulate, găsește săptămâna următoare', () => {
    const anulate = new Set(['2026-10-08', '2026-10-13']);
    expect(urmatorulSondaj(zile, '12:00', la('2026-10-07T11:59:00'), anulate)?.data).toBe('2026-10-14');
  });

  it('fără zile sau fără oră validă → niciun sondaj programat', () => {
    expect(urmatorulSondaj([], '12:00', new Date())).toBeNull();
    expect(urmatorulSondaj(null, '12:00', new Date())).toBeNull();
    expect(urmatorulSondaj(zile, '', new Date())).toBeNull();
  });
});

describe('datele în propoziții', () => {
  it('numeZi: ziua cu literă mică, pentru mijlocul frazei', () => {
    expect(numeZi('2026-10-07')).toBe('miercuri');
    expect(numeZi('nu-i dată')).toBe('nu-i dată');
  });

  it('dataScurta: ziua și luna scurtă, fără ziua săptămânii', () => {
    expect(dataScurta('2026-10-07')).toBe('7 oct');
    expect(dataScurta('2026-10-07T09:00:00Z')).toBe('7 oct');
  });

  it('frazaSondaj: când pleacă sondajul', () => {
    expect(frazaSondaj({ data: '2026-10-12', ora: '12:00', antrenament: '2026-10-13' })).toBe(
      'Sondajul pleacă luni la 12:00.'
    );
  });
});

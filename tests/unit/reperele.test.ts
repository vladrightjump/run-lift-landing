import { describe, it, expect } from 'vitest';
import {
  reperele,
  mutaReperele,
  reperiiCareSeMuta,
  momentulCheckinului,
  candScurt,
  durataRo,
} from '../../src/admin/reperele';
import { SNAPSHOT_CONFIG, type EventConfig } from '../../src/content/eventConfig';

/**
 * Reperele ediției: ordinea în care se întâmplă, ce înseamnă fiecare față de
 * start, și mutarea lor în bloc.
 *
 * Funcțiile sunt pure și `acum` e parametru — testele nu depind de ziua în care
 * rulează, iar asta contează mai ales aici, unde jumătate din afirmații sunt
 * despre trecut și viitor.
 */

const cu = (patch: Partial<EventConfig>): EventConfig => ({ ...SNAPSHOT_CONFIG, ...patch });

/** Un moment cu mult înaintea ediției din instantaneu (start: 2026-09-05). */
const INAINTE = new Date('2026-08-01T00:00:00+03:00').getTime();

describe('durataRo — o durată scrisă ca o decizie, nu ca milisecunde', () => {
  it('minute sub o oră', () => {
    expect(durataRo(15 * 60_000)).toBe('15 min');
  });

  it('ora la singular', () => {
    expect(durataRo(3_600_000)).toBe('o oră');
  });

  it('ore cu jumătăți, cu virgulă zecimală românească', () => {
    expect(durataRo(1.5 * 3_600_000)).toBe('1,5 ore');
  });

  it('zile', () => {
    expect(durataRo(2 * 86_400_000)).toBe('2 zile');
  });

  it('peste două săptămâni rotunjește la săptămâni', () => {
    expect(durataRo(21 * 86_400_000)).toBe('3 săptămâni');
  });

  it('semnul nu contează — direcția o spune cine formulează', () => {
    expect(durataRo(-2 * 86_400_000)).toBe(durataRo(2 * 86_400_000));
  });
});

describe('momentul check-inului', () => {
  it('ora seacă din document, în ziua cursei', () => {
    // Documentul ține doar „06:45". Singurul lucru care-l face verificabil e
    // ziua startului: aceeași oră e la fel de plauzibilă pentru o cursă de
    // dimineață ca pentru una de seară.
    expect(momentulCheckinului(SNAPSHOT_CONFIG)).toBe('2026-09-05T06:45:00');
  });

  it('un start stricat nu produce un moment inventat', () => {
    expect(momentulCheckinului(cu({ start: '' }))).toBe('');
  });
});

describe('cronologia — momentele în ordinea în care se întâmplă', () => {
  it('instantaneul de build e o desfășurare coerentă, fără niciun semnal', () => {
    const r = reperele(SNAPSHOT_CONFIG, INAINTE);
    expect(r.map((x) => x.cheie)).toEqual([
      'launchAt',
      'registrationDeadline',
      'checkin',
      'start',
      'final',
      'nextEditionAt',
    ]);
    expect(r.filter((x) => x.problema)).toEqual([]);
  });

  it('include finalul cursei, care nu are câmp propriu în formular', () => {
    // `start + durata` e reperul care comută homepage-ul pe countdown. Era
    // complet invizibil în admin.
    const final = reperele(SNAPSHOT_CONFIG, INAINTE).find((x) => x.cheie === 'final')!;
    expect(final.moment).toBe('2026-09-05T08:00:00');
    expect(final.fataDeStart).toBe('la o oră după start');
  });

  it('sortează după momentul real, nu după ordinea câmpurilor', () => {
    // Anunțul mutat după deadline nu mai apare primul: sare din locul lui, și
    // asta e tot semnalul de care e nevoie.
    const r = reperele(cu({ launchAt: '2026-09-05T06:30:00' }), INAINTE);
    expect(r[0].cheie).toBe('registrationDeadline');
    expect(r.findIndex((x) => x.cheie === 'launchAt')).toBe(1);
  });

  it('spune distanța față de start, cu litere', () => {
    const r = reperele(SNAPSHOT_CONFIG, INAINTE);
    const pe = (cheie: string) => r.find((x) => x.cheie === cheie)!;
    expect(pe('registrationDeadline').fataDeStart).toBe('cu o oră înainte de start');
    expect(pe('checkin').fataDeStart).toBe('cu 15 min înainte de start');
    expect(pe('launchAt').fataDeStart).toBe('cu 2 zile înainte de start');
    expect(pe('start').fataDeStart).toBe('');
  });

  it('un format stricat nu desenează o ordine calculată din NaN', () => {
    expect(reperele(cu({ nextEditionAt: 'mâine' }), INAINTE)).toEqual([]);
  });

  it('marchează ce a trecut deja, fără să-l scoată din listă', () => {
    // O ediție în desfășurare are repere consumate — e normal, nu greșit. Scoase
    // din listă, ordinea pe care o arătăm s-ar rupe.
    const dupaAnunt = new Date('2026-09-04T00:00:00+03:00').getTime();
    const r = reperele(SNAPSHOT_CONFIG, dupaAnunt);
    expect(r.find((x) => x.cheie === 'launchAt')!.trecut).toBe(true);
    expect(r.find((x) => x.cheie === 'start')!.trecut).toBe(false);
  });
});

describe('semnalele — consecința, nu regula', () => {
  const problema = (c: EventConfig, cheie: string, acum = INAINTE): string | undefined =>
    reperele(c, acum).find((x) => x.cheie === cheie)?.problema;

  it('anunțul deja consumat, cu cursa încă în viitor', () => {
    // Regresia care a motivat modulul: ciorna ediției următoare pornește de la
    // cea publicată, deci moștenește anunțul ediției TRECUTE. Documentul e
    // perfect valid; homepage-ul pur și simplu nu va sta pe Coming Soon.
    const dupaAnunt = new Date('2026-09-04T00:00:00+03:00').getTime();
    expect(problema(SNAPSHOT_CONFIG, 'launchAt', dupaAnunt)).toMatch(/Coming Soon/);
  });

  it('anunțul trecut NU e semnalat dacă a trecut și cursa', () => {
    // Atunci toată ediția e în trecut, iar „anunțul a trecut" n-ar fi un
    // reproș, ci o descriere.
    const dupaCursa = new Date('2026-09-20T00:00:00+03:00').getTime();
    expect(problema(SNAPSHOT_CONFIG, 'launchAt', dupaCursa)).toBeUndefined();
  });

  it('check-in după startul cursei', () => {
    expect(problema(cu({ checkinFrom: '08:00' }), 'checkin')).toMatch(/după startul/);
  });

  it('check-in absurd de devreme', () => {
    expect(problema(cu({ checkinFrom: '02:00' }), 'checkin')).toMatch(/trei ore/);
  });

  it('un check-in normal nu spune nimic', () => {
    expect(problema(SNAPSHOT_CONFIG, 'checkin')).toBeUndefined();
  });

  it('semnalul e scurt, consecința e pe larg — două straturi, două locuri', () => {
    // Linia de timp se parcurge dintr-o privire: o propoziție întreagă pe un
    // rând o transformă în paragraf. Explicația stă pe câmp, unde se repară.
    const dupaAnunt = new Date('2026-09-04T00:00:00+03:00').getTime();
    const r = reperele(SNAPSHOT_CONFIG, dupaAnunt).find((x) => x.cheie === 'launchAt')!;
    expect(r.semnal).toBe('anunțul a trecut deja');
    expect(r.problema!.length).toBeGreaterThan(r.semnal!.length);
  });

  it('semnalul și consecința vin întotdeauna împreună', () => {
    // Un semnal fără explicație e un reproș fără obiect; o explicație fără
    // semnal n-ar apărea niciodată în linia de timp.
    const cazuri = [
      cu({ checkinFrom: '08:00' }),
      cu({ checkinFrom: '02:00' }),
      cu({ launchAt: '2026-09-06T12:00:00' }),
    ];
    for (const c of cazuri) {
      for (const r of reperele(c, INAINTE)) {
        expect(Boolean(r.semnal)).toBe(Boolean(r.problema));
      }
    }
  });
});

describe('mutarea în bloc — startul trage după el ce atârnă de el', () => {
  const CU_O_SAPTAMANA = '2026-09-12T07:00:00';

  it('duce datele calendaristice cu același decalaj, păstrând distanțele alese', () => {
    const dupa = mutaReperele(SNAPSHOT_CONFIG, CU_O_SAPTAMANA);
    expect(dupa.start).toBe(CU_O_SAPTAMANA);
    expect(dupa.registrationDeadline).toBe('2026-09-12T06:00:00');
    expect(dupa.launchAt).toBe('2026-09-10T12:00:00');
    expect(dupa.nextEditionAt).toBe('2026-09-19T07:00:00');
  });

  it('relațiile dintre repere sunt exact cele dinainte', () => {
    const inainte = reperele(SNAPSHOT_CONFIG, INAINTE).map((r) => r.fataDeStart);
    const dupa = reperele(mutaReperele(SNAPSHOT_CONFIG, CU_O_SAPTAMANA), INAINTE);
    expect(dupa.map((r) => r.fataDeStart)).toEqual(inainte);
  });

  it('check-inul păstrează AVANSUL față de start, nu ora', () => {
    // O cursă mutată de la 07:00 la 09:00 are check-in la 08:45, nu la 06:45.
    const dupa = mutaReperele(SNAPSHOT_CONFIG, '2026-09-05T09:00:00');
    expect(dupa.checkinFrom).toBe('08:45');
  });

  it('nu atinge nimic altceva din document', () => {
    const dupa = mutaReperele(SNAPSHOT_CONFIG, CU_O_SAPTAMANA);
    expect(dupa.venue).toEqual(SNAPSHOT_CONFIG.venue);
    expect(dupa.slots).toEqual(SNAPSHOT_CONFIG.slots);
    expect(dupa.number).toBe(SNAPSHOT_CONFIG.number);
    expect(dupa.layout).toEqual(SNAPSHOT_CONFIG.layout);
  });

  it('un start identic lasă documentul neatins', () => {
    expect(mutaReperele(SNAPSHOT_CONFIG, SNAPSHOT_CONFIG.start)).toBe(SNAPSHOT_CONFIG);
  });

  it('un start nerecunoscut se scrie ca atare, fără să mute restul', () => {
    // Câmpul golit în timpul tastării nu e o decizie de mutat nimic după ea.
    const dupa = mutaReperele(SNAPSHOT_CONFIG, '');
    expect(dupa.start).toBe('');
    expect(dupa.launchAt).toBe(SNAPSHOT_CONFIG.launchAt);
  });
});

describe('ce s-ar muta — oferta nu se face când n-are ce oferi', () => {
  it('numește reperele afectate, în limbajul formularului', () => {
    expect(reperiiCareSeMuta(SNAPSHOT_CONFIG, '2026-09-12T07:00:00')).toEqual([
      'închiderea înscrierilor',
      'anunțul ediției',
      'următorul antrenament',
    ]);
  });

  it('ora de check-in intră în listă doar când startul își schimbă ORA', () => {
    // Mutat cu o săptămână, la aceeași oră, check-inul rămâne 06:45 — un buton
    // care nu schimbă nimic e mai rău decât unul lipsă.
    expect(reperiiCareSeMuta(SNAPSHOT_CONFIG, '2026-09-12T07:00:00')).not.toContain(
      'ora de check-in'
    );
    expect(reperiiCareSeMuta(SNAPSHOT_CONFIG, '2026-09-05T09:00:00')).toContain('ora de check-in');
  });

  it('start neschimbat — nimic de mutat', () => {
    expect(reperiiCareSeMuta(SNAPSHOT_CONFIG, SNAPSHOT_CONFIG.start)).toEqual([]);
  });
});

describe('candScurt', () => {
  it('ziua săptămânii înainte de dată — greșeala pe care cifrele n-o arată', () => {
    expect(candScurt('2026-09-05T07:00:00')).toBe('sâmbătă, 5 septembrie · 07:00');
  });

  it('un moment nerecunoscut nu produce o dată inventată', () => {
    expect(candScurt('mâine')).toBe('');
  });
});

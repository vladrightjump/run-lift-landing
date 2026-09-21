import { describe, it, expect } from 'vitest';
import {
  validateEventConfig,
  avertismenteEventConfig,
  mutaSectiune,
  comutaVizibilitatea,
  layoutComplet,
  cioarnaPentruEditiaUrmatoare,
  cioarnaEditieNoua,
  rezumatCiornaNoua,
} from '../../src/admin/eventConfigForm';
import { SNAPSHOT_CONFIG, SECTION_KEYS, type EventConfig } from '../../src/content/eventConfig';

/**
 * Regulile formularului trebuie să spună același lucru ca
 * `event_config_validate` din DB. Serverul rămâne autoritatea; testele de aici
 * păzesc ca organizatorul să nu apese „Publică" doar ca să afle că a greșit.
 */

const cu = (patch: Partial<EventConfig>): EventConfig => ({ ...SNAPSHOT_CONFIG, ...patch });
const campuri = (c: EventConfig): string[] => validateEventConfig(c).map((p) => p.camp);

describe('documentul valid trece', () => {
  it('instantaneul de build nu are nicio problemă', () => {
    expect(validateEventConfig(SNAPSHOT_CONFIG)).toEqual([]);
  });
});

/**
 * Momentele se exprimă în ore FAȚĂ DE START, nu ca date scrise de mână. Scrise
 * de mână, țineau doar cât timp instantaneul rămânea pe ediția care le-a
 * inspirat: la prima aliniere pe ediția publicată ajungeau de partea greșită a
 * graniței și testul pica fără ca vreo regulă să se fi schimbat.
 */
const fataDeStart = (ore: number): string => {
  const d = new Date(`${SNAPSHOT_CONFIG.start}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + Math.round(ore * 60));
  return d.toISOString().slice(0, 19);
};

describe('reguli de relație între repere', () => {
  it('deadline după start e respins', () => {
    expect(campuri(cu({ registrationDeadline: fataDeStart(2) }))).toContain(
      'registrationDeadline'
    );
  });

  it('deadline egal cu startul e acceptat', () => {
    expect(campuri(cu({ registrationDeadline: SNAPSHOT_CONFIG.start }))).not.toContain(
      'registrationDeadline'
    );
  });

  it('următorul antrenament înainte de finalul cursei e respins', () => {
    // Finalul e start + `durationHours`; ținta la jumătatea cursei e înăuntru.
    expect(campuri(cu({ nextEditionAt: fataDeStart(SNAPSHOT_CONFIG.durationHours / 2) }))).toContain(
      'nextEditionAt'
    );
  });

  it('următorul antrenament fix la finalul cursei e respins (trebuie strict după)', () => {
    expect(campuri(cu({ nextEditionAt: fataDeStart(SNAPSHOT_CONFIG.durationHours) }))).toContain(
      'nextEditionAt'
    );
  });

  it('durata mai lungă mută granița, deci și verdictul', () => {
    // Aceeași țintă, acceptabilă la durata reală, cade în interiorul unei curse
    // de 24h — granița e a duratei, nu a datei.
    const c = cu({ durationHours: 24, nextEditionAt: fataDeStart(13) });
    expect(campuri(c)).toContain('nextEditionAt');
  });
});

describe('reguli de câmp', () => {
  it.each([
    ['capacitate zero', { slots: { total: 0, waitlist: 10, occupiedFallback: 0 } }, 'slots.total'],
    [
      'coordonate scrise ca text',
      { venue: { ...SNAPSHOT_CONFIG.venue, mapQuery: 'Valea Morilor' } },
      'venue.mapQuery',
    ],
    ['nume de eveniment gol', { eventName: '   ' }, 'eventName'],
    ['fus fără offset', { tz: 'EEST' }, 'tz'],
    ['dată cu fus lipit', { start: '2026-08-22T07:00:00+03:00' }, 'start'],
    ['oră de check-in malformată', { checkinFrom: '6:30' }, 'checkinFrom'],
    ['ediție zero', { number: 0 }, 'number'],
  ])('%s', (_eticheta, patch, camp) => {
    expect(campuri(cu(patch as Partial<EventConfig>))).toContain(camp);
  });

  it('coordonate negative sunt valide', () => {
    expect(campuri(cu({ venue: { ...SNAPSHOT_CONFIG.venue, mapQuery: '-33.86,-151.2' } }))).not.toContain(
      'venue.mapQuery'
    );
  });

  it('raportează toate problemele odată, nu doar prima', () => {
    const probleme = validateEventConfig(
      cu({ eventName: '', concept: '', slots: { total: 0, waitlist: 0, occupiedFallback: 0 } })
    );
    expect(probleme.length).toBeGreaterThanOrEqual(3);
  });
});

describe('layout', () => {
  it('respinge o secțiune duplicată', () => {
    expect(
      campuri(
        cu({
          layout: [
            { key: 'format', visible: true },
            { key: 'format', visible: false },
          ],
        })
      )
    ).toContain('layout');
  });

  it('mutarea schimbă ordinea', () => {
    const dupa = mutaSectiune(SNAPSHOT_CONFIG.layout, 'venue', -1);
    expect(dupa.map((s) => s.key)).toEqual([
      'venue',
      'format',
      'registration',
      'participants',
      'reels',
    ]);
  });

  it('mutarea peste capăt nu face nimic', () => {
    expect(mutaSectiune(SNAPSHOT_CONFIG.layout, 'format', -1)).toEqual(SNAPSHOT_CONFIG.layout);
    expect(mutaSectiune(SNAPSHOT_CONFIG.layout, 'reels', 1)).toEqual(SNAPSHOT_CONFIG.layout);
  });

  it('comutarea schimbă doar secțiunea cerută', () => {
    const dupa = comutaVizibilitatea(SNAPSHOT_CONFIG.layout, 'venue');
    expect(dupa.find((s) => s.key === 'venue')?.visible).toBe(false);
    expect(dupa.filter((s) => s.visible)).toHaveLength(SECTION_KEYS.length - 1);
  });

  it('completează secțiunile lipsă dintr-un document mai vechi', () => {
    const vechi = layoutComplet([{ key: 'format', visible: false }]);
    expect(vechi.map((s) => s.key)).toEqual([
      'format',
      'venue',
      'registration',
      'participants',
      'reels',
    ]);
    // Ce era deja acolo își păstrează starea; ce s-a adăugat e vizibil.
    expect(vechi[0].visible).toBe(false);
    expect(vechi.slice(1).every((s) => s.visible)).toBe(true);
  });
});

describe('avertismente — nu blochează, dar spun ce urmează', () => {
  it('ediția de lansare înaintea celei a evenimentului', () => {
    const av = avertismenteEventConfig(cu({ launchNumber: SNAPSHOT_CONFIG.number + 1 }));
    expect(av).toHaveLength(1);
    expect(av[0].mesaj).toMatch(/confirmare/);
  });

  it('egale — fără avertisment', () => {
    expect(avertismenteEventConfig(SNAPSHOT_CONFIG)).toEqual([]);
  });

  it('un document cu avertisment rămâne VALID (avertismentul nu e refuz)', () => {
    const c = cu({ launchNumber: SNAPSHOT_CONFIG.number + 1 });
    expect(validateEventConfig(c)).toEqual([]);
    expect(avertismenteEventConfig(c).length).toBeGreaterThan(0);
  });

  it('ascunderea secțiunii „cine vine" e semnalată', () => {
    const av = avertismenteEventConfig(
      cu({ layout: comutaVizibilitatea(SNAPSHOT_CONFIG.layout, 'participants') })
    );
    expect(av.some((a) => a.mesaj.includes('cine vine'))).toBe(true);
  });
});

describe('ciorna ediției următoare', () => {
  const ciorna = cioarnaPentruEditiaUrmatoare(SNAPSHOT_CONFIG);

  it('incrementează ediția evenimentului', () => {
    expect(ciorna.number).toBe(SNAPSHOT_CONFIG.number + 1);
  });

  it('NU bumpează ediția de lansare — asta se face după cursă', () => {
    expect(ciorna.launchNumber).toBe(SNAPSHOT_CONFIG.launchNumber);
  });

  it('păstrează locul și capacitatea, ca punct de plecare', () => {
    expect(ciorna.venue).toEqual(SNAPSHOT_CONFIG.venue);
    expect(ciorna.slots).toEqual(SNAPSHOT_CONFIG.slots);
  });
});

describe('clipurile nu mai trec prin document', () => {
  it('„Instagram" vizibilă nu avertizează — clipurile vin din cod', () => {
    // Secțiunea se ascunde singură când banda n-are niciun clip.
    // Un avertisment care pornește aprins e unul pe care nimeni nu-l mai citește.
    expect(avertismenteEventConfig(SNAPSHOT_CONFIG)).toEqual([]);
  });

  it('un document nu poate fi invalidat de clipuri, fiindcă nu mai poartă niciunul', () => {
    expect(validateEventConfig(cu({ reels: { headline: 'Instagram', body: '' } }))).toEqual([]);
  });
});

/**
 * Ciorna ediției noi, din trei câmpuri.
 *
 * Contractul păzit aici e unul negativ: după dialogul rapid, `launchAt` NU mai
 * poate rămâne în urmă. `cioarnaPentruEditiaUrmatoare` îl copiază — de aceea
 * există și testul care arată diferența dintre cele două, nu doar cel care
 * verifică valoarea nouă.
 */
describe('cioarnaEditieNoua — reperele se recalculează, nu se copiază', () => {
  // Ediția din instantaneu: start 2026-09-05T07:00, check-in 06:45, anunț
  // 2026-09-03T12:00, deadline 2026-09-05T06:00, următorul 2026-09-12T07:00.
  const START_NOU = '2026-10-03T09:00:00';

  it('check-inul păstrează avansul, nu ora — 07:00→09:00 mută 06:45 la 08:45', () => {
    expect(cioarnaEditieNoua(SNAPSHOT_CONFIG, START_NOU, 30).checkinFrom).toBe('08:45');
  });

  it('anunțul ediției se mută odată cu startul, deci nu rămâne un moment consumat', () => {
    const noua = cioarnaEditieNoua(SNAPSHOT_CONFIG, START_NOU, 30);
    // Startul s-a mutat cu 28 de zile și 2 ore; anunțul face același drum.
    expect(noua.launchAt).toBe('2026-10-01T14:00:00');
    // Exact ce NU face calea veche — de aici venea capcana.
    expect(cioarnaPentruEditiaUrmatoare(SNAPSHOT_CONFIG).launchAt).toBe(SNAPSHOT_CONFIG.launchAt);
  });

  it('anunțul unei ediții mutate în viitor e în viitor', () => {
    const noua = cioarnaEditieNoua(SNAPSHOT_CONFIG, START_NOU, 30);
    const acum = new Date('2026-09-06T12:00:00+03:00').getTime();
    expect(new Date(`${noua.launchAt}${noua.tz}`).getTime()).toBeGreaterThan(acum);
  });

  it('închiderea înscrierilor și următorul antrenament păstrează distanțele față de start', () => {
    const noua = cioarnaEditieNoua(SNAPSHOT_CONFIG, START_NOU, 30);
    const distanta = (c: EventConfig, camp: 'registrationDeadline' | 'nextEditionAt'): number =>
      new Date(`${c[camp]}${c.tz}`).getTime() - new Date(`${c.start}${c.tz}`).getTime();
    expect(distanta(noua, 'registrationDeadline')).toBe(
      distanta(SNAPSHOT_CONFIG, 'registrationDeadline')
    );
    expect(distanta(noua, 'nextEditionAt')).toBe(distanta(SNAPSHOT_CONFIG, 'nextEditionAt'));
  });

  it('numărul ediției urcă cu unul, iar `launchNumber` rămâne o decizie separată', () => {
    const noua = cioarnaEditieNoua(SNAPSHOT_CONFIG, START_NOU, 30);
    expect(noua.number).toBe(SNAPSHOT_CONFIG.number + 1);
    expect(noua.launchNumber).toBe(SNAPSHOT_CONFIG.launchNumber);
  });

  it('numărul de locuri vine din câmp, restul capacității se moștenește', () => {
    const noua = cioarnaEditieNoua(SNAPSHOT_CONFIG, START_NOU, 42);
    expect(noua.slots.total).toBe(42);
    expect(noua.slots.waitlist).toBe(SNAPSHOT_CONFIG.slots.waitlist);
  });

  it('locația și formatul trec neatinse', () => {
    const noua = cioarnaEditieNoua(SNAPSHOT_CONFIG, START_NOU, 30);
    expect(noua.venue).toEqual(SNAPSHOT_CONFIG.venue);
    expect(noua.durationHours).toBe(SNAPSHOT_CONFIG.durationHours);
  });

  it('un start malformat nu inventează repere — validarea îl refuză', () => {
    const noua = cioarnaEditieNoua(SNAPSHOT_CONFIG, '2026-10-03', 30);
    expect(noua.start).toBe('2026-10-03');
    expect(campuri(noua)).toContain('start');
  });

  it('un start identic cu cel publicat nu mută nimic', () => {
    const noua = cioarnaEditieNoua(SNAPSHOT_CONFIG, SNAPSHOT_CONFIG.start, 30);
    expect(noua.launchAt).toBe(SNAPSHOT_CONFIG.launchAt);
    expect(noua.checkinFrom).toBe(SNAPSHOT_CONFIG.checkinFrom);
  });
});

describe('rezumatCiornaNoua — ce s-a moștenit, câmp cu câmp', () => {
  const START_NOU = '2026-10-03T09:00:00';
  const rezumat = (startNou = START_NOU, locuri = 30) =>
    rezumatCiornaNoua(SNAPSHOT_CONFIG, cioarnaEditieNoua(SNAPSHOT_CONFIG, startNou, locuri));
  const etichete = (...args: Parameters<typeof rezumat>): string[] =>
    rezumat(...args).map((c) => c.eticheta);

  it('enumeră locația moștenită, cu valoarea ei', () => {
    const locatia = rezumat().find((c) => c.eticheta === 'Locația');
    expect(locatia?.valoare).toContain(SNAPSHOT_CONFIG.venue.name);
    expect(locatia?.recalculat).toBeUndefined();
  });

  it('enumeră capacitatea, cu numărul de locuri ales', () => {
    expect(rezumat(START_NOU, 42).find((c) => c.eticheta === 'Capacitate')?.valoare).toContain(
      '42 locuri'
    );
  });

  it('momentele mutate apar cu valoarea NOUĂ, marcate ca recalculate', () => {
    const checkin = rezumat().find((c) => c.eticheta === 'Check-in de la');
    expect(checkin).toEqual({ eticheta: 'Check-in de la', valoare: '08:45', recalculat: true });
    expect(rezumat().find((c) => c.eticheta === 'Se anunță ediția')?.recalculat).toBe(true);
  });

  it('un start identic nu raportează niciun câmp ca recalculat', () => {
    expect(rezumat(SNAPSHOT_CONFIG.start).some((c) => c.recalculat)).toBe(false);
    // Dar moștenirea se arată în continuare — asta e jumătatea care contează.
    expect(etichete(SNAPSHOT_CONFIG.start)).toContain('Locația');
  });

  it('ocuparea de rezervă nu se mai moștenește, deci n-are ce raporta', () => {
    // Era numărul pe care pagina îl arată când statisticile tac. Moștenit, pe o
    // ediție la care încă nu s-a înscris nimeni, e ocupația ediției TRECUTE —
    // afișată exact atunci când backendul nu răspunde, adică atunci când nimeni
    // n-o poate verifica.
    const cuOcupate = {
      ...SNAPSHOT_CONFIG,
      slots: { ...SNAPSHOT_CONFIG.slots, occupiedFallback: 7 },
    };
    const noua = cioarnaEditieNoua(cuOcupate, START_NOU, 30);
    expect(noua.slots.occupiedFallback).toBe(0);
    expect(
      rezumatCiornaNoua(cuOcupate, noua).map((c) => c.eticheta)
    ).not.toContain('Ocupate (valoare de rezervă)');
  });
});

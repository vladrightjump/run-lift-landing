import { describe, it, expect } from 'vitest';
import {
  validateEventConfig,
  avertismenteEventConfig,
  mutaSectiune,
  comutaVizibilitatea,
  layoutComplet,
  cioarnaPentruEditiaUrmatoare,
  parseInstagramUrl,
  adaugaReel,
  stergeReel,
  mutaReel,
  seteazaReel,
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

describe('reguli de relație între repere', () => {
  it('deadline după start e respins', () => {
    expect(campuri(cu({ registrationDeadline: '2026-08-22T09:00:00' }))).toContain(
      'registrationDeadline'
    );
  });

  it('deadline egal cu startul e acceptat — e chiar cazul ediției curente', () => {
    expect(campuri(cu({ registrationDeadline: SNAPSHOT_CONFIG.start }))).not.toContain(
      'registrationDeadline'
    );
  });

  it('următorul antrenament înainte de finalul cursei e respins', () => {
    // Start 07:00 + 2h = 09:00; ținta la 08:00 e în timpul cursei.
    expect(campuri(cu({ nextEditionAt: '2026-08-22T08:00:00' }))).toContain('nextEditionAt');
  });

  it('următorul antrenament fix la finalul cursei e respins (trebuie strict după)', () => {
    expect(campuri(cu({ nextEditionAt: '2026-08-22T09:00:00' }))).toContain('nextEditionAt');
  });

  it('durata mai lungă mută granița, deci și verdictul', () => {
    const c = cu({ durationHours: 24, nextEditionAt: '2026-08-22T20:00:00' });
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

describe('clipuri de Instagram — linkul lipit, nu codul scris de mână', () => {
  it('extrage codul dintr-un link de reel, cu tot cu query-ul de share', () => {
    expect(
      parseInstagramUrl('https://www.instagram.com/reel/ABC12345/?igsh=MXY123abc')
    ).toEqual({ code: 'ABC12345', kind: 'reel' });
  });

  it('„/reels/" (pluralul din share-ul de browser) se normalizează la „reel"', () => {
    // Ruta de embed e la singular; pluralul ar da un iframe gol.
    expect(parseInstagramUrl('https://instagram.com/reels/XYZ98765/')).toEqual({
      code: 'XYZ98765',
      kind: 'reel',
    });
  });

  it('o postare rămâne postare — Instagram n-o servește pe ruta de reel', () => {
    expect(parseInstagramUrl('https://www.instagram.com/p/QWE45678/')).toEqual({
      code: 'QWE45678',
      kind: 'p',
    });
  });

  it('acceptă și un cod lipit direct', () => {
    expect(parseInstagramUrl('  ABC12345  ')).toEqual({ code: 'ABC12345', kind: 'reel' });
  });

  it('respinge ce nu conține un cod', () => {
    for (const gunoi of ['', '   ', 'https://tiktok.com/@x/video/123', 'abc', 'https://www.instagram.com/we_run_and_lift/']) {
      expect(parseInstagramUrl(gunoi)).toBeNull();
    }
  });

  it('ordinea din listă e ordinea din bandă, iar mutarea peste capăt nu face nimic', () => {
    const items = [
      { code: 'AAAAA1', kind: 'reel' as const, poster: '', caption: '' },
      { code: 'BBBBB2', kind: 'reel' as const, poster: '', caption: '' },
    ];
    expect(mutaReel(items, 1, -1).map((r) => r.code)).toEqual(['BBBBB2', 'AAAAA1']);
    expect(mutaReel(items, 0, -1)).toEqual(items);
    expect(mutaReel(items, 1, 1)).toEqual(items);
  });

  it('adăugarea se oprește la plafon', () => {
    let items = adaugaReel([]);
    expect(items).toHaveLength(1);
    for (let i = 0; i < 30; i++) items = adaugaReel(items);
    expect(items).toHaveLength(12);
  });

  it('ștergerea și setarea ating doar rândul cerut', () => {
    const items = [
      { code: 'AAAAA1', kind: 'reel' as const, poster: '', caption: 'unu' },
      { code: 'BBBBB2', kind: 'reel' as const, poster: '', caption: 'doi' },
    ];
    expect(stergeReel(items, 0).map((r) => r.code)).toEqual(['BBBBB2']);
    const dupa = seteazaReel(items, 1, 'caption', 'schimbat');
    expect(dupa[1].caption).toBe('schimbat');
    expect(dupa[0]).toEqual(items[0]);
  });
});

describe('validarea clipurilor oglindește serverul', () => {
  const cuClipuri = (items: { code: string; kind: 'reel' | 'p'; poster: string; caption: string }[]) =>
    campuri(cu({ reels: { ...SNAPSHOT_CONFIG.reels, items } }));

  it('un cod gol e semnalat pe rândul lui', () => {
    expect(cuClipuri([{ code: '', kind: 'reel', poster: '', caption: '' }])).toContain(
      'reels.0.code'
    );
  });

  it('același clip de două ori e semnalat', () => {
    const dublu = { code: 'ABC12345', kind: 'reel' as const, poster: '', caption: '' };
    expect(cuClipuri([dublu, { ...dublu }])).toContain('reels');
  });

  it('clipuri valide și distincte trec', () => {
    expect(
      cuClipuri([
        { code: 'ABC12345', kind: 'reel', poster: '/reels/a.jpg', caption: 'a' },
        { code: 'XYZ98765', kind: 'p', poster: '', caption: '' },
      ])
    ).toEqual([]);
  });

  it('un clip fără poster e doar avertisment, nu blocaj', () => {
    const config = cu({
      reels: {
        ...SNAPSHOT_CONFIG.reels,
        items: [{ code: 'ABC12345', kind: 'reel' as const, poster: '', caption: '' }],
      },
    });
    expect(validateEventConfig(config)).toEqual([]);
    expect(avertismenteEventConfig(config).some((a) => a.mesaj.includes('poster'))).toBe(true);
  });

  it('„Instagram" vizibilă fără clipuri NU avertizează — e starea implicită', () => {
    // Un avertisment care pornește aprins e un avertisment pe care nimeni nu-l
    // mai citește. Pagina ascunde secțiunea singură.
    expect(avertismenteEventConfig(SNAPSHOT_CONFIG)).toEqual([]);
  });
});

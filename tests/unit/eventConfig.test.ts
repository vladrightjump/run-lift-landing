import { describe, it, expect } from 'vitest';
import { EDITION } from '../../src/content/edition';
import {
  parseEventConfig,
  SNAPSHOT_CONFIG,
  DEFAULT_LAYOUT,
  SECTION_KEYS,
} from '../../src/content/eventConfig';

/**
 * `parseEventConfig` e poarta dintre rețea și pagină. Ce trece pe aici ajunge
 * direct în ce vede vizitatorul, deci testele de mai jos țin două lucruri:
 * instantaneul de build rămâne fidel lui `EDITION`, iar un document stricat
 * întoarce `null` (apelantul cade pe instantaneu) în loc să randeze pe jumătate.
 */

/** Document valid minim — pornim de la instantaneu ca să nu-l rescriem de fiecare dată. */
const valid = () => JSON.parse(JSON.stringify(SNAPSHOT_CONFIG)) as Record<string, unknown>;

describe('SNAPSHOT_CONFIG derivă din EDITION', () => {
  it('câmpurile de ediție', () => {
    expect(SNAPSHOT_CONFIG.number).toBe(EDITION.number);
    expect(SNAPSHOT_CONFIG.launchNumber).toBe(EDITION.launchNumber);
    expect(SNAPSHOT_CONFIG.eventName).toBe(EDITION.eventName);
    expect(SNAPSHOT_CONFIG.concept).toBe(EDITION.concept);
  });

  it('reperele de timp, fără offset', () => {
    expect(SNAPSHOT_CONFIG.tz).toBe(EDITION.tz);
    expect(SNAPSHOT_CONFIG.start).toBe(EDITION.start);
    expect(SNAPSHOT_CONFIG.registrationDeadline).toBe(EDITION.registrationDeadline);
    expect(SNAPSHOT_CONFIG.launchAt).toBe(EDITION.launchAt);
    expect(SNAPSHOT_CONFIG.nextEditionAt).toBe(EDITION.nextEditionAt);
    expect(SNAPSHOT_CONFIG.durationHours).toBe(EDITION.durationHours);
    expect(SNAPSHOT_CONFIG.leaderboardLeadHours).toBe(EDITION.leaderboardLeadHours);
  });

  it('locul cursei — inclusiv diacriticele', () => {
    expect(SNAPSHOT_CONFIG.venue.name).toBe(EDITION.venue.name);
    expect(SNAPSHOT_CONFIG.venue.mapQuery).toBe(EDITION.venue.mapQuery);
    expect(SNAPSHOT_CONFIG.venue.zoom).toBe(EDITION.venue.zoom);
  });

  it('locurile', () => {
    expect(SNAPSHOT_CONFIG.slots.total).toBe(EDITION.slots.total);
    expect(SNAPSHOT_CONFIG.slots.waitlist).toBe(EDITION.slots.waitlist);
  });

  it('NU cară ce rămâne în cod (antrenamente, URL-uri, brand)', () => {
    expect(SNAPSHOT_CONFIG).not.toHaveProperty('training');
    expect(SNAPSHOT_CONFIG).not.toHaveProperty('urls');
    expect(SNAPSHOT_CONFIG).not.toHaveProperty('brand');
    expect(SNAPSHOT_CONFIG).not.toHaveProperty('ogImageVersion');
  });
});

describe('parseEventConfig acceptă documentele randabile', () => {
  it('duce instantaneul dus-întors fără pierderi', () => {
    expect(parseEventConfig(valid())).toEqual(SNAPSHOT_CONFIG);
  });

  it('păstrează ordinea și vizibilitatea din layout', () => {
    const doc = valid();
    doc.layout = [
      { key: 'venue', visible: true },
      { key: 'format', visible: false },
    ];
    expect(parseEventConfig(doc)?.layout).toEqual([
      { key: 'venue', visible: true },
      { key: 'format', visible: false },
    ]);
  });

  it('ignoră cheile necunoscute — o secțiune scoasă din cod nu strică un document publicat', () => {
    const doc = valid();
    doc.layout = [
      { key: 'format', visible: true },
      { key: 'sectiune-disparuta', visible: true },
      { key: 'venue', visible: true },
    ];
    expect(parseEventConfig(doc)?.layout).toEqual([
      { key: 'format', visible: true },
      { key: 'venue', visible: true },
    ]);
  });

  it('cade pe ordinea implicită când layout lipsește sau e gol', () => {
    const fara = valid();
    delete fara.layout;
    expect(parseEventConfig(fara)?.layout).toEqual(DEFAULT_LAYOUT);

    const gol = valid();
    gol.layout = [];
    expect(parseEventConfig(gol)?.layout).toEqual(DEFAULT_LAYOUT);
  });

  it('acceptă ordinalOverride absent, tratându-l ca null', () => {
    const doc = valid();
    delete doc.ordinalOverride;
    expect(parseEventConfig(doc)?.ordinalOverride).toBeNull();
  });
});

describe('parseEventConfig respinge ce nu se poate randa', () => {
  it.each([
    ['null', null],
    ['un string', 'nu sunt un obiect'],
    ['o listă', []],
  ])('%s', (_eticheta, intrare) => {
    expect(parseEventConfig(intrare)).toBeNull();
  });

  it.each([
    'eventName',
    'concept',
    'tz',
    'start',
    'checkinFrom',
    'registrationDeadline',
    'launchAt',
    'nextEditionAt',
    'number',
    'launchNumber',
    'durationHours',
    'leaderboardLeadHours',
    'showComingSoon',
    'venue',
    'slots',
  ])('câmpul obligatoriu %s lipsește', (camp) => {
    const doc = valid();
    delete doc[camp];
    expect(parseEventConfig(doc)).toBeNull();
  });

  it('un câmp numeric venit ca text', () => {
    const doc = valid();
    doc.number = '5';
    expect(parseEventConfig(doc)).toBeNull();
  });

  it('showComingSoon venit ca text — „false" ar fi fost adevărat', () => {
    const doc = valid();
    doc.showComingSoon = 'false';
    expect(parseEventConfig(doc)).toBeNull();
  });

  it('venue fără mapQuery', () => {
    const doc = valid();
    doc.venue = { name: 'X', city: 'Y', zoom: 16 };
    expect(parseEventConfig(doc)).toBeNull();
  });

  it('slots incomplet', () => {
    const doc = valid();
    doc.slots = { total: 40 };
    expect(parseEventConfig(doc)).toBeNull();
  });
});

describe('cheile de secțiune', () => {
  it('sunt exact cele patru secțiuni numerotate din landing', () => {
    expect([...SECTION_KEYS]).toEqual(['format', 'venue', 'registration', 'participants']);
  });

  it('ordinea implicită le arată pe toate', () => {
    expect(DEFAULT_LAYOUT.every((s) => s.visible)).toBe(true);
    expect(DEFAULT_LAYOUT).toHaveLength(SECTION_KEYS.length);
  });
});

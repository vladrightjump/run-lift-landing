import { describe, it, expect } from 'vitest';
import {
  parseBuildInfo,
  campuriVechiInBuild,
  type BuildInfo,
} from '../../src/admin/buildFingerprint';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';

/**
 * Share preview-ul rămâne pe datele build-ului până la următorul deploy, pentru
 * că scraper-ele nu rulează JS. Testele de aici păzesc ca backoffice-ul să
 * numească exact câmpurile rămase în urmă — și să TACĂ atunci când nu e cazul,
 * altfel avertismentul devine zgomot pe care organizatorul învață să-l ignore.
 */

const build = (over: Partial<BuildInfo['meta']> = {}): BuildInfo => ({
  commit: 'abc123',
  builtAt: '2026-08-20T10:00:00Z',
  editie: SNAPSHOT_CONFIG.number,
  meta: {
    eventName: SNAPSHOT_CONFIG.eventName,
    start: SNAPSHOT_CONFIG.start,
    venueName: SNAPSHOT_CONFIG.venue.name,
    venueCity: SNAPSHOT_CONFIG.venue.city,
    ogImageVersion: 5,
    ...over,
  },
});

describe('build la zi', () => {
  it('nu raportează nimic când build-ul și configul publicat coincid', () => {
    expect(campuriVechiInBuild(build(), SNAPSHOT_CONFIG)).toEqual([]);
  });
});

describe('câmpuri rămase în urmă', () => {
  it('o dată de start schimbată e semnalată, cu ambele valori', () => {
    const vechi = campuriVechiInBuild(build(), {
      ...SNAPSHOT_CONFIG,
      start: '2026-12-01T07:00:00',
    });
    expect(vechi).toHaveLength(1);
    expect(vechi[0].camp).toBe('data startului');
    expect(vechi[0].inBuild).toBe(SNAPSHOT_CONFIG.start);
    expect(vechi[0].publicat).toBe('2026-12-01T07:00:00');
  });

  it('o mutare de locație raportează ambele câmpuri ale locului', () => {
    const vechi = campuriVechiInBuild(build(), {
      ...SNAPSHOT_CONFIG,
      venue: { ...SNAPSHOT_CONFIG.venue, name: 'Sala Polivalentă', city: 'Chișinău' },
    });
    expect(vechi.map((c) => c.camp)).toEqual(['numele locului', 'orașul/zona']);
  });

  it('numele evenimentului contează — intră în titlul de share', () => {
    const vechi = campuriVechiInBuild(build(), { ...SNAPSHOT_CONFIG, eventName: 'Winter Trial' });
    expect(vechi.map((c) => c.camp)).toEqual(['numele evenimentului']);
  });

  it('mai multe schimbări deodată sunt toate raportate', () => {
    const vechi = campuriVechiInBuild(build(), {
      ...SNAPSHOT_CONFIG,
      eventName: 'Winter Trial',
      start: '2026-12-01T07:00:00',
    });
    expect(vechi).toHaveLength(2);
  });
});

describe('ce NU se compară', () => {
  it('capacitatea nu intră în meta, deci nu produce avertisment', () => {
    const vechi = campuriVechiInBuild(build(), {
      ...SNAPSHOT_CONFIG,
      slots: { ...SNAPSHOT_CONFIG.slots, total: 99 },
    });
    expect(vechi).toEqual([]);
  });

  it('layout-ul nu intră în meta', () => {
    const vechi = campuriVechiInBuild(build(), {
      ...SNAPSHOT_CONFIG,
      layout: [{ key: 'format', visible: false }],
    });
    expect(vechi).toEqual([]);
  });

  it('ogImageVersion trăiește doar în build, deci nu se compară cu configul', () => {
    expect(campuriVechiInBuild(build({ ogImageVersion: 99 }), SNAPSHOT_CONFIG)).toEqual([]);
  });
});

describe('parseBuildInfo', () => {
  it('acceptă un version.json complet', () => {
    expect(parseBuildInfo(build())?.editie).toBe(SNAPSHOT_CONFIG.number);
  });

  it.each([
    ['null', null],
    ['un string', 'nope'],
    ['fără meta', { commit: 'a', editie: 5 }],
    ['meta incompletă', { commit: 'a', editie: 5, meta: { eventName: 'X' } }],
    ['editie ca text', { commit: 'a', editie: '5', meta: build().meta }],
  ])('respinge %s', (_e, intrare) => {
    expect(parseBuildInfo(intrare)).toBeNull();
  });

  it('un version.json vechi, fără câmpurile de ediție, e respins fără să arunce', () => {
    // Exact forma de dinaintea acestui plan: doar commit + builtAt.
    expect(parseBuildInfo({ commit: 'abc', builtAt: '2026-08-01T00:00:00Z' })).toBeNull();
  });
});

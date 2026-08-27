import { describe, it, expect } from 'vitest';
import {
  validateEventConfig,
  avertismenteEventConfig,
  mutaSectiune,
  comutaVizibilitatea,
  layoutComplet,
  cioarnaPentruEditiaUrmatoare,
} from '../../src/admin/eventConfigForm';
import { SNAPSHOT_CONFIG, type EventConfig } from '../../src/content/eventConfig';

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
    expect(dupa.map((s) => s.key)).toEqual(['venue', 'format', 'registration', 'participants']);
  });

  it('mutarea peste capăt nu face nimic', () => {
    expect(mutaSectiune(SNAPSHOT_CONFIG.layout, 'format', -1)).toEqual(SNAPSHOT_CONFIG.layout);
    expect(mutaSectiune(SNAPSHOT_CONFIG.layout, 'participants', 1)).toEqual(SNAPSHOT_CONFIG.layout);
  });

  it('comutarea schimbă doar secțiunea cerută', () => {
    const dupa = comutaVizibilitatea(SNAPSHOT_CONFIG.layout, 'venue');
    expect(dupa.find((s) => s.key === 'venue')?.visible).toBe(false);
    expect(dupa.filter((s) => s.visible)).toHaveLength(3);
  });

  it('completează secțiunile lipsă dintr-un document mai vechi', () => {
    const vechi = layoutComplet([{ key: 'format', visible: false }]);
    expect(vechi.map((s) => s.key)).toEqual(['format', 'venue', 'registration', 'participants']);
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

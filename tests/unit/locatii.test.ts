import { describe, it, expect } from 'vitest';
import { EDITION } from '../../src/content/edition';
import {
  EVENT_WHERE,
  EVENT_META,
  HERO_KICKER,
  MAP_EMBED_SRC,
  MAP_DIRECTIONS_URL,
  TRAINING_WHERE,
  TRAINING_MAP_EMBED_SRC,
  TRAINING_MAP_DIRECTIONS_URL,
} from '../../src/content/format';

/**
 * Gardă anti-cuplare între cele două locuri ale proiectului.
 *
 * Cursa se mută de la o ediție la alta; antrenamentele săptămânale sunt mereu
 * pe același teren. Pe ediția 5 derivatele antrenamentului citeau din `venue`,
 * așa că schimbarea locului cursei a mutat și antrenamentele — pagina a trimis
 * oameni la Scările de Granit pentru un antrenament de marți.
 *
 * `tests/despre-noi.spec.ts` verifică DOM-ul, dar compară componenta cu aceleași
 * constante: dacă `TRAINING_*` ar fi legate din nou de `venue`, s-ar muta amândouă
 * și testul ar trece în continuare. Aici păzim derivarea însăși.
 */

describe('locația cursei și locația antrenamentelor sunt izolate', () => {
  it('sunt două locuri diferite în SSOT', () => {
    // Dacă vreodată devin egale, testele de mai jos nu mai discriminează nimic.
    expect(EDITION.training.mapQuery).not.toBe(EDITION.venue.mapQuery);
    expect(EDITION.training.name).not.toBe(EDITION.venue.name);
  });

  it('derivatele antrenamentului citesc din EDITION.training', () => {
    expect(TRAINING_WHERE).toContain(EDITION.training.name);
    expect(TRAINING_WHERE).toContain(EDITION.training.landmark);
    expect(TRAINING_MAP_EMBED_SRC).toContain(EDITION.training.mapQuery);
    expect(TRAINING_MAP_DIRECTIONS_URL).toContain(EDITION.training.mapQuery);
  });

  it('derivatele antrenamentului NU citesc din EDITION.venue', () => {
    expect(TRAINING_WHERE).not.toContain(EDITION.venue.name);
    expect(TRAINING_MAP_EMBED_SRC).not.toContain(EDITION.venue.mapQuery);
    expect(TRAINING_MAP_DIRECTIONS_URL).not.toContain(EDITION.venue.mapQuery);
  });

  it('derivatele cursei citesc din EDITION.venue', () => {
    expect(EVENT_WHERE).toContain(EDITION.venue.name);
    expect(EVENT_META).toContain(EDITION.venue.name);
    expect(HERO_KICKER).toContain(EDITION.venue.name);
    expect(MAP_EMBED_SRC).toContain(EDITION.venue.mapQuery);
    expect(MAP_DIRECTIONS_URL).toContain(EDITION.venue.mapQuery);
  });

  it('derivatele cursei NU citesc din EDITION.training', () => {
    expect(EVENT_WHERE).not.toContain(EDITION.training.name);
    expect(EVENT_META).not.toContain(EDITION.training.name);
    expect(HERO_KICKER).not.toContain(EDITION.training.name);
    expect(MAP_EMBED_SRC).not.toContain(EDITION.training.mapQuery);
    expect(MAP_DIRECTIONS_URL).not.toContain(EDITION.training.mapQuery);
  });

  it('harta antrenamentului cade pe un punct, nu pe o căutare text', () => {
    // Coordonate „lat,lng": „Parcul Râșcani" ca text cădea oriunde în parc.
    expect(EDITION.training.mapQuery).toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/);
  });

  it('ambele hărți respectă originile permise de CSP (frame-src)', () => {
    // `vercel.json` permite doar maps.google.com și www.google.com în frame-src.
    for (const src of [MAP_EMBED_SRC, TRAINING_MAP_EMBED_SRC]) {
      expect(src.startsWith('https://maps.google.com/')).toBe(true);
    }
  });
});

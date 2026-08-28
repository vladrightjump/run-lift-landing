import { describe, it, expect } from 'vitest';
import { EDITION } from '../../src/content/edition';
import {
  deriveEventStrings,
  TRAINING_WHERE,
  TRAINING_MAP_EMBED_SRC,
  TRAINING_MAP_DIRECTIONS_URL,
} from '../../src/content/format';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';

const { EVENT_WHERE, EVENT_META, HERO_KICKER, MAP_EMBED_SRC, MAP_DIRECTIONS_URL } =
  deriveEventStrings(SNAPSHOT_CONFIG);
import { META } from '../../src/content/meta';
import { buildEventIcs } from '../../src/lib/calendar';

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
    expect(EDITION.training.place.mapQuery).not.toBe(EDITION.venue.mapQuery);
    expect(EDITION.training.place.name).not.toBe(EDITION.venue.name);
  });

  it('derivatele antrenamentului citesc din EDITION.training', () => {
    expect(TRAINING_WHERE).toContain(EDITION.training.place.name);
    expect(TRAINING_WHERE).toContain(EDITION.training.place.landmark);
    expect(TRAINING_MAP_EMBED_SRC).toContain(EDITION.training.place.mapQuery);
    expect(TRAINING_MAP_DIRECTIONS_URL).toContain(EDITION.training.place.mapQuery);
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
    expect(EVENT_WHERE).not.toContain(EDITION.training.place.name);
    expect(EVENT_META).not.toContain(EDITION.training.place.name);
    expect(HERO_KICKER).not.toContain(EDITION.training.place.name);
    expect(MAP_EMBED_SRC).not.toContain(EDITION.training.place.mapQuery);
    expect(MAP_DIRECTIONS_URL).not.toContain(EDITION.training.place.mapQuery);
  });

  it('ambele hărți cad pe un punct, nu pe o căutare text', () => {
    // Coordonate „lat,lng": „Parcul Râșcani" ca text cădea oriunde în parc.
    for (const p of [EDITION.venue, EDITION.training.place]) {
      expect(p.mapQuery).toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/);
    }
  });

  /**
   * „name, city" al cursei era calculat în trei locuri independente
   * (`format.ts`, `meta.ts`, `lib/calendar.ts`). Fiecare copie era o șansă în
   * plus să se strecoare sursa greșită; acum toate derivă din `EVENT_WHERE`.
   */
  it('meta de share și fișierul .ics folosesc același loc ca pagina', () => {
    expect(META.description).toContain(EVENT_WHERE);
    expect(META.ogImageAlt).toContain(EVENT_WHERE);
    // iCalendar (RFC 5545) escapează virgula, deci „a, b" devine „a\, b".
    expect(buildEventIcs(SNAPSHOT_CONFIG)).toContain(`LOCATION:${EVENT_WHERE.replace(/,/g, '\\,')}`);
  });

  it('meta de share și .ics nu pomenesc locul antrenamentelor', () => {
    expect(META.description).not.toContain(EDITION.training.place.name);
    expect(buildEventIcs(SNAPSHOT_CONFIG)).not.toContain(EDITION.training.place.name);
  });

  it('ambele hărți respectă originile permise de CSP (frame-src)', () => {
    // `vercel.json` permite doar maps.google.com și www.google.com în frame-src.
    for (const src of [MAP_EMBED_SRC, TRAINING_MAP_EMBED_SRC]) {
      expect(src.startsWith('https://maps.google.com/')).toBe(true);
    }
  });
});

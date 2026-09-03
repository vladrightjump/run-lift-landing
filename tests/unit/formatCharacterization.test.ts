import { describe, it, expect } from 'vitest';
import { deriveEventStrings, TRAINING_WHERE, TRAINING_MAP_EMBED_SRC, TRAINING_MAP_DIRECTIONS_URL } from '../../src/content/format';
import { SNAPSHOT_CONFIG } from '../../src/content/eventConfig';

/**
 * GARDĂ DE CARACTERIZARE pentru mutarea derivărilor de pe constante de modul pe
 * funcții de configurare (U2).
 *
 * Valorile de mai jos sunt CAPTURATE din codul de dinaintea mutării, rescrise la
 * fiecare aliniere a instantaneului pe ediția publicată (acum ediția 6).
 * Nu sunt „valorile corecte" în vreun sens abstract — sunt exact ce randa pagina
 * înainte. Testul are o singură treabă: dacă mutarea schimbă vreun string vizibil,
 * pică aici, nu în producție.
 *
 * Când se schimbă ediția, valorile astea SE SCHIMBĂ — asta e normal. Testul
 * rulează pe instantaneul de build (`SNAPSHOT_CONFIG`), deci se actualizează
 * odată cu el, deliberat, nu din greșeală.
 */

const CAPTURAT_EDITIA_6 = {
  EDITION_ORDINAL: 'a șasea',
  LAUNCH_EDITION_ORDINAL: 'a șasea',
  EVENT_META: '5 septembrie 2026 · Terenul de Basketball',
  HERO_KICKER:
    'Sâmbătă, 5 septembrie 2026 · Terenul de Basketball, Parcul La Izvor · Outdoor Adaptive',
  EVENT_WHEN: 'Sâmbătă, 5 septembrie 2026',
  EVENT_WHERE: 'Terenul de Basketball, Parcul La Izvor',
  EVENT_START_TIME: '07:00',
  EVENT_SUMMARY_LINE:
    'Sâmbătă, 5 septembrie 2026, ora 07:00 — Terenul de Basketball, Parcul La Izvor',
  SUCCESS_SEE_YOU: 'Ne vedem pe 5 septembrie la start, ora 07:00.',
  EVENT_BADGE: 'Hyrox Trial · 5 septembrie',
  MAP_EMBED_SRC: 'https://maps.google.com/maps?q=47.0465504,28.7854741&z=16&hl=ro&output=embed',
  MAP_DIRECTIONS_URL: 'https://www.google.com/maps/search/?api=1&query=47.0465504,28.7854741',
} as const;

describe('derivările din instantaneu rămân identice după mutarea pe config', () => {
  const derivat = deriveEventStrings(SNAPSHOT_CONFIG);

  it.each(Object.entries(CAPTURAT_EDITIA_6))('%s', (cheie, asteptat) => {
    expect(derivat[cheie as keyof typeof CAPTURAT_EDITIA_6]).toBe(asteptat);
  });

  it('acoperă fiecare string derivat, ca unul nou să nu scape necaracterizat', () => {
    expect(Object.keys(derivat).sort()).toEqual(Object.keys(CAPTURAT_EDITIA_6).sort());
  });
});

describe('antrenamentele rămân constante de modul — nu țin de ediție', () => {
  it('locul și hărțile nu se mută odată cu cursa', () => {
    expect(TRAINING_WHERE).toBe('Teren Sportiv, Parcul Râșcani');
    expect(TRAINING_MAP_EMBED_SRC).toBe(
      'https://maps.google.com/maps?q=47.0411377,28.8714638&z=17&hl=ro&output=embed'
    );
    expect(TRAINING_MAP_DIRECTIONS_URL).toBe(
      'https://www.google.com/maps/search/?api=1&query=47.0411377,28.8714638'
    );
  });
});

describe('derivarea urmează configul primit, nu instantaneul', () => {
  it('altă ediție → alte string-uri', () => {
    const altul = deriveEventStrings({
      ...SNAPSHOT_CONFIG,
      number: 6,
      launchNumber: 6,
      eventName: 'Winter Trial',
      concept: 'Indoor',
      start: '2026-12-01T09:30:00',
      venue: { name: 'Sala Polivalentă', city: 'Chișinău', mapQuery: '47.01,28.85', zoom: 15 },
    });

    expect(altul.EDITION_ORDINAL).toBe('a șasea');
    expect(altul.EVENT_META).toBe('1 decembrie 2026 · Sala Polivalentă');
    expect(altul.EVENT_WHEN).toBe('Marți, 1 decembrie 2026');
    expect(altul.EVENT_WHERE).toBe('Sala Polivalentă, Chișinău');
    expect(altul.EVENT_START_TIME).toBe('09:30');
    expect(altul.EVENT_BADGE).toBe('Winter Trial · 1 decembrie');
    expect(altul.MAP_EMBED_SRC).toContain('q=47.01,28.85');
    expect(altul.MAP_DIRECTIONS_URL).toContain('query=47.01,28.85');
  });

  it('ordinalOverride bate tabelul de ordinale', () => {
    const derivat = deriveEventStrings({ ...SNAPSHOT_CONFIG, ordinalOverride: 'aniversară' });
    expect(derivat.EDITION_ORDINAL).toBe('aniversară');
  });
});

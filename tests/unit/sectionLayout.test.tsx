import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Landing } from '../../src/components/Landing';
import { EventConfigProvider } from '../../src/hooks/useEventConfig';
import { SNAPSHOT_CONFIG, type SectionLayoutEntry } from '../../src/content/eventConfig';

/**
 * Ordinea și vizibilitatea secțiunilor vin din configul publicat.
 *
 * Ce se păzește aici: numărul afișat se derivă din POZIȚIA în lista filtrată,
 * nu se stochează. Dacă ar fi stocat, ascunderea unei secțiuni ar lăsa o gaură
 * („01, 03, 04") sau două secțiuni ar purta același număr.
 */

const randeaza = (layout: SectionLayoutEntry[], mode?: 'full' | 'leaderboard') =>
  render(
    <EventConfigProvider override={{ ...SNAPSHOT_CONFIG, layout }}>
      <Landing mode={mode} />
    </EventConfigProvider>
  );

/** Titlurile secțiunilor, în ordinea în care apar în DOM, cu numărul lor. */
const sectiuniDinPagina = (): string[] =>
  Array.from(document.querySelectorAll('.e3-title-num')).map((el) => {
    const titlu = el.parentElement?.querySelector('.e3-title')?.textContent?.trim() ?? '?';
    return `${el.textContent?.trim()} ${titlu}`;
  });

beforeEach(() => {
  // Landing-ul folosește IntersectionObserver (scroll reveal) și matchMedia.
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
      root = null;
      rootMargin = '';
      thresholds = [];
    }
  );
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  // Fără asta, arborii randați se adună în `document` și interogările de mai
  // jos (care merg pe tot documentul) ar vedea și secțiunile testului anterior.
  cleanup();
  vi.unstubAllGlobals();
});

describe('ordinea secțiunilor urmează configul', () => {
  it('ordinea implicită numerotează 01–04', () => {
    randeaza(SNAPSHOT_CONFIG.layout);
    expect(sectiuniDinPagina()).toEqual([
      '01 Formatul',
      '02 Locația',
      '03 Înscriere',
      '04 Cine vine',
    ]);
  });

  it('mutarea locației înaintea formatului le schimbă și numerele', () => {
    randeaza([
      { key: 'venue', visible: true },
      { key: 'format', visible: true },
      { key: 'registration', visible: true },
      { key: 'participants', visible: true },
    ]);
    const sectiuni = sectiuniDinPagina();
    expect(sectiuni[0]).toBe('01 Locația');
    expect(sectiuni[1]).toBe('02 Formatul');
  });
});

describe('vizibilitatea scoate secțiunea și renumerotează restul', () => {
  it('ascunderea locației nu lasă gaură în numerotare', () => {
    randeaza([
      { key: 'format', visible: true },
      { key: 'venue', visible: false },
      { key: 'registration', visible: true },
      { key: 'participants', visible: true },
    ]);
    const sectiuni = sectiuniDinPagina();
    expect(sectiuni).toEqual(['01 Formatul', '02 Înscriere', '03 Cine vine']);
    expect(sectiuni.some((s) => s.includes('Locația'))).toBe(false);
  });

  it('o singură secțiune vizibilă rămâne „01"', () => {
    randeaza([
      { key: 'format', visible: false },
      { key: 'venue', visible: true },
      { key: 'registration', visible: false },
      { key: 'participants', visible: false },
    ]);
    expect(sectiuniDinPagina()).toEqual(['01 Locația']);
  });

  it('numerele sunt unice și consecutive oricare ar fi filtrarea', () => {
    randeaza([
      { key: 'participants', visible: true },
      { key: 'format', visible: false },
      { key: 'venue', visible: true },
      { key: 'registration', visible: true },
    ]);
    const numere = sectiuniDinPagina().map((s) => s.split(' ')[0]);
    expect(numere).toEqual(['01', '02', '03']);
    expect(new Set(numere).size).toBe(numere.length);
  });
});

describe('ziua cursei nu e configurabilă', () => {
  it('modul leaderboard își păstrează aranjarea, oricare ar fi configul', () => {
    // Configul cere o cu totul altă ordine, cu formatul ascuns.
    randeaza(
      [
        { key: 'format', visible: false },
        { key: 'registration', visible: true },
      ],
      'leaderboard'
    );
    expect(sectiuniDinPagina()).toEqual(['01 Cine vine', '02 Formatul', '03 Locația']);
  });

  it('înscrierea nu apare în fereastra de dinaintea startului', () => {
    randeaza(SNAPSHOT_CONFIG.layout, 'leaderboard');
    expect(screen.queryByText('Înscriere')).toBeNull();
  });
});

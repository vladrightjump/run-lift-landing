import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Landing } from '../../src/components/Landing';
import { EventConfigProvider } from '../../src/hooks/useEventConfig';
import { SNAPSHOT_CONFIG, type SectionLayoutEntry } from '../../src/content/eventConfig';
import type { Reel } from '../../src/lib/supabase';

/**
 * Clipurile nu mai vin din configul publicat, ci din `public_training_reels()`.
 * Se mock-uiește HOOK-UL, nu `fetch`: testul verifică numerotarea secțiunilor,
 * nu drumul prin rețea, iar un hook mock-uit randează sincron — fără el fiecare
 * assert ar fi trebuit să aștepte o promisiune.
 */
const { clipuriMock } = vi.hoisted(() => ({ clipuriMock: [] as Reel[] }));
vi.mock('../../src/hooks/useTrainingReels', () => ({
  useTrainingReels: () => clipuriMock,
}));

const UN_CLIP: Reel = {
  youtube: 'dQw4w9WgXcQ',
  caption: 'Marți dimineața',
  url: 'https://www.instagram.com/reel/ABC12345/',
};

/** Pune exact clipurile date în lista pe care o văd componentele. */
const cuClipuri = (...reels: Reel[]) => {
  clipuriMock.length = 0;
  clipuriMock.push(...reels);
};

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
  // Lista de clipuri e un tablou PARTAJAT între teste. Fără golirea asta, un
  // test adăugat la coadă ar moșteni clipurile ultimului test care a cerut
  // unele — o dependență de ordine, adică exact ce nu vrei într-o suită.
  clipuriMock.length = 0;
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

describe('„Instagram" fără clipuri nu lasă gaură în numerotare', () => {
  const CU_REELS: SectionLayoutEntry[] = [
    { key: 'format', visible: true },
    { key: 'reels', visible: true },
    { key: 'venue', visible: true },
  ];

  it('vizibilă în layout dar fără clipuri → dispare, iar restul se renumerotează', () => {
    // Capcana pe care o păzește testul: dacă secțiunea s-ar filtra prin
    // `return null` în componentă, ea AR CONSUMA poziția din lista filtrată,
    // iar „Locația" ar primi 03 în loc de 02.
    cuClipuri();
    randeaza(CU_REELS);
    expect(sectiuniDinPagina()).toEqual(['01 Formatul', '02 Locația']);
  });

  it('cu un clip, își ia numărul din poziția ei', () => {
    cuClipuri(UN_CLIP);
    randeaza(CU_REELS);
    expect(sectiuniDinPagina()).toEqual(['01 Formatul', '02 Instagram', '03 Locația']);
  });

  it('ascunsă din layout nu apare, chiar dacă are clipuri', () => {
    cuClipuri(UN_CLIP);
    randeaza([
      { key: 'format', visible: true },
      { key: 'reels', visible: false },
    ]);
    expect(sectiuniDinPagina()).toEqual(['01 Formatul']);
  });
});

describe('secțiunea „Instagram" nu cere NIMIC de la Instagram', () => {
  it('nu montează niciun player la randare — nici măcar spre gazda video', () => {
    cuClipuri(UN_CLIP);
    randeaza([{ key: 'reels', visible: true }]);
    expect(document.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('cardul e desenat cât timp nu redă, nu gol', () => {
    cuClipuri(UN_CLIP);
    randeaza([{ key: 'reels', visible: true }]);
    expect(document.querySelector('.e3-reel-fallback')?.textContent).toBe('01');
  });

  it('linkul spre postare e singurul lucru care duce pe Instagram', () => {
    cuClipuri(UN_CLIP);
    randeaza([{ key: 'reels', visible: true }]);
    const link = screen.getByRole('link', { name: /Deschide pe Instagram/ });
    expect(link.getAttribute('href')).toBe('https://www.instagram.com/reel/ABC12345/');
  });
});

describe('linia de sosire nu depinde de poziție', () => {
  const banda = () => document.querySelector('#inscriere > .e3-finish');

  it('Covers AE2. Înscrierea prima, Reels ascuns: e 01 și poartă banda de sosire', () => {
    cuClipuri(UN_CLIP);
    randeaza([
      { key: 'registration', visible: true },
      { key: 'reels', visible: false },
      { key: 'format', visible: true },
      { key: 'venue', visible: true },
      { key: 'participants', visible: true },
    ]);
    expect(sectiuniDinPagina()[0]).toBe('01 Înscriere');
    expect(banda()).not.toBeNull();
    // După ea mai urmează secțiuni: banda nu e un sfârșit de pagină.
    expect(document.querySelector('#inscriere ~ section')).not.toBeNull();
  });

  it('ultima pe pagină, banda e aceeași', () => {
    randeaza([
      { key: 'format', visible: true },
      { key: 'registration', visible: true },
    ]);
    expect(sectiuniDinPagina().at(-1)).toBe('02 Înscriere');
    expect(banda()).not.toBeNull();
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

describe('cazul limita: nicio sectiune vizibila', () => {
  it('pagina ramane intreaga (hero + footer), fara sectiuni si fara sa crape', () => {
    // Config valid: R19 blocheaza doar ascunderea inscrierii cat timp inscrierile
    // sunt DESCHISE. Dupa deadline, a ascunde tot e alegerea organizatorului.
    randeaza([
      { key: 'format', visible: false },
      { key: 'venue', visible: false },
      { key: 'registration', visible: false },
      { key: 'participants', visible: false },
    ]);
    expect(sectiuniDinPagina()).toEqual([]);
    // Hero-ul si antetul raman — pagina nu e goala, doar fara sectiuni numerotate.
    expect(screen.getAllByRole('heading', { level: 1 }).length).toBeGreaterThan(0);
  });
});

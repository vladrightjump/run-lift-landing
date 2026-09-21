import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ReelsRail } from '../../src/components/landing/ReelsRail';
import type { Reel } from '../../src/lib/supabase';

/**
 * Banda cu clipurile de antrenament.
 *
 * Ce se păzește aici e comportamentul pe care nicio poartă e2e nu-l prinde cât
 * timp lista de clipuri livrată e goală: pornirea la intrarea în ecran, oprirea
 * la ieșire, și faptul că NIMIC nu se descarcă înainte de asta.
 *
 * jsdom n-are nici `IntersectionObserver`, nici `HTMLMediaElement.prototype.play`.
 * Amândouă sunt stub-uite, după tiparul din `sectionLayout.test.tsx`.
 */

const CLIPURI: Reel[] = [
  {
    video: '/reels/unu.mp4',
    poster: '/reels/unu.jpg',
    caption: 'Marți în parc',
    url: 'https://www.instagram.com/reel/AAAAA11111/',
  },
  {
    video: '/reels/doi.mp4',
    poster: '',
    caption: 'Circuit funcțional',
    url: 'https://www.instagram.com/reel/BBBBB22222/',
  },
];

type Callback = (intrari: { target: Element; isIntersecting: boolean }[]) => void;

/** Observatoarele montate de componentă, ca testul să le poată declanșa. */
let observatoare: { cb: Callback; elemente: Element[] }[] = [];

const monteazaStuburi = (miscareRedusa: boolean) => {
  observatoare = [];

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      cb: Callback;
      elemente: Element[] = [];
      constructor(cb: Callback) {
        this.cb = cb;
        observatoare.push(this);
      }
      observe(el: Element) {
        this.elemente.push(el);
      }
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
    matches: q.includes('prefers-reduced-motion') ? miscareRedusa : false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
};

const play = vi.fn();
const pause = vi.fn();

beforeEach(() => {
  play.mockReset();
  pause.mockReset();
  // jsdom declară media elements dar aruncă „Not implemented" pe play/pause.
  HTMLMediaElement.prototype.play = play as unknown as HTMLMediaElement['play'];
  HTMLMediaElement.prototype.pause = pause as unknown as HTMLMediaElement['pause'];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const randeaza = (reels: Reel[] = CLIPURI, miscareRedusa = false) => {
  monteazaStuburi(miscareRedusa);
  return render(<ReelsRail reels={reels} num="05" headline="Instagram" body="Filmate pe teren." />);
};

/** Trece toate elementele observate prin viewport, într-o direcție sau alta. */
const intersecteaza = (isIntersecting: boolean) => {
  for (const o of observatoare) {
    o.cb(o.elemente.map((target) => ({ target, isIntersecting })));
  }
};

const videouri = (c: HTMLElement) => Array.from(c.querySelectorAll('video'));

describe('randarea', () => {
  it('randează un card per clip', () => {
    const { container } = randeaza();
    expect(videouri(container)).toHaveLength(2);
  });

  it('lista goală nu randează nimic', () => {
    const { container } = randeaza([]);
    expect(container.querySelector('.e3-reels')).toBeNull();
  });

  it('legenda și linkul apar sub card, nu peste imagine', () => {
    const { container } = randeaza();
    const caption = container.querySelector('.e3-reel-caption');
    expect(caption?.textContent).toContain('Marți în parc');
    // `<figcaption>` e frate cu cardul, nu copil al lui.
    expect(caption?.closest('.e3-reel')).toBeNull();
  });

  it('fiecare card duce spre postarea reală', () => {
    randeaza();
    const linkuri = screen.getAllByRole('link', { name: /Deschide pe Instagram/ });
    expect(linkuri.map((a) => a.getAttribute('href'))).toEqual([
      'https://www.instagram.com/reel/AAAAA11111/',
      'https://www.instagram.com/reel/BBBBB22222/',
    ]);
  });

  it('un clip fără poster cade pe marcajul desenat, nu pe o casetă goală', () => {
    const { container } = randeaza();
    const carduri = container.querySelectorAll('.e3-reel');
    expect(carduri[0].querySelector('.e3-reel-poster')).not.toBeNull();
    expect(carduri[1].querySelector('.e3-reel-poster')).toBeNull();
    expect(carduri[1].querySelector('.e3-reel-fallback')?.textContent).toBe('02');
  });
});

describe('nimic nu se descarcă înainte de ecran', () => {
  it('clipul are preload="none"', () => {
    const { container } = randeaza();
    for (const v of videouri(container)) expect(v.getAttribute('preload')).toBe('none');
  });

  it('poster-ul e un <img loading="lazy">, nu atributul `poster`', () => {
    const { container } = randeaza();
    const poster = container.querySelector('.e3-reel-poster');
    expect(poster?.tagName).toBe('IMG');
    expect(poster?.getAttribute('loading')).toBe('lazy');
    // Atributul n-are echivalent de încărcare leneșă: l-ar cere pe toate la randare.
    expect(videouri(container)[0].hasAttribute('poster')).toBe(false);
  });

  it('nu pornește nimic înainte de intersecție', () => {
    randeaza();
    expect(play).not.toHaveBeenCalled();
  });
});

describe('redarea', () => {
  it('clipul e mut, în buclă, inline și ascuns de cititoarele de ecran', () => {
    const { container } = randeaza();
    const v = videouri(container)[0];
    expect(v.muted).toBe(true);
    expect(v.hasAttribute('loop')).toBe(true);
    expect(v.hasAttribute('playsinline')).toBe(true);
    expect(v.getAttribute('aria-hidden')).toBe('true');
  });

  it('pornește la intrarea în ecran', () => {
    randeaza();
    intersecteaza(true);
    expect(play).toHaveBeenCalledTimes(2);
  });

  it('se oprește la ieșirea din ecran', () => {
    randeaza();
    intersecteaza(true);
    intersecteaza(false);
    expect(pause).toHaveBeenCalledTimes(2);
  });

  it('poster-ul dispare după primul cadru redat', () => {
    const { container } = randeaza();
    expect(container.querySelector('.e3-reel-poster')).not.toBeNull();
    fireEvent.playing(videouri(container)[0]);
    expect(container.querySelectorAll('.e3-reel-poster')).toHaveLength(0);
  });
});

describe('la mișcare redusă', () => {
  it('niciun clip nu pornește singur', () => {
    randeaza(CLIPURI, true);
    intersecteaza(true);
    expect(play).not.toHaveBeenCalled();
  });

  it('butonul de pornire e prezent și pornește clipul', () => {
    randeaza(CLIPURI, true);
    const buton = screen.getByRole('button', { name: /Redă clipul: Marți în parc/ });
    fireEvent.click(buton);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('butonul RĂMÂNE după pornire și devine oprire — clipul e în buclă', () => {
    const { container } = randeaza(CLIPURI, true);
    fireEvent.click(screen.getByRole('button', { name: /Redă clipul: Marți în parc/ }));
    // Fără asta, cine a cerut mai puțină mișcare rămâne cu un clip care se
    // reia la nesfârșit și niciun control cu care să-l oprească.
    fireEvent.playing(videouri(container)[0]);

    const oprire = screen.getByRole('button', { name: /Oprește clipul: Marți în parc/ });
    fireEvent.click(oprire);
    expect(pause).toHaveBeenCalledTimes(1);
  });

  it('după oprire redevine buton de pornire', () => {
    const { container } = randeaza(CLIPURI, true);
    const video = videouri(container)[0];
    fireEvent.click(screen.getByRole('button', { name: /Redă clipul: Marți în parc/ }));
    fireEvent.playing(video);
    fireEvent.pause(video);
    expect(screen.getByRole('button', { name: /Redă clipul: Marți în parc/ })).toBeDefined();
  });

  it('fără mișcare redusă, butonul nu există — nu e nimic de apăsat', () => {
    randeaza();
    expect(screen.queryByRole('button', { name: /Redă clipul/ })).toBeNull();
  });
});

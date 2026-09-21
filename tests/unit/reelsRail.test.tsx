import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ReelsRail } from '../../src/components/landing/ReelsRail';
import type { Reel } from '../../src/lib/supabase';

/**
 * Caruselul cu clipurile de antrenament.
 *
 * Ce se păzește aici e comportamentul pe care nicio poartă e2e nu-l prinde cât
 * timp banda livrată e goală: UN SINGUR player viu la un moment dat, pe cardul
 * centrat, montat abia când șina se apropie de ecran și demontat când pleacă.
 *
 * „Demontat", nu „ascuns": un player YouTube costă în jurul unui megaoctet, iar
 * patru carduri care redau simultan coboară pagina la ~37 fps. Numărul de
 * `iframe`-uri din DOM E contractul, de aceea se numără direct.
 *
 * jsdom n-are `IntersectionObserver` și nici dimensiuni reale, deci ambele sunt
 * stub-uite: observatoarele ca în `sectionLayout.test.tsx`, iar
 * `getBoundingClientRect` cu o geometrie în care fiecare card ocupă o fâșie
 * previzibilă, ca alegerea centrului să fie verificabilă.
 */

const CLIPURI: Reel[] = [
  {
    youtube: 'dQw4w9WgXcQ',
    caption: 'Marți în parc',
    url: 'https://www.instagram.com/reel/AAAAA11111/',
  },
  {
    youtube: '_-Ab0123456',
    caption: 'Circuit funcțional',
    url: 'https://www.instagram.com/reel/BBBBB22222/',
  },
  {
    youtube: 'ZZZZ9999888',
    caption: 'Forță pe scări',
    url: 'https://www.instagram.com/reel/CCCCC33333/',
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

/**
 * Geometrie falsă: șina e lată de 300, fiecare card de 100. Cardul `i` ocupă
 * [i*100 - scrollLeft, …], deci cu `scrollLeft = 0` centrul șinei (150) cade pe
 * cardul 1, iar derularea mută centrul previzibil.
 */
const geometrie = (container: HTMLElement) => {
  const sina = container.querySelector('.e3-reels-rail') as HTMLElement | null;
  if (!sina) return null;
  sina.getBoundingClientRect = () =>
    ({ left: 0, width: 300, right: 300, top: 0, height: 500, bottom: 500 }) as DOMRect;
  const carduri = Array.from(container.querySelectorAll('.e3-reels-item')) as HTMLElement[];
  carduri.forEach((card, i) => {
    card.getBoundingClientRect = () =>
      ({
        left: i * 100 - sina.scrollLeft,
        width: 100,
        right: i * 100 + 100 - sina.scrollLeft,
        top: 0,
        height: 500,
        bottom: 500,
      }) as DOMRect;
  });
  return sina;
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const randeaza = (reels: Reel[] = CLIPURI, miscareRedusa = false) => {
  monteazaStuburi(miscareRedusa);
  const r = render(
    <ReelsRail reels={reels} num="05" headline="Instagram" body="Filmate pe teren." />
  );
  geometrie(r.container);
  return r;
};

/**
 * Trece toate elementele observate prin viewport, într-o direcție sau alta.
 *
 * `act`: observatorul schimbă STARE, spre deosebire de versiunea cu `<video>`,
 * unde apela `play()` imperativ. Fără el, randarea nu se aplică până la
 * următoarea aserțiune și numărătoarea de `iframe`-uri e mereu zero.
 */
const intersecteaza = (isIntersecting: boolean) => {
  act(() => {
    for (const o of observatoare) {
      o.cb(o.elemente.map((target) => ({ target, isIntersecting })));
    }
  });
};

const iframeuri = (c: HTMLElement) => Array.from(c.querySelectorAll('iframe'));

describe('randarea', () => {
  it('un card per clip', () => {
    const { container } = randeaza();
    expect(container.querySelectorAll('.e3-reels-item')).toHaveLength(3);
  });

  it('lista goală nu randează nimic', () => {
    const { container } = randeaza([]);
    expect(container.querySelector('.e3-reels')).toBeNull();
  });

  it('legenda și linkul stau sub card, nu peste imagine', () => {
    const { container } = randeaza();
    const legenda = container.querySelector('.e3-reel-caption');
    expect(legenda?.textContent).toContain('Marți în parc');
  });

  it('fiecare card duce spre postarea de pe Instagram, nu spre YouTube', () => {
    randeaza();
    const link = screen.getAllByRole('link', { name: /Deschide pe Instagram/ })[0];
    expect(link.getAttribute('href')).toBe('https://www.instagram.com/reel/AAAAA11111/');
    expect(link.getAttribute('href')).not.toContain('youtube');
  });

  it('cardul care nu redă poartă marcajul desenat, nu o casetă goală', () => {
    const { container } = randeaza();
    expect(container.querySelectorAll('.e3-reel-fallback')).toHaveLength(3);
  });
});

describe('nimic nu se descarcă înainte de ecran', () => {
  it('la montare nu există niciun player', () => {
    const { container } = randeaza();
    expect(iframeuri(container)).toHaveLength(0);
  });

  it('niciun card nu poartă `src` spre gazdă înainte de intersecție', () => {
    const { container } = randeaza();
    expect(container.innerHTML).not.toContain('youtube');
  });
});

describe('un singur player, pe cardul centrat', () => {
  it('intersecția pornește exact un player', () => {
    const { container } = randeaza();
    intersecteaza(true);
    expect(iframeuri(container)).toHaveLength(1);
  });

  it('playerul se montează pe cardul din centrul șinei', () => {
    const { container } = randeaza();
    intersecteaza(true);
    const carduri = Array.from(container.querySelectorAll('.e3-reels-item'));
    expect(carduri[1].querySelector('iframe')).not.toBeNull();
    expect(carduri[0].querySelector('iframe')).toBeNull();
    expect(carduri[2].querySelector('iframe')).toBeNull();
  });

  it('derularea mută playerul, fără să adauge altul', () => {
    const { container } = randeaza();
    intersecteaza(true);
    const sina = container.querySelector('.e3-reels-rail') as HTMLElement;

    sina.scrollLeft = 100;
    act(() => {
      fireEvent.scroll(sina);
      vi.advanceTimersByTime(200);
    });

    const carduri = Array.from(container.querySelectorAll('.e3-reels-item'));
    expect(iframeuri(container)).toHaveLength(1);
    expect(carduri[2].querySelector('iframe')).not.toBeNull();
    expect(carduri[1].querySelector('iframe')).toBeNull();
  });

  it('ieșirea șinei de pe ecran demontează playerul', () => {
    const { container } = randeaza();
    intersecteaza(true);
    expect(iframeuri(container)).toHaveLength(1);
    intersecteaza(false);
    expect(iframeuri(container)).toHaveLength(0);
  });
});

describe('forma playerului', () => {
  const player = () => {
    const { container } = randeaza();
    intersecteaza(true);
    return iframeuri(container)[0];
  };

  it('merge pe gazda fără cookie, cu identificatorul cardului centrat', () => {
    const src = player().getAttribute('src') ?? '';
    expect(src).toContain('https://www.youtube-nocookie.com/embed/_-Ab0123456');
  });

  it('pornește mut și în buclă', () => {
    const src = player().getAttribute('src') ?? '';
    expect(src).toContain('autoplay=1');
    expect(src).toContain('mute=1');
    expect(src).toContain('loop=1');
  });

  it('deleagă autoplay — fără asta antetul paginii îl blochează', () => {
    expect(player().getAttribute('allow')).toContain('autoplay');
  });

  it('are un titlu: e conținut focalizabil, nu decor', () => {
    expect(player().getAttribute('title')).toBe('Circuit funcțional');
  });
});

describe('la mișcare redusă', () => {
  it('nimic nu pornește singur, nici după intersecție', () => {
    const { container } = randeaza(CLIPURI, true);
    intersecteaza(true);
    expect(iframeuri(container)).toHaveLength(0);
  });

  it('butonul de pornire montează playerul cardului lui', () => {
    const { container } = randeaza(CLIPURI, true);
    intersecteaza(true);
    fireEvent.click(screen.getByLabelText(/Redă clipul: Marți în parc/));
    const carduri = Array.from(container.querySelectorAll('.e3-reels-item'));
    expect(carduri[0].querySelector('iframe')).not.toBeNull();
    expect(iframeuri(container)).toHaveLength(1);
  });

  it('a doua apăsare îl demontează — un clip în buclă trebuie să poată fi oprit', () => {
    const { container } = randeaza(CLIPURI, true);
    fireEvent.click(screen.getByLabelText(/Redă clipul: Marți în parc/));
    expect(iframeuri(container)).toHaveLength(1);
    fireEvent.click(screen.getByLabelText(/Oprește clipul: Marți în parc/));
    expect(iframeuri(container)).toHaveLength(0);
  });

  it('pornirea altui card nu lasă două playere', () => {
    const { container } = randeaza(CLIPURI, true);
    fireEvent.click(screen.getByLabelText(/Redă clipul: Marți în parc/));
    fireEvent.click(screen.getByLabelText(/Redă clipul: Forță pe scări/));
    expect(iframeuri(container)).toHaveLength(1);
  });

  it('fără mișcare redusă nu există buton — nu e nimic de apăsat', () => {
    randeaza(CLIPURI, false);
    expect(screen.queryByLabelText(/Redă clipul/)).toBeNull();
  });
});

/**
 * Assets pentru fundalul video FPV (hero-ul landing-ului + „Despre noi").
 */

/** Poster ~87KB — se afișează instant, cât timp se încarcă clipul. */
export const HERO_POSTER = '/fpv-poster.jpg';

/**
 * Sursa video în funcție de ecran: pe mobil (≤640px) un encode mai mic (720p,
 * ~2.7MB), altfel 1080p (~8.4MB). Alegem prin `matchMedia` la randare (app
 * client-only, fără SSR) — fiabil pe toate browserele, spre deosebire de
 * atributul `media` pe `<source>`, care e inconsistent (mai ales în Safari).
 */
export const heroVideoSrc = (): string =>
  typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches
    ? '/fpv-mobile.mp4'
    : '/fpv.mp4';

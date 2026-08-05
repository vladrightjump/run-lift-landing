import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { EDITION } from '../../src/content/edition';
import { META } from '../../src/content/meta';
import { formatRoDate } from '../../src/content/format';

/**
 * Meta de share/SEO derivă din EDITION și se injectează în index.html la build
 * (plugin Vite `transformIndexHtml`). Testul păzește:
 *  1. că derivarea reflectă EDITION (title/descriere/og image cu versiune);
 *  2. că index.html chiar folosește placeholder-ele (nu valori hardcodate care ar
 *     rămâne în urmă la ediție nouă) — regresia „meta rămasă pe ediția veche".
 */

// `new URL(..., import.meta.url)` e transformat de Vite în referință de asset
// (URL servit din root), deci nu poate fi citit de pe disc. Rezolvăm calea din
// calea fișierului de test.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const indexHtml = readFileSync(resolve(repoRoot, 'index.html'), 'utf8');

describe('META derivat din EDITION', () => {
  it('titlul conține brandul, numele evenimentului și data', () => {
    expect(META.title).toBe(
      `${EDITION.brand} — ${EDITION.eventName} · ${formatRoDate(EDITION.start)}`
    );
  });

  it('descrierea conține data și locația ediției', () => {
    expect(META.description).toContain(formatRoDate(EDITION.start));
    expect(META.description).toContain(EDITION.venue.name);
  });

  it('og:image are versiunea din EDITION (anti-cache la share)', () => {
    expect(META.ogImage).toBe(`${EDITION.urls.site}/og.png?v=${EDITION.ogImageVersion}`);
  });

  it('url-ul canonic e site-ul din EDITION', () => {
    expect(META.url).toBe(EDITION.urls.site);
  });
});

describe('index.html folosește placeholder-e (nu meta hardcodată)', () => {
  it('conține placeholder-ele de meta', () => {
    for (const ph of ['%META_TITLE%', '%META_DESCRIPTION%', '%META_OG_IMAGE%', '%META_URL%']) {
      expect(indexHtml).toContain(ph);
    }
  });

  it('nu mai conține un og:image cu versiune hardcodată', () => {
    // Placeholder-ul %META_OG_IMAGE% aduce versiunea; un `og.png?v=<număr>` scris
    // de mână ar drifta de la EDITION.
    expect(indexHtml).not.toMatch(/og\.png\?v=\d+/);
  });
});

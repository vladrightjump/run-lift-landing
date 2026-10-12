import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { makeRouter } from './router';
import { ROUTE_PATHS } from './routes';

// Potrivirea și canonicalizarea aparțin routerului; randarea paginilor și
// cererile lor sunt caracterizate o singură dată, în spec-ul de browser.
describe('routerul aplicației', () => {
  it('înregistrează exact paginile din registrul canonic', () => {
    const router = makeRouter(createMemoryHistory({ initialEntries: ['/'] }));
    expect(Object.keys(router.routesByPath).sort()).toEqual([...ROUTE_PATHS].sort());
  });

  it.each(['/admin/', '/admin///'])('potrivește %s fără să schimbe adresa publică', (path) => {
    const href = `${path}?config=draft#livrare`;
    const router = makeRouter(createMemoryHistory({ initialEntries: [href] }));
    const matches = router.matchRoutes(router.latestLocation);
    expect(matches.at(-1)?.fullPath).toBe('/admin');
    expect(router.latestLocation.publicHref).toBe(href);
    expect(router.buildLocation({ to: '/admin', search: true, hash: true }).publicHref).toBe(href);
  });

  it.each(['landing', 'soon', 'leaderboard', 'next'])('validează preview=%s', (preview) => {
    const router = makeRouter(createMemoryHistory({ initialEntries: [`/?preview=${preview}&config=draft`] }));
    const matches = router.matchRoutes(router.latestLocation);
    expect(matches.at(-1)?.search).toMatchObject({ preview, config: 'draft' });
  });

  it.each([
    '/?preview=necunoscut&config=draft#format',
    '/?preview=soon&preview=landing&config=draft#format',
    '/confirmare?token=123e4567-e89b-42d3-a456-426614174000&origine=a%20b#email',
  ])('păstrează query și hash la canonicalizarea %s', (href) => {
    const router = makeRouter(createMemoryHistory({ initialEntries: [href] }));
    expect(router.buildLocation({
      to: router.latestLocation.pathname,
      search: true,
      hash: true,
      _includeValidateSearch: true,
    }).publicHref).toBe(href);
  });

  it('o cale necunoscută sau cu majuscule folosește fallback-ul rădăcinii', () => {
    for (const path of ['/pagina-necunoscuta', '/ADMIN']) {
      const router = makeRouter(createMemoryHistory({ initialEntries: [path] }));
      const matches = router.matchRoutes(router.latestLocation);
      expect(matches).toHaveLength(1);
      expect(matches[0]?.routeId).toBe('__root__');
    }
  });
});

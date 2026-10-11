import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  HOMEPAGE_IMPLICIT,
  loadPublicHomepage,
  parseHomepage,
} from '../../src/lib/homepagePublic';

/**
 * Ce citește site-ul din `public_homepage()`. Orice răspuns ciudat cade pe
 * implicit (antrenamentul primul, locul din cod), fiindcă ordinea și locul sunt
 * decor: o eroare aici nu are voie să strice homepage-ul sau `/despre-noi`.
 */

describe('parseHomepage', () => {
  it('citește ordinea și locul', () => {
    expect(parseHomepage({ trial_first: true, training_location: 'Sala Ironworks' })).toEqual({
      trialFirst: true,
      trainingLocation: 'Sala Ironworks',
    });
  });

  it('taie spațiile din jurul locului', () => {
    expect(parseHomepage({ trial_first: false, training_location: '  Parcul X  ' }).trainingLocation).toBe(
      'Parcul X'
    );
  });

  it('loc gol, lipsă sau de alt tip: fără loc', () => {
    for (const loc of ['', '   ', null, undefined, 42]) {
      expect(parseHomepage({ trial_first: false, training_location: loc }).trainingLocation).toBeNull();
    }
  });

  it('loc mai lung decât permite botul (120): fără loc', () => {
    expect(parseHomepage({ trial_first: false, training_location: 'x'.repeat(121) }).trainingLocation).toBeNull();
  });

  it('ordinea trebuie să fie exact `true` ca proba să urce', () => {
    expect(parseHomepage({ trial_first: 'true' }).trialFirst).toBe(false);
    expect(parseHomepage({ trial_first: 1 }).trialFirst).toBe(false);
  });

  it('răspuns care nu e obiect: implicitul', () => {
    for (const r of [null, undefined, 'x', [], 3]) expect(parseHomepage(r)).toEqual(HOMEPAGE_IMPLICIT);
  });
});

describe('loadPublicHomepage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cheamă public_homepage și întoarce forma citită', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ trial_first: true, training_location: 'Sala X' }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetch);
    await expect(loadPublicHomepage()).resolves.toEqual({ trialFirst: true, trainingLocation: 'Sala X' });
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/rest\/v1\/rpc\/public_homepage$/);
  });
});

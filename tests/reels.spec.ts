import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { SNAPSHOT_CONFIG } from '../src/content/eventConfig';

/**
 * Secțiunea „Instagram" de pe landing.
 *
 * Ce se păzește aici NU mai e „până la primul click", ci „niciodată": clipurile
 * sunt fișiere proprii, servite de pe aceeași origine, deci pagina nu cere
 * absolut nimic de la `instagram.com` — nici script, nici imagine, nici cookie,
 * indiferent ce face vizitatorul. Singurul lucru care duce acolo e linkul de
 * sub card.
 *
 * Clipurile vin din `public_training_reels()`, administrat din `/admin`. E
 * mock-uit aici, la fel ca `public_config` și `public_stats`, deci nimic nu
 * atinge baza reală și ambele stări — bandă plină și bandă goală — se pot
 * verifica de la capăt.
 */


const CONFIG_ROUTE = '**/rest/v1/rpc/public_config';
const STATS_ROUTE = '**/rest/v1/rpc/public_stats';
const REELS_ROUTE = '**/rest/v1/rpc/public_training_reels';

/** Un clip valid, așa cum îl dă RPC-ul public. */
const UN_CLIP = {
  video: '/reels/marti.mp4',
  poster: '/reels/marti.jpg',
  caption: 'Marți dimineața',
  url: 'https://www.instagram.com/reel/AAAAA11111/',
};

const configCu = (layout: { key: string; visible: boolean }[]) => ({
  ...SNAPSHOT_CONFIG,
  layout,
  reels: { headline: 'Instagram', body: 'Filmate pe teren.' },
});

const mock = (
  page: Page,
  clipuri: (typeof UN_CLIP)[] = [],
  layout = [
    { key: 'format', visible: true },
    { key: 'reels', visible: true },
  ]
) =>
  Promise.all([
    page.route(REELS_ROUTE, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(clipuri),
      })
    ),
    page.route(CONFIG_ROUTE, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(configCu(layout)),
      })
    ),
    page.route(STATS_ROUTE, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, participants: [], waitlist: 0 }),
      })
    ),
  ]);

/** Toate cererile spre Instagram, în ordinea în care au plecat. */
const urmaresteInstagram = (page: Page): string[] => {
  const cereri: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('instagram.com')) cereri.push(r.url());
  });
  return cereri;
};

test.describe('nimic de la Instagram, niciodată', () => {
  test('la încărcare, zero cereri spre instagram.com', async ({ page }) => {
    const cereri = urmaresteInstagram(page);
    await mock(page);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Formatul' })).toBeVisible();
    // Lăsăm pagina să se așeze: un embed leneș ar apărea aici, nu instant.
    await page.waitForTimeout(1000);
    expect(cereri).toEqual([]);
  });

  test('nu există niciun iframe către Instagram pe pagină', async ({ page }) => {
    await mock(page);
    await page.goto('/?preview=landing');
    await expect(page.locator('iframe[src*="instagram.com"]')).toHaveCount(0);
  });
});

test.describe('lista goală nu lasă gaură în numerotare', () => {
  test('secțiunea lipsește, iar „Formatul" rămâne 01', async ({ page }) => {
    await mock(page);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Formatul' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Instagram' })).toHaveCount(0);
    await expect(page.locator('.e3-title-num')).toHaveText(['01']);
  });

  test('ascunsă din layout, tot nu apare', async ({ page }) => {
    await mock(page, [UN_CLIP], [
      { key: 'format', visible: true },
      { key: 'reels', visible: false },
    ]);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Instagram' })).toHaveCount(0);
    await expect(page.locator('.e3-title-num')).toHaveText(['01']);
  });
});

test.describe('cu clipuri în bandă', () => {
  const TREI = [
    UN_CLIP,
    { ...UN_CLIP, video: '/reels/joi.mp4', poster: '', caption: 'Stația de cărat' },
    { ...UN_CLIP, video: '/reels/finish.mp4', poster: '', caption: 'Finish' },
  ];

  test('secțiunea apare și își ia numărul din poziția ei', async ({ page }) => {
    await mock(page, TREI);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Instagram' })).toBeVisible();
    await expect(page.locator('.e3-title-num')).toHaveText(['01', '02']);
  });

  test('fiecare card poartă linkul spre postare, de la început', async ({ page }) => {
    await mock(page, TREI);
    await page.goto('/?preview=landing');

    const linkuri = page.getByRole('link', { name: /Deschide pe Instagram/ });
    await expect(linkuri).toHaveCount(3);
  });

  test('clipurile chiar pornesc singure la intrarea în ecran', async ({ page }) => {
    // Se numără APELURILE de `play()`, nu starea `paused`. Fișierele nu există
    // în `dist` (sînt conținut, nu cod), deci încărcarea eșuează și `paused`
    // revine la `true` imediat — o verificare pe stare ar fi vânat o fereastră
    // de câteva milisecunde. Contractul păzit e legătura observator → `play()`,
    // iar asta se vede direct.
    await page.addInitScript(() => {
      (window as unknown as { playCalls: string[] }).playCalls = [];
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        if (this.classList.contains('e3-reel-video')) {
          (window as unknown as { playCalls: string[] }).playCalls.push(this.getAttribute('src') ?? '');
        }
        return original.call(this);
      };
    });
    await mock(page, TREI);
    await page.goto('/?preview=landing');

    await page.locator('.e3-reel-video').first().scrollIntoViewIfNeeded();
    await expect
      .poll(async () => page.evaluate(() => (window as unknown as { playCalls: string[] }).playCalls), {
        timeout: 5000,
      })
      .toContain('/reels/marti.mp4');
  });

  test('nimic nu se descarcă înainte de ecran', async ({ page }) => {
    await mock(page, TREI);
    await page.goto('/?preview=landing');

    // Clipurile vin prin RPC, deci banda se randează asincron: fără așteptarea
    // asta, `evaluateAll` prinde un DOM în care secțiunea încă nu există și
    // întoarce o listă goală, care ar fi trecut drept „niciun preload greșit".
    await expect(page.locator('.e3-reel-video')).toHaveCount(3);
    const preloads = await page
      .locator('.e3-reel-video')
      .evaluateAll((els) => els.map((e) => e.getAttribute('preload')));
    expect(preloads).toEqual(['none', 'none', 'none']);
  });
});

test.describe('mobil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('textul vine ÎNAINTEA șinei, iar pagina nu derulează orizontal', async ({ page }) => {
    await mock(page, [UN_CLIP, { ...UN_CLIP, video: '/reels/joi.mp4', caption: 'Joi' }]);
    await page.goto('/?preview=landing');

    const titlu = page.getByRole('heading', { name: 'Instagram' });
    await expect(titlu).toBeVisible();

    // O secțiune care începe cu imagini fără titlu nu se citește.
    const yTitlu = (await titlu.boundingBox())!.y;
    const yCard = (await page.locator('.e3-reel').first().boundingBox())!.y;
    expect(yTitlu).toBeLessThan(yCard);

    // Fantoma e lată cât banda; fără `overflow: hidden` ar împinge scroll pe body.
    const latimi = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(latimi.scroll).toBeLessThanOrEqual(latimi.client + 1);
  });

  test('decalajul dispare — la un card și jumătate ar arăta ca un bug', async ({ page }) => {
    await mock(page, [UN_CLIP, { ...UN_CLIP, video: '/reels/joi.mp4', caption: 'Joi' }]);
    await page.goto('/?preview=landing');

    await expect(page.locator('.e3-reels-item')).toHaveCount(2);
    const cutii = await page
      .locator('.e3-reels-item')
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(Math.max(...cutii) - Math.min(...cutii)).toBeLessThan(2);
  });
});

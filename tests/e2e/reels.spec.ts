import { test, expect, type NetworkFixture } from '../support/playwright';
import { rpcResponse } from '../support/responses';
import { publicStats, publicReel } from '../support/builders/public';
import type { Page } from '@playwright/test';
import { publicConfig } from '../support/builders/config';
import type { EventConfig } from '../../src/shared/content/eventConfig';
import { http, HttpResponse } from 'msw';

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

/** Un clip valid, așa cum îl dă RPC-ul public. */
const UN_CLIP = publicReel({ caption: 'Marți dimineața' });

/** Un PNG transparent de 1×1, ca poster servit local. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/** Originea de la care banda cere playerul. */
const GAZDA = 'youtube-nocookie.com';

const TREI = [
  UN_CLIP,
  { ...UN_CLIP, youtube: '_-Ab0123456', caption: 'Stația de cărat' },
  { ...UN_CLIP, youtube: 'ZZZZ9999888', caption: 'Finish' },
];

const mock = (
  network: NetworkFixture,
  clipuri: (typeof UN_CLIP)[] = [],
  layout: EventConfig['layout'] = [
    { key: 'format', visible: true },
    { key: 'reels', visible: true },
  ]
) => network.use(
  // Posterele nu depind de rețea sau de validitatea identificatorului inventat.
  http.get('https://i.ytimg.com/*', () => new HttpResponse(PIXEL, { headers: { 'Content-Type': 'image/png' } })),
  rpcResponse('public_training_reels', clipuri),
  rpcResponse('public_config', publicConfig({ layout, reels: { headline: 'Instagram', body: 'Filmate pe teren.' } })),
  rpcResponse('public_stats', publicStats()),
);

/** Toate cererile spre o gazdă, în ordinea în care au plecat. */
const urmareste = (page: Page, gazda: string): string[] => {
  const cereri: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes(gazda)) cereri.push(r.url());
  });
  return cereri;
};

test.describe('nimic de la Instagram, niciodată', () => {
  test('la încărcare, zero cereri spre instagram.com', async ({ page, network }) => {
    const cereri = urmareste(page, 'instagram.com');
    mock(network);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Formatul' })).toBeVisible();
    // Lăsăm pagina să se așeze: un embed leneș ar apărea aici, nu instant.
    await page.waitForTimeout(1000);
    expect(cereri).toEqual([]);
  });

  test('nu există niciun iframe către Instagram pe pagină', async ({ page, network }) => {
    mock(network, [UN_CLIP]);
    await page.goto('/?preview=landing');
    await expect(page.locator('iframe[src*="instagram.com"]')).toHaveCount(0);
  });

  test('singurul drum spre Instagram e legătura de sub card', async ({ page, network }) => {
    mock(network, [UN_CLIP]);
    await page.goto('/?preview=landing');
    const link = page.getByRole('link', { name: /Deschide pe Instagram/ }).first();
    await expect(link).toHaveAttribute('href', UN_CLIP.url);
  });
});

test.describe('nimic de la gazda video înainte de ecran', () => {
  test('la încărcare, banda nu cere nimic de la gazdă', async ({ page, network }) => {
    // Banda stă sub fold pe landing, deci la încărcare nu are de ce să pornească
    // niciun player. Asta e proprietatea care înlocuiește vechiul „zero cereri
    // terțe": granița s-a mutat, nu a dispărut.
    const cereri = urmareste(page, GAZDA);
    mock(network, TREI);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Formatul' })).toBeVisible();
    await page.waitForTimeout(1000);
    expect(cereri).toEqual([]);
  });
});

test.describe('lista goală nu lasă gaură în numerotare', () => {
  test('secțiunea lipsește, iar „Formatul" rămâne 01', async ({ page, network }) => {
    mock(network);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Formatul' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Instagram' })).toHaveCount(0);
    await expect(page.locator("[data-css~=\"e3-title-num\"]")).toHaveText(['01']);
  });

  test('ascunsă din layout, tot nu apare', async ({ page, network }) => {
    mock(network, [UN_CLIP], [
      { key: 'format', visible: true },
      { key: 'reels', visible: false },
    ]);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Instagram' })).toHaveCount(0);
    await expect(page.locator("[data-css~=\"e3-title-num\"]")).toHaveText(['01']);
  });
});

test.describe('cu clipuri în bandă', () => {
  test('secțiunea apare și își ia numărul din poziția ei', async ({ page, network }) => {
    mock(network, TREI);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Instagram' })).toBeVisible();
    await expect(page.locator("[data-css~=\"e3-title-num\"]")).toHaveText(['01', '02']);
  });

  test('fiecare card poartă linkul spre postare, de la început', async ({ page, network }) => {
    mock(network, TREI);
    await page.goto('/?preview=landing');

    const linkuri = page.getByRole('link', { name: /Deschide pe Instagram/ });
    await expect(linkuri).toHaveCount(3);
  });

  test('derularea până la bandă pornește exact un player', async ({ page, network }) => {
    mock(network, TREI);
    await page.goto('/?preview=landing');

    // Clipurile vin prin RPC, deci banda se randează asincron: fără așteptarea
    // asta, verificarea ar prinde un DOM în care secțiunea încă nu există.
    await expect(page.locator("[data-css~=\"e3-reel\"]")).toHaveCount(3);
    await expect(page.locator(`iframe[src*="${GAZDA}"]`)).toHaveCount(0);

    await page.locator("[data-css~=\"e3-reel\"]").first().scrollIntoViewIfNeeded();

    // UNUL, nu trei. Ăsta e contractul care ține pagina în picioare pe telefon.
    await expect(page.locator(`iframe[src*="${GAZDA}"]`)).toHaveCount(1, { timeout: 5000 });
  });

  test('playerul pornește mut și în buclă', async ({ page, network }) => {
    mock(network, TREI);
    await page.goto('/?preview=landing');
    await expect(page.locator("[data-css~=\"e3-reel\"]")).toHaveCount(3);
    await page.locator("[data-css~=\"e3-reel\"]").first().scrollIntoViewIfNeeded();

    const player = page.locator(`iframe[src*="${GAZDA}"]`).first();
    await expect(player).toHaveCount(1, { timeout: 5000 });
    const src = (await player.getAttribute('src')) ?? '';
    expect(src).toContain('autoplay=1');
    expect(src).toContain('mute=1');
    expect(src).toContain('loop=1');
  });
});

test.describe('caruselul', () => {
  test('săgeata mută playerul pe cardul următor, tot unul singur', async ({ page, network }) => {
    mock(network, TREI);
    await page.goto('/?preview=landing');
    await expect(page.locator("[data-css~=\"e3-reel\"]")).toHaveCount(3);
    await page.locator("[data-css~=\"e3-reels-rail\"]").scrollIntoViewIfNeeded();

    // Pornește pe clipul din mijloc.
    const player = page.locator(`iframe[src*="${GAZDA}"]`);
    await expect(player).toHaveCount(1, { timeout: 5000 });
    await expect(player).toHaveAttribute('src', /_-Ab0123456/);
    await expect(page.locator("[data-css~=\"e3-reels-count-now\"]")).toHaveText('02');

    await page.getByRole('button', { name: 'Clipul următor' }).click();

    await expect(player).toHaveAttribute('src', /ZZZZ9999888/);
    await expect(player).toHaveCount(1);
    await expect(page.locator("[data-css~=\"e3-reels-count-now\"]")).toHaveText('03');
    await expect(page.getByRole('button', { name: 'Clipul următor' })).toBeDisabled();
  });

  test('fiecare card are poster; niciunul nu e casetă goală', async ({ page, network }) => {
    mock(network, TREI);
    await page.goto('/?preview=landing');
    await expect(page.locator("[data-css~=\"e3-reel-poster\"]")).toHaveCount(3);
  });
});

test.describe('mobil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('textul vine ÎNAINTEA șinei, iar pagina nu derulează orizontal', async ({ page, network }) => {
    mock(network, [UN_CLIP, { ...UN_CLIP, youtube: '_-Ab0123456', caption: 'Joi' }]);
    await page.goto('/?preview=landing');

    const titlu = page.getByRole('heading', { name: 'Instagram' });
    await expect(titlu).toBeVisible();

    // O secțiune care începe cu imagini fără titlu nu se citește.
    const yTitlu = (await titlu.boundingBox())!.y;
    const yCard = (await page.locator("[data-css~=\"e3-reel\"]").first().boundingBox())!.y;
    expect(yTitlu).toBeLessThan(yCard);

    // Fantoma e lată cât banda; fără `overflow: hidden` ar împinge scroll pe body.
    const latimi = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(latimi.scroll).toBeLessThanOrEqual(latimi.client + 1);
  });

  test('decalajul dispare — la un card și jumătate ar arăta ca un bug', async ({ page, network }) => {
    mock(network, [UN_CLIP, { ...UN_CLIP, youtube: '_-Ab0123456', caption: 'Joi' }]);
    await page.goto('/?preview=landing');

    await expect(page.locator("[data-css~=\"e3-reels-item\"]")).toHaveCount(2);
    const cutii = await page
      .locator("[data-css~=\"e3-reels-item\"]")
      .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
    expect(Math.max(...cutii) - Math.min(...cutii)).toBeLessThan(2);
  });
});

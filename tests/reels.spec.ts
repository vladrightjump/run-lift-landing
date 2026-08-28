import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { SNAPSHOT_CONFIG } from '../src/content/eventConfig';

/**
 * Banda „Instagram" de pe landing.
 *
 * Cel mai important lucru păzit aici NU e cum arată, ci ce NU se întâmplă:
 * până când vizitatorul nu apasă pe un card, pagina nu cere absolut nimic de la
 * `instagram.com`. Nici script, nici imagine, nici cookie. Testul numără
 * cererile spre domeniul lor și cade dacă apare vreuna la încărcare.
 *
 * `public_config` e mock-uit, deci nimic nu atinge baza reală.
 */

const CONFIG_ROUTE = '**/rest/v1/rpc/public_config';
const STATS_ROUTE = '**/rest/v1/rpc/public_stats';

const CLIPURI = [
  { code: 'AAAAA11111', kind: 'reel', poster: '', caption: 'Marți dimineața' },
  { code: 'BBBBB22222', kind: 'reel', poster: '', caption: 'Stația de cărat' },
  { code: 'CCCCC33333', kind: 'p', poster: '', caption: 'Finish' },
];

const configCu = (items: typeof CLIPURI) => ({
  ...SNAPSHOT_CONFIG,
  layout: [
    { key: 'format', visible: true },
    { key: 'reels', visible: true },
  ],
  reels: { headline: 'Instagram', body: 'Filmate pe teren.', items },
});

const mock = (page: Page, items = CLIPURI) =>
  Promise.all([
    page.route(CONFIG_ROUTE, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(configCu(items)),
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

test.describe('nimic de la Instagram până la click', () => {
  test('la încărcare, zero cereri spre instagram.com', async ({ page }) => {
    const cereri = urmaresteInstagram(page);
    await mock(page);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Instagram' })).toBeVisible();
    // Lăsăm pagina să se așeze: un embed leneș ar apărea aici, nu instant.
    await page.waitForTimeout(1000);
    expect(cereri).toEqual([]);
  });

  test('clicul montează iframe-ul, și abia atunci pleacă cererea', async ({ page }) => {
    const cereri = urmaresteInstagram(page);
    await mock(page);
    await page.goto('/?preview=landing');

    await page.getByRole('button', { name: /Redă clipul: Marți dimineața/ }).click();

    const frame = page.locator('.e3-reel-frame');
    await expect(frame).toHaveAttribute(
      'src',
      'https://www.instagram.com/reel/AAAAA11111/embed/'
    );
    await expect.poll(() => cereri.length).toBeGreaterThan(0);
  });

  test('un singur iframe montat odată', async ({ page }) => {
    await mock(page);
    await page.goto('/?preview=landing');

    await page.getByRole('button', { name: /Redă clipul: Marți dimineața/ }).click();
    await expect(page.locator('.e3-reel-frame')).toHaveCount(1);

    await page.getByRole('button', { name: /Redă clipul: Stația de cărat/ }).click();
    // Cel dinainte a fost demontat, nu s-a adăugat unul lângă.
    await expect(page.locator('.e3-reel-frame')).toHaveCount(1);
    await expect(page.locator('.e3-reel-frame')).toHaveAttribute(
      'src',
      'https://www.instagram.com/reel/BBBBB22222/embed/'
    );
  });
});

test.describe('plasa de siguranță și rutele', () => {
  test('fiecare card poartă linkul canonic, de la început', async ({ page }) => {
    await mock(page);
    await page.goto('/?preview=landing');

    const linkuri = page.getByRole('link', { name: /Deschide pe Instagram/ });
    await expect(linkuri).toHaveCount(3);
    // O postare rămâne pe ruta „/p/": Instagram n-o servește pe cealaltă.
    await expect(linkuri.nth(2)).toHaveAttribute(
      'href',
      'https://www.instagram.com/p/CCCCC33333/'
    );
  });
});

test.describe('secțiunea nu lasă gaură în numerotare', () => {
  test('fără clipuri, dispare, iar „Formatul" rămâne 01', async ({ page }) => {
    await mock(page, []);
    await page.goto('/?preview=landing');

    await expect(page.getByRole('heading', { name: 'Formatul' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Instagram' })).toHaveCount(0);
    await expect(page.locator('.e3-title-num')).toHaveText(['01']);
  });

  test('cu clipuri, ia numărul 02 din poziția ei', async ({ page }) => {
    await mock(page);
    await page.goto('/?preview=landing');
    await expect(page.locator('.e3-title-num')).toHaveText(['01', '02']);
  });
});

test.describe('mobil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('textul vine ÎNAINTEA șinei, iar pagina nu derulează orizontal', async ({ page }) => {
    await mock(page);
    await page.goto('/?preview=landing');

    const titlu = page.getByRole('heading', { name: 'Instagram' });
    await expect(titlu).toBeVisible();

    // Titlul secțiunii trebuie să stea deasupra primului card: o secțiune care
    // începe cu imagini fără titlu nu se citește.
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
    await mock(page);
    await page.goto('/?preview=landing');

    const cutii = await page.locator('.e3-reels-item').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().top)
    );
    // Toate cardurile pornesc de la aceeași înălțime.
    expect(Math.max(...cutii) - Math.min(...cutii)).toBeLessThan(2);
  });
});

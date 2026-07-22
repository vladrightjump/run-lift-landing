import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Landing-ul Ediției a treia („Up + Down") — conținut + logica de reveal.
 * public_stats e mock-uit (fără DB reală). Ceasul e fixat înainte de eveniment
 * (dar avansează), ca să fie și după ora lansării (deci „/" arată landing-ul),
 * și înainte de eveniment (deci countdown-ul de start e activ).
 */

const STATS_ROUTE = '**/rest/v1/rpc/public_stats';
const EMPTY = { count: 0, participants: [], waitlist: 0 };

const mockStats = (page: Page, body: unknown) =>
  page.route(STATS_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const base = new Date('2026-07-23T10:00:00+03:00').getTime();
    const start = performance.now();
    Date.now = () => base + (performance.now() - start);
  });
  await mockStats(page, EMPTY);
});

test.describe('App — comutarea Coming Soon ↔ landing', () => {
  test('?preview=soon forțează Coming Soon', async ({ page }) => {
    await page.goto('/?preview=soon');
    await expect(page.locator('.cs-root')).toBeVisible();
    await expect(page.locator('#inscriere')).toHaveCount(0);
  });

  test('?preview=landing forțează landing-ul', async ({ page }) => {
    await page.goto('/?preview=landing');
    await expect(page.locator('#inscriere')).toBeVisible();
    await expect(page.locator('.cs-root')).toHaveCount(0);
  });

  test('după ora lansării, „/" arată singur landing-ul (fără param)', async ({ page }) => {
    // Ceasul din beforeEach (23 iulie) e deja după LAUNCH_DATE (22 iulie 18:00).
    await page.goto('/');
    await expect(page.locator('#inscriere')).toBeVisible();
    await expect(page.locator('.cs-root')).toHaveCount(0);
  });
});

test.describe('Landing — conținut', () => {
  test('topbar: countdown de start (role=timer) care avansează', async ({ page }) => {
    await page.goto('/?preview=landing');
    const timer = page.getByRole('timer');
    await expect(timer).toBeVisible();
    const first = await timer.textContent();
    await expect(timer).not.toHaveText(first ?? '', { timeout: 3000 });
  });

  test('hero: „Up + Down" și subtitlul ediției (25 iulie, ediția a treia)', async ({ page }) => {
    await page.goto('/?preview=landing');
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toContainText('Up');
    await expect(h1).toContainText('Down');
    await expect(
      page.getByText(/25 iulie 2026 · Parcul Râșcani, Chișinău · Ediția a treia/i)
    ).toBeVisible();
  });

  test('format: cardurile RUN / LIFT / REPEAT', async ({ page }) => {
    await page.goto('/?preview=landing');
    for (const t of ['RUN', 'LIFT', 'REPEAT']) {
      await expect(page.getByText(t, { exact: true })).toBeVisible();
    }
  });

  test('locația: data, adresa și ora de start', async ({ page }) => {
    await page.goto('/?preview=landing');
    await expect(page.getByText('Parcul Râșcani, Strada Braniștii, Chișinău')).toBeVisible();
    await expect(page.getByText(/25 iulie 2026/).first()).toBeVisible();
    await expect(page.getByText('07:00', { exact: true })).toBeVisible();
  });

  test('footer: organizatorii și Instagramul comunității', async ({ page }) => {
    await page.goto('/?preview=landing');
    await expect(page.getByText('+373 69 509 949')).toBeVisible();
    await expect(page.getByRole('link', { name: '@we_run_and_lift' })).toHaveAttribute(
      'href',
      /instagram\.com\/we_run_and_lift/
    );
  });

  test('nu are scroll orizontal pe mobil (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/?preview=landing');
    await expect(page.locator('#inscriere')).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Landing — lista de participanți (din public_stats)', () => {
  test('afișează numele mascate și numărul când există înscriși', async ({ page }) => {
    await mockStats(page, {
      count: 2,
      participants: [
        { nume: 'Vlad F.', echipa: '' },
        { nume: 'Ana P.', echipa: '' },
      ],
      waitlist: 0,
    });
    await page.goto('/?preview=landing');

    await expect(page.getByText('Vlad F.')).toBeVisible();
    await expect(page.getByText('Ana P.')).toBeVisible();
    await expect(page.getByText('2 / 20')).toBeVisible();
  });

  test('gol → mesajul „fii primul"', async ({ page }) => {
    await mockStats(page, EMPTY);
    await page.goto('/?preview=landing');
    await expect(page.getByText(/fii primul/i)).toBeVisible();
  });
});

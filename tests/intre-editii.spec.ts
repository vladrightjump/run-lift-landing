import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { deriveEditionDates, INSTAGRAM_URL } from '../src/lib/config';
import { SNAPSHOT_CONFIG } from '../src/content/eventConfig';

/**
 * Ecranul dintre ediții: homepage-ul după finalul cursei, până când o ediție
 * nouă devine activă. Proba e primul bloc, apoi antrenamentul săptămânii,
 * unde și când ne antrenăm și banda ediției următoare. Fără countdown.
 *
 * Tot backend-ul e mock-uit: configul probei, programul și formularul.
 */

const { EVENT_END_DATE } = deriveEditionDates(SNAPSHOT_CONFIG);
const DUPA_CURSA = EVENT_END_DATE.getTime() + 60_000;

const fixClock = (page: Page, moment: number) =>
  page.addInitScript((fixed) => {
    Date.now = () => fixed;
  }, moment);

type Raspunsuri = { proba?: unknown; program?: unknown; programStatus?: number };

const mockBackend = (page: Page, { proba, program, programStatus = 200 }: Raspunsuri = {}) =>
  page.route('**/rest/v1/rpc/*', (route: Route) => {
    const nume = route.request().url().split('/').pop();
    if (nume === 'public_trial_config')
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(proba ?? { enabled: true, bot_username: 'ParkTrialBot', contact_text: '' }),
      });
    if (nume === 'public_weekly_workouts')
      return route.fulfill({
        status: programStatus,
        contentType: 'application/json',
        body: JSON.stringify(program ?? [{ numar: 3, titlu: 'Intervale 3', corp: 'ÎNCĂLZIRE\n5 min' }]),
      });
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

const titluProba = (page: Page) =>
  page.getByRole('heading', { name: 'Primul tău antrenament cu noi.' });

test.describe('Ecranul dintre ediții', () => {
  test('după cursă: proba, antrenamentul, unde și când, banda — în ordinea asta', async ({ page }) => {
    await mockBackend(page);
    await fixClock(page, DUPA_CURSA);
    await page.goto('/');

    const blocuri = [
      titluProba(page),
      page.locator('.cs-antren'),
      page.locator('.ie-orar'),
      page.locator('.ie-banda'),
    ];
    for (const bloc of blocuri) await expect(bloc).toBeVisible();
    const pozitii = await Promise.all(
      blocuri.map(async (b) => (await b.boundingBox())?.y ?? -1)
    );
    expect(pozitii).toEqual([...pozitii].sort((a, b) => a - b));
    await expect(page.getByRole('timer')).toHaveCount(0);
  });

  test('banda anunță ediția fără dată și deschide formularul de notificare', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/?preview=next');

    const banda = page.locator('.ie-banda');
    await expect(banda).toContainText('anunțăm curând');
    await banda.getByRole('button', { name: 'Anunță-mă' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
  });

  test('unde și când arată zilele, locul și ora, cu link spre /despre-noi', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/?preview=next');

    const orar = page.locator('.ie-orar');
    await expect(orar).toContainText('Marți și joi');
    await expect(orar).toContainText('06:30');
    await expect(orar.getByRole('link')).toHaveAttribute('href', '/despre-noi');
  });

  test('botul oprit: același titlu, butonul duce la Instagram', async ({ page }) => {
    await mockBackend(page, { proba: { enabled: false, bot_username: 'ParkTrialBot', contact_text: '' } });
    await page.goto('/?preview=next');

    await expect(titluProba(page)).toBeVisible();
    const sectiune = page.getByRole('region', { name: 'Primul tău antrenament cu noi.' });
    await expect(sectiune.getByRole('link', { name: /Scrie-ne pe Instagram/ })).toHaveAttribute('href', INSTAGRAM_URL);
    await expect(page.locator('a[href^="https://t.me/"]')).toHaveCount(0);
  });

  test('configul probei nu răspunde: după limită apare butonul Instagram', async ({ page }) => {
    await mockBackend(page);
    // Rută înregistrată după mockBackend, deci câștigă: cererea rămâne fără răspuns.
    await page.route('**/rest/v1/rpc/public_trial_config', () => new Promise(() => {}));
    await page.goto('/?preview=next');

    await expect(titluProba(page)).toBeVisible();
    const sectiune = page.getByRole('region', { name: 'Primul tău antrenament cu noi.' });
    await expect(sectiune.getByRole('link')).toHaveCount(0);
    await expect(sectiune.getByRole('link', { name: /Scrie-ne pe Instagram/ })).toBeVisible({ timeout: 8000 });
  });

  test('fără program sau cu eroare la program, cardul lipsește și restul rămâne', async ({ page }) => {
    await mockBackend(page, { program: { message: 'boom' }, programStatus: 500 });
    await page.goto('/?preview=next');

    await expect(titluProba(page)).toBeVisible();
    await expect(page.locator('.ie-orar')).toBeVisible();
    await expect(page.locator('.ie-banda')).toBeVisible();
    await expect(page.locator('.cs-antren')).toHaveCount(0);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test('teaser-ul de dinainte de anunț rămâne Coming Soon', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/?preview=soon');

    await expect(page.locator('.cs-title')).toContainText('Coming');
    await expect(page.locator('.ie-banda')).toHaveCount(0);
  });
});

test.describe('pe telefon (375×667)', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('titlul probei și butonul încap în primul ecran, fără scroll orizontal', async ({ page }) => {
    await mockBackend(page);
    await page.goto('/?preview=next');

    const buton = page.getByRole('link', { name: /Vreau la un antrenament/ }).first();
    await expect(buton).toBeVisible();
    const cutie = await buton.boundingBox();
    expect(cutie).not.toBeNull();
    expect((cutie?.y ?? 0) + (cutie?.height ?? 0)).toBeLessThanOrEqual(667);
    const depasire = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(depasire).toBeLessThanOrEqual(0);
  });
});

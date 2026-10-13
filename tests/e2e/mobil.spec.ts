import { test, expect, type NetworkFixture } from '../support/playwright';
import { rpcResponse } from '../support/responses';
import { publicStats } from '../support/builders/public';
import type { Page } from '@playwright/test';

/**
 * Confortul pe telefon, pentru ambele intrări în formular (linkul direct și
 * landing-ul). Regula păzită aici e cea care nu se vede în niciun alt test:
 *
 *   un input sub 16px face Safari pe iOS să dea zoom la focus, iar layoutul
 *   sare în lateral la jumătatea completării.
 *
 * E ușor de reintrodus din greșeală, fiindcă stilurile sunt inline (deci bat
 * orice regulă din CSS) — de aici testul.
 */

const MIN_FONT_PX = 16;
const IPHONE = { width: 375, height: 812 };

test.use({ viewport: IPHONE });

const fixClock = (page: Page) =>
  page.addInitScript(() => {
    const fixed = new Date('2026-08-06T10:00:00+03:00').getTime();
    Date.now = () => fixed;
  });

const mockStats = (network: NetworkFixture) =>
  network.use(rpcResponse('public_stats', publicStats()));

const INTRARI = [
  { nume: 'linkul direct /inscriere', url: '/inscriere' },
  { nume: 'formularul de pe landing', url: '/?preview=landing' },
] as const;

for (const { nume, url } of INTRARI) {
  test(`${nume}: niciun câmp sub ${MIN_FONT_PX}px, deci fără zoom la focus`, async ({ page, network }) => {
    await fixClock(page);
    mockStats(network);
    await page.goto(url);

    await expect(page.locator('form input:not([type=hidden]):not([type=checkbox])').first()).toBeVisible();

    const campuri = await page
      .locator('form input:not([type=hidden]):not([type=checkbox])')
      .evaluateAll((els) =>
        els.map((e) => ({
          name: (e as HTMLInputElement).name || (e as HTMLInputElement).placeholder,
          px: parseFloat(getComputedStyle(e).fontSize),
        }))
      );

    expect(campuri.length).toBeGreaterThan(0);
    for (const camp of campuri) {
      expect(camp.px, `„${camp.name}" e ${camp.px}px — sub ${MIN_FONT_PX} iOS dă zoom`).toBeGreaterThanOrEqual(
        MIN_FONT_PX
      );
    }
  });

  test(`${nume}: fără scroll orizontal la ${IPHONE.width}px`, async ({ page, network }) => {
    await fixClock(page);
    mockStats(network);
    await page.goto(url);

    await expect(page.locator('form input:not([type=hidden]):not([type=checkbox])').first()).toBeVisible();

    const depasire = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(depasire).toBeLessThanOrEqual(0);
  });
}

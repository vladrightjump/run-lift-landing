import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

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

const mockStats = (page: Page) =>
  page.route('**/rest/v1/rpc/public_stats', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: 0, participants: [], waitlist: 0 }),
    })
  );

const INTRARI = [
  { nume: 'linkul direct /inscriere', url: '/inscriere' },
  { nume: 'formularul de pe landing', url: '/?preview=landing' },
] as const;

for (const { nume, url } of INTRARI) {
  test(`${nume}: niciun câmp sub ${MIN_FONT_PX}px, deci fără zoom la focus`, async ({ page }) => {
    await fixClock(page);
    await mockStats(page);
    await page.goto(url);

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

  test(`${nume}: fără scroll orizontal la ${IPHONE.width}px`, async ({ page }) => {
    await fixClock(page);
    await mockStats(page);
    await page.goto(url);

    const depasire = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(depasire).toBeLessThanOrEqual(0);
  });
}

/**
 * Butonul „Înscrie-te" din antet, pe lățimi de telefon.
 *
 * Regresia păzită: `white-space: nowrap` oprea ruperea pe două rânduri, dar NU
 * și micșorarea cutiei. Flex-ul îngusta butonul sub lățimea textului, textul
 * ieșea din el, iar pe iPhone se citea „Înscri". Cutia încăpea în ecran, deci
 * nici testul de scroll orizontal, nici cel de vizibilitate nu-l prindeau — de
 * aceea aserțiunea e pe `scrollWidth` vs `clientWidth`, nu pe poziție.
 *
 * 320px e cea mai îngustă lățime pe care o mai servește iOS (iPhone SE 1).
 */
const LATIMI_TELEFON = [320, 375, 390, 430] as const;

for (const latime of LATIMI_TELEFON) {
  test(`antet @${latime}px: „Înscrie-te" se vede întreg și nu iese din ecran`, async ({ page }) => {
    await page.setViewportSize({ width: latime, height: 812 });
    await fixClock(page);
    await mockStats(page);
    await page.goto('/?preview=landing');

    const cta = page.locator('header a').filter({ hasText: /înscrie-te/i }).first();
    await expect(cta).toBeVisible();

    const m = await cta.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        taiat: el.scrollWidth > el.clientWidth + 1,
        stanga: r.left,
        dreapta: r.right,
        latimeEcran: window.innerWidth,
        scrollOrizontal: document.documentElement.scrollWidth > window.innerWidth,
      };
    });

    expect(m.taiat, 'textul butonului e mai lat decât butonul — apare tăiat').toBe(false);
    expect(m.stanga).toBeGreaterThanOrEqual(0);
    expect(m.dreapta).toBeLessThanOrEqual(m.latimeEcran);
    expect(m.scrollOrizontal, 'pagina derulează orizontal').toBe(false);
  });
}

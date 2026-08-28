import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Navigarea între pagini — în special tabul „Despre noi" din antet, prezent
 * atât pe Coming Soon cât și pe landing.
 *
 * De ce există: linkurile interne se rup tăcut. Ruta merge în dev (Vite
 * servește index.html pentru orice cale), dar în producție are nevoie de
 * rewrite în `vercel.json` — exact asta a dat 404 la /despre-noi cândva.
 * `tests/unit/rute.test.ts` păzește partea de configurare; aici verificăm
 * că linkul chiar există în antet și că duce unde trebuie.
 *
 * Nu depindem de textul linkului (CSS-ul aplică `text-transform: uppercase`,
 * ceea ce schimbă numele accesibil), ci de href și de clasă.
 */

const STATS_ROUTE = '**/rest/v1/rpc/public_stats';
const EMPTY = { count: 0, participants: [], waitlist: 0 };

/** Landing-ul cere statisticile la montare — le mock-uim ca să nu atingem DB-ul. */
const mockStats = (page: Page) =>
  page.route(STATS_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY) })
  );

test.describe('Tabul „Despre noi" — Coming Soon', () => {
  test('e prezent în antet și trimite către /despre-noi', async ({ page }) => {
    await page.goto('/?preview=soon');
    const tab = page.locator('.cs-topbar a.cs-tab');
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute('href', '/despre-noi');
  });

  test('clic pe tab deschide pagina Despre noi', async ({ page }) => {
    await page.goto('/?preview=soon');
    await page.locator('.cs-topbar a.cs-tab').click();
    await expect(page).toHaveURL(/\/despre-noi$/);
    await expect(page.locator('.dn-root')).toBeVisible();
  });

  test('rămâne vizibil pe mobil (375px), fără să fie tăiat de marginea paginii', async ({
    page,
  }) => {
    // `.cs-root` are `overflow: hidden`, deci un antet prea lat NU produce
    // scroll orizontal — se taie în tăcere. Verificăm direct că tabul încape
    // în viewport, altfel testul obișnuit de overflow ar trece degeaba.
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/?preview=soon');

    const tab = page.locator('.cs-topbar a.cs-tab');
    await expect(tab).toBeVisible();
    const box = await tab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe('Tabul „Despre noi" — landing', () => {
  test.beforeEach(async ({ page }) => {
    await mockStats(page);
  });

  test('e prezent în antet și trimite către /despre-noi', async ({ page }) => {
    await page.goto('/?preview=landing');
    const tab = page.locator('header a[href="/despre-noi"]');
    await expect(tab).toBeVisible();
  });

  test('clic pe tab deschide pagina Despre noi', async ({ page }) => {
    await page.goto('/?preview=landing');
    await page.locator('header a[href="/despre-noi"]').click();
    await expect(page).toHaveURL(/\/despre-noi$/);
    await expect(page.locator('.dn-root')).toBeVisible();
  });

  test('nu strică celelalte acțiuni din antet (Înscrie-te duce la formular)', async ({ page }) => {
    await page.goto('/?preview=landing');
    // „Înscrie-te" nu mai e ancoră spre secțiunea 03: deschide formularul ca
    // overlay, cu href="/inscriere" ca rezervă dacă JS-ul n-a pornit.
    const cta = page.locator('header a[href="/inscriere"]');
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page.getByRole('dialog', { name: /înscriere/i })).toBeVisible();
  });

  test('rămâne în viewport pe mobil (375px)', async ({ page }) => {
    // Aici `.e3-root` NU are `overflow: hidden`, deci testul de scroll
    // orizontal din landing.spec prinde deja depășirile de lățime. Verificăm
    // doar că tabul e efectiv vizibil, fără să fixăm o poziție exactă.
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/?preview=landing');
    const tab = page.locator('header a[href="/despre-noi"]');
    await expect(tab).toBeVisible();
    await expect(tab).toBeInViewport();
  });
});

test.describe('Drumul dus-întors', () => {
  test('Despre noi → înapoi la eveniment („/")', async ({ page }) => {
    await mockStats(page);
    await page.goto('/despre-noi');
    await page.locator('.dn-footer a[href="/"]').click();
    await expect(page).toHaveURL(/\/$/);
    // La „/" apare Coming Soon sau landing, în funcție de LAUNCH_DATE —
    // testul acceptă ambele, ca să nu se rupă la trecerea de la o fază la alta.
    await expect(page.locator('.cs-root, #inscriere').first()).toBeVisible();
  });

  test('logoul din antetul Despre noi duce la pagina principală', async ({ page }) => {
    await mockStats(page);
    await page.goto('/despre-noi');
    await page.locator('a.dn-logo').click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('toate rutele publice răspund fără eroare la acces direct', async ({ page }) => {
    // Simulează refresh/deschidere directă — cazul care cere rewrite pe Vercel.
    await mockStats(page);
    for (const ruta of ['/', '/despre-noi', '/confirmare']) {
      const res = await page.goto(ruta);
      expect(res?.status(), `Ruta ${ruta} a răspuns cu eroare`).toBeLessThan(400);
    }
  });
});

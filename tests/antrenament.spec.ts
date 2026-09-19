import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Pagina `/antrenament` — linkul de trimis în story sau în grupul de Telegram.
 *
 * Trei stări contează, și diferența dintre ultimele două e tot rostul paginii:
 * „nu e publicat nimic" e un răspuns valid la un link vechi, iar „n-am putut
 * întreba" e o defecțiune. Dacă pagina le-ar arăta la fel, un backend căzut ar
 * arăta ca o săptămână fără antrenament.
 *
 * Citirea e mock-uită — testul nu atinge Supabase.
 */

const RUTA = '**/rest/v1/rpc/public_weekly_workout';

const mock = (page: Page, body: unknown, status = 200) =>
  page.route(RUTA, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  );

test.describe('Antrenamentul săptămânii', () => {
  test('arată titlul și corpul antrenamentului publicat', async ({ page }) => {
    await mock(page, { titlu: 'Tempo', corp: '5×1000m la ritm de cursă\npauză 2 min' });
    await page.goto('/antrenament');

    await expect(page.locator('.an-titlu')).toHaveText('Tempo');
    await expect(page.locator('.an-corp')).toContainText('5×1000m');
  });

  test('păstrează rândurile pe care le-a scris organizatorul', async ({ page }) => {
    await mock(page, { titlu: 'Tempo', corp: 'primul rând\nal doilea rând' });
    await page.goto('/antrenament');

    // `pre-wrap` e ce face rândurile să conteze — fără el, textul s-ar aduna
    // într-un singur paragraf și formatul scris în backoffice s-ar pierde.
    await expect(page.locator('.an-corp')).toHaveCSS('white-space', 'pre-wrap');
    await expect(page.locator('.an-corp')).toContainText('primul rând');
    await expect(page.locator('.an-corp')).toContainText('al doilea rând');
  });

  test('cu antrenamentul oprit răspunde, nu dă eroare', async ({ page }) => {
    await mock(page, null);
    await page.goto('/antrenament');

    await expect(page.locator('.cs-main')).toContainText('Nu e publicat niciun antrenament');
    await expect(page.locator('.an-card')).toHaveCount(0);
  });

  test('o eroare de rețea nu se dă drept „nimic publicat"', async ({ page }) => {
    await mock(page, { message: 'boom' }, 500);
    await page.goto('/antrenament');

    await expect(page.locator('[role="alert"]')).toContainText('Nu am putut încărca');
    await expect(page.locator('.cs-main')).not.toContainText('Nu e publicat niciun antrenament');
  });

  test('titlul paginii e vizibil și linkul spre acasă funcționează', async ({ page }) => {
    await mock(page, { titlu: 'Tempo', corp: '5×1000m' });
    await page.goto('/antrenament');

    await expect(page.locator('.cf-title')).toContainText('Antrenamentul săptămânii');
    await expect(page.locator('.cs-topbar a.cs-logo')).toHaveAttribute('href', '/');
  });

  test('nu cere configul ediției — pagina nu ține de nicio ediție', async ({ page }) => {
    const configCalls: string[] = [];
    await page.route('**/rest/v1/rpc/public_config', (route) => {
      configCalls.push(route.request().url());
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
    });
    await mock(page, { titlu: 'Tempo', corp: '5×1000m' });

    await page.goto('/antrenament');
    await expect(page.locator('.an-titlu')).toHaveText('Tempo');

    expect(configCalls).toEqual([]);
  });

  test('rămâne lizibilă pe mobil, fără scroll orizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mock(page, {
      titlu: 'Tempo lung',
      corp: 'https://exemplu.ro/un-link-foarte-foarte-foarte-lung-care-nu-are-voie-sa-latească-pagina',
    });
    await page.goto('/antrenament');

    await expect(page.locator('.an-corp')).toBeVisible();
    const latime = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(latime).toBeLessThanOrEqual(1);
  });
});

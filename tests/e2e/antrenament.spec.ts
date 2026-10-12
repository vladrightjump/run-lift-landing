import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Pagina `/antrenament` — linkul de trimis în story sau în grupul de Telegram,
 * plus programul din care poate începe cineva de la capăt.
 *
 * Trei stări contează, și diferența dintre ultimele două e tot rostul paginii:
 * „nu e publicat nimic" e un răspuns valid la un link vechi, iar „n-am putut
 * întreba" e o defecțiune. Dacă pagina le-ar arăta la fel, un backend căzut ar
 * arăta ca o săptămână fără antrenament.
 *
 * Citirea e mock-uită — testul nu atinge Supabase.
 */

const RUTA = '**/rest/v1/rpc/public_weekly_workouts';

const mock = (page: Page, body: unknown, status = 200) =>
  page.route(RUTA, (route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  );

const saptamana = (numar: number) => ({
  numar,
  titlu: `Titlu ${numar}`,
  corp: `corpul săptămânii ${numar}`,
});

const programDe = (n: number) => Array.from({ length: n }, (_, i) => saptamana(i + 1));

test.describe('Antrenamentul săptămânii', () => {
  test('arată titlul și corpul săptămânii curente — cea mai mare', async ({ page }) => {
    await mock(page, [
      { numar: 1, titlu: 'Prima', corp: 'usor' },
      { numar: 2, titlu: 'Tempo', corp: '5×1000m la ritm de cursă\npauză 2 min' },
    ]);
    await page.goto('/antrenament');

    await expect(page.locator('.an-titlu')).toHaveText('Tempo');
    await expect(page.locator('.an-eticheta')).toHaveText('Săptămâna 2');
    await expect(page.locator('.an-corp')).toContainText('5×1000m');
  });

  test('păstrează rândurile pe care le-a scris organizatorul', async ({ page }) => {
    await mock(page, [{ numar: 1, titlu: 'Tempo', corp: 'primul rând\nal doilea rând' }]);
    await page.goto('/antrenament');

    // `pre-wrap` e ce face rândurile să conteze — fără el, textul s-ar aduna
    // într-un singur paragraf și formatul scris în backoffice s-ar pierde.
    await expect(page.locator('.an-corp')).toHaveCSS('white-space', 'pre-wrap');
    await expect(page.locator('.an-corp')).toContainText('primul rând');
    await expect(page.locator('.an-corp')).toContainText('al doilea rând');
  });

  test('fără nicio săptămână vizibilă răspunde, nu dă eroare', async ({ page }) => {
    await mock(page, []);
    await page.goto('/antrenament');

    await expect(page.locator('.cs-main')).toContainText('Nu e publicat niciun antrenament');
    await expect(page.locator('.an-card')).toHaveCount(0);
    await expect(page.locator('.an-selector')).toHaveCount(0);
  });

  test('o eroare de rețea nu se dă drept „nimic publicat"', async ({ page }) => {
    await mock(page, { message: 'boom' }, 500);
    await page.goto('/antrenament');

    await expect(page.locator('[role="alert"]')).toContainText('Nu am putut încărca');
    await expect(page.locator('.cs-main')).not.toContainText('Nu e publicat niciun antrenament');
  });

  test('titlul paginii e vizibil și linkul spre acasă funcționează', async ({ page }) => {
    await mock(page, [saptamana(1)]);
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
    await mock(page, [saptamana(1)]);

    await page.goto('/antrenament');
    await expect(page.locator('.an-titlu')).toHaveText('Titlu 1');

    expect(configCalls).toEqual([]);
  });
});

test.describe('Programul', () => {
  test('selectorul listează toate săptămânile, crescător', async ({ page }) => {
    await mock(page, programDe(4));
    await page.goto('/antrenament');

    const optiuni = page.locator('.an-selector-camp option');
    await expect(optiuni).toHaveCount(4);
    await expect(optiuni.first()).toContainText('Săptămâna 1');
    await expect(optiuni.last()).toContainText('Săptămâna 4');
  });

  test('alegerea unei săptămâni schimbă cardul fără să ceară serverul din nou', async ({
    page,
  }) => {
    let cereri = 0;
    await page.route(RUTA, (route) => {
      cereri++;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(programDe(4)),
      });
    });
    await page.goto('/antrenament');
    await expect(page.locator('.an-titlu')).toHaveText('Titlu 4');
    expect(cereri).toBe(1);

    await page.locator('.an-selector-camp').selectOption('1');

    await expect(page.locator('.an-eticheta')).toHaveText('Săptămâna 1');
    await expect(page.locator('.an-corp')).toContainText('corpul săptămânii 1');
    // Tot programul a venit dintr-un singur răspuns; alegerea nu mai cere nimic.
    expect(cereri).toBe(1);
  });

  test('alegerea se scrie în fragment, ca linkul „începe de la Săptămâna 1" să fie trimisibil', async ({
    page,
  }) => {
    await mock(page, programDe(3));
    await page.goto('/antrenament');

    await page.locator('.an-selector-camp').selectOption('1');
    await expect(page).toHaveURL(/#s1$/);
  });

  test('un fragment valid deschide direct acea săptămână', async ({ page }) => {
    await mock(page, programDe(4));
    await page.goto('/antrenament#s2');

    await expect(page.locator('.an-eticheta')).toHaveText('Săptămâna 2');
  });

  test('un fragment care nu corespunde nimănui cade pe săptămâna curentă, fără eroare', async ({
    page,
  }) => {
    await mock(page, programDe(4));
    await page.goto('/antrenament#s99');

    await expect(page.locator('.an-eticheta')).toHaveText('Săptămâna 4');
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
  });

  test('cu o singură săptămână, selectorul nu se randează', async ({ page }) => {
    await mock(page, [saptamana(1)]);
    await page.goto('/antrenament');

    await expect(page.locator('.an-card')).toBeVisible();
    await expect(page.locator('.an-selector')).toHaveCount(0);
  });

  test('numerele sărite (o săptămână ascunsă) se arată ca atare, nu recalculate', async ({
    page,
  }) => {
    await mock(page, [saptamana(1), saptamana(2), saptamana(4)]);
    await page.goto('/antrenament');

    const optiuni = page.locator('.an-selector-camp option');
    await expect(optiuni).toHaveCount(3);
    await expect(optiuni.nth(2)).toContainText('Săptămâna 4');
    await expect(page.locator('.an-eticheta')).toHaveText('Săptămâna 4');
  });

  test('rămâne lizibilă pe mobil, fără scroll orizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mock(page, [
      {
        numar: 1,
        titlu: 'Tempo lung pe deal, cu revenire în pas alergat',
        corp: 'https://exemplu.ro/un-link-foarte-foarte-foarte-lung-care-nu-are-voie-sa-latească-pagina',
      },
      { numar: 2, titlu: 'Tempo lung', corp: 'scurt' },
    ]);
    await page.goto('/antrenament#s1');

    await expect(page.locator('.an-corp')).toBeVisible();
    await expect(page.locator('.an-selector-camp')).toBeVisible();
    const latime = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(latime).toBeLessThanOrEqual(1);
  });
});

import { test, expect } from '../support/playwright';
import type { Page } from '@playwright/test';
import { HttpResponse } from 'msw';
import { rpcHandler } from '../support/handlers';
import { programDe, saptamanaPublica } from '../support/builders/workouts';
import { META_ANTRENAMENT } from '../../src/content/meta';

/**
 * `/antrenament` și cardul „Până atunci", în browser: drumul vizitatorului și
 * ce se vede doar cu CSS-ul și shell-urile reale din build. Stările paginii și
 * ale cardului (gol, eroare, program, fragment) sunt teste de componentă, lângă
 * cod, în `src/features/antrenament/`.
 */

const program = (network: { use: (...h: ReturnType<typeof rpcHandler>[]) => void }, body: object) =>
  network.use(rpcHandler('public_weekly_workouts', () => HttpResponse.json(body)));

/**
 * Elementul încape în ecranul de 375px. Se măsoară ELEMENTUL, nu documentul:
 * `.cs-root` e `overflow: hidden`, deci o depășire e tăiată înainte să ajungă
 * la document, iar `scrollWidth` ar citi zero chiar pe bug.
 */
const incapePeTelefon = async (page: Page, element: ReturnType<Page['locator']>) => {
  const cutie = (await element.boundingBox())!;
  expect(cutie.x).toBeGreaterThanOrEqual(0);
  expect(cutie.x + cutie.width).toBeLessThanOrEqual(page.viewportSize()!.width);
};

test.describe('Pagina /antrenament', () => {
  test('linkul din story arată antrenamentul săptămânii, cu rândurile organizatorului', async ({
    page,
    network,
  }) => {
    program(network, [saptamanaPublica(1), saptamanaPublica(2, { titlu: 'Tempo', corp: 'primul rând\nal doilea rând' })]);
    await page.goto('/antrenament');

    await expect(page.getByRole('heading', { level: 2, name: 'Tempo' })).toBeVisible();
    const corp = page.getByRole('article').getByText('primul rând');
    await expect(corp).toHaveCSS('white-space', 'pre-wrap');
  });

  test('nu cere configul ediției — pagina nu ține de nicio ediție', async ({ page, network }) => {
    const cereri: string[] = [];
    program(network, programDe(1));
    network.use(
      rpcHandler('public_config', ({ request }) => {
        cereri.push(request.url);
        return HttpResponse.json(null);
      })
    );
    await page.goto('/antrenament');

    await expect(page.getByRole('heading', { level: 2, name: 'Titlu 1' })).toBeVisible();
    expect(cereri).toEqual([]);
  });

  test('rămâne lizibilă pe mobil, fără scroll orizontal', async ({ page, network }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    program(network, [
      saptamanaPublica(1, {
        titlu: 'Tempo lung pe deal, cu revenire în pas alergat',
        corp: 'https://exemplu.ro/un-link-foarte-foarte-foarte-lung-care-nu-are-voie-sa-latească-pagina',
      }),
      saptamanaPublica(2, { titlu: 'Tempo lung', corp: 'scurt' }),
    ]);
    await page.goto('/antrenament#s1');

    await expect(page.getByRole('article')).toBeVisible();
    await incapePeTelefon(page, page.getByRole('article'));
    await incapePeTelefon(page, page.getByLabel(/Alege o săptămână/));
  });

  test('shell-ul construit poartă cardul de share al antrenamentului, nu al ediției', async ({ page }) => {
    await page.goto('/antrenament.html');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', META_ANTRENAMENT.title);
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', META_ANTRENAMENT.url);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', META_ANTRENAMENT.ogImage);
  });
});

/**
 * Ceasul se fixează înaintea țintei countdown-ului (`nextEditionAt`), altfel
 * ecranul „next" ar dispărea de la sine după data din snapshot și absența
 * cardului ar arăta ca o regresie a lui.
 */
const INAINTE_DE_TINTA = Date.parse('2026-09-22T09:00:00+03:00');

test.describe('Cardul „Până atunci"', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((fix) => {
      Date.now = () => fix;
    }, INAINTE_DE_TINTA);
  });

  const CORP = 'ÎNCĂLZIRE\n5 min alergare ușoară\nINTERVALE\n1200 m · RPE 5/10\nREVENIRE\n5 min mers';

  test('de pe ecranul de așteptare, cardul duce la antrenamentul săptămânii', async ({ page, network }) => {
    program(network, [saptamanaPublica(1, { titlu: 'Intervale 1', corp: CORP })]);
    await page.goto('/?preview=next');

    await page.getByRole('link', { name: 'Antrenamentul săptămânii 1: Intervale 1' }).click();

    await expect(page).toHaveURL(/\/antrenament$/);
    await expect(page.getByRole('heading', { level: 2, name: 'Intervale 1' })).toBeVisible();
  });

  test('nu apare pe „Coming Soon" — acolo ecranul încă își face promisiunea', async ({ page, network }) => {
    program(network, programDe(1));
    await page.goto('/?preview=soon');

    // Întâi dovedim că suntem chiar pe ecranul acela; altfel absența cardului
    // n-ar însemna nimic.
    await expect(page.locator('.cs-title')).toContainText('Coming');
    await expect(page.getByRole('link', { name: /Antrenamentul săptămânii/ })).toHaveCount(0);
  });

  test('o eroare de server lasă ecranul de așteptare întreg', async ({ page, network }) => {
    network.use(rpcHandler('public_weekly_workouts', () => HttpResponse.json({ message: 'down' }, { status: 500 })));
    await page.goto('/?preview=next');

    await expect(page.getByRole('button', { name: /Anunță-mă la lansare/i })).toBeVisible();
    await expect(page.locator('.cs-countdown')).toBeVisible();
    await expect(page.getByRole('link', { name: /Antrenamentul săptămânii/ })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('pe mobil încape în ecran, iar fade-ul apare doar când textul e tăiat', async ({ page, network }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    program(network, [
      saptamanaPublica(1, { titlu: 'Scurt', corp: 'Alergare ușoară 30 min.' }),
      saptamanaPublica(2, {
        titlu: 'Intervale lungi cu revenire activă pe deal',
        corp: Array.from({ length: 12 }, (_, i) => `rândul ${i + 1} https://exemplu.ro/un-link-foarte-lung`).join('\n'),
      }),
    ]);
    await page.goto('/?preview=next');

    const card = page.getByRole('link', { name: /Antrenamentul săptămânii 2/ });
    await incapePeTelefon(page, card);

    const masca = (text: string) =>
      card.getByText(text).evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage);
    expect(await masca('rândul 1')).not.toBe('none');
  });

  test('un antrenament scurt NU se stinge', async ({ page, network }) => {
    program(network, [saptamanaPublica(1, { titlu: 'Scurt', corp: 'Alergare ușoară 30 min.' })]);
    await page.goto('/?preview=next');

    const corp = page.getByRole('link', { name: /Antrenamentul săptămânii 1/ }).getByText('Alergare ușoară 30 min.');
    await expect(corp).toBeVisible();
    await expect(corp).toHaveCSS('white-space', 'pre-wrap');
    expect(await corp.evaluate((el) => getComputedStyle(el).maskImage || getComputedStyle(el).webkitMaskImage)).toBe('none');
  });
});

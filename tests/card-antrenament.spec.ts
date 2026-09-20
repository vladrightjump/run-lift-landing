import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/**
 * „Până atunci" — cardul antrenamentului de pe ecranul „Ne vedem curând".
 *
 * Countdown-ul de deasupra ridică întrebarea „ce fac în zilele astea?", iar
 * cardul e răspunsul. De aceea arată CONȚINUT, nu o etichetă: numărul
 * săptămânii, titlul și primele rânduri.
 *
 * Contractul păzit aici e mai ales ce NU face. Cardul e decor pe un ecran al
 * cărui rost e formularul de notificare, deci orice eșec al lui trebuie să fie
 * invizibil: fără bandă de eroare, fără card gol, fără să atingă butonul
 * principal. Un card care strică homepage-ul când tace backend-ul ar fi mai rău
 * decât niciun card.
 */

const PROGRAM_ROUTE = '**/rest/v1/rpc/public_weekly_workouts';

/**
 * Ceasul se fixează înaintea țintei countdown-ului (`nextEditionAt`).
 *
 * Fără asta, testul care verifică „ecranul rămâne întreg la o eroare" ar fi
 * expirat de la sine după 26 septembrie 2026: `.cs-countdown` se randează doar
 * cât timp countdown-ul n-a ajuns la zero, iar eșecul ar fi arătat ca o
 * regresie a cardului, nu ca un ceas trecut.
 */
const INAINTE_DE_TINTA = Date.parse('2026-09-22T09:00:00+03:00');

const fixClock = (page: Page, moment: number) =>
  page.addInitScript((fixed) => {
    Date.now = () => fixed;
  }, moment);

const saptamana = (numar: number) => ({
  numar,
  titlu: `Intervale ${numar}`,
  corp: `ÎNCĂLZIRE\n5 min alergare ușoară\nINTERVALE\n1200 m · RPE 5/10\nREVENIRE\n5 min mers`,
});

const mockProgram = (page: Page, body: unknown, status = 200) =>
  page.route(PROGRAM_ROUTE, (route: Route) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  );

test.describe('Cardul „Până atunci"', () => {
  test('arată săptămâna curentă — numărul, titlul și primele rânduri', async ({ page }) => {
    await mockProgram(page, [saptamana(1), saptamana(2)]);
    await page.goto('/?preview=next');

    const card = page.locator('.cs-antren');
    await expect(card).toBeVisible();
    // Cea curentă e cea mai mare, ca pe /antrenament.
    await expect(card).toContainText('Săptămâna 2');
    await expect(card).toContainText('Intervale 2');
    await expect(card).toContainText('ÎNCĂLZIRE');
  });

  test('tot cardul e un link spre pagina antrenamentului', async ({ page }) => {
    await mockProgram(page, [saptamana(1)]);
    await page.goto('/?preview=next');

    // Linkul e stabil la renumerotare: pagina deschide oricum săptămâna curentă,
    // deci nu poartă un `#sN` care poate expira.
    await expect(page.locator('.cs-antren')).toHaveAttribute('href', '/antrenament');
  });

  test('duce chiar acolo la clic', async ({ page }) => {
    await mockProgram(page, [saptamana(1)]);
    await page.goto('/?preview=next');
    await page.locator('.cs-antren').click();

    await expect(page).toHaveURL(/\/antrenament$/);
  });

  test('păstrează rândurile scrise de organizator', async ({ page }) => {
    await mockProgram(page, [saptamana(1)]);
    await page.goto('/?preview=next');

    await expect(page.locator('.cs-antren-corp')).toHaveCSS('white-space', 'pre-wrap');
  });

  test('fără niciun antrenament vizibil, cardul nu se randează deloc', async ({ page }) => {
    await mockProgram(page, []);
    await page.goto('/?preview=next');

    await expect(page.locator('.cs-root')).toBeVisible();
    await expect(page.locator('.cs-antren')).toHaveCount(0);
  });

  test('o eroare de server rămâne INVIZIBILĂ — ecranul nu se strică', async ({ page }) => {
    await fixClock(page, INAINTE_DE_TINTA);
    await mockProgram(page, { message: 'boom' }, 500);
    await page.goto('/?preview=next');

    await expect(page.locator('.cs-antren')).toHaveCount(0);
    await expect(page.locator('[role="alert"]')).toHaveCount(0);
    // Ce contează pe ecranul ăsta e în continuare acolo.
    await expect(page.getByRole('button', { name: /Anunță-mă la lansare/i })).toBeVisible();
    await expect(page.locator('.cs-countdown')).toBeVisible();
  });

  test('un răspuns stricat e tratat la fel de tăcut', async ({ page }) => {
    await mockProgram(page, { nu: 'e un array' });
    await page.goto('/?preview=next');

    await expect(page.locator('.cs-antren')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Anunță-mă la lansare/i })).toBeVisible();
  });

  test('nu apare pe „Coming Soon" — acolo ecranul încă își face promisiunea', async ({
    page,
  }) => {
    await mockProgram(page, [saptamana(1)]);
    await page.goto('/?preview=soon');

    // Întâi dovedim că suntem chiar pe ecranul acela; altfel absența cardului
    // n-ar însemna nimic.
    await expect(page.locator('.cs-title')).toContainText('Coming');
    await expect(page.locator('.cs-antren')).toHaveCount(0);
  });

  test('rămâne lizibil pe mobil, fără scroll orizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await mockProgram(page, [
      {
        numar: 1,
        titlu: 'Intervale lungi cu revenire activă pe deal',
        corp: 'https://exemplu.ro/un-link-foarte-foarte-foarte-lung-care-nu-are-voie-sa-latească-pagina',
      },
    ]);
    await page.goto('/?preview=next');

    const card = page.locator('.cs-antren');
    await expect(card).toBeVisible();

    /**
     * Se măsoară CARDUL, nu documentul.
     *
     * `documentElement.scrollWidth - clientWidth` nu poate depăși zero pentru
     * nimic din interiorul lui `.cs-root`, care e `overflow: hidden`: depășirea
     * e tăiată înainte să ajungă la document. Garda scrisă așa citea 0 în timp
     * ce cardul ieșea 26px în afara ecranului — trecea exact pe bug-ul pe care
     * pretindea că-l păzește.
     */
    const cutie = (await card.boundingBox())!;
    expect(cutie.x).toBeGreaterThanOrEqual(0);
    expect(cutie.x + cutie.width).toBeLessThanOrEqual(375);
  });

  test('un antrenament scurt NU se stinge — fade-ul apare doar când s-a tăiat', async ({
    page,
  }) => {
    // Masca aplicată mereu stingea și un text care încăpea întreg: promitea
    // fals „mai e dedesubt" și cobora contrastul sub pragul de citit.
    await mockProgram(page, [{ numar: 1, titlu: 'Scurt', corp: 'Alergare ușoară 30 min.' }]);
    await page.goto('/?preview=next');

    await expect(page.locator('.cs-antren-corp')).toBeVisible();
    await expect(page.locator('.cs-antren-corp.taiat')).toHaveCount(0);
  });

  test('un antrenament lung primește fade-ul', async ({ page }) => {
    await mockProgram(page, [
      { numar: 1, titlu: 'Lung', corp: Array.from({ length: 12 }, (_, i) => `rândul ${i + 1}`).join('\n') },
    ]);
    await page.goto('/?preview=next');

    await expect(page.locator('.cs-antren-corp.taiat')).toHaveCount(1);
  });

  test('linkul are un nume accesibil scurt, nu tot antrenamentul', async ({ page }) => {
    await mockProgram(page, [saptamana(3)]);
    await page.goto('/?preview=next');

    // Fără `aria-label`, numele linkului ar fi fost tot corpul antrenamentului,
    // citit dintr-o suflare de un cititor de ecran.
    const nume = await page.locator('.cs-antren').getAttribute('aria-label');
    expect(nume).toBe('Antrenamentul săptămânii 3: Intervale 3');
    expect(nume).not.toContain('ÎNCĂLZIRE');
  });
});

import { test, expect, type NetworkFixture } from '../support/playwright';
import { rpcResponse } from '../support/responses';
import { publicStats } from '../support/builders/public';

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

const EMPTY = publicStats();

/**
 * Landing-ul cere statisticile ȘI configul publicat la montare — le mock-uim pe
 * amândouă ca să nu atingem DB-ul.
 *
 * Configul nu e un amănunt: pagina pornește pe instantaneul de build și se
 * RE-RANDEAZĂ când răspunde `public_config()`. Un răspuns real, sosit între
 * verificarea de acționabilitate a lui Playwright și click, înlocuiește nodul
 * din antet — clicul cade pe elementul vechi, ancora navighează, iar dialogul
 * nu se mai deschide. Mock-uit, momentul e determinist.
 */
const mockStats = (network: NetworkFixture) =>
  network.use(
    rpcResponse('public_stats', EMPTY),
    // Fără corp: clientul păstrează instantaneul de build, deci nicio re-randare.
    rpcResponse('public_config', null, { networkError: true }),
  );

test.describe('Tabul „Despre noi" — Coming Soon', () => {
  test('e prezent în antet și trimite către /despre-noi', async ({ page }) => {
    await page.goto('/?preview=soon');
    const tab = page.locator("[data-css~=\"cs-topbar\"] a[data-css~=\"cs-tab\"]");
    await expect(tab).toBeVisible();
    await expect(tab).toHaveAttribute('href', '/despre-noi');
  });

  test('clic pe tab deschide pagina Despre noi', async ({ page }) => {
    await page.goto('/?preview=soon');
    await page.locator("[data-css~=\"cs-topbar\"] a[data-css~=\"cs-tab\"]").click();
    await expect(page).toHaveURL(/\/despre-noi$/);
    await expect(page.locator("[data-css~=\"dn-root\"]")).toBeVisible();
  });

  test('rămâne vizibil pe mobil (375px), fără să fie tăiat de marginea paginii', async ({ page }) => {
    // `.cs-root` are `overflow: hidden`, deci un antet prea lat NU produce
    // scroll orizontal — se taie în tăcere. Verificăm direct că tabul încape
    // în viewport, altfel testul obișnuit de overflow ar trece degeaba.
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/?preview=soon');

    const tab = page.locator("[data-css~=\"cs-topbar\"] a[data-css~=\"cs-tab\"]");
    await expect(tab).toBeVisible();
    const box = await tab.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });
});

test.describe('Tabul „Despre noi" — landing', () => {
  test.beforeEach(async ({ network }) => {
    mockStats(network);
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
    await expect(page.locator("[data-css~=\"dn-root\"]")).toBeVisible();
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
  test('Despre noi → înapoi la eveniment („/")', async ({ page, network }) => {
    mockStats(network);
    await page.goto('/despre-noi');
    await page.locator("[data-css~=\"dn-footer\"] a[href=\"/\"]").click();
    await expect(page).toHaveURL(/\/$/);
    // La „/" apare Coming Soon (`.cs-root`) sau landing-ul (`.e3-root`), în
    // funcție de fază. Testul ăsta verifică DRUMUL, nu faza, deci acceptă orice
    // fază: landing-ul are trei (`pre`, `leaderboard`, `next`) și doar în `pre`
    // există `#inscriere`. Fixarea pe `#inscriere` pica în ziua cursei, când
    // înscrierea dispare de pe homepage. Fazele se testează în `faze.spec.ts`.
    await expect(page.locator("[data-css~=\"cs-root\"], [data-css~=\"e3-root\"]").first()).toBeVisible();
  });

  test('logoul din antetul Despre noi duce la pagina principală', async ({ page, network }) => {
    mockStats(network);
    await page.goto('/despre-noi');
    await page.locator("a[data-css~=\"dn-logo\"]").click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('toate rutele publice răspund fără eroare la acces direct', async ({ page, network }) => {
    // Simulează refresh/deschidere directă — cazul care cere rewrite pe Vercel.
    mockStats(network);
    for (const ruta of ['/', '/despre-noi', '/confirmare']) {
      const res = await page.goto(ruta);
      expect(res?.status(), `Ruta ${ruta} a răspuns cu eroare`).toBeLessThan(400);
    }
  });
});

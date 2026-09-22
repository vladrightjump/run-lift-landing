import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SNAPSHOT_CONFIG } from '../src/content/eventConfig';

/**
 * Primul test de browser al backoffice-ului.
 *
 * Suita lui era numai unitară, iar comutarea între ecrane — exact ce a
 * introdus trecerea la „un ecran pe rând" — e clasa de regresie pe care
 * testele unitare n-o pot prinde structural: fragmentul din URL, istoricul
 * browserului și butonul „înapoi" nu există în jsdom așa cum există aici.
 *
 * Nu scrie nimic: toate RPC-urile Supabase sînt interceptate.
 */

const RPC = '**/rest/v1/rpc/*';

/** Răspunsuri plauzibile, cât să se randeze fiecare ecran. */
const RASPUNSURI: Record<string, unknown> = {
  admin_check_token: true,
  admin_list_registrations: [],
  admin_list_waitlist: [],
  admin_list_email_log: [],
  admin_list_events: [],
  admin_list_editions: [
    { editie: SNAPSHOT_CONFIG.number, participanti: 0, asteptare: 0, lansare: 0, prima: null, ultima: null, este_curenta: true },
  ],
  admin_list_launch_notifications: [],
  admin_list_email_templates: [],
  admin_get_event_config: [],
  admin_list_training_reels: [],
  admin_list_weekly_workout: [],
};

const deschideAdminul = async (page: Page) => {
  await page.route(RPC, async (ruta) => {
    const nume = /\/rpc\/([a-z_]+)/.exec(ruta.request().url())?.[1] ?? '';
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(nume in RASPUNSURI ? RASPUNSURI[nume] : null),
    });
  });
  // Tokenul sărit peste login: testul e despre navigare, nu despre autentificare.
  await page.addInitScript(() => {
    localStorage.setItem('runlift_admin_token', 'token-e2e');
  });
  await page.goto('/admin');
};

test.describe('navigarea între ecrane', () => {
  test('aterizarea e pe desfășurare, cu registrul sub ea', async ({ page }) => {
    await deschideAdminul(page);

    await expect(page.getByLabel('Desfășurarea ediției')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Toate ecranele' })).toBeVisible();
  });

  test('un ecran deschis din registru schimbă și adresa', async ({ page }) => {
    await deschideAdminul(page);

    await page.getByRole('button', { name: /Clipuri/ }).click();

    await expect(page.getByRole('heading', { name: 'Clipuri de antrenament' })).toBeVisible();
    await expect(page).toHaveURL(/#clipuri$/);
  });

  test('„înapoi" se întoarce la ecranul anterior, fără să iasă din admin', async ({ page }) => {
    // Regresia pe care o păzește: fără fragment în URL, butonul „înapoi" scotea
    // din /admin cu totul — pierdeai tot contextul pentru că voiai un pas înapoi.
    await deschideAdminul(page);

    await page.getByRole('button', { name: /Clipuri/ }).click();
    await expect(page).toHaveURL(/#clipuri$/);

    await page.goBack();

    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByLabel('Desfășurarea ediției')).toBeVisible();
  });

  test('un singur ecran e randat odată', async ({ page }) => {
    await deschideAdminul(page);

    await page.getByRole('button', { name: /Șabloane/ }).click();

    await expect(page.getByRole('heading', { name: 'Șabloane de email' })).toBeVisible();
    await expect(page.getByLabel('Desfășurarea ediției')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Toate ecranele' })).toHaveCount(0);
  });

  test('adresa deschide direct ecranul, deci se poate trimite prin link', async ({ page }) => {
    await page.route(RPC, async (ruta) => {
      const nume = /\/rpc\/([a-z_]+)/.exec(ruta.request().url())?.[1] ?? '';
      await ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(nume in RASPUNSURI ? RASPUNSURI[nume] : null),
      });
    });
    await page.addInitScript(() => {
      localStorage.setItem('runlift_admin_token', 'token-e2e');
    });

    await page.goto('/admin#antrenament');

    await expect(page.getByRole('heading', { name: 'Antrenamentele' })).toBeVisible();
  });

  test('calea de întoarcere duce acasă de pe orice ecran', async ({ page }) => {
    await deschideAdminul(page);

    await page.getByRole('button', { name: /Clipuri/ }).click();
    await page.getByRole('navigation', { name: 'Calea de întoarcere' }).getByRole('button').click();

    await expect(page.getByLabel('Desfășurarea ediției')).toBeVisible();
  });

  test('saltul peste antet e primul control focusabil și duce la ecran', async ({ page }) => {
    // Antetul are faza, numărătoarea, alerta, comutatorul și ieșirea din cont
    // — cinci opriri înaintea treburii, pe fiecare ecran.
    await deschideAdminul(page);
    await expect(page).toHaveURL(/#desfasurare$/);

    const sari = page.getByRole('button', { name: 'Sari la ecran' });

    // Primul din ordinea de tabulare: nimic focusabil nu-l precede în document.
    const esteprimul = await page.evaluate(() => {
      const focusabile = document.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      return focusabile[0]?.textContent?.trim() === 'Sari la ecran';
    });
    expect(esteprimul).toBe(true);

    await sari.press('Enter');

    // Focusul e pe ecran, iar adresa NU s-a schimbat: fragmentul ține ecranul
    // curent, deci o ancoră „#ecran" ar fi trimis-o acasă.
    await expect(page.locator('main#ecran')).toBeFocused();
    await expect(page).toHaveURL(/#desfasurare$/);
  });
});

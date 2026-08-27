import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { EDITION } from '../src/content/edition';

/**
 * Formularul de înscriere la eveniment — landing-ul Ediției a treia.
 * Se accesează cu ?preview=landing (altfel, până la ora lansării, „/" arată
 * Coming Soon). Toate endpoint-urile Supabase sunt mock-uite: testele NU scriu
 * în baza de date reală și nu trimit emailuri.
 */

const STATS_ROUTE = '**/rest/v1/rpc/public_stats';
const REG_ROUTE = '**/rest/v1/registrations';
const WAITLIST_ROUTE = '**/rest/v1/event_waitlist';
const EMAIL_ROUTE = '**/functions/v1/send-email';

// Ora fixată înainte de start (8 august) ca formularul să fie mereu deschis,
// indiferent când rulează testul.
const fixClock = (page: Page) =>
  page.addInitScript(() => {
    const fixed = new Date('2026-08-06T10:00:00+03:00').getTime();
    const RealDate = Date;
    // Doar Date.now e citit de useCountdown/useNow — îl fixăm.
    Date.now = () => fixed;
    void RealDate;
  });

const mockStats = (page: Page, count: number, waitlist = 0) =>
  page.route(STATS_ROUTE, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count, participants: [], waitlist }),
    })
  );

const mockEmail = (page: Page) =>
  page.route(EMAIL_ROUTE, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"sent":1}' })
  );

const fillValid = async (page: Page) => {
  await page.getByPlaceholder('Ana Popescu').fill('Vladislav Filip');
  await page.getByPlaceholder('07xx xxx xxx').fill('069509949');
  await page.getByPlaceholder('ana@email.ro').fill('pw@example.com');
  await page.getByPlaceholder('zz.ll.aaaa').fill('15.05.1994');
  await page.locator('input[name="acord"]').check();
};

const submitBtn = (page: Page) => page.getByRole('button', { name: /trimite înscrierea/i });

test.describe('Înscriere — formular ediția curentă', () => {
  test('formularul e vizibil cu buton activ „Trimite înscrierea"', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await page.goto('/?preview=landing');

    const btn = submitBtn(page);
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  // Regresie critică: butonul se dezactiva pe navigator.onLine === false (fals
  // „OFFLINE" pe unele rețele/VPN) și bloca toate înscrierile.
  test('nu se blochează pe „offline" fals — submit-ul merge chiar dacă navigator.onLine e false', async ({
    page,
  }) => {
    await fixClock(page);
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    );
    await mockStats(page, 0);
    await mockEmail(page);
    await page.route(REG_ROUTE, (route: Route) => route.fulfill({ status: 201, body: '' }));

    await page.goto('/?preview=landing');

    const btn = submitBtn(page);
    await expect(btn).toBeEnabled();
    await expect(btn).not.toHaveText(/offline/i);

    await fillValid(page);
    await btn.click();
    await expect(page.getByText(/te-ai înregistrat/i)).toBeVisible();
  });

  test('submit valid → trimite ediția curentă, schema runlift și data scrisă într-un câmp', async ({
    page,
  }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await mockEmail(page);

    let body: Record<string, unknown> = {};
    let headers: Record<string, string> = {};
    await page.route(REG_ROUTE, (route: Route) => {
      body = route.request().postDataJSON();
      headers = route.request().headers();
      return route.fulfill({ status: 201, body: '' });
    });

    await page.goto('/?preview=landing');
    await fillValid(page);
    await submitBtn(page).click();

    await expect(page.getByText(/te-ai înregistrat/i)).toBeVisible();
    // Ediția NU mai pleacă din client: o pune serverul din DEFAULT
    // (`current_event_edition()`), iar RLS respinge orice valoare trimisă de
    // client. Altfel un tab vechi ar scrie în ediția greșită după o publicare.
    expect(body).not.toHaveProperty('editie');
    expect(body.data_nasterii).toBe('1994-05-15');
    expect(body.telefon).toBe('069509949');
    // Regresia din 4 aug: fără Content-Profile: runlift, PostgREST caută în
    // schema `public` și insert-ul pică. Playwright dă headerele cu litere mici.
    expect(headers['content-profile']).toBe('runlift');
  });

  // Pe telefon, cele 3 select-uri însemnau 3 deschideri de picker pentru o
  // singură informație. Testul păzește să nu se întoarcă pe furiș.
  test('data nașterii e un singur câmp scris, nu trei select-uri', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await page.goto('/?preview=landing');

    const camp = page.getByPlaceholder('zz.ll.aaaa');
    await expect(camp).toBeVisible();
    await expect(camp).toHaveAttribute('inputmode', 'numeric');
    await expect(page.locator('form select')).toHaveCount(0);

    // Punctele apar singure, iar valoarea trimisă mai departe e ISO.
    await camp.fill('15.05.1994');
    await expect(camp).toHaveValue('15.05.1994');
    await expect(page.locator('input[name="dataNasterii"]')).toHaveValue('1994-05-15');
  });

  test('validare: submit gol NU trimite request și afișează eroare', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    let requested = false;
    await page.route(REG_ROUTE, (route: Route) => {
      requested = true;
      return route.abort();
    });

    await page.goto('/?preview=landing');
    await submitBtn(page).click();

    await expect(page.getByText(/verifică câmpurile/i)).toBeVisible();
    expect(requested).toBe(false);
  });

  test('data nașterii neselectată → eroare pe câmp, fără request', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    let requested = false;
    await page.route(REG_ROUTE, (route: Route) => {
      requested = true;
      return route.abort();
    });

    await page.goto('/?preview=landing');
    await page.getByPlaceholder('Ana Popescu').fill('Vladislav Filip');
    await page.getByPlaceholder('07xx xxx xxx').fill('069509949');
    await page.getByPlaceholder('ana@email.ro').fill('pw@example.com');
    await page.locator('input[name="acord"]').check();
    // fără data nașterii
    await submitBtn(page).click();

    await expect(page.getByText(/introdu data nașterii/i)).toBeVisible();
    expect(requested).toBe(false);
  });

  test('email duplicat (mock 409) → ecran „Ceva n-a mers"', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await mockEmail(page);
    await page.route(REG_ROUTE, (route: Route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: '{"code":"23505"}' })
    );

    await page.goto('/?preview=landing');
    await fillValid(page);
    await submitBtn(page).click();

    await expect(page.getByText(/ceva n-a mers/i)).toBeVisible();
  });

  test('sold-out (la capacitate) → butonul devine „listă de așteptare" și scrie în event_waitlist', async ({
    page,
  }) => {
    await fixClock(page);
    await mockStats(page, EDITION.slots.total);
    await mockEmail(page);

    let waitlistHit = false;
    await page.route(WAITLIST_ROUTE, (route: Route) => {
      waitlistHit = true;
      return route.fulfill({ status: 201, body: '' });
    });

    await page.goto('/?preview=landing');

    const wlBtn = page.getByRole('button', { name: /lista de așteptare/i });
    await expect(wlBtn).toBeVisible();

    await page.getByPlaceholder('Ana Popescu').fill('Vladislav Filip');
    await page.getByPlaceholder('07xx xxx xxx').fill('069509949');
    await page.getByPlaceholder('ana@email.ro').fill('pw@example.com');
    await page.getByPlaceholder('zz.ll.aaaa').fill('15.05.1994');
    await page.locator('input[name="acord"]').check();
    await wlBtn.click();

    await expect(page.getByText(/lista de așteptare/i).first()).toBeVisible();
    expect(waitlistHit).toBe(true);
  });

  test('secțiunea Locație: harta e afișată, iar linkul duce la Google Maps', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await page.goto('/?preview=landing');

    // Harta embed a locației (Scările de Granit) e prezentă.
    await expect(page.locator('iframe[title*="hartă"]')).toHaveAttribute('src', /maps\.google\.com/);

    // Linkul „Deschide în Google Maps" duce chiar la Google Maps, într-un tab nou.
    const link = page.getByRole('link', { name: /deschide în google maps/i });
    await expect(link).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\//);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });
});

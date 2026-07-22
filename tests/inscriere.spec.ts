import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

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

// Ora fixată înainte de deadline (25 iulie) ca formularul să fie mereu deschis,
// indiferent când rulează testul.
const fixClock = (page: Page) =>
  page.addInitScript(() => {
    const fixed = new Date('2026-07-23T10:00:00+03:00').getTime();
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
  await page.getByLabel('Ziua nașterii').selectOption('15');
  await page.getByLabel('Luna nașterii').selectOption('5'); // Mai
  await page.getByLabel('Anul nașterii').selectOption('1994');
  await page.locator('input[name="acord"]').check();
};

const submitBtn = (page: Page) => page.getByRole('button', { name: /trimite înscrierea/i });

test.describe('Înscriere — formular ediția 3', () => {
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

  test('submit valid → trimite ediția 3 și data compusă din selectoare', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await mockEmail(page);

    let body: Record<string, unknown> = {};
    await page.route(REG_ROUTE, (route: Route) => {
      body = route.request().postDataJSON();
      return route.fulfill({ status: 201, body: '' });
    });

    await page.goto('/?preview=landing');
    await fillValid(page);
    await submitBtn(page).click();

    await expect(page.getByText(/te-ai înregistrat/i)).toBeVisible();
    expect(body.editie).toBe(3);
    expect(body.data_nasterii).toBe('1994-05-15');
    expect(body.telefon).toBe('069509949');
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
    // fără Zi/Luna/An
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

  test('sold-out (20/20) → butonul devine „listă de așteptare" și scrie în event_waitlist', async ({
    page,
  }) => {
    await fixClock(page);
    await mockStats(page, 20);
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
    await page.getByLabel('Ziua nașterii').selectOption('15');
    await page.getByLabel('Luna nașterii').selectOption('5');
    await page.getByLabel('Anul nașterii').selectOption('1994');
    await page.locator('input[name="acord"]').check();
    await wlBtn.click();

    await expect(page.getByText(/lista de așteptare/i).first()).toBeVisible();
    expect(waitlistHit).toBe(true);
  });
});

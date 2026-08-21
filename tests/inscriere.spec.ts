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
// Toate formularele trec acum prin aceeași funcție Edge, care verifică Turnstile
// înainte de a scrie (browserul nu mai are voie să insereze direct în PostgREST).
// Testele disting înscrierea de lista de așteptare după câmpul `mode` din plic.
const SUBMIT_ROUTE = '**/functions/v1/submit-form';
const EMAIL_ROUTE = '**/functions/v1/send-email';

type Plic = { mode: string; token: string; hp: string; elapsed: number; data: Record<string, unknown> };

/**
 * Interceptează `submit-form`. `handler` primește plicul decodat și decide
 * răspunsul; ce nu e tratat primește un 200 „ok".
 */
const mockSubmit = (
  page: Page,
  handler: (plic: Plic, route: Route) => unknown | Promise<unknown>
) =>
  page.route(SUBMIT_ROUTE, async (route: Route) => {
    const plic = route.request().postDataJSON() as Plic;
    await handler(plic, route);
  });

const ok = (route: Route, body = '{"ok":true}') =>
  route.fulfill({ status: 200, contentType: 'application/json', body });

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
  await page.getByLabel('Ziua nașterii').selectOption('15');
  await page.getByLabel('Luna nașterii').selectOption('5'); // Mai
  await page.getByLabel('Anul nașterii').selectOption('1994');
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
    await mockSubmit(page, (_plic, route) => ok(route));

    await page.goto('/?preview=landing');

    const btn = submitBtn(page);
    await expect(btn).toBeEnabled();
    await expect(btn).not.toHaveText(/offline/i);

    await fillValid(page);
    await btn.click();
    await expect(page.getByText(/te-ai înregistrat/i)).toBeVisible();
  });

  test('submit valid → plic corect spre submit-form, cu dovezi anti-bot și fără ediție', async ({
    page,
  }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await mockEmail(page);

    let plic: Plic | null = null;
    await mockSubmit(page, (p, route) => {
      plic = p;
      return ok(route);
    });

    await page.goto('/?preview=landing');
    await fillValid(page);
    await submitBtn(page).click();

    await expect(page.getByText(/te-ai înregistrat/i)).toBeVisible();
    const trimis = plic as unknown as Plic;
    expect(trimis.mode).toBe('registration');
    expect(trimis.data.dataNasterii).toBe('1994-05-15');
    expect(trimis.data.telefon).toBe('069509949');
    // Ediția o decide serverul (DEFAULT din DB): dacă ar veni din client, un bot
    // ar putea scrie în edițiile de arhivă.
    expect(trimis.data).not.toHaveProperty('editie');
    expect(trimis).not.toHaveProperty('editie');
    // Dovezile anti-bot însoțesc fiecare submit: capcana goală + timp plauzibil.
    expect(trimis.hp).toBe('');
    expect(typeof trimis.elapsed).toBe('number');
  });

  test('validare: submit gol NU trimite request și afișează eroare', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    let requested = false;
    await mockSubmit(page, (_plic, route) => {
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
    await mockSubmit(page, (_plic, route) => {
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
    await mockSubmit(page, (_plic, route) =>
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
    await mockSubmit(page, (plic, route) => {
      if (plic.mode === 'waitlist') waitlistHit = true;
      return ok(route);
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

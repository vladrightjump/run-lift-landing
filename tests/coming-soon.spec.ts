import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/**
 * Pagina Coming Soon — Ediția a treia: countdown + formular „Anunță-mă la lansare".
 * Testele mock-uiesc endpointul Supabase, deci nu scriu în baza de date reală.
 */

const INSERT_ROUTE = '**/rest/v1/launch_notifications';

const openModal = async (page: Page): Promise<Locator> => {
  await page.goto('/');
  await page.getByRole('button', { name: /anunță-mă la lansare/i }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  return modal;
};

const fillValid = async (modal: Locator) => {
  await modal.getByPlaceholder('Popescu').fill('Test');
  await modal.getByPlaceholder('Andrei', { exact: true }).fill('Playwright');
  await modal.getByPlaceholder('andrei@email.ro').fill('pw@example.com');
  await modal.getByPlaceholder('07xx xxx xxx').fill('069123456');
};

test.describe('Coming Soon — ecran', () => {
  test('afișează titlul, badge-ul, countdown-ul și CTA-ul', async ({ page }) => {
    await page.goto('/');

    const title = page.locator('h1.cs-title');
    await expect(title).toContainText('Coming');
    await expect(title).toContainText('Soon');

    // Regex case-insensitive: CSS-ul aplică text-transform: uppercase pe badge.
    await expect(page.locator('.cs-badge')).toHaveText(/antrenament nou · ediția a treia/i);
    await expect(page.locator('.cs-brand-meta')).toHaveText(/run \+ lift · ediția a treia/i);

    const units = page.locator('.cs-cd-unit');
    await expect(units).toHaveCount(4);
    for (const label of ['Zile', 'Ore', 'Minute', 'Secunde']) {
      await expect(units.filter({ hasText: label })).toBeVisible();
    }

    await expect(page.getByRole('button', { name: /anunță-mă la lansare/i })).toBeVisible();
  });

  test('countdown-ul are role=timer și cifre zero-padded', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('timer')).toBeVisible();
    const values = await page.locator('.cs-cd-value').allTextContents();
    expect(values).toHaveLength(4);
    for (const v of values) expect(v).toMatch(/^\d{2,}$/);
  });

  test('countdown-ul avansează (secundele se schimbă)', async ({ page }) => {
    await page.goto('/');
    const seconds = page.locator('.cs-cd-unit', { hasText: 'Secunde' }).locator('.cs-cd-value');
    const first = await seconds.textContent();
    await expect(seconds).not.toHaveText(first ?? '', { timeout: 3000 });
  });

  test('countdown expirat → cifrele dispar, CTA-ul rămâne', async ({ page }) => {
    // useCountdown citește ora doar prin Date.now() — e suficient să-l stubăm,
    // înainte ca bundle-ul aplicației să ruleze.
    await page.addInitScript(() => {
      const fixed = new Date('2026-07-22T18:00:01+03:00').getTime();
      Date.now = () => fixed;
    });

    await page.goto('/');
    await expect(page.locator('.cs-cd-unit')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /anunță-mă la lansare/i })).toBeVisible();
  });

  test('se randează corect pe mobil (375px) fără scroll orizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/');

    await expect(page.locator('h1.cs-title')).toBeVisible();
    await expect(page.locator('.cs-cd-unit')).toHaveCount(4);
    await expect(page.getByRole('button', { name: /anunță-mă la lansare/i })).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('titlul paginii și meta description reflectă anunțul din 22 iulie', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/coming soon/i);
    const desc = await page.locator('meta[name="description"]').getAttribute('content');
    expect(desc).toMatch(/22 iulie 2026/);
    expect(desc).toMatch(/edi[țt]ia a treia/i);
  });

  test('landing-ul vechi (înscrieri, participanți) nu e randat', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.cs-root')).toBeVisible();
    await expect(page.locator('#inscriere')).toHaveCount(0);
  });
});

test.describe('Coming Soon — formular „Anunță-mă la lansare"', () => {
  test('modalul are cele 4 câmpuri (Nume, Prenume, Email, Telefon)', async ({ page }) => {
    const modal = await openModal(page);
    await expect(modal.getByPlaceholder('Popescu')).toBeVisible();
    await expect(modal.getByPlaceholder('Andrei', { exact: true })).toBeVisible();
    await expect(modal.getByPlaceholder('andrei@email.ro')).toBeVisible();
    await expect(modal.getByPlaceholder('07xx xxx xxx')).toBeVisible();
  });

  test('validare client: submit gol NU trimite request și afișează eroare', async ({ page }) => {
    let requested = false;
    await page.route(INSERT_ROUTE, (route) => {
      requested = true;
      return route.abort();
    });

    const modal = await openModal(page);
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(page.getByText(/verifică câmpurile/i)).toBeVisible();
    expect(requested).toBe(false);
    await expect(modal.getByPlaceholder('Popescu')).toBeVisible(); // rămâne pe formular
  });

  test('email invalid → eroare pe câmp, fără request', async ({ page }) => {
    let requested = false;
    await page.route(INSERT_ROUTE, (route) => {
      requested = true;
      return route.abort();
    });

    const modal = await openModal(page);
    await fillValid(modal);
    await modal.getByPlaceholder('andrei@email.ro').fill('nu-e-email');
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(page.getByText(/verifică câmpurile/i)).toBeVisible();
    expect(requested).toBe(false);
  });

  test('submit valid (mock 201) → ecran de succes', async ({ page }) => {
    await page.route(INSERT_ROUTE, (route) => route.fulfill({ status: 201, body: '' }));

    const modal = await openModal(page);
    await fillValid(modal);
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(page.getByRole('heading', { name: /te-am adăugat/i })).toBeVisible();
  });

  test('email duplicat (mock 409) → mesaj „ești deja pe listă"', async ({ page }) => {
    await page.route(INSERT_ROUTE, (route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: '{"code":"23505"}' })
    );

    const modal = await openModal(page);
    await fillValid(modal);
    await modal.getByPlaceholder('andrei@email.ro').fill('dup@example.com');
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(page.getByRole('heading', { name: /ești deja pe listă/i })).toBeVisible();
  });

  test('eroare server (mock 500) → rămâne pe formular, cu toast de eroare', async ({ page }) => {
    await page.route(INSERT_ROUTE, (route) => route.fulfill({ status: 500, body: '' }));

    const modal = await openModal(page);
    await fillValid(modal);
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(page.getByText(/nu am putut trimite/i)).toBeVisible();
    await expect(modal.getByPlaceholder('Popescu')).toBeVisible();
  });

  test('modalul se închide cu Esc și cu click pe overlay', async ({ page }) => {
    const modal = await openModal(page);
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);

    await page.getByRole('button', { name: /anunță-mă la lansare/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.locator('.cs-modal-overlay').click({ position: { x: 5, y: 5 } });
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('formularul funcționează și după expirarea countdown-ului', async ({ page }) => {
    await page.addInitScript(() => {
      const fixed = new Date('2026-07-22T18:00:01+03:00').getTime();
      Date.now = () => fixed;
    });
    await page.route(INSERT_ROUTE, (route) => route.fulfill({ status: 201, body: '' }));

    const modal = await openModal(page);
    await fillValid(modal);
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(page.getByRole('heading', { name: /te-am adăugat/i })).toBeVisible();
  });
});

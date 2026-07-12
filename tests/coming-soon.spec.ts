import { test, expect } from '@playwright/test';

// Endpoint-ul de insert al formularului „Anunță-mă la lansare".
const INSERT_ROUTE = '**/rest/v1/launch_notifications';

const openModal = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: /anunță-mă la lansare/i }).click();
  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible();
  return modal;
};

test.describe('Coming Soon — Ediția a doua', () => {
  test('afișează ecranul cu titlu, badge, countdown și CTA', async ({ page }) => {
    await page.goto('/');
    const title = page.locator('h1.cs-title');
    await expect(title).toContainText('Coming');
    await expect(title).toContainText('Soon');
    await expect(page.getByText('Eveniment nou · Ediția a doua')).toBeVisible();
    await expect(page.locator('.cs-cd-unit')).toHaveCount(4);
    await expect(page.getByText('Zile')).toBeVisible();
    await expect(page.getByRole('button', { name: /anunță-mă la lansare/i })).toBeVisible();
  });

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

  test('submit valid (mock 201) → ecran de succes', async ({ page }) => {
    await page.route(INSERT_ROUTE, (route) => route.fulfill({ status: 201, body: '' }));

    const modal = await openModal(page);
    await modal.getByPlaceholder('Popescu').fill('Test');
    await modal.getByPlaceholder('Andrei', { exact: true }).fill('Playwright');
    await modal.getByPlaceholder('andrei@email.ro').fill('pw@example.com');
    await modal.getByPlaceholder('07xx xxx xxx').fill('069123456');
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(page.getByRole('heading', { name: /te-am adăugat/i })).toBeVisible();
  });

  test('email duplicat (mock 409) → mesaj „ești deja pe listă"', async ({ page }) => {
    await page.route(INSERT_ROUTE, (route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: '{"code":"23505"}' })
    );

    const modal = await openModal(page);
    await modal.getByPlaceholder('Popescu').fill('Test');
    await modal.getByPlaceholder('Andrei', { exact: true }).fill('Dup');
    await modal.getByPlaceholder('andrei@email.ro').fill('dup@example.com');
    await modal.getByPlaceholder('07xx xxx xxx').fill('069123456');
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(page.getByRole('heading', { name: /ești deja pe listă/i })).toBeVisible();
  });
});

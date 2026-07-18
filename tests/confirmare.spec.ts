import { test, expect } from '@playwright/test';

/**
 * Pagina /confirmare — double opt-in prin linkul din email.
 * RPC-ul confirm_signup e mock-uit: testele nu ating baza reală.
 */

const RPC_ROUTE = '**/rest/v1/rpc/confirm_signup';
const TOKEN = '123e4567-e89b-42d3-a456-426614174000';

const raspunde = (rezultat: string) => (route: import('@playwright/test').Route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(rezultat),
  });

test.describe('Confirmare înscriere', () => {
  test('token valid → mesaj de succes', async ({ page }) => {
    await page.route(RPC_ROUTE, raspunde('confirmat'));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await expect(page.locator('.cf-title')).toHaveText(/înscriere confirmată/i);
    await expect(page.locator('.cf-icon')).not.toHaveClass(/err/);
  });

  test('token deja folosit → mesaj distinct, tot pozitiv', async ({ page }) => {
    await page.route(RPC_ROUTE, raspunde('deja_confirmat'));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await expect(page.locator('.cf-title')).toHaveText(/erai deja confirmat/i);
    await expect(page.locator('.cf-icon')).not.toHaveClass(/err/);
  });

  test('token necunoscut de server → link invalid', async ({ page }) => {
    await page.route(RPC_ROUTE, raspunde('invalid'));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await expect(page.locator('.cf-title')).toHaveText(/link invalid/i);
    await expect(page.locator('.cf-icon')).toHaveClass(/err/);
  });

  test('token malformat NU lovește serverul', async ({ page }) => {
    let cerut = false;
    await page.route(RPC_ROUTE, (route) => {
      cerut = true;
      return route.abort();
    });
    await page.goto('/confirmare?token=nu-e-uuid');
    await expect(page.locator('.cf-title')).toHaveText(/link invalid/i);
    expect(cerut).toBe(false);
  });

  test('fără token → link invalid, fără request', async ({ page }) => {
    let cerut = false;
    await page.route(RPC_ROUTE, (route) => {
      cerut = true;
      return route.abort();
    });
    await page.goto('/confirmare');
    await expect(page.locator('.cf-title')).toHaveText(/link invalid/i);
    expect(cerut).toBe(false);
  });

  test('eroare de rețea → mesaj de reîncercare, nu crash', async ({ page }) => {
    await page.route(RPC_ROUTE, (route) => route.fulfill({ status: 500, body: '' }));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await expect(page.locator('.cf-title')).toHaveText(/nu am putut verifica/i);
  });

  test('linkul de întoarcere duce la pagina principală', async ({ page }) => {
    await page.route(RPC_ROUTE, raspunde('confirmat'));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await page.getByRole('link', { name: /înapoi la pagina principală/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('Formularele anunță confirmarea', () => {
  test('Coming Soon: succesul cere verificarea emailului', async ({ page }) => {
    await page.route('**/rest/v1/launch_notifications', (route) =>
      route.fulfill({ status: 201, body: '' })
    );
    await page.route('**/functions/v1/send-email', (route) =>
      route.fulfill({ status: 200, body: '{"sent":1}' })
    );

    await page.goto('/');
    await page.getByRole('button', { name: /anunță-mă la lansare/i }).click();
    const modal = page.getByRole('dialog');
    await modal.getByPlaceholder('Popescu').fill('Test');
    await modal.getByPlaceholder('Andrei', { exact: true }).fill('Confirmare');
    await modal.getByPlaceholder('andrei@email.ro').fill('conf@example.com');
    await modal.getByPlaceholder('07xx xxx xxx').fill('069123456');
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(modal.getByText(/linkul din el ca să confirmi/i)).toBeVisible();
  });

  test('Coming Soon: succesul declanșează emailul de confirmare', async ({ page }) => {
    let emailBody: Record<string, unknown> = {};
    await page.route('**/rest/v1/launch_notifications', (route) =>
      route.fulfill({ status: 201, body: '' })
    );
    await page.route('**/functions/v1/send-email', async (route) => {
      emailBody = JSON.parse(route.request().postData() ?? '{}');
      return route.fulfill({ status: 200, body: '{"sent":1}' });
    });

    await page.goto('/');
    await page.getByRole('button', { name: /anunță-mă la lansare/i }).click();
    const modal = page.getByRole('dialog');
    await modal.getByPlaceholder('Popescu').fill('Test');
    await modal.getByPlaceholder('Andrei', { exact: true }).fill('Confirmare');
    await modal.getByPlaceholder('andrei@email.ro').fill('conf@example.com');
    await modal.getByPlaceholder('07xx xxx xxx').fill('069123456');
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect.poll(() => emailBody.mode).toBe('info');
    expect(emailBody.email).toBe('conf@example.com');
  });
});

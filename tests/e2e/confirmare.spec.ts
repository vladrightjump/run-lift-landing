import { test, expect } from '../support/playwright';
import { HttpResponse } from 'msw';
import { rpcHandler, functionHandler } from '../support/handlers';

/**
 * Pagina /confirmare — double opt-in prin linkul din email.
 * RPC-ul confirm_signup e mock-uit: testele nu ating baza reală.
 */

const TOKEN = '123e4567-e89b-42d3-a456-426614174000';

test.describe('Confirmare înscriere', () => {
  test('token valid → mesaj de succes', async ({ page, network }) => {
    network.use(rpcHandler('confirm_signup', () => HttpResponse.json('confirmat')));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await expect(page.locator('.cf-title')).toHaveText(/înscriere confirmată/i);
    await expect(page.locator('.cf-icon')).not.toHaveClass(/err/);
  });

  test('token deja folosit → mesaj distinct, tot pozitiv', async ({ page, network }) => {
    network.use(rpcHandler('confirm_signup', () => HttpResponse.json('deja_confirmat')));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await expect(page.locator('.cf-title')).toHaveText(/erai deja confirmat/i);
    await expect(page.locator('.cf-icon')).not.toHaveClass(/err/);
  });

  test('token necunoscut de server → link invalid', async ({ page, network }) => {
    network.use(rpcHandler('confirm_signup', () => HttpResponse.json('invalid')));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await expect(page.locator('.cf-title')).toHaveText(/link invalid/i);
    await expect(page.locator('.cf-icon')).toHaveClass(/err/);
  });

  test('token malformat NU lovește serverul', async ({ page, network }) => {
    let cerut = false;
    network.use(rpcHandler('confirm_signup', () => {
      cerut = true;
      return HttpResponse.error();
    }));
    await page.goto('/confirmare?token=nu-e-uuid');
    await expect(page.locator('.cf-title')).toHaveText(/link invalid/i);
    expect(cerut).toBe(false);
  });

  test('fără token → link invalid, fără request', async ({ page, network }) => {
    let cerut = false;
    network.use(rpcHandler('confirm_signup', () => {
      cerut = true;
      return HttpResponse.error();
    }));
    await page.goto('/confirmare');
    await expect(page.locator('.cf-title')).toHaveText(/link invalid/i);
    expect(cerut).toBe(false);
  });

  test('eroare de rețea → mesaj de reîncercare, nu crash', async ({ page, network }) => {
    network.use(rpcHandler('confirm_signup', () => new HttpResponse('', { status: 500 })));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await expect(page.locator('.cf-title')).toHaveText(/nu am putut verifica/i);
  });

  test('linkul de întoarcere duce la pagina principală', async ({ page, network }) => {
    network.use(rpcHandler('confirm_signup', () => HttpResponse.json('confirmat')));
    await page.goto(`/confirmare?token=${TOKEN}`);
    await page.getByRole('link', { name: /înapoi la pagina principală/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('Formularele anunță confirmarea', () => {
  test('Coming Soon: succesul cere verificarea emailului', async ({ page, network }) => {
    network.use(functionHandler('submit-form', () => HttpResponse.json({ ok: true })));

    await page.goto('/?preview=soon');
    await page.getByRole('button', { name: /anunță-mă la lansare/i }).click();
    const modal = page.getByRole('dialog');
    await modal.getByPlaceholder('Popescu').fill('Test');
    await modal.getByPlaceholder('Andrei', { exact: true }).fill('Confirmare');
    await modal.getByPlaceholder('andrei@email.ro').fill('conf@example.com');
    await modal.getByPlaceholder('07xx xxx xxx').fill('069123456');
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect(modal.getByText(/linkul din el ca să confirmi/i)).toBeVisible();
  });

  test('Coming Soon: înscrierea pleacă spre submit-form, care trimite emailul', async ({ page, network }) => {
    // Emailul de confirmare nu mai e declanșat din browser: îl trimite funcția
    // Edge, după ce a verificat token-ul Turnstile. Aici verificăm doar că plicul
    // ajunge corect la ea — restul e responsabilitatea serverului.
    let plic: Record<string, unknown> = {};
    network.use(functionHandler('submit-form', async ({ request }) => {
      plic = await request.json() as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }));
    let emailCerut = false;
    network.use(functionHandler('send-email', () => {
      emailCerut = true;
      return HttpResponse.json({ sent: 1 });
    }));

    await page.goto('/?preview=soon');
    await page.getByRole('button', { name: /anunță-mă la lansare/i }).click();
    const modal = page.getByRole('dialog');
    await modal.getByPlaceholder('Popescu').fill('Test');
    await modal.getByPlaceholder('Andrei', { exact: true }).fill('Confirmare');
    await modal.getByPlaceholder('andrei@email.ro').fill('conf@example.com');
    await modal.getByPlaceholder('07xx xxx xxx').fill('069123456');
    await modal.getByRole('button', { name: /^anunță-mă$/i }).click();

    await expect.poll(() => plic.mode).toBe('launch');
    expect((plic.data as Record<string, unknown>).email).toBe('conf@example.com');
    expect(emailCerut).toBe(false);
  });
});

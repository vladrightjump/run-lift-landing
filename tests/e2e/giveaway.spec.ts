import { test, expect } from '../support/playwright';
import { createHandlers } from '../support/handlers';
import { rpcResponse } from '../support/responses';
import { publicGiveaway } from '../support/builders/public';

/**
 * Pagina /giveaway pe aplicația construită.
 *
 * Producția nu poartă niciun giveaway de probă, deci până la primul conținut
 * real pagina are de arătat un singur lucru: că nu e niciun giveaway activ.
 * Parcursul de înscriere se adaugă odată cu acel conținut (planul
 * docs/plans/2026-11-14-0736-feat-giveaway-instagram-plan.md, U7).
 */
test.beforeEach(async ({ network }) => {
  network.use(...createHandlers());
});

test('accesul direct arată că nu e niciun giveaway activ', async ({ page }) => {
  const response = await page.goto('/giveaway');
  expect(response?.status()).toBeLessThan(400);
  await expect(page.getByRole('heading', { name: /niciun giveaway activ/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Deschide Instagram' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Intră în giveaway' })).toHaveCount(0);
});

test('un giveaway fără texte în cod nu deschide formularul', async ({ page, network }) => {
  network.use(rpcResponse('public_giveaway', publicGiveaway({ slug: 'fara-continut', stare: 'deschis' })));
  await page.goto('/giveaway');
  await expect(page.getByRole('heading', { name: /niciun giveaway activ/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Intră în giveaway' })).toHaveCount(0);
});

test('o citire eșuată se poate reîncerca', async ({ page, network }) => {
  network.use(rpcResponse('public_giveaway', { message: 'boom' }, { status: 500 }));
  await page.goto('/giveaway');
  await expect(page.getByRole('heading', { name: /Nu am putut încărca giveaway-ul/ })).toBeVisible();

  network.use(rpcResponse('public_giveaway', null));
  await page.getByRole('button', { name: 'Încearcă din nou' }).click();
  await expect(page.getByRole('heading', { name: /niciun giveaway activ/i })).toBeVisible();
});

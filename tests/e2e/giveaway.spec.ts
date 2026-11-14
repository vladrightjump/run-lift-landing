import { test, expect } from '../support/playwright';
import { createHandlers } from '../support/handlers';
import { rpcResponse } from '../support/responses';
import { publicGiveaway } from '../support/builders/public';
import { installAdminResponses } from '../support/admin';
import { dateGiveaway, participareGiveaway } from '../support/builders/giveaway';

/**
 * Giveaway-ul pe aplicația construită: pagina /giveaway și ecranul din admin.
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

/**
 * Ecranul din admin, de la extragere la încheiere. Serverul e simulat ca o
 * mașină de stări: fiecare scriere schimbă ce întoarce următoarea citire.
 */
test('organizatorul extrage, confirmă și încheie giveaway-ul din admin', async ({ page, network }) => {
  const ana = participareGiveaway({ id: 'p-ana', nume: 'Ana Popescu', instagram: 'ana.run', acord_contact: true });
  const ion = participareGiveaway({ id: 'p-ion', nume: 'Ion Rusu', instagram: 'ion.r' });
  const ionExtras = { ...ion, extrasa_la: '2026-12-01T10:00:00Z' };
  const castigator = { nume: 'Ion Rusu', instagram: 'ion.r', extras_la: '2026-12-01T10:00:00Z', confirmat_la: '2026-12-01T11:00:00Z' };

  let stare = dateGiveaway({ participari: [ana, ion] });
  const scrieri: { rpc: string; corp: unknown }[] = [];
  const scrie = (rpc: string, urmatoarea: ReturnType<typeof dateGiveaway>, raspuns: unknown) => (corp: unknown) => {
    scrieri.push({ rpc, corp });
    stare = urmatoarea;
    return raspuns;
  };
  installAdminResponses(network, {
    admin_giveaway_date: () => stare,
    admin_giveaway_extrage: scrie('extrage', dateGiveaway({ giveaway: { stare: 'extras' }, participari: [ana, ionExtras] }), 'p-ion'),
    admin_giveaway_confirma: scrie('confirma', dateGiveaway({ giveaway: { stare: 'confirmat', castigator }, participari: [ana, ionExtras] }), null),
    admin_giveaway_incheie: scrie(
      'incheie',
      dateGiveaway({
        giveaway: { stare: 'incheiat', castigator, incheiat_la: '2026-12-05T12:00:00Z', total_participari: 2 },
        participari: [ana],
      }),
      1
    ),
  });
  await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
  await page.goto('/admin#giveaway');

  const panou = page.getByRole('region', { name: 'Extragere' });
  await panou.getByRole('button', { name: 'Extrage câștigătorul' }).click();
  await expect(panou.getByRole('heading', { name: 'Persoană extrasă' })).toBeVisible();
  await expect(panou.getByText('Ion Rusu', { exact: true })).toBeVisible();

  await panou.getByRole('button', { name: 'Confirmă câștigătorul' }).click();
  await expect(panou.getByRole('heading', { name: 'Câștigător confirmat' })).toBeVisible();

  await panou.getByRole('button', { name: 'Încheie giveaway-ul' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByText(/1 participări fără acord/)).toBeVisible();
  await expect(dialog.getByText(/ireversibil/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Încheie definitiv' }).click();

  await expect(panou.getByRole('heading', { name: 'Giveaway încheiat' })).toBeVisible();
  await expect(panou.getByText(/Au participat 2 persoane/)).toBeVisible();
  await expect(panou.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '@ana.run' })).toBeVisible();
  await expect(page.getByRole('link', { name: '@ion.r' })).toHaveCount(0);

  expect(scrieri).toEqual([
    { rpc: 'extrage', corp: { p_token: 'token-e2e', p_giveaway_id: 'gw-1' } },
    { rpc: 'confirma', corp: { p_token: 'token-e2e', p_giveaway_id: 'gw-1' } },
    { rpc: 'incheie', corp: { p_token: 'token-e2e', p_giveaway_id: 'gw-1' } },
  ]);
});

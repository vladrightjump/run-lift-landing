import { test, expect } from '../support/playwright';
import { createHandlers } from '../support/handlers';
import { rpcResponse, submitFormResponse, type FormEnvelope } from '../support/responses';
import { publicGiveaway } from '../support/builders/public';
import { installAdminResponses } from '../support/admin';
import { dateGiveaway, participareGiveaway } from '../support/builders/giveaway';

/**
 * Giveaway-ul pe aplicația construită: pagina /giveaway și ecranul din admin.
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

test('giveaway-ul BITONIC programat arată pachetul, logoul și ora de deschidere', async ({ page, network }) => {
  network.use(rpcResponse('public_giveaway', publicGiveaway({ slug: 'bitonic-2026', stare: 'programat', ends_at: 'infinity' })));
  await page.goto('/giveaway');

  await expect(page.getByRole('heading', { name: 'Run + Lift × BITONIC' })).toBeVisible();
  await expect(page.getByText(/Înscrierile încep pe 1 noiembrie 2026.*10:00/)).toBeVisible();
  const logo = page.getByRole('img', { name: 'BITONIC', exact: true });
  await expect(logo).toBeVisible();
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  const pachet = page.getByRole('list', { name: 'Produsele din pachet' });
  for (const [nume, slug] of [
    ['BITONIC® ORANGE IMUN', 'orange-imun'],
    ['BITONIC® OMEGA 3 GOLD', 'golden-oils-forte'],
    ['BITONIC® VITAMINA D + ZINC', 'vitamina-d-zinc'],
  ]) {
    await expect(pachet.getByRole('link', { name: nume })).toHaveAttribute('href', `https://bitonic.md/products/${slug}`);
  }
  await expect(page.getByRole('button', { name: 'Intră în giveaway' })).toHaveCount(0);
});

test('pe mobil participantul vede formularul direct, consultă detaliile și se înscrie', async ({ page, network }) => {
  let plic: FormEnvelope | undefined;
  network.use(
    rpcResponse('public_giveaway', publicGiveaway({ slug: 'bitonic-2026', ends_at: 'infinity' })),
    submitFormResponse({ onRequest: (trimis) => { plic = trimis; } }),
  );
  await page.setViewportSize({ width: 390, height: 760 });
  await page.goto('/giveaway');

  const nume = page.getByLabel('Nume și prenume');
  const bifa = page.getByRole('checkbox', { name: /accept regulamentul/i });
  const titluRegulament = page.getByText('Regulament', { exact: true });
  const detalii = page.getByText('Premiul și pașii de participare', { exact: true });
  await expect(page.getByRole('heading', { level: 1, name: 'Înscrie-te la giveaway' })).toBeVisible();
  await expect(nume).toBeInViewport({ ratio: 1 });
  const dimensiuni = await nume.evaluate((input) => ({
    camp: input.getBoundingClientRect().width,
    fereastra: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensiuni.camp).toBeGreaterThan(dimensiuni.fereastra * 0.85);
  expect(dimensiuni.document).toBe(dimensiuni.fereastra);

  await nume.fill('Ana Popescu');
  await expect(page.getByRole('img', { name: 'BITONIC', exact: true })).toBeHidden();
  await detalii.click();
  await expect(page.getByText('Anunțăm pe Instagram când se vor închide înscrierile.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Urmărește @we_run_and_lift pe Instagram' }))
    .toHaveAttribute('href', 'https://instagram.com/we_run_and_lift');
  await expect(page.getByRole('link', { name: 'Urmărește @bitonic.md pe Instagram' }))
    .toHaveAttribute('href', 'https://www.instagram.com/bitonic.md');
  await expect(page.getByText('Completează formularul de pe această pagină, o singură dată.')).toBeVisible();
  await detalii.press('Enter');
  await expect(page.getByRole('img', { name: 'BITONIC', exact: true })).toBeHidden();

  await bifa.check();
  await page.getByRole('link', { name: 'regulamentul', exact: true }).press('Enter');
  await expect(titluRegulament).toBeFocused();
  await expect(titluRegulament).toBeInViewport();
  await expect(page.getByRole('heading', { name: 'Datele de participare' })).toBeVisible();
  await page.getByRole('button', { name: 'Înapoi la formular' }).click();
  await expect(bifa).toBeFocused();
  await expect(bifa).toBeChecked();
  await expect(bifa).toBeInViewport();
  await expect(nume).toHaveValue('Ana Popescu');

  await page.getByLabel('Telefon').fill('069 123 456');
  await page.getByLabel('Email').fill('ana@example.com');
  await page.getByLabel('Instagram', { exact: true }).fill('@Ana.Run');
  await page.getByRole('button', { name: 'Intră în giveaway' }).click();

  await expect(page.getByRole('heading', { name: 'Ești în giveaway!' })).toBeVisible();
  await expect(page.getByText(/Câștigătorul e ales după închiderea înscrierilor/)).toBeVisible();
  expect(plic).toMatchObject({
    mode: 'giveaway',
    data: { nume: 'Ana Popescu', instagram: 'ana.run', acord_regulament: true, acord_contact: false },
  });
});

test('pe desktop câmpurile sunt într-o singură coloană centrată', async ({ page, network }) => {
  network.use(rpcResponse('public_giveaway', publicGiveaway({ slug: 'bitonic-2026' })));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/giveaway');

  const casete = await Promise.all(['Nume și prenume', 'Telefon', 'Email', 'Instagram'].map(async (eticheta) => {
    const camp = page.getByLabel(eticheta, { exact: true });
    await expect(camp).toBeVisible();
    return camp.evaluate((input) => {
      const { x, width, top, bottom } = input.getBoundingClientRect();
      return { x, width, top, bottom };
    });
  }));
  const [prima] = casete;
  const centru = await page.evaluate(() => document.documentElement.clientWidth / 2);
  expect(prima.x + prima.width / 2).toBeCloseTo(centru);
  expect(prima.width).toBeLessThan(centru);
  for (const [index, caseta] of casete.entries()) {
    expect(caseta.x).toBe(prima.x);
    expect(caseta.width).toBe(prima.width);
    if (index > 0) expect(caseta.top).toBeGreaterThan(casete[index - 1].bottom);
  }
});

test('linkul direct la regulament îl deschide și derulează la el după încărcare', async ({ page, network }) => {
  network.use(rpcResponse('public_giveaway', publicGiveaway({ slug: 'bitonic-2026' }), { latencyMs: 350 }));
  await page.setViewportSize({ width: 390, height: 630 });
  await page.goto('/giveaway#regulament');

  await expect(page.getByRole('heading', { name: 'Datele de participare' })).toBeVisible();
  await expect(page.getByText('Regulament', { exact: true })).toBeInViewport({ ratio: 1 });
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
 * Ecranul din admin, de la oprirea înscrierilor la încheiere. Serverul e simulat ca o
 * mașină de stări: fiecare scriere schimbă ce întoarce următoarea citire.
 */
test('organizatorul închide înscrierile, extrage, confirmă și încheie giveaway-ul din admin', async ({ page, network }) => {
  const ana = participareGiveaway({ id: 'p-ana', nume: 'Ana Popescu', instagram: 'ana.run', acord_contact: true });
  const ion = participareGiveaway({ id: 'p-ion', nume: 'Ion Rusu', instagram: 'ion.r' });
  const ionExtras = { ...ion, extrasa_la: '2026-12-01T10:00:00Z' };
  const castigator = { nume: 'Ion Rusu', instagram: 'ion.r', extras_la: '2026-12-01T10:00:00Z', confirmat_la: '2026-12-01T11:00:00Z' };

  let stare = dateGiveaway({ giveaway: { stare: 'deschis', ends_at: 'infinity' }, participari: [ana, ion] });
  const scrieri: { rpc: string; corp: unknown }[] = [];
  const scrie = (rpc: string, urmatoarea: ReturnType<typeof dateGiveaway>, raspuns: unknown) => (corp: unknown) => {
    scrieri.push({ rpc, corp });
    stare = urmatoarea;
    return raspuns;
  };
  installAdminResponses(network, {
    admin_giveaway_date: () => stare,
    admin_giveaway_opreste_inscrierile: scrie('opreste', dateGiveaway({ participari: [ana, ion] }), null),
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
  const oprire = panou.getByRole('button', { name: 'Închide înscrierile' });
  const dialog = page.getByRole('alertdialog');
  await oprire.click();
  await dialog.getByRole('button', { name: 'Renunță' }).click();
  expect(scrieri).toHaveLength(0);
  await expect(panou.getByRole('button', { name: 'Extrage câștigătorul' })).toHaveCount(0);
  await oprire.click();
  await dialog.getByRole('button', { name: 'Închide acum' }).click();

  await panou.getByRole('button', { name: 'Extrage câștigătorul' }).click();
  await expect(panou.getByRole('heading', { name: 'Persoană extrasă' })).toBeVisible();
  await expect(panou.getByText('Ion Rusu', { exact: true })).toBeVisible();

  await panou.getByRole('button', { name: 'Confirmă câștigătorul' }).click();
  await expect(panou.getByRole('heading', { name: 'Câștigător confirmat' })).toBeVisible();

  await panou.getByRole('button', { name: 'Încheie giveaway-ul' }).click();
  await expect(dialog.getByText(/1 participări fără acord/)).toBeVisible();
  await expect(dialog.getByText(/ireversibil/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Încheie definitiv' }).click();

  await expect(panou.getByRole('heading', { name: 'Giveaway încheiat' })).toBeVisible();
  await expect(panou.getByText(/Au participat 2 persoane/)).toBeVisible();
  await expect(panou.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('link', { name: '@ana.run' })).toBeVisible();
  await expect(page.getByRole('link', { name: '@ion.r' })).toHaveCount(0);

  expect(scrieri).toEqual([
    { rpc: 'opreste', corp: { p_token: 'token-e2e', p_giveaway_id: 'gw-1' } },
    { rpc: 'extrage', corp: { p_token: 'token-e2e', p_giveaway_id: 'gw-1' } },
    { rpc: 'confirma', corp: { p_token: 'token-e2e', p_giveaway_id: 'gw-1' } },
    { rpc: 'incheie', corp: { p_token: 'token-e2e', p_giveaway_id: 'gw-1' } },
  ]);
});

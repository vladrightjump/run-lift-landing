import { test, expect } from '../support/playwright';
import { HttpResponse } from 'msw';
import { rpcHandler } from '../support/handlers';
import { deschideAdminul } from '../support/sala';
import { salaBrowser } from '../support/builders/salaBrowser';
import { comandaSala } from '../support/builders/sala';
import type { Locator, Page } from '@playwright/test';

/**
 * Grupul din parc în backoffice, în browser: cardul de pe pornire, ecranele și
 * scrierile care pleacă spre server.
 *
 * Nu scrie nimic: toate RPC-urile Supabase sînt interceptate, iar scrierile se
 * înregistrează ca să se verifice CE s-ar fi cerut serverului.
 */

const SALA = salaBrowser();

test.describe('grupul din parc', () => {
  for (const [buton, filtru, nume] of [
    [/^1\s*vin$/, 'Vin', 'Ana Rusu'],
    [/^1\s*nu pot$/, 'Nu vin', 'Ion Ceban'],
    [/^2\s*fără răspuns$/, 'Fără răspuns', 'Maria Lungu'],
  ] as const) {
    test(`Acum deschide prezențele cu filtrul ${filtru}`, async ({ page, network }) => {
      await deschideAdminul(page, network);
      const card = page.getByRole('region', { name: /după sondaj/ });
      await card.getByRole('button', { name: buton }).click();
      await expect(page).toHaveURL(/#grup-prezente$/);
      const urmator = page.locator("section[data-css~='admin-sala-urmator']");
      const filtre = urmator.getByRole('group', { name: 'Filtrează răspunsurile' });
      await expect(filtre.getByRole('button', { name: filtru, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(urmator.getByText(nume, { exact: true })).toBeVisible();
      for (const alt of ['Ana Rusu', 'Ion Ceban', 'Maria Lungu'].filter((n) => n !== nume)) {
        await expect(urmator.getByText(alt, { exact: true })).toHaveCount(0);
      }
      await filtre.getByRole('button', { name: 'Toți', exact: true }).click();
      for (const n of ['Ana Rusu', 'Ion Ceban', 'Maria Lungu']) {
        await expect(urmator.getByText(n, { exact: true })).toBeVisible();
      }
    });
  }

  test('scoaterea unui membru obișnuit trimite cererea, după confirmare', async ({ page, network }) => {
    const scrieri = await deschideAdminul(page, network, '#grup-membri');
    await page.getByRole('button', { name: 'Scoate-l pe Ion Ceban din grup' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Scoate din grup' }).click();
    await expect.poll(() => scrieri.find((s) => s.rpc === 'admin_sala_scoate_din_grup')?.corp).toEqual({
      p_token: 'token-e2e',
      p_membru: 'm1',
    });
  });

  test('setările botului se salvează cu textul sondajului', async ({ page, network }) => {
    const scrieri = await deschideAdminul(page, network, '#grup-bot');
    await page.getByLabel('Titlu').fill('Alergăm mâine!');
    await page.getByRole('button', { name: 'Salvează setările' }).click();
    await expect
      .poll(() => (scrieri.find((s) => s.rpc === 'admin_sala_salveaza_config')?.corp.p_config as Record<string, unknown>)?.poll_title)
      .toBe('Alergăm mâine!');
  });
});

test.describe('grupul din parc, pe telefon', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  // Fiecare ecran se verifică DUPĂ ce și-a randat datele: `main` e vizibil încă din
  // starea „Se încarcă…", când nu e nimic care să poată ieși din pagină. Butonul
  // numit e cel principal al ecranului și trebuie să rămână apăsabil pe telefon.
  const ecrane: [string, (p: Page) => Locator, (p: Page) => Locator][] = [
    ['#grup-prezente', (p) => p.getByText('Antrenamentul următor', { exact: true }), (p) => p.getByRole('button', { name: 'Anulează antrenamentul' })],
    ['#grup-membri', (p) => p.getByRole('heading', { name: 'Membrii' }), (p) => p.getByRole('button', { name: 'Editează' }).first()],
    ['#grup-analiza', (p) => p.getByRole('heading', { name: 'Fiecare antrenament' }), (p) => p.getByRole('button', { name: 'Istoric' }).first()],
    ['#grup-bot', (p) => p.getByText('Textul sondajului', { exact: true }), (p) => p.getByRole('button', { name: 'Trimite sondajul acum' })],
  ];

  for (const [ecran, gata, principal] of ecrane) {
    test(`${ecran}: fără scroll orizontal la 375px, cu butonul principal apăsabil`, async ({ page, network }) => {
      await deschideAdminul(page, network, ecran);
      await expect(gata(page)).toBeVisible();
      const lat = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(lat).toBeLessThanOrEqual(375);
      const cutie = await principal(page).boundingBox();
      expect(cutie?.height ?? 0).toBeGreaterThanOrEqual(32);
      expect((cutie?.x ?? 0) + (cutie?.width ?? 0)).toBeLessThanOrEqual(375);
    });
  }

  test('#acum: fără scroll orizontal la 375px, cu cardul antrenamentului', async ({ page, network }) => {
    await deschideAdminul(page, network, '#acum');
    await expect(page.getByRole('region', { name: /după sondaj/ })).toBeVisible();
    const lat = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(lat).toBeLessThanOrEqual(375);
  });

  test('pe „Prezențe", cine n-are Telegram se marchează de mână, cu butonul apăsabil', async ({ page, network }) => {
    const scrieri = await deschideAdminul(page, network, '#grup-prezente');
    const urmator = page.locator("section[data-css~='admin-sala-urmator']");
    await urmator.getByLabel('Fără sondaj (fără Telegram sau în pauză)').selectOption({ label: 'Dan Fără Cont' });
    const marcheaza = urmator.getByRole('button', { name: 'Marchează că vine' });
    const cutie = await marcheaza.boundingBox();
    expect(cutie?.height ?? 0).toBeGreaterThanOrEqual(32);
    expect((cutie?.x ?? 0) + (cutie?.width ?? 0)).toBeLessThanOrEqual(375);
    await marcheaza.click();
    await expect
      .poll(() => scrieri.find((s) => s.rpc === 'admin_sala_set_prezenta')?.corp)
      .toEqual({ p_token: expect.any(String), p_sesiune: 's2', p_membru: 'm4', p_raspuns: 'yes' });
  });

  test('pe „Prezențe", butoanele de marcare rămân apăsabile', async ({ page, network }) => {
    await deschideAdminul(page, network, '#grup-prezente');
    const vine = page.getByRole('group', { name: /Prezența lui Maria Lungu/ }).first().getByRole('button', { name: 'Vine' });
    await expect(vine).toBeVisible();
    const cutie = await vine.boundingBox();
    expect(cutie?.height ?? 0).toBeGreaterThanOrEqual(32);
  });
});

for (const width of [1280, 375]) {
  test(`apartenența reală, filtrele și reverificarea funcționează la ${width}px`, async ({ page, network }) => {
    await page.setViewportSize({ width, height: 900 });
    const scrieri = await deschideAdminul(page, network, '#grup-membri', { ...SALA,
      membri: SALA.membri.map((m) => m.id === 'm1' ? { ...m, telegram_membership: 'left' } : m),
    });
    await expect(page.getByText('Ana Rusu', { exact: true })).toBeVisible();
    await expect(page.getByText('Ion Ceban', { exact: true })).toHaveCount(0);
    const filtre = page.getByRole('group', { name: 'Apartenență Telegram' });
    await filtre.getByRole('button', { name: /^Arhivă/ }).click();
    await expect(page.getByText('Ion Ceban', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scoate din grup: E deja ieșit.' })).toBeDisabled();
    await filtre.getByRole('button', { name: /^Neverificați/ }).click();
    await expect(page.getByText('Dan Fără Cont', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Verifică apartenența' }).click();
    await expect.poll(() => scrieri.filter((s) => s.rpc === 'admin_sala_verifica_membri').length).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

for (const width of [1280, 375]) {
  test(`verificarea unei avertizări persistă după reload și păstrează jurnalul la ${width}px`, async ({ page, network }) => {
    await page.setViewportSize({ width, height: 900 });
    const scrieri = await deschideAdminul(page, network, '#acum');
    const command = comandaSala({ id: 'check-1', action: 'kick_member', member_id: 'm1', status: 'failed', result: 'Persoana este blocată în Telegram.', created_at: new Date().toISOString(), processed_at: new Date().toISOString(), reviewed_at: null as string | null });
    network.use(
      rpcHandler('admin_sala_date', () => HttpResponse.json({ ...SALA, azi: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(new Date()), comenzi: [command], scoateri: [command] })),
      rpcHandler('admin_sala_marcheaza_verificat', async ({ request }) => {
        expect(await request.json()).toEqual({ p_token: 'token-e2e', p_comanda: 'check-1' });
        command.reviewed_at = new Date().toISOString();
        return HttpResponse.json(null);
      }),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Marchează ca verificat' }).click();
    await expect(page.getByRole('button', { name: 'Marchează ca verificat' })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'De rezolvat' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marchează ca verificat' })).toHaveCount(0);
    await page.goto('/admin#grup-bot');
    await expect(page.getByText(/verificat de admin/)).toBeVisible();
    await expect(page.getByText(/Persoana este blocată în Telegram/)).toBeVisible();
    expect(scrieri).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

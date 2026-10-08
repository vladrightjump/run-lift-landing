import { test, expect } from '@playwright/test';
import type { Locator, Page, Request } from '@playwright/test';
import { SNAPSHOT_CONFIG } from '../src/content/eventConfig';

/**
 * Grupul din parc în backoffice, în browser: cardul de pe pornire, ecranele și
 * scrierile care pleacă spre server.
 *
 * Nu scrie nimic: toate RPC-urile Supabase sînt interceptate, iar scrierile se
 * înregistrează ca să se verifice CE s-ar fi cerut serverului.
 */

const RPC = '**/rest/v1/rpc/*';

const azi = new Date().toISOString().slice(0, 10);
const plus = (zile: number) => new Date(Date.now() + zile * 86_400_000).toISOString().slice(0, 10);

// „Dan Fără Cont" n-are Telegram: nu primește sondajul, deci se marchează de mână (R6).
const membri = ['Ana Rusu', 'Ion Ceban', 'Maria Lungu', 'Roma Admin', 'Dan Fără Cont'].map((nume, i) => ({
  id: `m${i}`,
  full_name: nume,
  status: 'active',
  is_admin: i === 3,
  telegram_user_id: i === 4 ? null : 1000 + i,
  telegram_username: null,
  bot_dm_enabled: false,
  join_date: '2026-07-01',
  telegram_membership: i === 4 ? 'unknown' : 'in_group',
}));

const SALA = {
  azi,
  config: {
    enabled: true, poll_days: [1, 3], poll_time: '12:00', summary_days: [2, 4], summary_time: '06:00',
    training_time: '06:30', location: 'Parcul Dumitru Râșcanu', auto_reminder_enabled: true,
    reminder_threshold: 6, poll_title: null, poll_yes_label: null, poll_no_label: null,
  },
  membri,
  antrenamente: [
    { id: 's2', session_date: plus(1), starts_at: '06:30', location: 'Parcul Dumitru Râșcanu', status: 'scheduled', poll_sent: true },
    { id: 's1', session_date: plus(-2), starts_at: '06:30', location: 'Parcul Dumitru Râșcanu', status: 'done', poll_sent: true },
  ],
  raspunsuri: [
    { session_id: 's2', member_id: 'm0', response: 'yes', is_first_training: false, responded_at: new Date().toISOString() },
    { session_id: 's2', member_id: 'm1', response: 'no', is_first_training: false, responded_at: new Date().toISOString() },
    { session_id: 's1', member_id: 'm2', response: 'yes', is_first_training: false, responded_at: new Date().toISOString() },
  ],
  necunoscuti: [],
  comenzi: [],
  scoateri: [],
};

const REZUMAT = {
  azi,
  pornit: true,
  poll_days: [1, 3],
  poll_time: '12:00',
  urmatorul: { session_date: plus(1), starts_at: '06:30', location: 'Parcul Dumitru Râșcanu', status: 'scheduled', poll_sent: true, vin: 1, nu_vin: 1 },
};

const RASPUNSURI: Record<string, unknown> = {
  admin_check_token: true,
  admin_list_registrations: [],
  admin_list_waitlist: [],
  admin_list_email_log: [],
  admin_list_events: [],
  admin_list_editions: [
    { editie: SNAPSHOT_CONFIG.number, participanti: 0, asteptare: 0, lansare: 0, prima: null, ultima: null, este_curenta: true },
  ],
  admin_list_launch_notifications: [],
  admin_list_email_templates: [],
  admin_get_event_config: [],
  admin_list_training_reels: [],
  admin_list_weekly_workout: [],
  admin_sala_date: SALA,
  admin_sala_rezumat: REZUMAT,
};

/** Deschide adminul cu tokenul sărit peste login; întoarce scrierile spre grup. */
const deschideAdminul = async (page: Page, ecran = '', sala = SALA) => {
  const scrieri: { rpc: string; corp: Record<string, unknown> }[] = [];
  await page.route(RPC, async (ruta) => {
    const nume = /\/rpc\/([a-z_]+)/.exec(ruta.request().url())?.[1] ?? '';
    if (nume.startsWith('admin_sala_') && !(nume in RASPUNSURI)) {
      scrieri.push({ rpc: nume, corp: JSON.parse((ruta.request() as Request).postData() ?? '{}') });
    }
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(nume === 'admin_sala_date' ? sala : nume in RASPUNSURI ? RASPUNSURI[nume] : null),
    });
  });
  await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
  await page.goto(`/admin${ecran}`);
  return scrieri;
};

test.describe('grupul din parc', () => {
  for (const [buton, filtru, nume] of [
    [/^1\s*vin$/, 'Vin', 'Ana Rusu'],
    [/^1\s*nu pot$/, 'Nu vin', 'Ion Ceban'],
    [/^2\s*fără răspuns$/, 'Fără răspuns', 'Maria Lungu'],
  ] as const) {
    test(`Acum deschide prezențele cu filtrul ${filtru}`, async ({ page }) => {
      await deschideAdminul(page);
      const card = page.getByRole('region', { name: /după sondaj/ });
      await card.getByRole('button', { name: buton }).click();
      await expect(page).toHaveURL(/#grup-prezente$/);
      const urmator = page.locator('section.admin-sala-urmator');
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

  test('scoaterea unui membru obișnuit trimite cererea, după confirmare', async ({ page }) => {
    const scrieri = await deschideAdminul(page, '#grup-membri');
    await page.getByRole('button', { name: 'Scoate-l pe Ion Ceban din grup' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Scoate din grup' }).click();
    await expect.poll(() => scrieri.find((s) => s.rpc === 'admin_sala_scoate_din_grup')?.corp).toEqual({
      p_token: 'token-e2e',
      p_membru: 'm1',
    });
  });

  test('setările botului se salvează cu textul sondajului, iar previzualizarea îl arată', async ({ page }) => {
    const scrieri = await deschideAdminul(page, '#grup-bot');
    await page.getByLabel('Titlu').fill('Alergăm mâine!');
    await expect(page.getByLabel('Așa arată sondajul în grup')).toContainText('Alergăm mâine!');
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
    ['#grup-bot', (p) => p.getByText('Textul sondajului'), (p) => p.getByRole('button', { name: 'Trimite sondajul acum' })],
  ];

  for (const [ecran, gata, principal] of ecrane) {
    test(`${ecran}: fără scroll orizontal la 375px, cu butonul principal apăsabil`, async ({ page }) => {
      await deschideAdminul(page, ecran);
      await expect(gata(page)).toBeVisible();
      const lat = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(lat).toBeLessThanOrEqual(375);
      const cutie = await principal(page).boundingBox();
      expect(cutie?.height ?? 0).toBeGreaterThanOrEqual(32);
      expect((cutie?.x ?? 0) + (cutie?.width ?? 0)).toBeLessThanOrEqual(375);
    });
  }

  test('#acum: fără scroll orizontal la 375px, cu cardul antrenamentului', async ({ page }) => {
    await deschideAdminul(page, '#acum');
    await expect(page.getByRole('region', { name: /după sondaj/ })).toBeVisible();
    const lat = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(lat).toBeLessThanOrEqual(375);
  });

  test('pe „Prezențe", cine n-are Telegram se marchează de mână, cu butonul apăsabil', async ({ page }) => {
    const scrieri = await deschideAdminul(page, '#grup-prezente');
    const urmator = page.locator('section.admin-sala-urmator');
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

  test('pe „Prezențe", butoanele de marcare rămân apăsabile', async ({ page }) => {
    await deschideAdminul(page, '#grup-prezente');
    const vine = page.getByRole('group', { name: /Prezența lui Maria Lungu/ }).first().getByRole('button', { name: 'Vine' });
    await expect(vine).toBeVisible();
    const cutie = await vine.boundingBox();
    expect(cutie?.height ?? 0).toBeGreaterThanOrEqual(32);
  });
});

for (const width of [1280, 375]) {
  test(`apartenența reală, filtrele și reverificarea funcționează la ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const scrieri = await deschideAdminul(page, '#grup-membri', { ...SALA,
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
  test(`verificarea unei avertizări persistă după reload și păstrează jurnalul la ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const scrieri = await deschideAdminul(page, '#acum');
    const command = { id: 'check-1', action: 'kick_member', member_id: 'm1', status: 'failed', result: 'Persoana este blocată în Telegram.', created_at: new Date().toISOString(), processed_at: new Date().toISOString(), reviewed_at: null as string | null };
    await page.route('**/rest/v1/rpc/admin_sala_date', (route) => route.fulfill({ json: { ...SALA, azi: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Chisinau' }).format(new Date()), comenzi: [command], scoateri: [command] } }));
    await page.route('**/rest/v1/rpc/admin_sala_marcheaza_verificat', async (route) => {
      expect(route.request().postDataJSON()).toEqual({ p_token: 'token-e2e', p_comanda: 'check-1' });
      command.reviewed_at = new Date().toISOString();
      await route.fulfill({ json: null });
    });
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

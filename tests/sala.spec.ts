import { test, expect } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
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

const membri = ['Ana Rusu', 'Ion Ceban', 'Maria Lungu', 'Roma Admin'].map((nume, i) => ({
  id: `m${i}`,
  full_name: nume,
  status: 'active',
  is_admin: i === 3,
  telegram_user_id: 1000 + i,
  telegram_username: null,
  bot_dm_enabled: false,
  join_date: '2026-07-01',
  phone: null,
  email: null,
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
const deschideAdminul = async (page: Page, ecran = '') => {
  const scrieri: { rpc: string; corp: Record<string, unknown> }[] = [];
  await page.route(RPC, async (ruta) => {
    const nume = /\/rpc\/([a-z_]+)/.exec(ruta.request().url())?.[1] ?? '';
    if (nume.startsWith('admin_sala_') && !(nume in RASPUNSURI)) {
      scrieri.push({ rpc: nume, corp: JSON.parse((ruta.request() as Request).postData() ?? '{}') });
    }
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(nume in RASPUNSURI ? RASPUNSURI[nume] : null),
    });
  });
  await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
  await page.goto(`/admin${ecran}`);
  return scrieri;
};

test.describe('grupul din parc', () => {
  test('cardul de pe pornire arată câți vin și deschide „Prezențe"', async ({ page }) => {
    await deschideAdminul(page);
    const card = page.getByLabel('Grupul din parc', { exact: true });
    await expect(card).toContainText('1 vine · 1 nu');
    await card.getByRole('button', { name: 'Prezențe' }).click();
    await expect(page).toHaveURL(/#grup-prezente$/);
    await expect(page.getByText('Antrenamentul următor')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vin 1', exact: true })).toBeVisible();
  });

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

  for (const ecran of ['#grup-prezente', '#grup-membri', '#grup-analiza', '#grup-bot', '#desfasurare']) {
    test(`${ecran}: fără scroll orizontal la 375px`, async ({ page }) => {
      await deschideAdminul(page, ecran);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForTimeout(300);
      const lat = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(lat).toBeLessThanOrEqual(375);
    });
  }

  test('pe „Prezențe", butoanele de marcare rămân apăsabile', async ({ page }) => {
    await deschideAdminul(page, '#grup-prezente');
    const vine = page.getByRole('group', { name: /Prezența lui Maria Lungu/ }).first().getByRole('button', { name: 'Vine' });
    await expect(vine).toBeVisible();
    const cutie = await vine.boundingBox();
    expect(cutie?.height ?? 0).toBeGreaterThanOrEqual(32);
  });
});

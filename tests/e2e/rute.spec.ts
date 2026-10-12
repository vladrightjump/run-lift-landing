import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { HttpResponse } from 'msw';
import { test, expect } from '../support/playwright';
import { createHandlers, rpcHandler } from '../support/handlers';
import { workout } from '../support/builders/workouts';
import { configRow } from '../support/builders/config';
import { SNAPSHOT_CONFIG } from '../../src/shared/content/eventConfig';
import { deriveEditionDates } from '../../src/shared/lib/config';

const TOKEN = '123e4567-e89b-42d3-a456-426614174000';
const BEFORE_LAUNCH = deriveEditionDates(SNAPSHOT_CONFIG).LAUNCH_DATE.getTime() - 60_000;

test.beforeEach(async ({ network }) => {
  network.use(...createHandlers({ public_weekly_workouts: [workout()] }));
});

test('toate paginile existente răspund la acces direct pe build', async ({ page }) => {
  await page.addInitScript((now) => { Date.now = () => now; }, BEFORE_LAUNCH);
  const pages = [
    ['/?preview=landing', "[data-css~=\"e3-root\"]"],
    ['/admin', '.admin-auth'],
    ['/despre-noi', "[data-css~=\"dn-root\"]"],
    ['/confirmare', 'h1'],
    ['/inscriere?preview=landing', "[data-css~=\"e3-page-title\"]"],
    ['/unsubscribe', 'h1'],
    ['/renunt', 'h1'],
    ['/antrenament', 'h1'],
  ];
  for (const [path, selector] of pages) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBeLessThan(400);
    await expect(page.locator(selector).first(), path).toBeVisible();
  }
});

test('/admin#livrare păstrează ecranul după autentificare', async ({ page }) => {
  await page.goto('/admin#livrare');
  await page.getByLabel('Utilizator').fill('organizator');
  await page.getByLabel(/^Parolă/).fill('parola-test');
  await page.getByRole('button', { name: 'Intră în cont' }).click();
  await expect(page.getByRole('heading', { name: /Livrare emailuri/ })).toBeVisible();
  await expect(page).toHaveURL(/\/admin#livrare$/);
});

test('slash-urile finale nu schimbă pagina admin sau adresa', async ({ page }) => {
  await page.goto('/admin///?origine=test#livrare');
  await expect(page.getByRole('heading', { name: 'Autentificare' })).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/\/\/\?origine=test#livrare$/);
});

test('o cale client necunoscută păstrează fallback-ul landing', async ({ page }) => {
  await page.goto('/pagina-necunoscuta?preview=landing#format');
  await expect(page.locator("[data-css~=\"e3-root\"]")).toBeVisible();
  await expect(page).toHaveURL(/\/pagina-necunoscuta\?preview=landing#format$/);
});

test('Despre noi nu cere documentul ediției', async ({ page, network }) => {
  let configRequests = 0;
  network.use(rpcHandler('public_config', () => {
    configRequests++;
    return HttpResponse.json(null);
  }));
  await page.goto('/despre-noi');
  await expect(page.locator("[data-css~=\"dn-root\"]")).toBeVisible();
  await expect(page.locator("[data-css~=\"dn-footer\"]")).toBeVisible();
  expect(configRequests).toBe(0);
});

test('preview păstrează query-ul brut, config și hash; valoarea necunoscută urmează ceasul', async ({ page, network }) => {
  network.use(rpcHandler('public_config', () => HttpResponse.json({ ...SNAPSHOT_CONFIG, showComingSoon: true })));
  await page.addInitScript((now) => { Date.now = () => now; }, BEFORE_LAUNCH);
  for (const preview of ['soon', 'landing', 'necunoscut', 'soon&preview=landing']) {
    const path = `/?preview=${preview}&config=draft&origine=a%20b&origine=c#format`;
    await page.goto(path);
    await expect(page.locator(preview === 'landing' ? "[data-css~=\"e3-root\"]" : "[data-css~=\"cs-root\"]")).toBeVisible();
    await expect(page).toHaveURL(`http://localhost:5173${path}`);
  }
});

test('confirmarea primește tokenul original și păstrează restul adresei', async ({ page, network }) => {
  let received: unknown;
  network.use(rpcHandler('confirm_signup', async ({ request }) => {
    received = await request.json();
    return HttpResponse.json('confirmat');
  }));
  const path = `/confirmare?token=${TOKEN}&origine=a%20b#email`;
  await page.goto(path);
  await expect(page.getByRole('heading', { name: /înscriere confirmată/i })).toBeVisible();
  expect(received).toEqual({ p_token: TOKEN });
  await expect(page).toHaveURL(`http://localhost:5173${path}`);
});

test('Coming Soon nu descarcă interfața sau API-ul admin', async ({ page }) => {
  test.skip(!process.env.E2E_PREVIEW, 'Dovada chunk-urilor folosește build-ul de producție.');
  // Identificăm codul prin textul interfeței și numele RPC-urilor autentificate.
  // Transportul RPC public este comun, dar implementările admin trebuie separate.
  const assets = resolve('dist/assets');
  const scripts = readdirSync(assets).filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, code: readFileSync(resolve(assets, name), 'utf8') }));
  const adminUi = scripts.filter(({ code }) => code.includes('Ieși din cont'));
  const adminApi = scripts.filter(({ code }) => /["']admin_[a-z0-9_]+["']/.test(code));
  expect(adminUi).toHaveLength(1);
  expect(adminApi.length).toBeGreaterThan(0);
  const adminAssets = [...new Set([...adminUi, ...adminApi].map(({ name }) => name))];
  const requested: string[] = [];
  page.on('request', (request) => requested.push(new URL(request.url()).pathname));
  await page.goto('/?preview=soon');
  await expect(page.locator("[data-css~=\"cs-root\"]")).toBeVisible();
  expect(requested.filter((path) => adminAssets.some((name) => path.endsWith(`/${name}`)))).toEqual([]);
  // Același artefact chiar servește adminul, deci absența de pe / nu poate
  // proveni dintr-o identificare a unui fișier care nu e folosit nicăieri.
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Autentificare' })).toBeVisible();
  for (const name of adminAssets) {
    expect(requested.some((path) => path.endsWith(`/${name}`)), name).toBe(true);
  }
});

test('ciorna autentificată încarcă configurația admin la cerere', async ({ page, network }) => {
  network.use(rpcHandler('admin_get_event_config', () => HttpResponse.json([configRow({
    status: 'draft',
    config: { ...SNAPSHOT_CONFIG, venue: { ...SNAPSHOT_CONFIG.venue, name: 'Locul ciornei test' } },
  })])));
  await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-test'));
  await page.goto('/?config=draft&preview=landing');
  await expect(page.getByText(/Locul ciornei test/).first()).toBeVisible();
});

test('Escape restaurează query-ul brut al landing-ului', async ({ page }) => {
  await page.addInitScript((now) => { Date.now = () => now; }, BEFORE_LAUNCH);
  const path = '/?preview=landing&preview=soon&config=draft&config=public&origine=a%20b&origine=c';
  await page.goto(`${path}#format`);
  await page.getByRole('link', { name: /înscrie-te/i }).first().click();
  await expect(page.getByRole('dialog', { name: /înscriere/i })).toBeVisible();
  await expect(page).toHaveURL('http://localhost:5173/inscriere');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: /înscriere/i })).toHaveCount(0);
  // Închiderea manuală păstrează comportamentul existent: fragmentul se elimină.
  await expect(page).toHaveURL(`http://localhost:5173${path}`);
  expect(await page.evaluate(() => new URLSearchParams(location.search).get('preview'))).toBe('landing');
  await expect(page.locator("[data-css~=\"e3-root\"]")).toBeVisible();
});

test('Back închide overlay-ul de înscriere și păstrează landing-ul', async ({ page }) => {
  await page.addInitScript((now) => { Date.now = () => now; }, BEFORE_LAUNCH);
  await page.goto('/?preview=landing');
  await page.getByRole('link', { name: /înscrie-te/i }).first().click();
  await expect(page.getByRole('dialog', { name: /înscriere/i })).toBeVisible();
  await expect(page).toHaveURL('http://localhost:5173/inscriere');
  await page.goBack();
  await expect(page.getByRole('dialog', { name: /înscriere/i })).toHaveCount(0);
  await expect(page.locator("[data-css~=\"e3-root\"]")).toBeVisible();
  await expect(page).toHaveURL('http://localhost:5173/?preview=landing');
});

test('reload pe URL-ul overlay-ului deschide pagina de înscriere de sine stătătoare', async ({ page }) => {
  await page.addInitScript((now) => { Date.now = () => now; }, BEFORE_LAUNCH);
  await page.goto('/?preview=landing');
  await page.getByRole('link', { name: /înscrie-te/i }).first().click();
  await expect(page.getByRole('dialog', { name: /înscriere/i })).toBeVisible();
  await page.reload();
  await expect(page.locator("[data-css~=\"e3-page-title\"]")).toHaveText('Înscrie-te');
  await expect(page.getByRole('dialog', { name: /înscriere/i })).toHaveCount(0);
  await expect(page).toHaveURL('http://localhost:5173/inscriere');
});

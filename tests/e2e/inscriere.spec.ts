import { test, expect, type NetworkFixture } from '../support/playwright';
import { rpcResponse, functionReply, submitFormResponse, type FormEnvelope as Plic } from '../support/responses';
import { publicStats } from '../support/builders/public';
import type { Page } from '@playwright/test';
import { EDITION } from '../../src/shared/content/edition';

/**
 * Formularul de înscriere la eveniment — landing-ul Ediției a treia.
 * Se accesează cu ?preview=landing (altfel, până la ora lansării, „/" arată
 * Coming Soon). Toate endpoint-urile Supabase sunt mock-uite: testele NU scriu
 * în baza de date reală și nu trimit emailuri.
 */

// Toate formularele trec acum prin aceeași funcție Edge, care verifică Turnstile
// înainte de a scrie (browserul nu mai are voie să insereze direct în PostgREST).
// Testele disting înscrierea de lista de așteptare după câmpul `mode` din plic.

// Ora fixată înainte de start (8 august) ca formularul să fie mereu deschis,
// indiferent când rulează testul.
const fixClock = (page: Page) =>
  page.addInitScript(() => {
    const fixed = new Date('2026-08-06T10:00:00+03:00').getTime();
    const RealDate = Date;
    // Doar Date.now e citit de useCountdown/useNow — îl fixăm.
    Date.now = () => fixed;
    void RealDate;
  });

const mockStats = (network: NetworkFixture, count: number, waitlist = 0) =>
  network.use(rpcResponse('public_stats', publicStats({ count, waitlist })));

const mockEmail = (network: NetworkFixture) =>
  network.use(functionReply('send-email', { sent: 1 }));

const fillValid = async (page: Page) => {
  await page.getByPlaceholder('Popescu').fill('Filip');
  await page.getByPlaceholder('Ana', { exact: true }).fill('Vladislav');
  await page.getByPlaceholder('07xx xxx xxx').fill('069509949');
  await page.getByPlaceholder('ana@email.ro').fill('pw@example.com');
  await page.getByPlaceholder('zz.ll.aaaa').fill('15.05.1994');
  await page.locator('input[name="acord"]').check();
};

const submitBtn = (page: Page) => page.getByRole('button', { name: /trimite înscrierea/i });

test.describe('Înscriere — formular ediția curentă', () => {
  test('formularul e vizibil cu buton activ „Trimite înscrierea"', async ({ page, network }) => {
    await fixClock(page);
    mockStats(network, 0);
    await page.goto('/?preview=landing');

    const btn = submitBtn(page);
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  // Regresie critică: butonul se dezactiva pe navigator.onLine === false (fals
  // „OFFLINE" pe unele rețele/VPN) și bloca toate înscrierile.
  test('nu se blochează pe „offline" fals — submit-ul merge chiar dacă navigator.onLine e false', async ({
    page, network,
  }) => {
    await fixClock(page);
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false })
    );
    mockStats(network, 0);
    mockEmail(network);
    network.use(submitFormResponse());

    await page.goto('/?preview=landing');

    const btn = submitBtn(page);
    await expect(btn).toBeEnabled();
    await expect(btn).not.toHaveText(/offline/i);

    await fillValid(page);
    await btn.click();
    await expect(page.getByText(/te-ai înregistrat/i)).toBeVisible();
  });

  test('submit valid → plic corect spre submit-form, cu dovezi anti-bot și fără ediție', async ({
    page, network,
  }) => {
    await fixClock(page);
    mockStats(network, 0);
    mockEmail(network);

    let plic: Plic | null = null;
    network.use(submitFormResponse({ onRequest: (p) => { plic = p; } }));

    await page.goto('/?preview=landing');
    await fillValid(page);
    await submitBtn(page).click();

    await expect(page.getByText(/te-ai înregistrat/i)).toBeVisible();
    const trimis = plic as unknown as Plic;
    expect(trimis.mode).toBe('registration');
    // Data nașterii vine acum dintr-un singur câmp scris (`BirthDateField`), nu
    // din trei selectoare — dar ajunge în plic la fel, ca ISO.
    expect(trimis.data.dataNasterii).toBe('1994-05-15');
    expect(trimis.data.telefon).toBe('069509949');
    // Ediția o decide serverul (DEFAULT din DB): dacă ar veni din client, un bot
    // ar putea scrie în edițiile de arhivă.
    expect(trimis.data).not.toHaveProperty('editie');
    expect(trimis).not.toHaveProperty('editie');
    // Dovezile anti-bot însoțesc fiecare submit: capcana goală + timp plauzibil.
    expect(trimis.hp).toBe('');
    expect(typeof trimis.elapsed).toBe('number');
    // Regresia din 4 aug (`Content-Profile: runlift`) nu mai e a clientului:
    // browserul nu mai vorbește cu PostgREST. Header-ul îl pune `insertRow` din
    // `submit-form`, iar garda e în `tests/integration/backend.live.test.ts`.
  });

  // Pe telefon, cele 3 select-uri însemnau 3 deschideri de picker pentru o
  // singură informație. Testul păzește să nu se întoarcă pe furiș.
  test('data nașterii e un singur câmp scris, nu trei select-uri', async ({ page, network }) => {
    await fixClock(page);
    mockStats(network, 0);
    await page.goto('/?preview=landing');

    const camp = page.getByPlaceholder('zz.ll.aaaa');
    await expect(camp).toBeVisible();
    await expect(camp).toHaveAttribute('inputmode', 'numeric');
    await expect(page.locator('form select')).toHaveCount(0);

    // Punctele apar singure, iar valoarea trimisă mai departe e ISO.
    await camp.fill('15.05.1994');
    await expect(camp).toHaveValue('15.05.1994');
    await expect(page.locator('input[name="dataNasterii"]')).toHaveValue('1994-05-15');
  });

  test('email duplicat (mock 409) → ecran „Ceva n-a mers"', async ({ page, network }) => {
    await fixClock(page);
    mockStats(network, 0);
    mockEmail(network);
    network.use(submitFormResponse({ status: 409, body: { code: '23505' } }));

    await page.goto('/?preview=landing');
    await fillValid(page);
    await submitBtn(page).click();

    await expect(page.getByText(/ceva n-a mers/i)).toBeVisible();
  });

  test('sold-out (la capacitate) → butonul devine „listă de așteptare" și scrie în event_waitlist', async ({
    page, network,
  }) => {
    await fixClock(page);
    mockStats(network, EDITION.slots.total);
    mockEmail(network);

    let waitlistHit = false;
    network.use(submitFormResponse({ onRequest: (plic) => {
      if (plic.mode === 'waitlist') waitlistHit = true;
    } }));

    await page.goto('/?preview=landing');

    const wlBtn = page.getByRole('button', { name: /lista de așteptare/i });
    await expect(wlBtn).toBeVisible();

    await page.getByPlaceholder('Popescu').fill('Filip');
  await page.getByPlaceholder('Ana', { exact: true }).fill('Vladislav');
    await page.getByPlaceholder('07xx xxx xxx').fill('069509949');
    await page.getByPlaceholder('ana@email.ro').fill('pw@example.com');
    await page.getByPlaceholder('zz.ll.aaaa').fill('15.05.1994');
    await page.locator('input[name="acord"]').check();
    await wlBtn.click();

    await expect(page.getByText(/lista de așteptare/i).first()).toBeVisible();
    expect(waitlistHit).toBe(true);
  });

  test('secțiunea Locație: harta e afișată, iar linkul duce la Google Maps', async ({ page, network }) => {
    await fixClock(page);
    mockStats(network, 0);
    await page.goto('/?preview=landing');

    // Harta embed a locației (Scările de Granit) e prezentă.
    await expect(page.locator('iframe[title*="hartă"]')).toHaveAttribute('src', /maps\.google\.com/);

    // Linkul „Deschide în Google Maps" duce chiar la Google Maps, într-un tab nou.
    const link = page.getByRole('link', { name: /deschide în google maps/i });
    await expect(link).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\//);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
  });
});

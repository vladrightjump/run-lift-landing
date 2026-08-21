import { test, expect } from '@playwright/test';
import { LAUNCH_DATE } from '../src/lib/config';

/**
 * Pagina /despre-noi — prezentare + formular „Vreau info".
 * Endpointurile Supabase sunt mock-uite: testele nu scriu în baza reală
 * și nu trimit emailuri.
 */

// Formularul trece prin funcția Edge `submit-form` (verifică Turnstile înainte
// de a scrie); emailul de bun venit îl trimite tot ea, server-side.
const INSERT_ROUTE = '**/functions/v1/submit-form';
const EMAIL_ROUTE = '**/functions/v1/send-email';
const OK = { status: 200, contentType: 'application/json', body: '{"ok":true}' };

const completeaza = async (page: import('@playwright/test').Page) => {
  await page.getByPlaceholder('Nume', { exact: true }).fill('Popescu');
  await page.getByPlaceholder('Prenume', { exact: true }).fill('Andrei');
  await page.getByPlaceholder('email@exemplu.md').fill('andrei@email.ro');
  await page.getByPlaceholder('069 123 456').fill('069123456');
};

test.describe('Despre noi — conținut', () => {
  test('se încarcă pe ruta /despre-noi (nu 404)', async ({ page }) => {
    const res = await page.goto('/despre-noi');
    expect(res?.status()).toBeLessThan(400);
    await expect(page.locator('.dn-root')).toBeVisible();
  });

  test('afișează hero, secțiunile și valorile', async ({ page }) => {
    await page.goto('/despre-noi');
    await expect(page.locator('.dn-kicker')).toHaveText(/cine suntem/i);
    await expect(page.locator('.dn-hero-title')).toContainText('Mai mult decât');

    for (const titlu of [
      'Povestea noastră',
      'Comunitatea',
      'Cum arată un antrenament',
      'Unde ne antrenăm',
      'Vrei mai multe informații?',
    ]) {
      await expect(page.locator('.dn-section-head h2', { hasText: titlu })).toBeVisible();
    }
    await expect(page.locator('.dn-value-card')).toHaveCount(3);
    await expect(page.locator('.dn-stat')).toHaveCount(4);
  });

  test('linkul de Instagram e corect și se deschide în tab nou', async ({ page }) => {
    await page.goto('/despre-noi');
    const ig = page.locator('.dn-footer a', { hasText: /instagram/i });
    await expect(ig).toHaveAttribute('href', 'https://instagram.com/we_run_and_lift');
    await expect(ig).toHaveAttribute('target', '_blank');
    await expect(ig).toHaveAttribute('rel', /noopener/);
  });

  test('nu face requesturi către Supabase la încărcare', async ({ page }) => {
    let hits = 0;
    await page.route('**/rest/v1/**', (route) => {
      hits += 1;
      return route.abort();
    });
    await page.goto('/despre-noi');
    await expect(page.locator('.dn-root')).toBeVisible();
    await page.waitForTimeout(1000);
    expect(hits).toBe(0);
  });

  test('fără scroll orizontal pe mobil', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 720 });
    await page.goto('/despre-noi');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('Despre noi — formular', () => {
  test('submit gol nu trimite request și arată eroare', async ({ page }) => {
    let cerut = false;
    await page.route(INSERT_ROUTE, (route) => {
      cerut = true;
      return route.abort();
    });

    await page.goto('/despre-noi');
    await page.locator('.dn-submit').click();

    await expect(page.locator('.dn-error')).toBeVisible();
    await expect(page.locator('.dn-field.invalid')).toHaveCount(4);
    expect(cerut).toBe(false);
  });

  test('trimite sursa "despre-noi", dovezile anti-bot și NU trimite ediția', async ({ page }) => {
    let plic: Record<string, unknown> = {};
    await page.route(INSERT_ROUTE, async (route) => {
      plic = JSON.parse(route.request().postData() ?? '{}');
      return route.fulfill(OK);
    });

    await page.goto('/despre-noi');
    await completeaza(page);
    await page.locator('.dn-submit').click();

    await expect(page.locator('.dn-success')).toBeVisible();
    expect(plic.mode).toBe('launch');
    const date = plic.data as Record<string, unknown>;
    expect(date.sursa).toBe('despre-noi');
    // Ediția o decide serverul (DEFAULT din DB), nu clientul.
    expect(date).not.toHaveProperty('editie');
    expect(plic).not.toHaveProperty('editie');
    // Capcana goală + timp pe formular: dovezile pe care le verifică serverul.
    expect(plic.hp).toBe('');
    expect(typeof plic.elapsed).toBe('number');
  });

  test('emailul de bun venit NU mai pleacă din browser — îl trimite funcția Edge', async ({
    page,
  }) => {
    // Înainte, clientul apela `send-email` cu modul „info" folosind cheia
    // publishable, deci oricine putea declanșa trimiteri. Acum emailul pleacă
    // server-side, imediat după insert, în aceeași funcție care a validat captcha.
    let emailCerut = false;
    await page.route(INSERT_ROUTE, (route) => route.fulfill(OK));
    await page.route(EMAIL_ROUTE, (route) => {
      emailCerut = true;
      return route.fulfill({ status: 200, body: '{"sent":1}' });
    });

    await page.goto('/despre-noi');
    await completeaza(page);
    await page.locator('.dn-submit').click();

    await expect(page.locator('.dn-success')).toBeVisible();
    expect(emailCerut).toBe(false);
  });

  test('duplicatul (409) e tratat tot ca succes', async ({ page }) => {
    await page.route(INSERT_ROUTE, (route) =>
      route.fulfill({ status: 409, contentType: 'application/json', body: '{"code":"23505"}' })
    );
    await page.route(EMAIL_ROUTE, (route) => route.fulfill({ status: 200, body: '{}' }));

    await page.goto('/despre-noi');
    await completeaza(page);
    await page.locator('.dn-submit').click();

    await expect(page.locator('.dn-success')).toBeVisible();
  });

  test('eroarea de server păstrează datele completate', async ({ page }) => {
    await page.route(INSERT_ROUTE, (route) => route.fulfill({ status: 500, body: '' }));

    await page.goto('/despre-noi');
    await completeaza(page);
    await page.locator('.dn-submit').click();

    await expect(page.locator('.dn-error')).toContainText(/nu am putut trimite/i);
    // Datele rămân, ca omul să nu le rescrie.
    await expect(page.getByPlaceholder('email@exemplu.md')).toHaveValue('andrei@email.ro');
    await expect(page.locator('.dn-submit')).toBeEnabled();
  });

  test('emailul invalid e respins fără request', async ({ page }) => {
    let cerut = false;
    await page.route(INSERT_ROUTE, (route) => {
      cerut = true;
      return route.abort();
    });

    await page.goto('/despre-noi');
    await completeaza(page);
    await page.getByPlaceholder('email@exemplu.md').fill('nu-e-email');
    await page.locator('.dn-submit').click();

    await expect(page.locator('.dn-error')).toBeVisible();
    expect(cerut).toBe(false);
  });
});

test.describe('Navigare între pagini', () => {
  test('butonul „Află mai multe" de pe Coming Soon duce la /despre-noi', async ({ page }) => {
    await page.goto('/?preview=soon');
    const buton = page.getByRole('link', { name: /află mai multe/i });
    await expect(buton).toBeVisible();
    await buton.click();
    await expect(page).toHaveURL(/\/despre-noi$/);
    await expect(page.locator('.dn-root')).toBeVisible();
  });

  test('logoul din /despre-noi duce înapoi acasă (landing)', async ({ page }) => {
    // Logoul duce la „/" fără query. Fixăm ceasul după LAUNCH_DATE ca „/" să
    // arate landing-ul indiferent de faza curentă (Coming Soon vs. înscrieri).
    // Mock la stats ca să nu atingem DB-ul real.
    await page.addInitScript((fixed) => {
      Date.now = () => fixed;
    }, LAUNCH_DATE.getTime() + 1000);
    await page.route('**/rest/v1/rpc/public_stats', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, participants: [], waitlist: 0 }),
      })
    );
    await page.goto('/despre-noi');
    await page.locator('.dn-logo').click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('#inscriere')).toBeVisible();
  });

  test('Instagram apare și pe Coming Soon', async ({ page }) => {
    await page.goto('/?preview=soon');
    await expect(page.locator('.cs-footer a', { hasText: /instagram/i })).toHaveAttribute(
      'href',
      'https://instagram.com/we_run_and_lift'
    );
  });
});

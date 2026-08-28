import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

/**
 * Linkul direct `/inscriere` + overlay-ul de pe landing.
 *
 * `/inscriere` NU are nevoie de `?preview=landing`: parametrul ăla guvernează
 * doar poarta Coming Soon din `App.tsx`, iar ruta nouă e servită direct din
 * `main.tsx`. Toate endpoint-urile Supabase sunt mock-uite: testele nu scriu în
 * baza de date reală și nu trimit emailuri.
 */

const STATS_ROUTE = '**/rest/v1/rpc/public_stats';
// Browserul nu mai scrie direct în PostgREST: toate formularele publice trec
// prin funcția Edge, care verifică Turnstile înainte de insert. Fișierul ăsta a
// apărut pe `main` DUPĂ ce PR-ul anti-bot fusese scris, deci merge-ul l-a lăsat
// în pace și mock-urile lui vizau un endpoint mort.
const REG_ROUTE = '**/functions/v1/submit-form';
const EMAIL_ROUTE = '**/functions/v1/send-email';

/** Plicul trimis către `submit-form`: { mode, token, hp, elapsed, data }. */
type Plic = {
  mode: string;
  token: string;
  hp: string;
  elapsed: number;
  data: Record<string, unknown>;
};

const fixClock = (page: Page) =>
  page.addInitScript(() => {
    const fixed = new Date('2026-08-06T10:00:00+03:00').getTime();
    Date.now = () => fixed;
  });

const mockStats = (page: Page, count: number, waitlist = 0) =>
  page.route(STATS_ROUTE, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count, participants: [], waitlist }),
    })
  );

const mockEmail = (page: Page) =>
  page.route(EMAIL_ROUTE, (route: Route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"sent":1}' })
  );

const dateField = (page: Page) => page.getByPlaceholder('zz.ll.aaaa');

const fillValid = async (page: Page) => {
  await page.getByPlaceholder('Ana Popescu').fill('Vladislav Filip');
  await page.getByPlaceholder('07xx xxx xxx').fill('069509949');
  await page.getByPlaceholder('ana@email.ro').fill('pw@example.com');
  await dateField(page).fill('15.05.1994');
  await page.locator('input[name="acord"]').check();
};

const submitBtn = (page: Page) => page.getByRole('button', { name: /trimite înscrierea/i });

test.describe('/inscriere — pagina cu link direct', () => {
  test('se deschide direct pe formular, cu primul câmp focusat', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await page.goto('/inscriere');

    await expect(page.getByRole('heading', { name: /înscrie-te/i })).toBeVisible();
    await expect(submitBtn(page)).toBeEnabled();
    // Fără scroll și fără căutat: cursorul e deja în „Nume complet".
    await expect(page.getByPlaceholder('Ana Popescu')).toBeFocused();
  });

  test('submit valid → aceleași date ca de pe landing', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await mockEmail(page);

    let plic: Plic | null = null;
    await page.route(REG_ROUTE, (route: Route) => {
      plic = route.request().postDataJSON() as Plic;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });

    await page.goto('/inscriere');
    await fillValid(page);
    await submitBtn(page).click();

    await expect(page.getByText(/te-ai înscris/i)).toBeVisible();
    const trimis = plic as unknown as Plic;
    expect(trimis.mode).toBe('registration');
    // Data scrisă „15.05.1994" ajunge ISO la backend.
    expect(trimis.data.dataNasterii).toBe('1994-05-15');
    expect(trimis.data.telefon).toBe('069509949');
    // Ediția NU pleacă din client: o pune serverul din DEFAULT
    // (`current_event_edition()`). Altfel un tab vechi ar scrie în ediția
    // greșită după o publicare.
    expect(trimis.data).not.toHaveProperty('editie');
    // Capcana anti-bot pleacă și de aici, nu doar de pe landing: `/inscriere`
    // randează `RegistrationForm`, care e o suprafață publică în sine.
    expect(trimis.hp).toBe('');
    expect(typeof trimis.elapsed).toBe('number');
  });

  test('vârstă sub minim → eroare pe câmp, fără request', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    let requested = false;
    await page.route(REG_ROUTE, (route: Route) => {
      requested = true;
      return route.abort();
    });

    await page.goto('/inscriere');
    await page.getByPlaceholder('Ana Popescu').fill('Vladislav Filip');
    await page.getByPlaceholder('07xx xxx xxx').fill('069509949');
    await page.getByPlaceholder('ana@email.ro').fill('pw@example.com');
    await dateField(page).fill('15.05.2020');
    await page.locator('input[name="acord"]').check();
    await submitBtn(page).click();

    await expect(page.getByText(/minim 14 ani/i).first()).toBeVisible();
    expect(requested).toBe(false);
  });

  test('data incompletă nu trece drept validă', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    let requested = false;
    await page.route(REG_ROUTE, (route: Route) => {
      requested = true;
      return route.abort();
    });

    await page.goto('/inscriere');
    await page.getByPlaceholder('Ana Popescu').fill('Vladislav Filip');
    await page.getByPlaceholder('07xx xxx xxx').fill('069509949');
    await page.getByPlaceholder('ana@email.ro').fill('pw@example.com');
    await dateField(page).fill('15.05');
    await page.locator('input[name="acord"]').check();
    await submitBtn(page).click();

    await expect(page.getByText(/introdu data nașterii/i)).toBeVisible();
    expect(requested).toBe(false);
  });

  test('după confirmare ajunge pe landing, cu bannerul afișat o singură dată', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 12);
    await mockEmail(page);
    await page.route(REG_ROUTE, (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

    await page.goto('/inscriere');
    await fillValid(page);
    await submitBtn(page).click();
    await expect(page.getByText(/te-ai înscris/i)).toBeVisible();

    // Redirect după 3 secunde, fără ca noi să atingem nimic. Așteptăm bannerul,
    // nu URL-ul: navigarea reală detașează frame-ul și waitForURL dă ERR_ABORTED.
    const banner = page.getByRole('status').filter({ hasText: /ești înscris/i });
    await expect(banner).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toContain('#participanti');

    // Flagul e consumat: la reload bannerul nu mai apare.
    await page.reload();
    await expect(page.getByRole('status').filter({ hasText: /ești înscris/i })).toHaveCount(0);
  });

  test('o interacțiune oprește redirectul automat', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await mockEmail(page);
    await page.route(REG_ROUTE, (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

    await page.goto('/inscriere');
    await fillValid(page);
    await submitBtn(page).click();
    await expect(page.getByText(/te-ai înscris/i)).toBeVisible();

    // Un tap oprește numărătoarea — altfel i-am smulge butoanele de sub deget.
    await page.mouse.click(5, 5);
    await page.waitForTimeout(5000);

    expect(new URL(page.url()).pathname).toBe('/inscriere');
    await expect(page.getByRole('button', { name: /adaugă în calendar/i })).toBeVisible();
  });
});

test.describe('overlay-ul de pe landing', () => {
  test('CTA-urile deschid overlay-ul și schimbă URL-ul fără reîncărcare', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await page.goto('/?preview=landing');

    // Fallback fără JS: linkul duce tot la pagina reală.
    const cta = page.getByRole('link', { name: /înscrie-te/i }).first();
    await expect(cta).toHaveAttribute('href', '/inscriere');

    await cta.click();
    const overlay = page.getByRole('dialog', { name: /înscriere/i });
    await expect(overlay).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/inscriere');
  });

  test('Esc închide overlay-ul și pune URL-ul la loc', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await page.goto('/?preview=landing');

    await page.getByRole('link', { name: /înscrie-te/i }).first().click();
    await expect(page.getByRole('dialog', { name: /înscriere/i })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: /înscriere/i })).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('înscriere din overlay: confirmare, fără banner (ești deja pe landing)', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await mockEmail(page);
    await page.route(REG_ROUTE, (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

    await page.goto('/?preview=landing');
    await page.getByRole('link', { name: /înscrie-te/i }).first().click();

    const overlay = page.getByRole('dialog', { name: /înscriere/i });
    await overlay.getByPlaceholder('Ana Popescu').fill('Vladislav Filip');
    await overlay.getByPlaceholder('07xx xxx xxx').fill('069509949');
    await overlay.getByPlaceholder('ana@email.ro').fill('pw@example.com');
    await overlay.getByPlaceholder('zz.ll.aaaa').fill('15.05.1994');
    await overlay.locator('input[name="acord"]').check();
    await overlay.getByRole('button', { name: /trimite înscrierea/i }).click();

    await expect(page.getByText(/te-ai înscris/i)).toBeVisible();
    // markJustSignedUp nu e apelat din overlay (fără prop `redirect`), deci
    // bannerul de aterizare nu are ce consuma.
    await expect(page.getByRole('status').filter({ hasText: /ești înscris/i })).toHaveCount(0);
  });

  // Regresia pe care kitul o avea: setTimeout gol, care închidea confirmarea
  // chiar dacă utilizatorul era la jumătatea unui tap pe „Adaugă în calendar".
  test('o interacțiune oprește închiderea automată a overlay-ului', async ({ page }) => {
    await fixClock(page);
    await mockStats(page, 0);
    await mockEmail(page);
    await page.route(REG_ROUTE, (route: Route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

    await page.goto('/?preview=landing');
    await page.getByRole('link', { name: /înscrie-te/i }).first().click();

    const overlay = page.getByRole('dialog', { name: /înscriere/i });
    await overlay.getByPlaceholder('Ana Popescu').fill('Vladislav Filip');
    await overlay.getByPlaceholder('07xx xxx xxx').fill('069509949');
    await overlay.getByPlaceholder('ana@email.ro').fill('pw@example.com');
    await overlay.getByPlaceholder('zz.ll.aaaa').fill('15.05.1994');
    await overlay.locator('input[name="acord"]').check();
    await overlay.getByRole('button', { name: /trimite înscrierea/i }).click();

    await expect(page.getByText(/te-ai înscris/i)).toBeVisible();
    await page.keyboard.press('Shift');
    await page.waitForTimeout(5000);

    await expect(overlay).toBeVisible();
    // Scopat la overlay: landing-ul are propriul buton cu același text.
    await expect(overlay.getByRole('button', { name: /adaugă în calendar/i })).toBeVisible();
  });
});

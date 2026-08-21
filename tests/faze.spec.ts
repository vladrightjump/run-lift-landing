import { test, expect } from '@playwright/test';
import type { Page, Route } from '@playwright/test';
import { LEADERBOARD_DATE, EVENT_DATE, EVENT_END_DATE, NEXT_EDITION_DATE } from '../src/lib/config';

/**
 * Cele trei faze ale zilei de eveniment, pe rutele „/" și „/inscriere".
 *
 * Ceasul e fixat prin `Date.now` (singurul citit de `useCountdown`/`useNow`),
 * iar momentele se derivă din config — nicio dată scrisă de mână, deci testul
 * rămâne valid la ediția următoare. `public_stats` e mock-uit: nimic nu atinge
 * baza de date reală.
 */

const STATS_ROUTE = '**/rest/v1/rpc/public_stats';

const PARTICIPANTI = [{ nume: 'Andrei P.' }, { nume: 'Maria C.' }, { nume: 'Ion V.' }];

const fixClock = (page: Page, moment: number) =>
  page.addInitScript((fixed) => {
    Date.now = () => fixed;
  }, moment);

const mockStats = (page: Page, participants: { nume: string }[]) =>
  page.route(STATS_ROUTE, (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ count: participants.length, participants, waitlist: 0 }),
    })
  );

/** Momentele-cheie din tabelul de faze al planului. */
const INAINTE = LEADERBOARD_DATE.getTime() - 60_000;
const IN_FEREASTRA = LEADERBOARD_DATE.getTime() + 60_000;
const IN_TIMPUL_CURSEI = EVENT_DATE.getTime() + 60_000;
const DUPA_CURSA = EVENT_END_DATE.getTime() + 60_000;

test.beforeEach(async ({ page }) => {
  await mockStats(page, PARTICIPANTI);
});

test.describe('Faza „pre" — până cu o oră înainte de start', () => {
  test('secțiunea de înscriere e pe pagină', async ({ page }) => {
    await fixClock(page, INAINTE);
    await page.goto('/');
    await expect(page.locator('#inscriere')).toBeVisible();
    await expect(page.locator('.cs-root')).toHaveCount(0);
  });
});

test.describe('Faza „leaderboard" — de la o oră înainte de start', () => {
  test('nu mai există nicio cale spre formular', async ({ page }) => {
    await fixClock(page, IN_FEREASTRA);
    await page.goto('/');
    await expect(page.locator('#participanti')).toBeVisible();
    await expect(page.locator('#inscriere')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Înscrie-te' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Rezervă-ți locul' })).toHaveCount(0);
  });

  test('„cine vine" stă deasupra secțiunilor de format și locație', async ({ page }) => {
    await fixClock(page, IN_FEREASTRA);
    await page.goto('/');
    const titluri = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(titluri.indexOf('Cine vine')).toBeGreaterThanOrEqual(0);
    expect(titluri.indexOf('Cine vine')).toBeLessThan(titluri.indexOf('Formatul'));
    expect(titluri.indexOf('Cine vine')).toBeLessThan(titluri.indexOf('Locația'));
  });

  test('în modul complet „cine vine" rămâne sub format și locație', async ({ page }) => {
    await fixClock(page, INAINTE);
    await page.goto('/');
    const titluri = await page.getByRole('heading', { level: 2 }).allTextContents();
    expect(titluri.indexOf('Cine vine')).toBeGreaterThan(titluri.indexOf('Formatul'));
    expect(titluri.indexOf('Cine vine')).toBeGreaterThan(titluri.indexOf('Locația'));
  });

  // Cineva care se înscrie prin linkul direct în ora dinaintea startului
  // aterizează pe homepage-ul deja restructurat — bannerul lui trebuie să
  // supraviețuiască mutării secțiunilor, iar ancora să ducă tot la listă.
  test('bannerul de aterizare apare și în fereastra fără înscriere', async ({ page }) => {
    await fixClock(page, IN_FEREASTRA);
    await page.addInitScript(() => {
      sessionStorage.setItem(
        'runlift_abia_inscris',
        JSON.stringify({ prenume: 'Andrei', loc: 3, waitlist: false })
      );
    });
    await page.goto('/#participanti');
    await expect(page.getByRole('status').filter({ hasText: 'Andrei' })).toBeVisible();
    await expect(page.locator('#participanti')).toBeVisible();
  });

  test('participanții mock-uiți sunt listați', async ({ page }) => {
    await fixClock(page, IN_FEREASTRA);
    await page.goto('/');
    for (const p of PARTICIPANTI) {
      await expect(page.getByText(p.nume, { exact: true })).toBeVisible();
    }
  });

  test('lista goală nu mai invită la înscriere', async ({ page }) => {
    await page.unroute(STATS_ROUTE);
    await mockStats(page, []);
    await fixClock(page, IN_FEREASTRA);
    await page.goto('/');
    await expect(page.getByText('fii primul', { exact: false })).toHaveCount(0);
  });

  test('după ora de start antetul arată „Live acum", nu patru zerouri', async ({ page }) => {
    await fixClock(page, IN_TIMPUL_CURSEI);
    await page.goto('/');
    await expect(page.getByText('Live acum')).toBeVisible();
    await expect(page.getByRole('timer')).toHaveCount(0);
  });
});

test.describe('Faza „next" — de la finalul cursei', () => {
  test('homepage-ul numără spre următorul antrenament', async ({ page }) => {
    await fixClock(page, DUPA_CURSA);
    await page.goto('/');
    await expect(page.locator('.cs-root')).toBeVisible();
    await expect(page.locator('#inscriere')).toHaveCount(0);
    await expect(page.locator('#participanti')).toHaveCount(0);
  });

  test('countdown-ul arată zilele rămase până la ținta din config', async ({ page }) => {
    await fixClock(page, DUPA_CURSA);
    await page.goto('/');
    const zileRamase = Math.floor((NEXT_EDITION_DATE.getTime() - DUPA_CURSA) / 86_400_000);
    const countdown = page.locator('.cs-countdown');
    await expect(countdown).toBeVisible();
    await expect(countdown.locator('.cs-cd-value').first()).toHaveText(
      String(zileRamase).padStart(2, '0')
    );
  });
});

test.describe('/inscriere — pe deadline-ul real, nu pe faza homepage-ului', () => {
  test('în fereastra de dinaintea startului linkul direct încă servește formularul', async ({
    page,
  }) => {
    await fixClock(page, IN_FEREASTRA);
    await page.goto('/inscriere');
    // Exact același moment în care homepage-ul a ascuns deja înscrierea.
    await expect(page.getByRole('heading', { name: 'Înscrie-te' })).toBeVisible();
    await expect(page.locator('input[name="email"]')).toBeVisible();
  });

  test('după finalul cursei linkul direct duce la homepage', async ({ page }) => {
    await fixClock(page, DUPA_CURSA);
    await page.goto('/inscriere');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('.cs-root')).toBeVisible();
  });
});

// Ecranele fazelor apar exact când organizatorul e pe teren cu telefonul în
// mână — sunt cele mai mobile ecrane din tot site-ul.
test.describe('pe telefon (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const [nume, moment] of [
    ['fereastra „cine vine"', IN_FEREASTRA],
    ['countdown-ul spre următorul antrenament', DUPA_CURSA],
  ] as const) {
    test(`${nume}: fără scroll orizontal`, async ({ page }) => {
      await fixClock(page, moment);
      await page.goto('/');
      const depasire = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(depasire).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('?preview bate ceasul', () => {
  test('„leaderboard" se vede înainte de ora lui', async ({ page }) => {
    await fixClock(page, INAINTE);
    await page.goto('/?preview=leaderboard');
    await expect(page.locator('#participanti')).toBeVisible();
    await expect(page.locator('#inscriere')).toHaveCount(0);
  });

  test('„next" se vede înainte de ora lui', async ({ page }) => {
    await fixClock(page, INAINTE);
    await page.goto('/?preview=next');
    await expect(page.locator('.cs-root')).toBeVisible();
  });

  test('„landing" readuce landing-ul complet peste o fază târzie', async ({ page }) => {
    await fixClock(page, DUPA_CURSA);
    await page.goto('/?preview=landing');
    await expect(page.locator('#inscriere')).toBeVisible();
    await expect(page.locator('.cs-root')).toHaveCount(0);
  });
});

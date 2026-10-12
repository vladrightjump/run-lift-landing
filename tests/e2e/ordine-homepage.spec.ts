import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Ordinea de pe ecranul dintre ediții: cardul „Până atunci" și secțiunea
 * „Primul tău antrenament cu noi" își schimbă locul după `public_homepage()`.
 *
 * Implicitul — și orice eșec al funcției — e ordinea de dinainte: antrenamentul
 * primul. Setarea atinge doar ecranul dintre ediții; landing-ul și Coming
 * Soon-ul de dinainte de anunț nu o citesc.
 */

const PROBA = { enabled: true, bot_username: 'ParkTrialBot', contact_text: 'Scrie-ne.' };
const SAPTAMANA = [{ numar: 1, titlu: 'Intervale 1', corp: 'ÎNCĂLZIRE\n5 min alergare ușoară' }];

type Raspunsuri = { homepage?: unknown; homepageStatus?: number; proba?: unknown };

const mock = async (page: Page, r: Raspunsuri, apelate: string[] = []) =>
  page.route('**/rest/v1/rpc/*', (route) => {
    const name = route.request().url().split('/').pop()!;
    apelate.push(name);
    if (name === 'public_homepage') {
      return route.fulfill({
        status: r.homepageStatus ?? 200,
        contentType: 'application/json',
        body: JSON.stringify(r.homepage ?? null),
      });
    }
    const value =
      name === 'public_trial_config' ? ('proba' in r ? r.proba : PROBA)
        : name === 'public_weekly_workouts' ? SAPTAMANA
          : name === 'public_stats' ? { count: 0, participants: [], waitlist: 0 }
            : null;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });

/** Cardul „Până atunci", după numele lui accesibil (clasa e a modulului, cu hash). */
const CARD = 'a[aria-label^="Antrenamentul săptămânii"]';
const card = (page: Page) => page.locator(CARD);
const proba = (page: Page) => page.getByRole('region', { name: 'Primul tău antrenament cu noi.' });

/** `true` când `a` stă înaintea lui `b` în document. */
const inainte = async (page: Page, a: string, b: string): Promise<boolean> =>
  page.evaluate(
    ([sa, sb]) => {
      const ea = document.querySelector(sa)!;
      const eb = document.querySelector(sb)!;
      return !!(ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING);
    },
    [a, b]
  );

test.describe('Ordinea de pe ecranul dintre ediții', () => {
  test('implicit: „Până atunci" deasupra probei', async ({ page }) => {
    await mock(page, { homepage: { trial_first: false, training_location: 'Parcul X' } });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await expect(proba(page)).toBeVisible();
    expect(await inainte(page, CARD, "[data-css~=\"trial-training\"]")).toBe(true);
  });

  test('„Proba primul": secțiunea de probă urcă deasupra cardului', async ({ page }) => {
    await mock(page, { homepage: { trial_first: true, training_location: 'Parcul X' } });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await expect(proba(page)).toBeVisible();
    expect(await inainte(page, "[data-css~=\"trial-training\"]", CARD)).toBe(true);
  });

  test('funcția pică: ordinea implicită, fără eroare pe ecran', async ({ page }) => {
    await mock(page, { homepageStatus: 404, homepage: { message: 'not found' } });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await expect(proba(page)).toBeVisible();
    expect(await inainte(page, CARD, "[data-css~=\"trial-training\"]")).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('funcția atârnă: cardul apare oricum, în locul implicit', async ({ page }) => {
    await mock(page, {});
    // Rutele adăugate mai târziu au prioritate: cererea nu primește niciodată răspuns.
    await page.route('**/rest/v1/rpc/public_homepage', () => {});
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible({ timeout: 5000 });
    expect(await inainte(page, CARD, "[data-css~=\"trial-training\"]")).toBe(true);
  });

  test('„Proba primul" cu configul probei întârziat: cardul nu apare înaintea probei', async ({ page }) => {
    // Ordinea în care blocurile APAR, nu doar unde ajung: un card montat sub
    // butoane și împins apoi în jos de secțiunea de probă e exact saltul de evitat.
    await page.addInitScript((selectorCard) => {
      const w = window as unknown as { aparitiiTest: string[] };
      w.aparitiiTest = [];
      new MutationObserver(() => {
        for (const [sel, nume] of [["[data-css~=\"trial-training\"]", 'proba'], [selectorCard, 'card']] as const) {
          if (document.querySelector(sel) && !w.aparitiiTest.includes(nume)) w.aparitiiTest.push(nume);
        }
      }).observe(document, { childList: true, subtree: true });
    }, CARD);
    await mock(page, { homepage: { trial_first: true, training_location: null } });
    await page.route('**/rest/v1/rpc/public_trial_config', async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PROBA) });
    });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await expect(proba(page)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { aparitiiTest: string[] }).aparitiiTest)).toEqual([
      'proba',
      'card',
    ]);
  });

  test('ordinea care sosește după limita de 2 s nu mai mută cardul afișat', async ({ page }) => {
    await mock(page, {});
    await page.route('**/rest/v1/rpc/public_homepage', async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ trial_first: true, training_location: null }),
      });
    });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible({ timeout: 5000 });
    expect(await inainte(page, CARD, "[data-css~=\"trial-training\"]")).toBe(true);
    // Răspunsul întârziat sosește; cardul rămâne unde l-a văzut vizitatorul.
    await page.waitForTimeout(3000);
    expect(await inainte(page, CARD, "[data-css~=\"trial-training\"]")).toBe(true);
  });

  test('„Proba primul" cu botul de probă oprit: rămâne doar cardul', async ({ page }) => {
    await mock(page, { homepage: { trial_first: true, training_location: null }, proba: null });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await expect(proba(page)).toHaveCount(0);
  });

  test('„Proba primul" pe telefon: fără scroll orizontal', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mock(page, { homepage: { trial_first: true, training_location: null } });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await card(page).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('Coming Soon-ul de dinainte de anunț nu cere ordinea', async ({ page }) => {
    const apelate: string[] = [];
    await mock(page, { homepage: { trial_first: true, training_location: null } }, apelate);
    await page.goto('/?preview=soon');
    await expect(page.locator("[data-css~=\"cs-title\"]")).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    expect(apelate).not.toContain('public_homepage');
  });

  test('landing-ul unei ediții active nu cere ordinea', async ({ page }) => {
    const apelate: string[] = [];
    await mock(page, { homepage: { trial_first: true, training_location: null } }, apelate);
    await page.goto('/?preview=landing');
    await expect(proba(page)).toBeVisible();
    expect(apelate).not.toContain('public_homepage');
  });
});

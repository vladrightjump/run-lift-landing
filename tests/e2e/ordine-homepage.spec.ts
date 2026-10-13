import { test, expect, type NetworkFixture } from '../support/playwright';
import { rpcResponse } from '../support/responses';
import { publicStats, publicHomepage, publicTrialConfig } from '../support/builders/public';
import type { Page } from '@playwright/test';
import { saptamanaPublica } from '../support/builders/workouts';

/**
 * Ordinea de pe ecranul dintre ediții: cardul „Până atunci" și secțiunea
 * „Primul tău antrenament cu noi" își schimbă locul după `public_homepage()`.
 *
 * Implicitul — și orice eșec al funcției — e ordinea de dinainte: antrenamentul
 * primul. Setarea atinge doar ecranul dintre ediții; landing-ul și Coming
 * Soon-ul de dinainte de anunț nu o citesc.
 */

const PROBA = publicTrialConfig({ enabled: true, bot_username: 'ParkTrialBot', contact_text: 'Scrie-ne.' });
const SAPTAMANA = [saptamanaPublica(1, { titlu: 'Intervale 1', corp: 'ÎNCĂLZIRE\n5 min alergare ușoară' })];

type Raspunsuri = { homepage?: unknown; homepageStatus?: number; proba?: unknown };

const mock = (network: NetworkFixture, r: Raspunsuri, apelate: string[] = []) => {
  const onRequest = (request: Request) => { apelate.push(new URL(request.url).pathname.split('/').pop()!); };
  network.use(
    rpcResponse('public_homepage', r.homepage ?? null, { status: r.homepageStatus ?? 200, onRequest }),
    rpcResponse('public_trial_config', 'proba' in r ? r.proba : PROBA, { onRequest }),
    rpcResponse('public_weekly_workouts', SAPTAMANA, { onRequest }),
    rpcResponse('public_stats', publicStats(), { onRequest }),
    rpcResponse('public_config', null, { onRequest }),
    rpcResponse('public_training_reels', null, { onRequest }),
  );
};

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
  test('implicit: „Până atunci" deasupra probei', async ({ page, network }) => {
    mock(network, { homepage: { trial_first: false, training_location: 'Parcul X' } });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await expect(proba(page)).toBeVisible();
    expect(await inainte(page, CARD, "[data-css~=\"trial-training\"]")).toBe(true);
  });

  test('„Proba primul": secțiunea de probă urcă deasupra cardului', async ({ page, network }) => {
    mock(network, { homepage: { trial_first: true, training_location: 'Parcul X' } });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await expect(proba(page)).toBeVisible();
    expect(await inainte(page, "[data-css~=\"trial-training\"]", CARD)).toBe(true);
  });

  test('funcția pică: ordinea implicită, fără eroare pe ecran', async ({ page, network }) => {
    mock(network, { homepageStatus: 404, homepage: { message: 'not found' } });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await expect(proba(page)).toBeVisible();
    expect(await inainte(page, CARD, "[data-css~=\"trial-training\"]")).toBe(true);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('funcția atârnă: cardul apare oricum, în locul implicit', async ({ page, network }) => {
    mock(network, {});
    // Handlerul adăugat mai târziu are prioritate: cererea rămâne fără răspuns.
    network.use(rpcResponse('public_homepage', null, { latencyMs: 'infinite' }));
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible({ timeout: 5000 });
    expect(await inainte(page, CARD, "[data-css~=\"trial-training\"]")).toBe(true);
  });

  test('„Proba primul" cu configul probei întârziat: cardul nu apare înaintea probei', async ({ page, network }) => {
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
    mock(network, { homepage: { trial_first: true, training_location: null } });
    network.use(rpcResponse('public_trial_config', PROBA, { latencyMs: 800 }));
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await expect(proba(page)).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { aparitiiTest: string[] }).aparitiiTest)).toEqual([
      'proba',
      'card',
    ]);
  });

  test('ordinea care sosește după limita de 2 s nu mai mută cardul afișat', async ({ page, network }) => {
    mock(network, {});
    network.use(rpcResponse('public_homepage', publicHomepage({ trial_first: true }), { latencyMs: 3000 }));
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible({ timeout: 5000 });
    expect(await inainte(page, CARD, "[data-css~=\"trial-training\"]")).toBe(true);
    // Răspunsul întârziat sosește; cardul rămâne unde l-a văzut vizitatorul.
    await page.waitForTimeout(3000);
    expect(await inainte(page, CARD, "[data-css~=\"trial-training\"]")).toBe(true);
  });

  test('„Proba primul" cu botul de probă oprit: rămâne doar cardul', async ({ page, network }) => {
    mock(network, { homepage: { trial_first: true, training_location: null }, proba: null });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await expect(proba(page)).toHaveCount(0);
  });

  test('„Proba primul" pe telefon: fără scroll orizontal', async ({ page, network }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    mock(network, { homepage: { trial_first: true, training_location: null } });
    await page.goto('/?preview=next');
    await expect(card(page)).toBeVisible();
    await card(page).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test('Coming Soon-ul de dinainte de anunț nu cere ordinea', async ({ page, network }) => {
    const apelate: string[] = [];
    mock(network, { homepage: { trial_first: true, training_location: null } }, apelate);
    await page.goto('/?preview=soon');
    await expect(page.locator("[data-css~=\"cs-title\"]")).toBeVisible();
    await expect(card(page)).toHaveCount(0);
    expect(apelate).not.toContain('public_homepage');
  });

  test('landing-ul unei ediții active nu cere ordinea', async ({ page, network }) => {
    const apelate: string[] = [];
    mock(network, { homepage: { trial_first: true, training_location: null } }, apelate);
    await page.goto('/?preview=landing');
    await expect(proba(page)).toBeVisible();
    expect(apelate).not.toContain('public_homepage');
  });
});

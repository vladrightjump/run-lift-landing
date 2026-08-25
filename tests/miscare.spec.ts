import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Mișcarea de pe landing — efectele legate de scroll, hover și reduced-motion.
 *
 * De ce există fișierul ăsta: restul suitei verifică *conținut*, iar
 * `toBeVisible()` din Playwright ignoră `opacity`. Un efect care nu pornește
 * deloc, sau un bloc rămas la `opacity: 0`, trece nedetectat prin toate
 * celelalte 100 de teste. Aici verificăm stiluri calculate, nu prezență.
 *
 * Două teste sunt marcate `test.fail()` — bug-uri confirmate, încă nereparate.
 * Când le repari, Playwright raportează „expected to fail, but passed" și îți
 * cere să scoți adnotarea; nu poți repara și uita testul în urmă.
 */

const STATS_ROUTE = '**/rest/v1/rpc/public_stats';
const EMPTY = { count: 0, participants: [], waitlist: 0 };

/** Tokenii de brand, în forma în care îi raportează `getComputedStyle`. */
const ACCENT = 'rgb(201, 242, 75)'; // --e3-accent  #C9F24B
const SURFACE = 'rgb(26, 29, 23)'; //  --e3-surface #1A1D17
const BORDER = 'rgb(42, 46, 37)'; //   --e3-border  #2A2E25

const mockStats = (page: Page, body: unknown) =>
  page.route(STATS_ROUTE, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );

/** `scaleX` din matricea de transform a unui element (0 dacă n-are transform). */
const scaleX = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return -1;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    return new DOMMatrixReadOnly(t).a;
  }, selector);

/** `translateY` din matricea de transform (0 dacă n-are transform). */
const translateY = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return NaN;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    return new DOMMatrixReadOnly(t).f;
  }, selector);

/**
 * Așteaptă ca layoutul să se stabilizeze înainte de măsurători geometrice.
 *
 * Anton/Archivo vin de la Google Fonts cu `display=swap`: până se schimbă
 * fonturile, textul are alte metrici și tot ce e sub el sare. Fără așteptarea
 * asta, `hover()` calculează poziția cardului, fontul intră, cardul coboară
 * ~250px, iar mouse-ul aterizează pe gol — testul pică nedeterminist, doar
 * când cache-ul de fonturi e rece.
 */
const settle = async (page: Page) => {
  // `document.fonts.ready` singur nu ajunge: dacă `@import`-ul de la Google Fonts
  // n-a fost încă parsat, nu există încărcări în așteptare și promisiunea se
  // rezolvă imediat. Cerem explicit cele două familii înainte.
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('400 1em Anton').catch(() => {}),
      document.fonts.load('600 1em Archivo').catch(() => {}),
    ]);
    await document.fonts.ready;
  });
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
  );
};

/**
 * Scroll fără `scroll-behavior: smooth` — altfel citim stilurile în mijlocul
 * animației de scroll și testele devin nedeterministe.
 */
const scrollTo = async (page: Page, y: number) => {
  await page.evaluate((top) => {
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
  }, y);
  // Două cadre: unul pentru scroll, unul pentru ca timeline-urile să se recalculeze.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))
  );
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const base = new Date('2026-08-06T10:00:00+03:00').getTime();
    const start = performance.now();
    Date.now = () => base + (performance.now() - start);
  });
  await mockStats(page, EMPTY);
});

test.describe('Mișcare — efecte legate de scroll', () => {
  test('bara de progres se umple pe măsură ce cobori pagina', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    const bar = page.locator('.e3-progress');
    await expect(bar).toHaveCount(1);

    // În vârful paginii bara e goală.
    expect(await scaleX(page, '.e3-progress')).toBeLessThan(0.02);

    await scrollTo(page, 1200);
    await expect
      .poll(() => scaleX(page, '.e3-progress'), {
        message: 'bara de progres nu a avansat la scroll — timeline-ul de scroll nu e activ',
      })
      .toBeGreaterThan(0.05);
  });

  test('titlurile de secțiune se dezvăluie complet, nu rămân tăiate', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    const title = page.locator('.e3-title').first();

    // Aducem titlul în ecran și-l lăsăm să-și parcurgă intervalul.
    await title.scrollIntoViewIfNeeded();
    await scrollTo(page, await page.evaluate(() => window.scrollY + 400));

    // Starea finală e `inset(-30% -6%)`; ce contează e să NU fie `inset(100% ...)`,
    // care ar însemna un titlu invizibil permanent.
    const clip = await page.evaluate(
      () => getComputedStyle(document.querySelector('.e3-title') as Element).clipPath
    );
    expect(clip).not.toContain('100%');
  });

  test('blocurile cu data-reveal ajung la opacity 1 (nu rămân invizibile)', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    const revealables = page.locator('[data-reveal]');
    const n = await revealables.count();
    expect(n).toBeGreaterThan(0);

    // `useScrollReveal` pune opacity:0 pe ce e sub fold și o scoate la intersecție.
    // Dacă observer-ul nu se declanșează, blocul rămâne invizibil — iar
    // `toBeVisible()` NU prinde asta, fiindcă ignoră opacity.
    for (let i = 0; i < n; i++) {
      const el = revealables.nth(i);
      await el.scrollIntoViewIfNeeded();
      await expect(el).toHaveCSS('opacity', '1', { timeout: 3000 });
    }
  });
});

test.describe('Mișcare — reduced motion', () => {
  // `test.use({ reducedMotion })` nu ajunge la pagină aici (matchMedia raportează
  // false), deci emulăm explicit per pagină — API-ul de runtime funcționează.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('fără mișcare: bara de progres și clipul din hero dispar', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    await expect(page.locator('.e3-progress')).toBeHidden();
    await expect(page.locator('.e3-hero-video')).toBeHidden();
  });

  test('fără mișcare: titlurile nu rămân tăiate de mască', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    // Regula din edition3.css scoate clip-path-ul cu !important.
    await expect(page.locator('.e3-title').first()).toHaveCSS('clip-path', 'none');
  });

  test('fără mișcare: conținutul de sub fold rămâne vizibil, nu la opacity 0', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    // `useScrollReveal` iese devreme la reduced-motion, deci nu setează opacity:0.
    const revealables = page.locator('[data-reveal]');
    const n = await revealables.count();
    for (let i = 0; i < n; i++) {
      await expect(revealables.nth(i)).toHaveCSS('opacity', '1');
    }
  });

  test('fără mișcare: contorul ajunge la valoarea finală', async ({ page }) => {
    await mockStats(page, { count: 7, participants: [], waitlist: 0 });
    await page.goto('/?preview=landing');
    await settle(page);
    // Garda din useCountUp scurtcircuitează rAF-ul. Testul păzește faptul că
    // ramura aia livrează valoarea corectă — nu că lipsește animația (un contor
    // animat ar ajunge tot la 7). Absența mișcării o acoperă aserțiunile CSS
    // de mai sus, care chiar discriminează.
    await expect(page.getByText('7 / 40')).toBeVisible({ timeout: 2000 });
  });
});

test.describe('Mișcare — hover pe carduri', () => {
  test('cardul se ridică la hover', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    const card = page.locator('.e3-card.e3-step').first();
    await card.scrollIntoViewIfNeeded();

    // Reveal-ul rulează cu `fill: 'backwards'`, deci ține cardul la
    // translateY(20px) până își termină cursa. Așteptăm să se așeze, altfel
    // măsurăm starea de intrare și testul devine nedeterminist.
    await expect.poll(() => translateY(page, '.e3-card.e3-step')).toBe(0);

    // Re-facem hover-ul la fiecare încercare: dacă layoutul se mai mișcă între
    // calculul poziției și mișcarea mouse-ului, cursorul aterizează pe gol și
    // un `hover()` unic ar rămâne definitiv pe lângă card.
    await expect
      .poll(
        async () => {
          await card.hover();
          return translateY(page, '.e3-card.e3-step');
        },
        { timeout: 10_000 }
      )
      .toBeLessThan(-2); // translateY(-4px)
  });

  // BUG CONFIRMAT (review #1) — `style={{ background, border }}` inline bate
  // `.e3-card:hover`, deci tenta și bordura lime nu se aplică niciodată.
  // Scoate `test.fail()` odată ce declarațiile de bază urcă în clasa `.e3-card`.
  test('cardul primește tentă și bordură lime la hover', async ({ page }) => {
    test.fail(true, 'review #1: declarațiile inline bat regula de hover din CSS');
    await page.goto('/?preview=landing');
    await settle(page);
    const card = page.locator('.e3-card.e3-step').first();
    await card.scrollIntoViewIfNeeded();

    await expect(card).toHaveCSS('border-top-color', BORDER);
    await expect(card).toHaveCSS('background-color', SURFACE);

    await card.hover();
    await expect(card).toHaveCSS('border-top-color', ACCENT);
  });
});

test.describe('Mișcare — parallax în hero', () => {
  // BUG CONFIRMAT (review #4) — `view(block)` se leagă de secțiunea hero, care
  // are `overflow: hidden` și e deci container de scroll fără overflow scrollabil,
  // așa că timeline-ul nu avansează niciodată.
  // Scoate `test.fail()` după trecerea la `view(root block)`.
  test('textul din hero se retrage la scroll', async ({ page }) => {
    test.fail(true, 'review #4: view(block) se leagă de secțiunea cu overflow:hidden');
    await page.goto('/?preview=landing');
    await settle(page);

    expect(await translateY(page, '.e3-hero-copy')).toBe(0);
    await scrollTo(page, 400);

    await expect
      .poll(() => translateY(page, '.e3-hero-copy'), {
        message: 'hero-ul nu s-a mișcat — timeline-ul de view nu e activ',
      })
      .toBeLessThan(-5);
  });
});

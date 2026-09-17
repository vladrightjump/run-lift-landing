import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SNAPSHOT_CONFIG } from '../src/content/eventConfig';

/**
 * Mișcarea de pe landing — efectele legate de scroll, hover și reduced-motion.
 *
 * De ce există fișierul ăsta: restul suitei verifică *conținut*, iar
 * `toBeVisible()` din Playwright ignoră `opacity`. Un efect care nu pornește
 * deloc, sau un bloc rămas la `opacity: 0`, trece nedetectat prin toate
 * celelalte 100 de teste. Aici verificăm stiluri calculate, nu prezență.
 *
 * Testele de hover și de parallax au fost cândva `test.fail()` — două bug-uri
 * în care animația exista în CSS dar nu pornea niciodată în pagină. Sunt acum
 * teste de regresie normale; comentariul de deasupra fiecăruia spune ce anume
 * păzesc, ca reparația să nu fie desfăcută din greșeală.
 */

const STATS_ROUTE = '**/rest/v1/rpc/public_stats';
const EMPTY = { count: 0, participants: [], waitlist: 0 };

/** Tokenii de brand, în forma în care îi raportează `getComputedStyle`. */
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

/** `translateX` din matricea de transform (0 dacă n-are transform). */
const translateX = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return NaN;
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') return 0;
    return new DOMMatrixReadOnly(t).e;
  }, selector);

/** Canalele r/g/b ale unei proprietăți de culoare, ca numere. */
const rgbOf = (page: Page, selector: string, prop: 'borderTopColor' | 'backgroundColor') =>
  page.evaluate(
    ([sel, p]) => {
      const el = document.querySelector(sel as string);
      if (!el) return [-1, -1, -1];
      const raw = getComputedStyle(el)[p as 'borderTopColor'];
      return (raw.match(/\d+/g) ?? []).slice(0, 3).map(Number);
    },
    [selector, prop] as const
  );

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
    await expect(page.getByText(`7 / ${SNAPSHOT_CONFIG.slots.total}`)).toBeVisible({
      timeout: 2000,
    });
  });

  test('fără mișcare: banda rulantă stă pe loc, dar textul rămâne', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    const track = page.locator('.e3-marquee-track');
    // Mesajul e text, nu mișcare — banda rămâne vizibilă, doar înghețată.
    await expect(track).toBeVisible();
    await expect(track).toHaveCSS('transform', 'none');
  });
});

test.describe('Mișcare — banda rulantă', () => {
  test('pista chiar se mișcă', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    const track = page.locator('.e3-marquee-track');
    await expect(track).toBeVisible();

    const first = await translateX(page, '.e3-marquee-track');
    await expect
      .poll(() => translateX(page, '.e3-marquee-track'), {
        message: 'pista nu s-a deplasat — animația buclei nu rulează',
      })
      .not.toBe(first);
  });

  test('conținutul e duplicat, dar citit o singură dată', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    // Bucla continuă cere două copii identice; a doua e aria-hidden, altfel
    // cititoarele de ecran ar citi lista de două ori.
    await expect(page.locator('.e3-marquee-group')).toHaveCount(2);
    await expect(page.locator('.e3-marquee-group[aria-hidden="true"]')).toHaveCount(1);
    // Copiile trebuie să fie identice — dacă s-ar desincroniza, bucla ar sări
    // vizibil la reluare.
    const [vizibil, ascuns] = await Promise.all([
      page.locator('.e3-marquee-group:not([aria-hidden])').innerText(),
      page.locator('.e3-marquee-group[aria-hidden="true"]').innerText(),
    ]);
    expect(ascuns).toBe(vizibil);
  });

  test('se oprește la hover, ca textul să se poată citi', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    const marquee = page.locator('.e3-marquee');
    await marquee.hover();
    await expect(page.locator('.e3-marquee-track')).toHaveCSS(
      'animation-play-state',
      /paused/
    );
  });

  // O mișcare care nu se oprește singură trebuie să poată fi oprită (WCAG 2.2.2).
  // Hover-ul nu se pune: nu există pe touch și nu se ajunge la el cu tastatura.
  test('are un buton de pauză, care chiar oprește', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    const track = page.locator('.e3-marquee-track');
    const pauza = page.getByRole('button', { name: 'Oprește banda' });

    await pauza.click();
    await expect(track).toHaveCSS('animation-play-state', /paused/);
    await expect(pauza).toHaveCount(0);

    // Repornirea readuce mișcarea — starea e comutator, nu drum fără întoarcere.
    const pornire = page.getByRole('button', { name: 'Pornește banda' });
    await pornire.click();
    // Mouse-ul e încă deasupra benzii după click, iar hover-ul o ține pe pauză;
    // îl mutăm ca să măsurăm starea butonului, nu a cursorului.
    await page.mouse.move(0, 0);
    await expect(track).toHaveCSS('animation-play-state', /running/);
  });

  test('pauza se ajunge cu tastatura', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    await page.getByRole('button', { name: 'Oprește banda' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.e3-marquee-track')).toHaveCSS(
      'animation-play-state',
      /paused/
    );
  });
});

test.describe('Mișcare — titlul din hero', () => {
  test('cuvintele se dezvăluie complet, nu rămân tăiate de mască', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    // Aceeași capcană ca la titlurile de secțiune: o mască prost calculată
    // lasă textul retezat, iar `toBeVisible()` nu vede nimic în neregulă.
    const words = page.locator('.e3-word');
    await expect(words).toHaveCount(2);
    for (let i = 0; i < 2; i++) {
      await expect(words.nth(i)).not.toHaveCSS('clip-path', 'inset(105% -8% -35% -8%)');
      await expect(words.nth(i)).toHaveCSS('opacity', '1');
    }
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

  // Regresie: declarațiile de bază (fundal + bordură) trebuie să rămână în
  // clasa `.e3-card`. Mutate inline pe componentă, ar bate `:hover` la
  // specificitate și tenta lime ar dispărea fără ca nimic să pară stricat.
  test('cardul primește tentă și bordură lime la hover', async ({ page }) => {
    await page.goto('/?preview=landing');
    await settle(page);
    const card = page.locator('.e3-card.e3-step').first();
    await card.scrollIntoViewIfNeeded();

    await expect(card).toHaveCSS('border-top-color', BORDER);
    await expect(card).toHaveCSS('background-color', SURFACE);

    // Aceeași grijă ca la testul de mai sus: reveal-ul mai mișcă rândul de
    // carduri, deci re-facem hover-ul la fiecare încercare.
    await expect.poll(() => translateY(page, '.e3-card.e3-step')).toBe(0);
    await expect
      .poll(
        async () => {
          await card.hover();
          // Nu comparăm exact cu lime-ul (#C9F24B): tranziția cardului merge pe arc
          // (`--e3-spring`), deci culoarea DEPĂȘEȘTE lime-ul înainte să se așeze
          // pe el, iar o egalitate strictă ar prinde din când în când cadrul de
          // depășire. Cerem doar să fie lime — verde dominant și luminos — nu
          // gri-ul de bordură (42, 46, 37).
          const [r, g, b] = await rgbOf(page, '.e3-card.e3-step', 'borderTopColor');
          return g > 200 && r > 150 && b < 130;
        },
        { message: 'bordura nu a devenit lime la hover', timeout: 10_000 }
      )
      .toBe(true);
  });
});

/**
 * `/despre-noi` are propria rădăcină (`.dn-root`) și propriul set de clase, deci
 * nu moștenește nimic din stratul de mișcare al landing-ului doar pentru că
 * trăiesc în același bundle. A rămas o dată în urmă exact așa: hero animat și
 * nimic sub el. Testele de aici păzesc că cele două pagini se mișcă la fel.
 */
test.describe('Mișcare — pagina „Despre noi"', () => {
  test('are aceleași efecte de scroll ca landing-ul', async ({ page }) => {
    await page.goto('/despre-noi');
    await settle(page);

    await expect(page.locator('.e3-marquee-track')).toBeVisible();
    // Titlurile de secțiune se dezvăluie prin mască, nu apar pur și simplu.
    expect(await page.locator('.e3-title').count()).toBeGreaterThan(0);

    // Bara de progres: `toBeVisible()` n-o vede la scroll 0, fiindcă e la
    // `scaleX(0)`. Ce contează e că se umple pe măsură ce cobori.
    await scrollTo(page, 900);
    await expect
      .poll(() => scaleX(page, '.e3-progress'), {
        message: 'bara de progres nu s-a umplut',
      })
      .toBeGreaterThan(0.05);
  });

  test('titlurile de secțiune nu rămân tăiate de mască', async ({ page }) => {
    await page.goto('/despre-noi');
    await settle(page);
    const titlu = page.locator('.e3-title').first();
    await titlu.scrollIntoViewIfNeeded();
    // Aceeași capcană ca pe landing: o mască prost calculată lasă textul
    // retezat, iar `toBeVisible()` nu vede nimic în neregulă.
    await expect(titlu).not.toHaveCSS('clip-path', 'inset(100% 0px 0px 0px)');
  });

  test('blocurile de sub fold ajung la opacity 1', async ({ page }) => {
    await page.goto('/despre-noi');
    await settle(page);
    const blocuri = page.locator('[data-reveal]');
    const n = await blocuri.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      await blocuri.nth(i).scrollIntoViewIfNeeded();
      await expect(blocuri.nth(i)).toHaveCSS('opacity', '1', { timeout: 3000 });
    }
  });

  test('cardurile primesc tentă lime la hover', async ({ page }) => {
    await page.goto('/despre-noi');
    await settle(page);
    const card = page.locator('.dn-step').first();
    await card.scrollIntoViewIfNeeded();
    await expect.poll(() => translateY(page, '.dn-step')).toBe(0);
    await expect
      .poll(
        async () => {
          await card.hover();
          const [r, g, b] = await rgbOf(page, '.dn-step', 'borderTopColor');
          return g > 200 && r > 150 && b < 130;
        },
        { message: 'bordura nu a devenit lime la hover', timeout: 10_000 }
      )
      .toBe(true);
  });

  test('parallaxul din hero pornește', async ({ page }) => {
    await page.goto('/despre-noi');
    await settle(page);
    // Regresie: `.dn-hero` trebuie să rămână pe `overflow: clip`. Pe `hidden`
    // devine container de scroll fără overflow, iar `view(block)` nu avansează.
    expect(await translateY(page, '.e3-hero-copy')).toBe(0);
    await scrollTo(page, 500);
    await expect
      .poll(() => translateY(page, '.e3-hero-copy'), {
        message: 'hero-ul nu s-a mișcat — timeline-ul de view nu e activ',
      })
      .toBeLessThan(-5);
  });
});

test.describe('Mișcare — parallax în hero', () => {
  // Regresie: secțiunea hero trebuie să rămână pe `overflow: clip`. Pe
  // `overflow: hidden` devenea ea însăși container de scroll — unul fără
  // overflow scrollabil — iar `view(block)` se lega de ea, deci progresul nu
  // avansa niciodată și parallaxul era mort fără ca nimic să pară stricat.
  test('textul din hero se retrage la scroll', async ({ page }) => {
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

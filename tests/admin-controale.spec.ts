import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { participant } from './unit/helpers/adminHarness';
import { dateSala } from './unit/helpers/salaFixtures';
import { SNAPSHOT_CONFIG } from '../src/content/eventConfig';

/**
 * Garda pentru limbajul comun al controalelor din admin (planul
 * `docs/plans/2026-10-07-1802-fix-admin-controale-unificate-plan.md`).
 *
 * Fiecare ecran își scria propriile reguli pentru câmpuri și butoane, iar
 * rezultatul se vedea abia în browser: margini de 1,43:1, calendare întunecate
 * pe tema luminoasă, câmpuri de clipuri fără niciun stil. Testul citește stilul
 * CALCULAT, nu clasa, ca o regulă de ecran mai specifică să nu poată trece
 * neobservată peste bază.
 *
 * Nu scrie nimic: toate RPC-urile Supabase sînt interceptate.
 */

const RPC = '**/rest/v1/rpc/*';

/** Câte un rând în fiecare listă, ca acțiunile de pe rând să existe pe ecran. */
const RASPUNSURI: Record<string, unknown> = {
  admin_check_token: true,
  admin_list_registrations: [
    participant({ id: 'p1', nume: 'Ana Rusu', email: 'ana@exemplu.md', editie: SNAPSHOT_CONFIG.number }),
  ],
  admin_list_waitlist: [
    { id: 'w1', created_at: '2026-08-20T10:00:00Z', nume: 'Ion Ceban', telefon: '069000001', email: 'ion@exemplu.md', editie: SNAPSHOT_CONFIG.number },
  ],
  admin_list_email_log: [],
  admin_list_events: [],
  admin_list_editions: [
    { editie: SNAPSHOT_CONFIG.number, participanti: 1, asteptare: 1, lansare: 0, prima: null, ultima: null, este_curenta: true },
  ],
  admin_list_launch_notifications: [],
  admin_list_email_templates: [],
  admin_get_event_config: [],
  admin_list_training_reels: [
    { id: 'c1', numar: 1, youtube: 'dQw4w9WgXcQ', caption: 'Marți seara, în parc', url: 'https://www.instagram.com/reel/AAAAA11111/', vizibil: true },
  ],
  admin_list_weekly_workout: [],
  admin_sala_date: dateSala(),
  admin_login: null,
};

const cuRaspunsuri = (page: Page) =>
  page.route(RPC, async (ruta) => {
    const nume = /\/rpc\/([a-z_]+)/.exec(ruta.request().url())?.[1] ?? '';
    await ruta.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(RASPUNSURI[nume] ?? null),
    });
  });

const deschideAdminul = async (page: Page, ecran: string) => {
  await cuRaspunsuri(page);
  await page.addInitScript(() => localStorage.setItem('runlift_admin_token', 'token-e2e'));
  await page.goto(`/admin${ecran}`);
  await page.waitForLoadState('networkidle');
};

/** Ecranele cu câmpuri, din toate cele patru zone. */
const ECRANE = [
  '#eveniment',
  '#email',
  '#clipuri',
  '#antrenament',
  '#coming-soon',
  '#participanti',
  '#lansare',
  '#grup-membri',
  '#grup-prezente',
  '#grup-bot',
];

type Camp = {
  descriere: string;
  margine: string;
  inaltime: number;
  font: number;
  schema: string;
  repaus: boolean;
  compact: boolean;
  multilinie: boolean;
};

/**
 * Câmpurile vizibile ale adminului, cu stilul calculat. `jeton` întoarce
 * culoarea unui jeton Panoul în forma `rgb(...)` din `getComputedStyle`.
 */
const citesteCampurile = (page: Page) =>
  page.evaluate(() => {
    const vizibil = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && getComputedStyle(el).visibility !== 'hidden';
    };
    return [
      ...document.querySelectorAll(
        '.admin-app input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]), .admin-app select, .admin-app textarea'
      ),
    ]
      .filter(vizibil)
      .map((el) => {
        const c = getComputedStyle(el);
        const camp = el as HTMLInputElement;
        return {
          descriere: `${el.tagName.toLowerCase()}[${camp.name || camp.type || ''}] în .${el.parentElement?.className.toString().split(' ')[0]}`,
          margine: c.borderTopColor,
          inaltime: el.getBoundingClientRect().height,
          font: parseFloat(c.fontSize),
          schema: c.colorScheme,
          repaus:
            !camp.disabled &&
            !camp.readOnly &&
            el.getAttribute('aria-invalid') !== 'true' &&
            !el.closest('.invalid, .atentie'),
          compact: !!el.closest('.admin-ordonabila-pozitie'),
          multilinie: el.tagName === 'TEXTAREA',
        };
      });
  }) as Promise<Camp[]>;

const jeton = (page: Page, nume: string) =>
  page.evaluate((nume) => {
    const proba = document.createElement('i');
    proba.style.color = `var(${nume})`;
    document.querySelector('.admin-app, .admin-pagina')?.appendChild(proba);
    const valoare = getComputedStyle(proba).color;
    proba.remove();
    return valoare;
  }, nume);

test.describe('câmpurile și listele, pe fiecare ecran', () => {
  for (const ecran of ECRANE) {
    test(`${ecran}: margine vizibilă, schemă luminoasă, înălțimea comună`, async ({ page }) => {
      await deschideAdminul(page, ecran);
      const campuri = await citesteCampurile(page);
      expect(campuri.length, `${ecran} n-a randat niciun câmp`).toBeGreaterThan(0);
      const control = await jeton(page, '--pa-line-control');

      for (const camp of campuri) {
        expect(camp.schema, `${camp.descriere}: calendarul nativ s-ar deschide întunecat`).not.toContain('dark');
        if (camp.repaus) {
          expect(camp.margine, `${camp.descriere}: marginea nu e --pa-line-control`).toBe(control);
        }
        if (!camp.multilinie) {
          const minim = camp.compact ? 36 : 44;
          expect(camp.inaltime, `${camp.descriere}: ${camp.inaltime}px, sub ${minim}`).toBeGreaterThanOrEqual(minim - 0.5);
        }
      }
    });
  }

  test('pe telefon, niciun câmp sub 16px, deci fără zoom la focus', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    for (const ecran of ['#email', '#clipuri', '#grup-bot', '#participanti']) {
      await deschideAdminul(page, ecran);
      for (const camp of await citesteCampurile(page)) {
        expect(camp.font, `${ecran} · ${camp.descriere}: ${camp.font}px`).toBeGreaterThanOrEqual(16);
      }
    }
  });
});

test.describe('focusul pe un câmp', () => {
  test('un singur indicator, iar câmpul nu se mișcă', async ({ page }) => {
    await deschideAdminul(page, '#email');
    const subiect = page.locator('.admin-email-field input[type="text"]').first();
    const inainte = await subiect.boundingBox();
    await subiect.focus();
    const stil = await subiect.evaluate((el) => {
      const c = getComputedStyle(el);
      return { contur: c.outlineStyle, inel: c.boxShadow, transformare: c.transform };
    });
    expect(stil.contur, 'conturul global s-ar adăuga peste inel').toBe('none');
    expect(stil.inel).not.toBe('none');
    expect(stil.transformare).toBe('none');
    expect(await subiect.boundingBox()).toEqual(inainte);
  });
});

test.describe('autentificarea', () => {
  test('câmpurile sînt din aceeași familie, inclusiv parola afișată', async ({ page }) => {
    await cuRaspunsuri(page);
    await page.goto('/admin');
    const utilizator = page.locator('input[name="utilizator"]');
    await expect(utilizator).toBeVisible();
    const control = await jeton(page, '--pa-line-control');
    const intrare = await jeton(page, '--pa-input');

    // Clicul pe „Arată" mergea pe `main` doar la a doua încercare: apăsarea
    // muta butonul sub cursor (vezi `translate` din `src/index.css`).
    await page.getByRole('button', { name: 'Arată' }).click();
    await expect(page.locator('input[name="parola"]')).toHaveAttribute('type', 'text');
    // Cursorul departe de câmpuri, ca hover-ul să nu schimbe marginea.
    await page.mouse.move(0, 0);
    for (const camp of [utilizator, page.locator('input[name="parola"]')]) {
      await expect(camp).toHaveCSS('border-top-color', control);
      await expect(camp).toHaveCSS('background-color', intrare);
      expect((await camp.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(43.5);
    }

    await utilizator.focus();
    expect(await utilizator.evaluate((el) => getComputedStyle(el).transform)).toBe('none');
  });

  test('o eroare înroșește marginea și rămâne roșie la focus', async ({ page }) => {
    await cuRaspunsuri(page);
    await page.goto('/admin');
    await page.locator('input[name="utilizator"]').fill('vlad');
    await page.locator('input[name="parola"]').fill('gresit');
    await page.getByRole('button', { name: 'Intră în cont' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    const pericol = await jeton(page, '--pa-danger');
    const utilizator = page.locator('input[name="utilizator"]');
    // `toHaveCSS` reîncearcă: marginea trece prin tranziție, nu se schimbă brusc.
    await expect(utilizator).toHaveCSS('border-top-color', pericol);
    await utilizator.hover();
    await expect(utilizator, 'hover-ul a ascuns eroarea').toHaveCSS('border-top-color', pericol);
    await utilizator.focus();
    await expect(utilizator, 'focusul a ascuns eroarea').toHaveCSS('border-top-color', pericol);
    await expect(utilizator).not.toHaveCSS('box-shadow', 'none');
  });
});

test.describe('butoanele', () => {
  test('acțiunile de pe rând au cel puțin 36px și se văd în repaus', async ({ page }) => {
    await deschideAdminul(page, '#participanti');
    const randuri = page.locator('.admin-btn-delete, .admin-btn-promote');
    expect(await randuri.count(), 'lista simulată n-a randat acțiuni de rând').toBeGreaterThan(0);
    const fundal = await jeton(page, '--pa-bg');
    for (const buton of await randuri.all()) {
      const stil = await buton.evaluate((el) => ({
        inaltime: el.getBoundingClientRect().height,
        margine: getComputedStyle(el).borderTopColor,
      }));
      expect(stil.inaltime).toBeGreaterThanOrEqual(35.5);
      expect(stil.margine, 'marginea se confundă cu fundalul').not.toBe(fundal);
    }
  });

  test('butoanele fără rol de pe rândurile clipurilor nu mai sînt native', async ({ page }) => {
    await deschideAdminul(page, '#clipuri');
    const randuri = page.locator('.admin-table-actions > button:not([class])');
    expect(await randuri.count(), 'lista simulată n-a randat clipuri').toBeGreaterThan(0);
    const linie = await jeton(page, '--pa-line');
    for (const buton of await randuri.all()) {
      await expect(buton).toHaveCSS('border-top-color', linie);
      expect((await buton.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(35.5);
    }
  });

  test('butonul principal are 44px pe fiecare ecran', async ({ page }) => {
    let vazute = 0;
    for (const ecran of ['#email', '#participanti', '#eveniment', '#antrenament', '#grup-bot']) {
      await deschideAdminul(page, ecran);
      for (const buton of await page.locator('.admin-btn-accent:visible').all()) {
        if (await buton.evaluate((el) => !!el.closest('.admin-config-mutare'))) continue;
        vazute++;
        const inaltime = await buton.evaluate((el) => el.getBoundingClientRect().height);
        expect(inaltime, `${ecran}: butonul principal are ${inaltime}px`).toBeGreaterThanOrEqual(43.5);
      }
    }
    expect(vazute).toBeGreaterThan(0);
  });

  test('starea dezactivat e aceeași pentru toate rolurile', async ({ page }) => {
    const fundaluri = new Set<string>();
    for (const ecran of ['#clipuri', '#antrenament', '#grup-membri', '#grup-bot']) {
      await deschideAdminul(page, ecran);
      for (const buton of await page.locator('[class*="admin-btn-"]:disabled:visible').all()) {
        fundaluri.add(await buton.evaluate((el) => getComputedStyle(el).backgroundColor));
      }
    }
    expect(fundaluri.size, 'niciun buton dezactivat pe ecranele parcurse').toBeGreaterThan(0);
    expect([...fundaluri]).toHaveLength(1);
  });
});

test.describe('pagina publică', () => {
  // Valorile de pe `main` înainte de schimbare. Stratul adminului stă sub
  // `.admin-app`, deci formularul public trebuie să iasă identic.
  test('formularul de înscriere arată ca înainte', async ({ page }) => {
    await page.addInitScript(() => {
      const fix = new Date('2026-08-06T10:00:00+03:00').getTime();
      Date.now = () => fix;
    });
    await page.route('**/rest/v1/rpc/public_stats', (ruta) =>
      ruta.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ count: 0, participants: [], waitlist: 0 }),
      })
    );
    await page.goto('/inscriere');
    const camp = page.locator('form input[type="tel"]');
    await expect(camp).toBeVisible();
    const citeste = (selector: string) =>
      page.locator(selector).first().evaluate((el) => {
        const c = getComputedStyle(el);
        return {
          fundal: c.backgroundColor,
          margine: c.borderTopColor,
          inaltime: c.height,
          font: c.fontSize,
          raza: c.borderRadius,
          schema: c.colorScheme,
        };
      });
    expect(await citeste('form input[type="tel"]')).toEqual({
      fundal: 'rgb(18, 20, 16)',
      margine: 'rgb(42, 46, 37)',
      inaltime: '46px',
      font: '16px',
      raza: '0px',
      schema: 'normal',
    });
    expect(await citeste('form button[type="submit"]')).toMatchObject({
      fundal: 'rgb(201, 242, 75)',
      inaltime: '59px',
      font: '20px',
      raza: '0px',
    });
  });
});
